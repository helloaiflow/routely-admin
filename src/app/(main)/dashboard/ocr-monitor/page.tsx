import { Suspense } from "react";

import { OcrMonitorShell } from "./_components/ocr-monitor-shell";

/** OCR Scan Monitor — real-time Qwen2.5-VL scan telemetry grouped by scan.
 *  Overview (KPIs + latency/provider charts) · Scans (grouped grid) ·
 *  Activity (event feed) · detail sheet. Data: /api/client/ocr-scan-logs. */
export default function OcrMonitorPage() {
  return (
    <Suspense fallback={null}>
      <OcrMonitorShell />
    </Suspense>
  );
}
