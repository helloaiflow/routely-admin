# CLAUDE.md — Routely

AI-powered medical courier logistics SaaS — Florida market.

## Repos
- `routely-web` → routelypro.com (Next.js, marketing + onboarding)
- `routely-admin` → admin.routelypro.com (Next.js, operations portal)
- `routely-client` → app.routelypro.com (Next.js, client portal)
- FastAPI → api.routelypro.com (VPS `root@217.216.90.158`)

## API Documentation (MANDATORY)

**Run `/update-docs` after EVERY change to an API route.**

| You change | You run |
|-----------|---------|
| Any `src/app/api/**/*.ts` | `/update-docs` |
| Any `app/routers/*.py` on VPS | `/update-docs` |
| New webhook | `/update-docs` |
| New integration | `/update-docs` |
| New env var | `/update-docs` + update `operations/environment-variables.md` |

Documentation lives at:
- `https://api.routelypro.com/scalar` → FastAPI core
- `https://api.routelypro.com/scalar-portals` → Next.js portals
- `/opt/routely-api/portals-openapi.json` → editable portals spec

## Architecture

```
Browser → Vercel (Next.js) → FastAPI (VPS) → MongoDB Atlas
                           → Spoke API
                           → Cloudflare R2
```

## Key Constraints

### MongoDB
- Search: always use `_normalized` fields + case-insensitive regex
- Auto-increment: `tenant_id`, `recipient_id` (find last, +1)
- `rtscan_id` = `Date.now()` (ms, unique, immutable)
- `rtstop_id` = atomic counter from `counters` collection
- Immutable spoke_stops fields: `rx_pharma_id`, `rx_creation_date`, `recipient_id`, `client_id`, `tenant_id`, `rtscan_id`
- `label_status` only changed by Nora n8n workflow

### Vercel / Next.js
- Lazy Stripe init: never module-level, always `getStripe()` pattern
- Clerk middleware: add new API routes to `publicRoutes` or get 307 redirects
- Auth check: use MongoDB `tenants` as source of truth, not Clerk JWT (goes stale)
- Commit: `git commit --no-verify` to bypass biome pre-commit hook
- Paths with `(main)` cannot be edited with file tools — edit manually or copy file

### FastAPI (VPS)
- After changes: `systemctl daemon-reload && systemctl restart routely-api`
- Env vars: `/etc/systemd/system/routely-api.service.d/r2.conf`
- Logs: `journalctl -u routely-api -f`
- Never use heredoc for multi-line Python writes — use `python3 << 'PYEOF'` with escaped quotes

### Cloudflare R2
- Bucket: `routely-stops`
- Object path: `stops/{stop_id}/{timestamp}_{uid}.{ext}`
- Public URL: `https://pub-b1a756dc615f49f3a7e09734bc801a9e.r2.dev/{object_name}`
- CORS allows: `app.routelypro.com`, `localhost:3000`
- custom domain `media.routelypro.com` pending (needs Cloudflare DNS)

### Spoke / Circuit
- Cannot create depots or routes via API — manual only
- circuit_client_id: `{stop_id}-PU` (pickup) and `{stop_id}-DL` (delivery)
- Webhook flow: Spoke → n8n → `/api/data/spoke-stops` + FastAPI `/v1/stops/by-circuit/`

## Working Style
- One change at a time — verify before next step
- Always check Vercel deployment status after push
- Use `str_replace` for files without parentheses in path
- For files in `(main)/` path — must edit manually
- Git: `helloaiflow@gmail.com`

## Domain Context (for docs and code)
- Tenants = pharmacies, labs, clinics in Florida
- Recipients = patients receiving medication
- stop_id format: `RTL-{unix_timestamp}` e.g. `RTL-1778131793`
- draft_id format: `DRF-{3-digit}` e.g. `DRF-783`
- Routes: CENTRAL FL, SOUTH FL, DEERFIELD FL, NORTH FL
- Tracking: pickup leg (-PU) + delivery leg (-DL) per stop
