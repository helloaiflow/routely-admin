import { LabelsShell } from "./_components/labels-shell";

/** Shipping Labels — tenant-facing management dashboard for Shippo labels
 *  bought through Routely. Data: GET /api/client/labels (label_orders).
 *  Overview KPIs + charts · Labels table with detail drawer · Activity feed. */
export default function LabelsPage() {
  return <LabelsShell />;
}
