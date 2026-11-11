import { runSelftest } from "@/lib/observability/selftest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return runSelftest(req, "nodejs");
}
