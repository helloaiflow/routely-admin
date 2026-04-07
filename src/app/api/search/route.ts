import { type NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q")?.trim();
    if (!q || q.length < 2) {
      return NextResponse.json({ recipients: [], scans: [], stops: [], gateCodes: [] });
    }

    const db = await getDb();
    const regex = { $regex: q, $options: "i" };

    const [recipients, scans, stops, gateCodes] = await Promise.all([
      db
        .collection("recipients")
        .find({ $or: [{ name: regex }, { phone: regex }, { address: regex }] })
        .limit(5)
        .toArray(),
      db
        .collection("package_scans")
        .find({ $or: [{ rx_pharma_id: regex }, { full_name: regex }] })
        .limit(5)
        .toArray(),
      db
        .collection("spoke_stops")
        .find({ $or: [{ recipient_name: regex }, { address: regex }] })
        .limit(5)
        .toArray(),
      db
        .collection("gate_codes")
        .find({ $or: [{ address: regex }] })
        .limit(5)
        .toArray(),
    ]);

    return NextResponse.json({ recipients, scans, stops, gateCodes });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
