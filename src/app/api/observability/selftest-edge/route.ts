import { runSelftest } from "@/lib/observability/selftest";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return runSelftest(req, "edge");
}
