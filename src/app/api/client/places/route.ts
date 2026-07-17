import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const input = searchParams.get("input") ?? "";
    if (input.length < 3) return NextResponse.json({ predictions: [] });

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return NextResponse.json({ predictions: [] });

    const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
    url.searchParams.set("input", input);
    url.searchParams.set("types", "address");
    url.searchParams.set("components", "country:us");
    url.searchParams.set("location", "27.6648,-81.5158");
    url.searchParams.set("radius", "300000");
    url.searchParams.set("key", apiKey);

    const res = await fetch(url.toString());
    const data = await res.json();

    const predictions = (data.predictions ?? []).map(
      (p: {
        description: string;
        place_id: string;
        structured_formatting?: { main_text: string; secondary_text: string };
      }) => ({
        description: p.description,
        place_id: p.place_id,
        main_text: p.structured_formatting?.main_text ?? p.description,
        secondary_text: p.structured_formatting?.secondary_text ?? "",
      }),
    );

    return NextResponse.json({ predictions });
  } catch {
    return NextResponse.json({ predictions: [] });
  }
}
