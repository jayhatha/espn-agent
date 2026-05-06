---
phase: 85-waiver-page-advanced-stats-columns
review_depth: standard
scope: entire-app
reviewed: 2026-05-04
files_reviewed: 65
status: findings_present
critical: 3
warning: 8
info: 6
---

# Full-App Code Review — Phase 85

**Scope:** Entire application (65 files)
**Depth:** Standard (per-file analysis with language-specific checks)
**Date:** 2026-05-04

---

## Summary
- Files reviewed: 65
- Critical: 3 findings
- Warning: 8 findings
- Info: 6 findings

---

## Critical Findings

### C1: Authentication Middleware Completely Bypassed — Entire Backend Unauthenticated
- **File**: `packages/backend/src/middleware/auth.ts`
- **Line**: 22–51
- **Issue**: All four auth functions (`authenticate`, `requireAdmin`, `requireLeagueAccess`, `requireTeamOwnership`) are no-ops that inject a hardcoded mock user `{ userId: 1, role: "admin" }`. Every registered route calls `onRequest: [authenticate]` or `preHandler: [requireAdmin]` and enforces nothing. Any unauthenticated caller can access admin-only user management, any team's trade/waiver data, and any league's private credentials.
- **Note**: Auth was intentionally stripped in Phase 43 for personal/solo use (per CLAUDE.md). The fix should gate the bypass to `NODE_ENV=development` rather than always-on.
- **Fix**: Guard the bypass with an env check:
  ```ts
  if (process.env.NODE_ENV !== "development") {
    await request.jwtVerify();
  } else {
    request.user = { userId: 1, role: "admin" };
  }
  ```

---

### C2: Hardcoded Fallback JWT and Cookie Secrets
- **File**: `packages/backend/src/index.ts`
- **Line**: 84–94
- **Issue**: Both secrets fall back to known public strings when env vars are absent:
  ```ts
  secret: process.env.COOKIE_SECRET || process.env.JWT_SECRET || "development-secret"
  secret: process.env.JWT_SECRET || "development-secret-change-in-production"
  ```
  In any deployed environment without these env vars set, attackers can forge valid tokens using the public fallback string.
- **Fix**: Fail fast on startup when secrets are missing in non-development environments:
  ```ts
  if (!process.env.JWT_SECRET && process.env.NODE_ENV !== "development") {
    throw new Error("JWT_SECRET environment variable is required in production");
  }
  const jwtSecret = process.env.JWT_SECRET ?? "development-secret";
  ```

---

### C3: Internal API Skips Authentication When `INTERNAL_JOB_TOKEN` Is Not Set
- **File**: `packages/backend/src/api/internal.ts`
- **Line**: 18–27
- **Issue**: `verifyInternalToken` explicitly allows all requests when `INTERNAL_JOB_TOKEN` is unset. Routes under `/internal/` expose `morningReportQueue.add(...)` with arbitrary params, Slack notification enumeration, and DB health. In any environment missing this env var (the default state), the internal API is fully open.
- **Fix**: When running outside development, require the token unconditionally:
  ```ts
  const token = process.env.INTERNAL_JOB_TOKEN;
  if (!token) {
    if (process.env.NODE_ENV !== "development") {
      throw new Error("INTERNAL_JOB_TOKEN is required in production");
    }
    return; // dev: allow
  }
  if (request.headers["x-internal-token"] !== token) {
    throw reply.forbidden("Invalid internal token");
  }
  ```

---

## Warning Findings

### W1: CORS Allows Any Chrome Extension Origin
- **File**: `packages/backend/src/index.ts`
- **Line**: 72–74
- **Issue**: `/^chrome-extension:\/\//.test(origin)` allows any installed Chrome extension to make credentialed cross-origin requests. A malicious extension can exfiltrate session cookies and league credentials.
- **Fix**: Allowlist the specific extension ID:
  ```ts
  /^chrome-extension:\/\/YOUR_EXTENSION_ID$/.test(origin)
  ```
  Store the extension ID in an env var (`CHROME_EXTENSION_ID`).

---

### W2: Slack OAuth CSRF Validation Is Broken — Always Fails
- **File**: `packages/backend/src/api/slack.ts`
- **Line**: 38, 90–98
- **Issue**: The state cookie is set `signed: true` but read via `request.cookies.oauth_state` which returns the raw `s:value.hmac` blob. The comparison `callbackState !== storedState` compares a plain string against the signed blob, so it always fails (treating all OAuth callbacks as CSRF attacks).
- **Fix**:
  ```ts
  const unsigned = request.unsignCookie(request.cookies.oauth_state ?? "");
  if (!unsigned.valid || callbackState !== unsigned.value) {
    return reply.badRequest("Invalid OAuth state");
  }
  ```

---

### W3: `timeseries.ts` `teamIds` Filter Passes `NaN` to Kysely `in()` Clause
- **File**: `packages/backend/src/api/timeseries.ts`
- **Line**: ~127–130 (repeated across multiple routes)
- **Issue**: `teamIds.split(",").map(id => parseInt(id, 10))` produces `NaN` for non-numeric segments. Kysely emits `WHERE team_id IN (1, NaN)` which causes a PostgreSQL runtime error.
- **Fix**:
  ```ts
  const ids = teamIds.split(",")
    .map(id => parseInt(id, 10))
    .filter(id => !isNaN(id));
  if (ids.length > 0) {
    query = query.where("team_id", "in", ids);
  }
  ```

---

### W4: Draft Live WebSocket Endpoint Has No Authentication
- **File**: `packages/backend/src/api/draft-live.ts`
- **Line**: 45–50
- **Issue**: `/draft/live` accepts WebSocket connections from any client without verifying any token or session. A rogue client can broadcast arbitrary JSON payloads to all connected mobile clients.
- **Fix**: Require a `token` query parameter and verify against a valid session before upgrading the connection.

---

### W5: Admin Endpoint `limit` and `page` Params Not Validated — Full Table Dump Possible
- **File**: `packages/backend/src/api/admin.ts`
- **Line**: 35–36
- **Issue**: `parseInt(request.query.limit || "50", 10)` is used directly without range checks. `limit=999999` dumps the entire table. Non-numeric values produce `NaN`.
- **Fix**:
  ```ts
  const limit = Math.min(Math.max(parseInt(request.query.limit || "50", 10) || 50, 1), 100);
  const page = Math.max(parseInt(request.query.page || "1", 10) || 1, 1);
  ```

---

### W6: `PlayerIdentityResolutionAgent.findBestMatch` Loads Entire Player Table Into Memory Per Call
- **File**: `packages/backend/src/agents/player-identity.ts`
- **Line**: 111–127
- **Issue**: `this.db.selectFrom("player").selectAll()` loads all players into memory for in-process Levenshtein scoring. Called per-player during projections upload, creating O(N×M) memory + CPU usage.
- **Fix**: Pre-filter candidates with a SQL `ILIKE` pattern on normalized name before fetching, or implement `pg_trgm` similarity search.

---

### W7: Draft Rankings Staleness Ordering Bug — `"missing"` Preferred Over `"stale"`
- **File**: `packages/backend/src/agents/draft-rankings.ts`
- **Line**: ~115–116
- **Issue**: `orderBy("staleness", "asc")` sorts alphabetically: `fresh < missing < stale`. When no fresh run exists, a `"missing"` run (no data) is returned before a `"stale"` run (outdated but present). Same bug exists in `AuctionValuationAgent`.
- **Fix**:
  ```ts
  .orderBy(sql`CASE staleness WHEN 'fresh' THEN 0 WHEN 'stale' THEN 1 ELSE 2 END`, "asc")
  ```

---

### W8: `slack-approval-worker.ts` Calls `process.exit(0)` at Module Level
- **File**: `packages/backend/src/workers/slack-approval-worker.ts`
- **Line**: 15–17
- **Issue**: Top-level `if (!isSlackEnabled()) { ... process.exit(0); }` terminates the entire process if Slack is disabled. Any import of this module as a side effect kills the host process.
- **Fix**: Move the Slack-enabled guard inside a startup/init function, never call `process.exit` at module evaluation time.

---

## Info Findings

### I1: Multiple Workers Register Conflicting `SIGTERM` Handlers
- **File**: `packages/backend/src/workers/snapshot-worker.ts`, `packages/backend/src/workers/backfill-worker.ts`
- **Line**: snapshot-worker.ts ~158; backfill-worker.ts ~83
- **Issue**: `snapshot-worker.ts` imports `backfill-worker.ts` as side effect. Both register `process.on("SIGTERM", ...)` that call `process.exit(0)`. First handler to fire terminates before the second worker can close, leaving BullMQ jobs dirty.
- **Fix**: Centralize SIGTERM handling in a single entry point that awaits all worker closes before exiting.

---

### I2: `advanced-stats.ts` External CSV Requests Have No Timeout
- **File**: `packages/backend/src/adapters/advanced-stats.ts`
- **Line**: `fetchCsvRows` function
- **Issue**: `axios.get` to Baseball Savant endpoints has no `timeout` option. A hung connection blocks indefinitely.
- **Fix**: Add `timeout: 15000` to all external fetch calls in this adapter.

---

### I3: `TopBar.tsx` Stores `NaN` to State from `localStorage`
- **File**: `packages/frontend/src/components/shell/TopBar.tsx`
- **Line**: ~82
- **Issue**: `setTeamId(parseInt(stored, 10))` stores `NaN` when `localStorage` contains a corrupt value, causing downstream API calls to request `/teams/NaN/...`.
- **Fix**: `const parsed = parseInt(stored, 10); if (!isNaN(parsed)) setTeamId(parsed);`

---

### I4: `/api/leagues/:leagueId/free-agents` Missing Authentication Decorator
- **File**: `packages/backend/src/api/recommendations.ts`
- **Line**: ~27–35
- **Issue**: The free-agents endpoint omits `onRequest: [authenticate]`. If auth is ever restored, this route remains publicly accessible.
- **Fix**: Add `onRequest: [authenticate]` to the route options.

---

### I5: `leagueId`/`teamId` URL Params Not Validated Across Routes
- **File**: `packages/backend/src/api/faab.ts`, `packages/backend/src/api/pitching-usage.ts`, `packages/backend/src/api/transaction-impact.ts` (and others)
- **Line**: Various
- **Issue**: `parseInt(request.params.leagueId, 10)` used directly without `NaN` or negative-value checks. Produces invalid SQL in Kysely.
- **Fix**: Use the existing `parseIntParam` helper consistently across all route files.

---

### I6: `projections-ingest.ts` Deduplication Last-Write-Wins on Duplicate Player IDs
- **File**: `packages/backend/src/agents/projections-ingest.ts`
- **Line**: 34–44
- **Issue**: For two-way players appearing in both batter and pitcher CSV files, `{ ...existing.stat_components_json, ...row.stat_components_json }` silently overwrites overlapping stat keys. Produces mixed hitter+pitcher stat objects.
- **Fix**: Split batter/pitcher stat components by position type before merging, or use separate projection rows keyed by player+position-type.
