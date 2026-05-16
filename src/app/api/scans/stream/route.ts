/**
 * GET /api/scans/stream
 * Server-Sent Events — real-time scan updates via MongoDB Change Streams.
 */
import { type NextRequest, NextResponse } from "next/server";

import clientPromise from "@/lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DB_NAME = process.env.MONGODB_DB ?? "routely_prod";
const HEARTBEAT_MS = 25_000;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantId = Number(searchParams.get("tenant_id") ?? "1");

  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();

      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* client disconnected */
        }
      };

      send("connected", { ts: Date.now(), tenant_id: tenantId });

      const heartbeat = setInterval(() => send("heartbeat", { ts: Date.now() }), HEARTBEAT_MS);

      try {
        const mongo = await clientPromise;
        const db = mongo.db(DB_NAME);
        const col = db.collection("package_scans");

        const changeStream = col.watch([], { fullDocument: "updateLookup" });

        changeStream.on("change", (change) => {
          const doc =
            change.operationType === "insert"
              ? change.fullDocument
              : change.operationType === "update" || change.operationType === "replace"
                ? change.fullDocument
                : null;

          if (!doc) return;
          if (doc.tenant_id !== tenantId) return;

          send("scan", { op: change.operationType, doc });
        });

        changeStream.on("error", (err) => {
          console.error("[SSE] changeStream error:", err);
          send("error", { message: "Change stream error — reconnecting." });
        });

        cleanup = () => {
          clearInterval(heartbeat);
          // biome-ignore lint/suspicious/noEmptyBlockStatements: intentional silent close
          changeStream.close().catch(() => {});
        };

        req.signal.addEventListener("abort", () => {
          cleanup?.();
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        });
      } catch (err) {
        console.error("[SSE] setup error:", err);
        send("error", { message: String(err) });
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      cleanup?.();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
