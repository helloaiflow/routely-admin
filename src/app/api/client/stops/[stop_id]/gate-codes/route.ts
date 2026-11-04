import { NextResponse } from "next/server";

import { requirePagePermission } from "@/lib/tenant";

/* Saved gate codes lived in Mongo. M18 unlinked Mongo and Domis parked gate codes for the stops mission, where they
 * move to public.gate_codes (the 45 codes are in the M18 backup and already in that table). Until then the panel
 * shows no saved codes and saving one says so — never a 500. */
const GATE_CODES_PAUSED =
  "Saved gate codes are paused while they move to the new system. Add the code to the stop notes for now.";

export async function GET() {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ codes: [], street: "", zip: "", paused: true });
}

export async function POST() {
  const ctx = await requirePagePermission("orders");
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ error: GATE_CODES_PAUSED }, { status: 503 });
}
