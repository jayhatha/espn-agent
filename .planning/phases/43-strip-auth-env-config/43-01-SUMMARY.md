---
phase: 43-strip-auth-env-config
plan: 01
subsystem: auth, api, ui
tags: [fastify, auth-bypass, espn, env-vars, next.js]

# Dependency graph
requires: []
provides:
  - Auth-free API routes (all endpoints respond without JWT/cookies)
  - Auth-free frontend (no login redirect, no session checks)
  - ESPN env var credential sourcing (ESPN_SWID, ESPN_S2)
affects: [all-api-routes, frontend-pages, espn-adapter]

# Tech tracking
tech-stack:
  added: []
  patterns: [no-op middleware for auth bypass, env-var-first credential sourcing]

key-files:
  created:
    - packages/backend/src/utils/espn-env.ts
  modified:
    - packages/backend/src/middleware/auth.ts
    - packages/frontend/src/components/ProtectedRoute.tsx
    - packages/frontend/src/contexts/AuthContext.tsx
    - packages/frontend/src/lib/api.ts
    - packages/frontend/src/app/page.tsx
    - packages/backend/src/api/leagues.ts
    - packages/backend/src/api/recommendations.ts
    - packages/backend/src/api/projections.ts
    - packages/backend/src/api/admin.ts
    - packages/backend/src/agents/player-pool-sync.ts
    - packages/backend/src/workers/snapshot-worker.ts
    - packages/backend/src/workers/backfill-worker.ts

key-decisions:
  - "Auth middleware made no-op rather than removed -- preserves exports for future re-enablement"
  - "AuthContext provides mock admin user so all useAuth() consumers work without changes"
  - "ESPN env vars (ESPN_SWID, ESPN_S2) checked first, encrypted DB columns as fallback"
  - "getEspnAuthFromEnv returns strict type (required SWID/espn_s2) to match existing callsites"

patterns-established:
  - "No-op auth pattern: middleware functions exist but do nothing, same exports"
  - "Env-first credential sourcing: check process.env before DB decrypt"

requirements-completed: [SIMP-01, SIMP-02, SIMP-03]

# Metrics
duration: 7min
completed: 2026-03-15
---

# Phase 43 Plan 01: Strip Auth & Env Config Summary

**No-op auth middleware, pass-through ProtectedRoute, and ESPN env var credential sourcing with DB fallback**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-15T17:25:32Z
- **Completed:** 2026-03-15T17:32:09Z
- **Tasks:** 4
- **Files modified:** 13

## Accomplishments
- All 4 backend auth middleware functions (authenticate, requireAdmin, requireLeagueAccess, requireTeamOwnership) converted to no-ops
- Frontend ProtectedRoute/AdminRoute now pass-through, AuthContext provides mock admin user, api.ts 401 redirect removed
- ESPN credential utility (getEspnAuthFromEnv) wired into all 7 auth sourcing sites across API routes, agents, and workers
- Both backend and frontend TypeScript compile cleanly

## Task Commits

Each task was committed atomically:

1. **Task 1: Make backend auth middleware no-ops** - `f3b27b1` (feat)
2. **Task 2: Remove frontend auth guards and login redirects** - `4c5794e` (feat)
3. **Task 3: Add env var ESPN credential support with DB fallback** - `c94048f` (feat)
4. **Task 4: Build verification** - no commit (verification only)

## Files Created/Modified
- `packages/backend/src/utils/espn-env.ts` - New utility: getEspnAuthFromEnv() reads ESPN_SWID/ESPN_S2 from process.env
- `packages/backend/src/middleware/auth.ts` - All 4 auth functions made no-op (kept exports)
- `packages/frontend/src/components/ProtectedRoute.tsx` - ProtectedRoute/AdminRoute pass-through
- `packages/frontend/src/contexts/AuthContext.tsx` - Always provides mock admin user
- `packages/frontend/src/lib/api.ts` - Removed 401 redirect-to-login and token refresh
- `packages/frontend/src/app/page.tsx` - Auto-redirect to first league without auth check
- `packages/backend/src/api/leagues.ts` - Env var ESPN auth fallback
- `packages/backend/src/api/recommendations.ts` - Env var ESPN auth fallback
- `packages/backend/src/api/projections.ts` - Env var ESPN auth fallback
- `packages/backend/src/api/admin.ts` - Env var ESPN auth fallback (2 sites)
- `packages/backend/src/agents/player-pool-sync.ts` - Env var ESPN auth fallback
- `packages/backend/src/workers/snapshot-worker.ts` - Env var ESPN auth fallback
- `packages/backend/src/workers/backfill-worker.ts` - Env var ESPN auth fallback

## Decisions Made
- Auth middleware made no-op rather than removed -- preserves exports for future re-enablement
- AuthContext provides mock admin user so all useAuth() consumers work without changes
- ESPN env vars (ESPN_SWID, ESPN_S2) checked first, encrypted DB columns as fallback
- getEspnAuthFromEnv returns strict type (required SWID/espn_s2) to match existing callsites

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed type incompatibility in getEspnAuthFromEnv return type**
- **Found during:** Task 3
- **Issue:** ESPNAuthCookies has optional SWID/espn_s2 but callsites expect required fields
- **Fix:** Changed return type to `{ SWID: string; espn_s2: string } | undefined` (strict)
- **Files modified:** packages/backend/src/utils/espn-env.ts
- **Committed in:** c94048f (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Type fix necessary for compilation. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All API routes accessible without authentication
- Frontend pages render without login redirect
- ESPN credentials configurable via ESPN_SWID and ESPN_S2 environment variables
- Ready for Phase 44 (hardcode league config)

## Self-Check: PASSED

All 6 key files verified present. All 3 task commits verified in git log.

---
*Phase: 43-strip-auth-env-config*
*Completed: 2026-03-15*
