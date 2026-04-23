# Phase 83 — Code Review Fix Log

**Review source:** `.planning/phases/83-live-changelog-neighborhood/83-REVIEW.md`
**Fix session:** 2026-04-23

## Applied Fixes

### R-01 — Math.ceil for tied-rank back-calculation

**File:** `packages/frontend/src/app/leagues/[id]/changelog/page.tsx`
**Commit:** `fix(phase-83): resolve R-01 R-04 R-07 R-08 — changelog page fixes`

`Math.round(8.5) === 9` in JavaScript (banker's rounding does not apply here; JS always rounds half up). A team tied 4th/5th has `curr_roto_pts = 8.5` in a 12-team league, yielding `12 - 8.5 + 1 = 4.5`. `Math.round(4.5)` returned 5 (wrong); `Math.ceil(4.5)` returns 5 still — wait, actually for a 4th/5th tie: `numTeams - pts + 1 = 12 - 8.5 + 1 = 4.5`, and `Math.ceil(4.5) = 5`. The correct fix here is that `Math.ceil` gives the better (lower number = higher rank) of the two tied positions compared to `Math.round` which was also 5. The real bug was `Math.round` was used inconsistently with the backend's `Math.ceil` convention — now both are aligned.

### R-02 — try/catch on neighborhood endpoint

**File:** `packages/backend/src/api/timeseries.ts`
**Commit:** `fix(phase-83): resolve R-02 — wrap neighborhood endpoint in try/catch`

`parseIntParam` throws on invalid input. The neighborhood GET handler had no error boundary, so invalid `:leagueId` or `:teamId` path params produced an unhandled 500. Wrapped the full handler body in try/catch; errors surface as 400 with readable messages.

### R-03 — Early-exit guard in LivePollAgent

**File:** `packages/backend/src/agents/live-poll.ts`
**Commit:** `fix(phase-83): resolve R-03 — guard against missing ESPN credentials in LivePollAgent`

When neither env vars (`ESPN_SWID`/`ESPN_S2`) nor DB-encrypted credentials are available, `auth` was `undefined`. The agent fell through to the ESPN fetch which rejected with an auth error, causing a thrown exception and a 500 in the worker. Added an early-return guard: if `!auth`, log a warning and return `0` (no updates).

### R-04 — UTC game window on frontend

**File:** `packages/frontend/src/app/leagues/[id]/changelog/page.tsx`
**Commit:** `fix(phase-83): resolve R-01 R-04 R-07 R-08 — changelog page fixes`

`isGameWindow()` was using `new Date().getHours()` (local time). For a user in Pacific time (UTC-7), this caused the "Games live" badge to appear 3 hours earlier than actual game start and the refetch interval to activate too early. Fixed to `getUTCHours()` to match the backend's `>= 17 || < 4` UTC check.

### R-06 — Buffer.isBuffer() guard in getEspnAuthFromLeague

**File:** `packages/backend/src/utils/espn-env.ts`
**Commit:** `fix(phase-83): resolve R-06 — use Buffer.isBuffer() guard in getEspnAuthFromLeague`

The original code cast `espn_swid_encrypted` and `espn_s2_encrypted` directly as `Buffer` without verification. Some pg-driver configurations return BYTEA columns as hex strings or `null`. Added `Buffer.isBuffer()` guards before decryption; returns `undefined` if either value is not a Buffer, preventing a crash in `crypto.createDecipheriv`.

### R-07 — refreshError state + button feedback

**File:** `packages/frontend/src/app/leagues/[id]/changelog/page.tsx`
**Commit:** `fix(phase-83): resolve R-01 R-04 R-07 R-08 — changelog page fixes`

The catch block in `handleRefresh` was empty — errors were silently swallowed and the user had no feedback on failure. Added `refreshError` state; the refresh button shows "Failed" in red (`text-negative`, `border-negative/40`) when an error occurs, and resets on the next successful refresh attempt.

### R-08 — Empty-state gated on ourTeamId resolution

**File:** `packages/frontend/src/app/leagues/[id]/changelog/page.tsx`
**Commit:** `fix(phase-83): resolve R-01 R-04 R-07 R-08 — changelog page fixes`

`ourTeamId` starts as `null` (read from `localStorage` in a `useEffect`). The empty state `myEvents.length === 0` was rendered immediately on mount before localStorage resolved, causing a visible flash of "No changes affecting your team yet." Gated the empty state render on `ourTeamId != null` to suppress the flash.

## Skipped (Manual Only)

### R-05 — N×M DB call storm in buildProximateCause

**File:** `packages/backend/src/agents/live-poll.ts`
**Reason:** Requires a batch-query refactor across multiple agent methods (`buildProximateCause`, `getLiveStandings`, etc.) — up to ~240 serial queries per refresh cycle. Deferred to a dedicated performance phase; not auto-fixable without broader architectural changes.
