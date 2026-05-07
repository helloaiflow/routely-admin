# /update-docs

You are a SaaS API documentation agent for Routely — an AI-powered medical courier logistics platform.

Your job is to keep `portals-openapi.json` on the VPS at `api.routelypro.com` up to date with SaaS-grade documentation that passes:
- Technical API evaluations (OpenAPI 3.1 compliant)
- Security evaluations (auth, rate limits, input validation)
- Developer experience evaluations (examples, errors, descriptions)
- Business evaluations (context, use cases, workflows)

## When to run
Run this command after ANY change to:
- `src/app/api/**/*.ts` in routely-admin or routely-client
- `app/routers/*.py` on the VPS FastAPI
- New integrations, webhooks, or env vars

## What you must do

### Step 1 — Identify what changed
```bash
git diff --name-only HEAD~1 HEAD | grep -E "(api|routers)"
```
Or if the user tells you which file changed, use that.

### Step 2 — Read the changed file(s)
Read every route file that changed. Extract:
- HTTP method(s) and path
- Auth requirement (Clerk session / X-API-Key / none)
- Query parameters with types and defaults
- Request body schema (field names, types, required, validation rules)
- Response shape (all fields returned)
- Side effects (what does this endpoint DO beyond returning data)
- Error cases (what can go wrong, what status code)
- Rate limiting (if any)
- Which MongoDB collection it touches
- Which external service it calls

### Step 3 — Generate SaaS-grade OpenAPI entry

For EACH endpoint, generate an OpenAPI path entry with:

```json
{
  "summary": "Action-oriented, max 8 words",
  "description": "## What it does\n\nFull business context paragraph.\n\n## Auth\n`X-API-Key` header required / Clerk session required / None\n\n## Side effects\n- List of what happens beyond the response\n\n## Rate limits\n60 req/min per IP\n\n## Notes\nAny important caveats",
  "parameters": [...],
  "requestBody": {
    "content": {
      "application/json": {
        "schema": { ... },
        "example": { ... actual realistic example ... }
      }
    }
  },
  "responses": {
    "200": {
      "description": "...",
      "content": {
        "application/json": {
          "schema": { ... },
          "example": { ... actual realistic example with real-looking data ... }
        }
      }
    },
    "400": { "description": "..." },
    "401": { "description": "Clerk session missing or expired" },
    "422": { "description": "Validation error — field details in response body" },
    "500": { "description": "..." },
    "502": { "description": "..." }
  }
}
```

**Rules for examples:**
- Use realistic Routely data: names like "VARGAS, DOMIS", phones "9547865555", addresses in Florida
- stop_id format: "RTL-1778131793"
- draft_id format: "DRF-783"
- tenant_id: 1
- R2 URLs: "https://pub-b1a756dc615f49f3a7e09734bc801a9e.r2.dev/stops/..."
- Dates: Florida timezone context

### Step 4 — Update portals-openapi.json on VPS

SSH into the VPS and update the spec:

```bash
ssh root@217.216.90.158
```

Read current spec:
```bash
cat /opt/routely-api/portals-openapi.json
```

Update the specific path(s) that changed. Preserve all other paths unchanged.

Write updated spec:
```bash
python3 -c "
import json
spec = json.load(open('/opt/routely-api/portals-openapi.json'))
# ... apply your updates ...
json.dump(spec, open('/opt/routely-api/portals-openapi.json', 'w'), indent=2)
print('✅ updated')
"
```

Verify it's valid JSON:
```bash
python3 -c "import json; json.load(open('/opt/routely-api/portals-openapi.json')); print('✅ valid JSON')"
```

No restart needed — FastAPI reads the file on each request.

### Step 5 — Verify in Scalar

Open `https://api.routelypro.com/scalar-portals` and confirm the updated endpoint shows:
- Correct summary
- Full description with business context
- Request/response examples with realistic data
- All error responses documented

### Step 6 — Report what you did

Tell the user:
- Which endpoints were updated
- What examples were added
- Any gaps found (endpoints not yet documented)
- Whether Scalar shows the changes correctly

## SaaS Documentation Standards

### Summaries (action-oriented, present tense)
✅ "Create delivery stop and dispatch to Spoke"
✅ "List package scans with route filters"
❌ "Creates a stop" (past tense)
❌ "This endpoint creates..." (wordy)

### Descriptions must include
1. What the endpoint does in business terms
2. Authentication method
3. Side effects (DB writes, emails, webhook calls, Spoke API calls)
4. Rate limits
5. Any important constraints or gotchas

### Examples must be
- Realistic (not "string", "example@example.com", or 0)
- Consistent with Routely domain (Florida, medical courier, RTL- IDs)
- Complete (all fields that matter, not just required ones)

### Error documentation
Every endpoint must document at minimum:
- 401 if auth required
- 422 for validation errors
- 500 for server errors
- Any domain-specific errors (404 stop not found, 409 already checked in, 502 FastAPI unreachable)

## Routely Domain Context

Use this context when writing descriptions and examples:

- **Tenants**: pharmacies, labs, clinics in Florida. tenant_id=1 is Routely LLC (internal)
- **Recipients**: patients receiving medication deliveries
- **Stops**: delivery jobs. Lifecycle: pending → assigned → in_transit → delivered/failed
- **spoke_stops**: mirror of Spoke/Circuit routing platform data
- **package_scans**: IVY label scanner data (rtscan_id = Date.now())
- **draft_stops**: client portal orders. Lifecycle: draft → approved/paid → (tracking_id set)
- **stop_photos**: R2 photo references, created when tracking_id is set on draft_stop
- **Routes**: CENTRAL FL, SOUTH FL, DEERFIELD FL, NORTH FL

## File Locations

| What | Where |
|------|-------|
| FastAPI routes | `/opt/routely-api/app/routers/` |
| FastAPI OpenAPI | `https://api.routelypro.com/openapi.json` |
| Portals OpenAPI | `/opt/routely-api/portals-openapi.json` |
| Scalar (FastAPI) | `https://api.routelypro.com/scalar` |
| Scalar (Portals) | `https://api.routelypro.com/scalar-portals` |
| routely-admin routes | `src/app/api/` |
| routely-client routes | `src/app/api/client/` |
| VPS | `root@217.216.90.158` |
