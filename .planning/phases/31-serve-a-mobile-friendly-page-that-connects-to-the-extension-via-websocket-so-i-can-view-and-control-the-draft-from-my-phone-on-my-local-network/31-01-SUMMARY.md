---
phase: 31-serve-a-mobile-friendly-page-that-connects-to-the-extension-via-websocket-so-i-can-view-and-control-the-draft-from-my-phone-on-my-local-network
plan: 01
subsystem: api
tags: [websocket, fastify, real-time, relay, chrome-extension, mobile]

# Dependency graph
requires: []
provides:
  - "Fastify WebSocket hub at /draft/live accepting both extension and mobile clients"
  - "@fastify/websocket plugin registered in buildServer"
  - "Role-based client management: extension (fan-out) vs mobile (control relay)"
  - "LAN IP CORS allowance for mobile companion pages on private networks"
  - "Latest snapshot cache for late-joining mobile clients"
affects:
  - phase-31-plan-02 (extension background SW WebSocket client)
  - phase-31-plan-03 (mobile Next.js companion page)

# Tech tracking
tech-stack:
  added:
    - "@fastify/websocket ^11.2.0 — WebSocket route handler, built on ws@8"
  patterns:
    - "Hub-and-spoke relay: one extension socket fans out to N mobile sockets"
    - "Role-based WS routing via ?role=extension or ?role=mobile query param"
    - "Latest-snapshot cache: new mobile clients get current state immediately on connect"
    - "PING/PONG keepalive: extension sends PING, hub responds PONG"

key-files:
  created:
    - "packages/backend/src/api/draft-live.ts"
  modified:
    - "packages/backend/src/index.ts"
    - "packages/backend/package.json"
    - "pnpm-lock.yaml"

key-decisions:
  - "Register @fastify/websocket before any route definitions — registration order is mandatory"
  - "Role detected from ?role query param (extension vs mobile) at connection time"
  - "Cache latestSnapshot string so late-joining mobile clients get state immediately"
  - "Allow private LAN IP origins (192.168.x, 10.x, 172.16-31.x) in CORS for mobile companion"
  - "All JSON.parse wrapped in try/catch — malformed messages are logged and ignored, not thrown"

patterns-established:
  - "Pattern: WebSocket hub route uses { websocket: true } option on app.get"
  - "Pattern: Export named async function accepting FastifyInstance for route modules"

requirements-completed: [WS-HUB-01, WS-HUB-02, WS-HUB-03]

# Metrics
duration: 2min
completed: 2026-03-08
---

# Phase 31 Plan 01: WebSocket Hub Summary

**Fastify WebSocket hub at /draft/live relaying draft state from Chrome extension to mobile phone clients with role-based fan-out and PING/PONG keepalive**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-08T07:42:25Z
- **Completed:** 2026-03-08T07:44:54Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Installed @fastify/websocket and registered it in buildServer before route definitions
- Created /draft/live WebSocket route with extension/mobile role separation
- Extension clients receive PONG on PING, else fan out STATE_SNAPSHOT to all mobile clients
- Mobile clients forward CONTROL commands to extension and receive latest snapshot on connect
- LAN IP origins (192.168.x, 10.x, 172.16-31.x) added to CORS allowed origins

## Task Commits

Each task was committed atomically:

1. **Task 1: Install @fastify/websocket and register plugin in buildServer** - `621bf42` (feat)
2. **Task 2: Create the WebSocket hub route at /draft/live** - `1801c2f` (feat)

## Files Created/Modified
- `packages/backend/src/api/draft-live.ts` - WebSocket hub route with role-based client management, fan-out relay, snapshot cache, PING/PONG
- `packages/backend/src/index.ts` - Added fastifyWebsocket import/registration (before routes), draftLiveRoutes import/registration, LAN CORS allowance
- `packages/backend/package.json` - Added @fastify/websocket ^11.2.0 dependency
- `pnpm-lock.yaml` - Updated lockfile with @fastify/websocket and transitive deps

## Decisions Made
- Used `?role=extension` or `?role=mobile` query param for client type detection at connection time — avoids any auth complexity for local-network use
- Registered @fastify/websocket in the plugin block (after rateLimit, before route definitions) to satisfy Fastify registration order constraints
- Cached `latestSnapshot` as a raw string to avoid double serialization when forwarding to late-joining mobile clients
- Used `Buffer` explicit type on message event handlers to satisfy TypeScript strict checks

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed implicit any TypeScript errors on event handler parameters**
- **Found during:** Task 2 (Create WebSocket hub route)
- **Issue:** `raw` in message handlers and `err` in error handlers had implicit `any` type, failing strict TypeScript compile (`noImplicitAny`)
- **Fix:** Typed `raw` as `Buffer` and `err` as `Error` in all four event handlers; also changed `catch (err)` to bare `catch {}` where error value was unused
- **Files modified:** packages/backend/src/api/draft-live.ts
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** 1801c2f (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - TypeScript strict type errors)
**Impact on plan:** Necessary for TypeScript compilation to succeed. No scope creep.

## Issues Encountered
None beyond the auto-fixed TypeScript strict errors.

## User Setup Required
None - no external service configuration required. The /draft/live WebSocket route is available immediately after backend restart.

## Next Phase Readiness
- Backend hub is ready to accept WebSocket connections from extension and mobile clients
- Phase 31-02 (extension background SW client) can now connect to ws://localhost:3001/draft/live?role=extension
- Phase 31-03 (mobile Next.js page) can connect to ws://{LAN-IP}:3001/draft/live?role=mobile
- No blockers

---
*Phase: 31-mobile-draft-companion*
*Completed: 2026-03-08*
