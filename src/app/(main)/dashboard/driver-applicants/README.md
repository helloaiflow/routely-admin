# Driver Applicants (M1 onboarding)

Staff-only (Routely-internal, never a tenant-facing page): the pipeline of people applying to
become Routely drivers, from Onboarding through Under Review to the Approved Applicants pool.
Separate from `/dashboard/drivers` (the active delivery fleet) — approving an applicant here never
creates a driver record; that's a later, not-yet-built mission.

Mission: `routely-os/02_PRODUCT/driver-app-design/orchestrator/MISSION_2026-10-22_R23_admin_applications.md`.
Shipped 2026-10-22 (Ronda 22/23) — [PR #1](https://github.com/helloaiflow/routely-admin/pull/1).

## Tabs

- **A01 Overview** (`_components/applicants-overview.tsx`) — KPIs, funnel (current-state snapshot,
  not a cohort/time-based conversion funnel), by-zone/by-status breakdowns, "needs attention".
  **Capped at the 100 most recent matching applications** (the list endpoint's own pagination cap) —
  not a true aggregate. Shown as an in-UI banner, not hidden. Needs a real backend aggregate endpoint
  once volume regularly exceeds 100.
- **A02 Applications** (`_components/applicants-table.tsx`) — real server-side search/filter/pagination
  grid over `public.applicants`.
- **A03 Detail** (`_components/applicant-detail-sheet.tsx`) — requirements checklist from REAL
  document/consent/verification status, the 4-decision panel (Approve/Waitlist/Request changes/Reject),
  the manual Background check block, documents viewed only via an audited signed-URL proxy.
- **A04 Activity** (`_components/applicants-activity.tsx`) — cross-applicant feed of every decision +
  document access, newest first. Reads Supabase directly (no cross-applicant FastAPI endpoint exists
  yet) via `/api/client/driver-applicants/events`.

## Auth model

- Sidebar: `adminOnly: true` on the nav item (`src/navigation/sidebar/sidebar-items.ts`) — NOT the
  tenant `permission` flag (a tenant owner bypasses that check entirely; this page is never a tenant
  concept). Client-side hide in `app-sidebar.tsx` fails closed until `/api/admin/tenants` confirms
  staff.
- `page.tsx`: server-side `ctx.isAdmin` check, `notFound()` otherwise (defense in depth for a
  bookmarked/guessed URL).
- Every API route under `/api/client/driver-applicants/**` independently re-checks `ctx.isAdmin`
  server-side — the real, enforced gate. The sidebar/page checks above are UI-only.

## Backend dependency

Every state-changing decision (`approve`, `waitlist`, `reject`, `request-changes`,
`background-check`) proxies to `routely-api` (`/v1/onboarding/applications/{key}/*`,
[routely-api PR #2](https://github.com/helloaiflow/routely-api/pull/2)). List/detail/events are
plain reads straight from Supabase (service key) — no backend round-trip.

**Every write route above is gated by `routely-api`'s own `DRIVERS_APPLY_PAUSED` legal pause**
(`app/core/pause.py`) — while active, all 5 decision endpoints answer `503 drivers_apply_paused`.
This is a deliberate, reversible, legal/business safeguard (tied to the pending FCRA
authorization-text legal sign-off) — never work around it from this app; it's Domis's own call to
lift.

## Known gaps (2026-10-22)

- No Vercel Preview has ever built successfully for this project — the project has never had
  Preview-scoped environment variables configured (confirmed: even the pre-R23 skeleton commit's own
  Preview build fails identically). Production deploys work (real env vars are configured there).
- A01's KPIs are capped at 100 rows (see above).
- A04 is a direct Supabase read, not a backend endpoint (see above).
- Background-check "signal for reviewer" (`face_detected`) from the routely-driver app side isn't
  persisted anywhere — `app_document_register` has no slot for it and adding one needs a schema
  change, not done as part of this round.
