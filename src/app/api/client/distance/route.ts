import { NextResponse } from "next/server";

// CEO design 2026-06-10 — "never bill an invented distance":
// retry transient Google failures, and when distance is still unknown return
// an explicit pending result instead of a made-up mileage. Consumers must
// treat miles:null as "distance pending" and must not bill from it.
const RETRY_DELAYS_MS = [300, 800];

function pendingResponse(reason: string) {
  return NextResponse.json({
    miles: null,
    duration: null,
    source: "unavailable",
    distance_pending: true,
    reason,
  });
}

export async function POST(req: Request) {
  try {
    const { origin, destination } = await req.json();
    if (!origin || !destination) {
      return NextResponse.json({ error: "origin and destination required" }, { status: 400 });
    }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error("[distance] Google Maps API key not configured");
      return pendingResponse("no_api_key");
    }

    const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
    url.searchParams.set("origins", origin);
    url.searchParams.set("destinations", destination);
    url.searchParams.set("units", "imperial");
    url.searchParams.set("key", apiKey);

    let lastStatus = "fetch_failed";
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
      try {
        const res = await fetch(url.toString());
        const data = await res.json();
        const element = data.rows?.[0]?.elements?.[0];

        if (element?.status === "OK") {
          const miles = Math.round((element.distance.value / 1609.34) * 10) / 10;
          return NextResponse.json({
            miles,
            duration: element.duration.text,
            duration_mins: Math.round(element.duration.value / 60),
            source: "google",
          });
        }

        lastStatus = element?.status ?? data.status ?? "no_element";
        // NOT_FOUND / ZERO_RESULTS are address problems, not transient — no retry.
        if (lastStatus === "NOT_FOUND" || lastStatus === "ZERO_RESULTS") break;
      } catch {
        lastStatus = "fetch_failed";
      }
    }

    console.error(`[distance] unresolved after retries (${lastStatus}): ${origin} → ${destination}`);
    return pendingResponse(lastStatus);
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }
}
