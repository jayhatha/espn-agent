---
phase: 02-authentication-onboarding
plan: 01
subsystem: auth
tags: [jwt, httponly-cookies, refresh-tokens, bcrypt, fastify-cookie]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: JWT auth routes, users table, middleware
provides:
  - HttpOnly cookie-based authentication (access + refresh tokens)
  - Refresh token rotation with reuse detection
  - Cookie-aware JWT middleware via @fastify/cookie
  - Shared auth-cookies utility (setAuthCookies, clearAuthCookies, issueTokenPair)
affects: [02-02, 02-03, frontend-auth]

# Tech tracking
tech-stack:
  added: ["@fastify/cookie"]
  patterns: ["HttpOnly cookie auth", "refresh token rotation", "bcrypt 13 rounds for passwords"]

key-files:
  created:
    - packages/backend/src/db/migrations/008_add_refresh_tokens.sql
    - packages/backend/src/utils/auth-cookies.ts
  modified:
    - packages/backend/src/api/auth.ts
    - packages/backend/src/api/auth-oauth.ts
    - packages/backend/src/db/schema.ts
    - packages/backend/src/index.ts
    - packages/shared/src/types.ts
    - packages/backend/package.json

key-decisions:
  - "Shared auth-cookies utility in utils/ instead of exporting from auth.ts to avoid circular dependencies"
  - "Bcrypt 10 rounds for refresh token hashing (speed) vs 13 rounds for passwords (security)"
  - "Graceful logout: clear cookies even if JWT is expired/invalid"

patterns-established:
  - "Cookie auth: access token in / path, refresh token scoped to /api/auth path"
  - "Token rotation: delete old token before issuing new pair, revoke all on reuse detection"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04]

# Metrics
duration: 4min
completed: 2026-02-19
---

# Phase 2 Plan 1: Backend Auth Hardening Summary

**HttpOnly cookie auth with 15-min access tokens, 7-day rotating refresh tokens, and bcrypt 13 rounds**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-20T01:38:06Z
- **Completed:** 2026-02-20T01:42:29Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Backend auth routes issue HttpOnly cookies instead of returning tokens in response body
- Refresh token rotation endpoint with automatic reuse detection (revokes all sessions on suspected attack)
- OAuth callbacks set cookies and redirect without token in URL query string
- Password hashing upgraded from bcrypt 10 to 13 rounds
- Kysely Database interface now includes typed UsersTable and RefreshTokensTable with Generated columns

## Task Commits

Each task was committed atomically:

1. **Task 1: Database migration, schema, types, and @fastify/cookie setup** - `29d1d34` (feat)
2. **Task 2: Migrate auth routes to HttpOnly cookies with refresh token rotation** - `a128604` (feat)

**Plan metadata:** (pending)

## Files Created/Modified
- `packages/backend/src/db/migrations/008_add_refresh_tokens.sql` - Refresh tokens table with user_id FK and expiry index
- `packages/backend/src/utils/auth-cookies.ts` - Shared helpers for cookie operations and token pair issuance
- `packages/backend/src/api/auth.ts` - Signup/login/refresh/logout routes with cookie-based auth
- `packages/backend/src/api/auth-oauth.ts` - Google/GitHub OAuth callbacks with cookie auth (no token in URL)
- `packages/backend/src/db/schema.ts` - Added UsersTable and RefreshTokensTable with Kysely Generated types
- `packages/backend/src/index.ts` - Registered @fastify/cookie, configured JWT cookie reading
- `packages/shared/src/types.ts` - Removed token field from AuthResponse
- `packages/backend/package.json` - Added @fastify/cookie dependency
- `pnpm-lock.yaml` - Updated lockfile

## Decisions Made
- Created `packages/backend/src/utils/auth-cookies.ts` shared utility instead of exporting from auth.ts to cleanly share between auth.ts and auth-oauth.ts without circular dependency
- Bcrypt 10 rounds for refresh token hashing (speed, since tokens are already high-entropy) vs 13 rounds for user passwords (security against brute force)
- Logout handler tries to authenticate but gracefully clears cookies even with invalid/expired token
- Email normalized to lowercase on signup and login for case-insensitive uniqueness

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required for this plan. OAuth env vars (GOOGLE_CLIENT_ID, etc.) were already documented in prior phases.

## Next Phase Readiness
- Backend cookie auth is ready for frontend integration (02-02)
- Frontend needs to remove localStorage token handling and rely on cookies
- Frontend auth callback page needs update to handle cookie-based redirect (no query param)
- COOKIE_SECRET env var should be set in production (falls back to JWT_SECRET)

## Self-Check: PASSED

All 8 key files verified present. Both task commits (29d1d34, a128604) verified in git log.

---
*Phase: 02-authentication-onboarding*
*Completed: 2026-02-19*
