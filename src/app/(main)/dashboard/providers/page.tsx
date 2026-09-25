import { ProvidersTable } from "./_components/providers-table";

/** M1 — Integraciones. Global catalog of integration providers tenants pick
 *  from when generating an API token in their own dashboard. View + toggle
 *  status only — providers are added by developers via code + migration, not
 *  through this page. Data: GET/PATCH /api/admin/providers. */
export default function ProvidersPage() {
  return <ProvidersTable />;
}
