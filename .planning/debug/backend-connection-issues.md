---
status: resolved
slug: backend-connection-issues
trigger: "Issues connecting to the backend."
created: 2026-04-23
updated: 2026-04-23
---

# Debug Session: backend-connection-issues

## Symptoms

- **Expected:** Frontend pages load data from http://localhost:3001 API endpoints
- **Actual:** All API requests fail with "The network connection was lost." and "Fetch API cannot load ... due to access control checks."
- **Errors:**
  - `Fetch API cannot load http://localhost:3001/api/leagues/2/teams/208/pitching/gs due to access control checks.`
  - `Fetch API cannot load http://localhost:3001/api/leagues/2/teams/208/pitching/gs/weekly due to access control checks.`
  - `Fetch API cannot load http://localhost:3001/api/leagues/2/transaction-impacts/compute?season=2026 due to access control checks.`
  - `Fetch API cannot load http://localhost:3001/api/leagues/2/teams/208/waivers/recommendations due to access control checks.`
  - Multiple "The network connection was lost." errors repeating
- **Timeline:** Occurred after recent CORS fix to timeseries.ts SSE endpoint (Phase 82 + debug session ea5a272 changes). May be related to the Fastify CORS plugin configuration.
- **Reproduction:** Open any league page in the frontend (localhost:3000) — all API calls to localhost:3001 fail with access control errors.

## Evidence

- timestamp: 2026-04-23T00:00:00Z  
  finding: "curl http://localhost:3001/health with Origin: http://localhost:3000 returns 200 with correct CORS headers"

- timestamp: 2026-04-23T00:00:01Z  
  finding: "lsof shows Docker Desktop (com.docke) occupying port 3000, not Next.js"

- timestamp: 2026-04-23T00:00:02Z  
  finding: "Port 3001 occupied by Fastify backend. Next.js falls back to port 3002 (port 3000 taken by Docker, port 3001 by backend)"

- timestamp: 2026-04-23T00:00:03Z  
  finding: "CORS config in index.ts only allows http://localhost:3000 (from FRONTEND_URL or default). Origin http://localhost:3002 is rejected with new Error('Not allowed by CORS')"

- timestamp: 2026-04-23T00:00:04Z  
  finding: "TypeScript compiles clean. Auth middleware is fully bypassed (single-user mode, all no-ops). No server crashes."

- timestamp: 2026-04-23T00:00:05Z  
  finding: "SSE endpoint in timeseries.ts has the CORS header transfer fix from commit ea5a272 — not the cause."

## Eliminated

_(populated by debugger)_

## Current Focus

hypothesis: "RESOLVED"
next_action: "none — fix committed"

## Eliminated

- Backend not running (curl to /health returns 200)
- SSE header transfer loop crashing the server (server healthy, no TypeScript errors)
- CORS credentials mismatch (credentials: true is set correctly)
- Auth middleware blocking before CORS headers (auth is fully bypassed, all no-ops)
- @fastify/cors version bug (CORS works correctly for localhost:3000)

## Resolution

root_cause: "Port collision — Docker Desktop occupies :3000, backend occupies :3001, so Next.js starts on :3002. The browser sends Origin: http://localhost:3002. The CORS allow-list only contained http://localhost:3000 (no FRONTEND_URL in .env), so all cross-origin requests were rejected."

fix: "Added a non-production guard in packages/backend/src/index.ts CORS origin callback that accepts any http://localhost:<port> origin when NODE_ENV !== 'production'. Committed as 9e41920."

commit: "9e41920"
