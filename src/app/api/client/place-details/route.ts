import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const placeId = searchParams.get("place_id");

  if (!placeId) {
    return NextResponse.json({ error: "place_id is required" }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Google Maps API key not configured" }, { status: 500 });
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=address_components,formatted_address,geometry&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== "OK" || !data.result?.address_components) {
      return NextResponse.json({ error: "Place not found", status: data.status }, { status: 404 });
    }

    const components = data.result.address_components as Array<{
      long_name: string;
      short_name: string;
      types: string[];
    }>;

    let street_number = "";
    let route = "";
    let city = "";
    let state = "";
    let zip = "";

    for (const c of components) {
      if (c.types.includes("street_number")) street_number = c.long_name;
      else if (c.types.includes("route")) route = c.long_name;
      else if (c.types.includes("locality")) city = c.long_name;
      else if (c.types.includes("sublocality_level_1") && !city) city = c.long_name;
      else if (c.types.includes("administrative_area_level_1")) state = c.short_name;
      else if (c.types.includes("postal_code")) zip = c.long_name;
    }

    const street = street_number ? `${street_number} ${route}` : route;

    const loc = data.result.geometry?.location;

    return NextResponse.json({
      street,
      city,
      state,
      zip,
      formatted_address: data.result.formatted_address,
      lat: loc?.lat ?? undefined,
      lng: loc?.lng ?? undefined,
    });
  } catch (err) {
    console.error("[place-details] error:", err);
    return NextResponse.json({ error: "Failed to fetch place details" }, { status: 500 });
  }
}
