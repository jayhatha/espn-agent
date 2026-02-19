---
phase: 01-foundation-critical-fixes
verified: 2026-02-19T23:00:00Z
status: gaps_found
score: 4/5 success criteria verified
gaps:
  - truth: "No frontend file contains hardcoded localhost:3001 -- all API calls go through lib/api.ts"
    status: failed
    reason: "3 frontend files still contain bare hardcoded localhost:3001 URLs without env var or api.ts usage"
    artifacts:
      - path: "packages/frontend/src/app/leagues/page.tsx"
        issue: "Line 19: fetch('http://localhost:3001/api/leagues') -- no env var, no api.ts"
      - path: "packages/frontend/src/app/leagues/connect/page.tsx"
        issue: "Line 47: fetch('http://localhost:3001/api/leagues/connect') -- no env var, no api.ts"
      - path: "packages/frontend/src/app/leagues/[id]/projections/page.tsx"
        issue: "Line 22: fetch('http://localhost:3001/api/projections/upload') -- no env var, no api.ts"
    missing:
      - "Migrate leagues/page.tsx to use api.getLeagues()"
      - "Migrate leagues/connect/page.tsx to use api.connectLeague()"
      - "Migrate leagues/[id]/projections/page.tsx to use api.uploadProjections() (or create file upload method)"
---

# Phase 01: Foundation & Critical Fixes Verification Report

**Phase Goal:** Fix all critical blockers preventing public launch -- secure data storage, working free agents, accurate trade math, shared components
**Verified:** 2026-02-19
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User's ESPN cookies are encrypted at rest in database (not plaintext) | VERIFIED | `encryption.ts` implements AES-256-GCM with `ENCRYPTION_KEY` env var. `leagues.ts` calls `encryptToken()` on connect (line 140) and auth update (line 407). Migration 007 adds `espn_swid_encrypted`/`espn_s2_encrypted` BYTEA columns. Shared types include encrypted fields. Manual snapshot trigger decrypts via `decryptToken()` (leagues.ts lines 484-488). |
| 2 | Free agent pool fetches successfully from ESPN API and populates recommendations | VERIFIED | `espn.ts` `fetchFreeAgents()` (lines 369-466) sends `filterStatus: ["FREEAGENT", "WAIVERS"]` with `kona_player_info` view. Orchestrator calls `fetchAndStoreFreeAgents()` (line 228) during snapshot. Recommendations API `/free-agents` endpoint (recommendations.ts line 18) calls `fetchFreeAgents` live with ownership data. |
| 3 | Trade simulation math uses component formulas (AVG = H/AB, not averaged rates) and returns correct deltas | VERIFIED | `trade-recommendation.ts` `simulateTradeImpact()` (lines 616-684) identifies rate stats, adjusts components by subtracting/adding player projections, then calls `calculateAVG`/`calculateOBP`/`calculateSLG`/`calculateOPS`/`calculateERA`/`calculateWHIP` from `@espn-fantasy/shared`. Test file has 6 test cases covering AVG, ERA, OBP, WHIP, zero-trade, and missing projections. |
| 4 | Frontend pages use centralized API client with environment-based URLs (no hardcoded localhost:3001) | FAILED | 3 files still hardcode `http://localhost:3001` without env var: `leagues/page.tsx` (line 19), `leagues/connect/page.tsx` (line 47), `leagues/[id]/projections/page.tsx` (line 22). Additionally, `admin/page.tsx` and `AuthContext.tsx` define their own `API_URL` constants instead of using api.ts (though they do use `NEXT_PUBLIC_API_URL` env var with fallback). The 5 league sub-pages (page, waivers, trades, standings, trends) and navigation.tsx ARE properly migrated. |
| 5 | All API routes require authentication and verify league ownership (no data leakage) | VERIFIED | Every route in `leagues.ts`, `recommendations.ts`, `timeseries.ts`, and `projections.ts` has `onRequest: [authenticate]`. League-specific routes additionally have `preHandler: [requireLeagueAccess]`. Team-specific routes have `requireTeamOwnership`. Projections upload requires admin role. `requireLeagueAccess` checks `team.user_id = request.user.userId` (auth.ts line 58). |

**Score:** 4/5 success criteria verified

### Required Artifacts (from Plan must_haves)

#### Plan 01-01: Backend Infrastructure

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/backend/src/utils/retry.ts` | Retryable axios instance factory | VERIFIED | 37 lines. Creates axios instance with `axiosRetry` configured for 3 retries, exponential delay, retries on network errors and 5xx. |
| `packages/backend/src/adapters/espn.ts` | ESPN adapter using retryable axios | VERIFIED | Line 4: `import { createRetryableAxios }`, line 230: `this.client = createRetryableAxios(logger)`. All HTTP calls use `this.client`. |
| `packages/backend/src/index.ts` | Rate limit plugin registration | VERIFIED | Lines 4/74-80: Imports and registers `@fastify/rate-limit` with Redis support and `espn-agent-rl:` namespace. Per-route limits configured on each route. |
| `packages/backend/src/workers/snapshot-worker.ts` | Job deduplication with BullMQ | VERIFIED | Uses `jobId: snapshot-${leagueId}-${today}` (line 84) with `removeOnComplete.age: 86400` and `removeOnFail.age: 86400`. BullMQ rejects duplicate jobIds within retention window. Includes `attempts: 3` with exponential backoff. |

#### Plan 01-02: Security (Encryption + Auth)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/backend/src/utils/encryption.ts` | Generalized encryption utility | VERIFIED | 78 lines. Uses `ENCRYPTION_KEY` env var (generic). `hasEncryptionKey()`, `encryptToken()`, `decryptToken()` with AES-256-GCM. |
| `packages/backend/src/db/migrations/007_encrypt_espn_cookies.sql` | Migration adding encrypted columns | VERIFIED | Adds `espn_swid_encrypted BYTEA` and `espn_s2_encrypted BYTEA` to league table. Comments explain encryption format. |
| `packages/backend/src/middleware/auth.ts` | Authentication and league access middleware | VERIFIED | 91 lines. `authenticate()` verifies JWT, `requireLeagueAccess()` reads `leagueId` from params and checks `team.user_id`, `requireTeamOwnership()` checks specific team ownership. Returns 401/403 appropriately. |

#### Plan 01-03: Rate Stat Component Math (TDD)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/backend/src/agents/__tests__/trade-recommendation.test.ts` | Tests proving component math works | VERIFIED | 638 lines. 6 test cases: AVG, ERA, OBP, WHIP, zero-trade, missing projections. Uses mock DB with component data. Verifies correct component math (e.g., AVG = 0.304 not 0.400). |
| `packages/backend/src/agents/trade-recommendation.ts` | Trade recommendation with rate stat calculations | VERIFIED | Lines 616-684: Switch statement calls `calculateAVG`, `calculateOBP`, `calculateSLG`, `calculateOPS`, `calculateERA`, `calculateWHIP` from shared package on adjusted components. Imports all 6 functions (lines 4-11). |

#### Plan 01-04: ESPN Data Gaps

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/backend/src/adapters/espn.ts` | Working fetchFreeAgents with ESPN filters | VERIFIED | Lines 369-466: Uses `filterStatus: ["FREEAGENT", "WAIVERS"]` with `kona_player_info` view and `x-fantasy-filter` parameter. Parses ownership data. |
| `packages/backend/src/adapters/espn.ts` | fetchTransactions method | VERIFIED | Lines 471-576: Uses `mTransactions2` view, parses transaction types (ADD/DROP/TRADE/WAIVER), extracts player moves with from/to teams. |
| `packages/backend/src/agents/snapshot-orchestrator.ts` | Orchestrator fetches free agents and transactions | VERIFIED | Lines 227-256: `Promise.allSettled([fetchAndStoreFreeAgents, fetchAndStoreTransactions])`. Free agent failure marks snapshot degraded. Transaction failure logged but non-blocking. Transactions upserted to `league_transaction_event` with conflict handling. |
| `packages/backend/src/agents/projections-ingest.ts` | Fuzzy matching fallback via PlayerIdentityResolutionAgent | VERIFIED | Line 6: imports `PlayerIdentityResolutionAgent`. Line 48: instantiates in constructor. `matchPlayer()` method (lines 72-149) first checks identity map, then calls `identityAgent.findBestMatch()`, applies `FUZZY_MATCH_CONFIDENCE_THRESHOLD = 0.8`. Tracks `exactMatches`/`fuzzyMatches`/`unmatched` statistics. |

#### Plan 01-05: Frontend API Client Migration

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/frontend/src/lib/api.ts` | Centralized API client with all endpoints | VERIFIED | 227 lines. 25+ methods covering leagues, projections, time series, recommendations, trades, auth. Uses `NEXT_PUBLIC_API_URL` env var. `fetchAPI` handles auth headers and 401 redirect. |
| Frontend pages migrated | All league pages use api.ts | PARTIAL | 7 files migrated (navigation, admin, and 5 league sub-pages). 3 files NOT migrated: `leagues/page.tsx`, `leagues/connect/page.tsx`, `leagues/[id]/projections/page.tsx` -- these still have bare `http://localhost:3001`. |

#### Plan 01-06: Frontend Shared Components

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/frontend/src/components/ui/StatsTable.tsx` | Reusable sortable stats table | VERIFIED | 155 lines. Sortable, configurable columns, empty state, compact mode, sticky header, row highlighting. |
| `packages/frontend/src/components/ui/StatCard.tsx` | Stat card component | VERIFIED | Exists in components/ui/ directory. |
| `packages/frontend/src/components/ui/LoadingSpinner.tsx` | Loading spinner component | VERIFIED | Exists. Imported by 5 league pages. |
| `packages/frontend/src/components/ui/ErrorAlert.tsx` | Error alert component | VERIFIED | Exists. Imported by 4 league pages. |
| `packages/frontend/src/components/ui/PageHeader.tsx` | Page header component | VERIFIED | Exists. Imported by 5 league pages. |
| `packages/frontend/src/components/league/TeamSelector.tsx` | Team selection dropdown | VERIFIED | 150 lines. Props: leagueId, teams, selectedTeamId, onSelect. Uses localStorage. Shows auto-detection UI. |
| `packages/frontend/src/components/league/CategoryStatsTable.tsx` | Category statistics table | VERIFIED | 148 lines. Formats rate stats to 3 decimals, rank colors, supports projected columns. |
| `packages/frontend/src/components/league/PlayerRow.tsx` | Player row component | VERIFIED | 70 lines. Shows player name, position, team. Supports add/drop/default variants, actions slot, compact mode. |

### Key Link Verification

#### Plan 01-01 Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `utils/retry.ts` | `adapters/espn.ts` | `createRetryableAxios` import | WIRED | Line 4 of espn.ts: `import { createRetryableAxios } from "../utils/retry.js"`, Line 230: `this.client = createRetryableAxios(logger)` |
| `index.ts` | Redis | `rate-limit plugin with Redis store` | WIRED | Lines 74-80: `server.register(rateLimit, { redis: process.env.REDIS_URL ? server.redis : undefined })` |

#### Plan 01-02 Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `api/leagues.ts` | `utils/encryption.ts` | `encryptToken` on connect and auth update | WIRED | Line 5: import. Line 140: `encryptToken(auth.SWID)` on connect. Line 407: `encryptToken(SWID)` on auth update. |
| `agents/snapshot-orchestrator.ts` | `utils/encryption.ts` | `decryptToken` for reading cookies | PARTIAL | Line 7: imports `decryptToken` and `hasEncryptionKey`. BUT: never called in the file. Decryption happens in `api/leagues.ts` (line 484-488) before calling the orchestrator. Scheduled snapshots via worker do NOT decrypt. |
| `api/recommendations.ts` | `middleware/auth.ts` | `onRequest authenticate` hook | WIRED | Line 7: imports `authenticate, requireLeagueAccess, requireTeamOwnership`. Every route has `onRequest: [authenticate]`. |

#### Plan 01-03 Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `trade-recommendation.ts` | `shared/formulas.ts` | Import rate stat functions | WIRED | Lines 4-11: `import { calculateAVG, calculateOBP, calculateSLG, calculateOPS, calculateERA, calculateWHIP } from "../../../shared/dist/index.js"`. Used in switch statement at lines 658-678. |

#### Plan 01-04 Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `snapshot-orchestrator.ts` | `adapters/espn.ts` | `fetchFreeAgents` call | WIRED | Line 557: `this.espnAdapter.fetchFreeAgents({...})` in `fetchAndStoreFreeAgents`. |
| `projections-ingest.ts` | `player-identity.ts` | `findBestMatch` fuzzy fallback | WIRED | Line 6: import. Line 54: instantiation. Line 101: `this.identityAgent.findBestMatch(fangraphsKey, playerName, team, positions)`. |
| `snapshot-orchestrator.ts` | `league_transaction_event` | Transaction storage | WIRED | Lines 672-693: `insertInto("league_transaction_event").values({...}).onConflict(...).doNothing()`. |

#### Plan 01-05 Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `leagues/[id]/page.tsx` | `lib/api.ts` | Import and call api methods | WIRED | Line 8: `import { api } from "@/lib/api"` |
| `leagues/[id]/trades/page.tsx` | `lib/api.ts` | Import and call api methods | WIRED | Line 7: `import { api } from "@/lib/api"` |

#### Plan 01-06 Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `standings/page.tsx` | `CategoryStatsTable.tsx` | Import and render | NOT WIRED | `standings/page.tsx` imports `StatsTable` (line 10) but does NOT import `CategoryStatsTable`. Uses generic StatsTable instead. |
| `waivers/page.tsx` | `PlayerRow.tsx` | Import and render | WIRED | Line 11: `import { PlayerRow } from "@/components/league/PlayerRow"` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DATA-01 | 01-02 | ESPN auth cookies encrypted at rest | SATISFIED | AES-256-GCM encryption in encryption.ts, migration 007, leagues.ts encrypts on connect/update |
| DATA-02 | 01-04 | PlayerIdentityResolution wired into projections ingest | SATISFIED | projections-ingest.ts imports and uses PlayerIdentityResolutionAgent with 0.8 confidence threshold |
| DATA-03 | 01-04 | Free agent pool fetched from ESPN | SATISFIED | espn.ts fetchFreeAgents with proper filters, orchestrator stores during snapshot, API serves live |
| DATA-04 | 01-03 | Rate stat component math in trade simulations | SATISFIED | 6 rate stats use component math via shared formulas, 6 test cases in test file |
| DATA-05 | 01-01 | ESPN API retry with backoff | SATISFIED | retry.ts with axios-retry, 3 retries, exponential delay, wired into ESPNAdapter |
| DATA-06 | 01-04 | Transaction ingestion from ESPN | SATISFIED | espn.ts fetchTransactions, orchestrator stores in league_transaction_event with upsert |
| INFR-01 | 01-02 | JWT auth on all API routes | SATISFIED | All routes in leagues, recommendations, timeseries, projections have authenticate hook. requireLeagueAccess on league-specific routes. |
| INFR-02 | 01-01 | API rate limiting | SATISFIED | @fastify/rate-limit registered with Redis/in-memory. Per-route configs: 100/min reads, 30/min writes, 10/hour expensive ops. |
| INFR-03 | 01-01 | Snapshot job deduplication | SATISFIED | BullMQ jobId pattern `snapshot-${leagueId}-${today}` with 24h retention. Duplicate add() returns null and logs dedup message. |
| DASH-05 | 01-06 | Shared frontend component library | SATISFIED | 8 components (5 UI primitives + 3 league-specific). All 5 league sub-pages import and use shared components. |
| DASH-06 | 01-05 | Centralized frontend API client | PARTIALLY SATISFIED | api.ts exists with 25+ methods and env-based URL. 7 files migrated. 3 files still hardcode localhost:3001 (leagues/page.tsx, leagues/connect/page.tsx, projections/page.tsx). |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/frontend/src/app/leagues/page.tsx` | 19 | Hardcoded `http://localhost:3001` | BLOCKER | Breaks in production. This is the leagues listing page -- primary navigation entry point. |
| `packages/frontend/src/app/leagues/connect/page.tsx` | 47 | Hardcoded `http://localhost:3001` | BLOCKER | Breaks in production. This is the league connection flow -- critical onboarding path. |
| `packages/frontend/src/app/leagues/[id]/projections/page.tsx` | 22 | Hardcoded `http://localhost:3001` | BLOCKER | Breaks in production. Projections upload page. |
| `packages/backend/src/agents/snapshot-orchestrator.ts` | 7 | Imported `decryptToken`/`hasEncryptionKey` but never used | WARNING | Scheduled snapshots for private leagues will not have auth cookies. Manual snapshots work because leagues.ts decrypts before calling orchestrator. |
| `packages/backend/src/db/schema.ts` | - | Schema imports League type from shared which has encrypted fields | INFO | Schema correctly includes encrypted fields via shared types import. No local definition needed. |

### Human Verification Required

### 1. Encryption Round-Trip

**Test:** Connect a league with ESPN cookies, then trigger a manual snapshot.
**Expected:** Cookies are encrypted in the `espn_swid_encrypted` column (check DB), and the snapshot successfully fetches data using decrypted cookies.
**Why human:** Requires running DB, ESPN API access, and checking actual column values.

### 2. Free Agent Data Quality

**Test:** Trigger a snapshot for a league and check `/api/leagues/:id/free-agents`.
**Expected:** Returns 200+ free agents with names, positions, ownership percentages. Not empty array.
**Why human:** Requires live ESPN API access to verify response parsing.

### 3. Rate Limit Enforcement

**Test:** Send 101 GET requests to a read endpoint within 1 minute.
**Expected:** First 100 succeed, 101st returns 429 Too Many Requests.
**Why human:** Requires running server with Redis or in-memory rate limiting.

### 4. JWT Auth Enforcement

**Test:** Make a request to `/api/leagues` without an Authorization header.
**Expected:** Returns 401 Unauthorized.
**Why human:** Requires running server to verify middleware chain execution.

### 5. Shared Component Rendering

**Test:** Navigate to leagues/[id]/standings, leagues/[id]/waivers, leagues/[id]/trades pages.
**Expected:** Pages render using shared components (consistent loading spinners, error alerts, table styles). No visual regression from pre-refactor state.
**Why human:** Visual verification of component rendering and consistency.

### Gaps Summary

**One gap found preventing full goal achievement:**

The frontend API client migration (DASH-06) is incomplete. Three files retain bare hardcoded `http://localhost:3001` URLs:

1. **`packages/frontend/src/app/leagues/page.tsx`** -- The leagues listing page, which is the primary navigation entry point after login. Uses `fetch("http://localhost:3001/api/leagues")` instead of `api.getLeagues()`.

2. **`packages/frontend/src/app/leagues/connect/page.tsx`** -- The league connection form, which is the critical onboarding path. Uses `fetch("http://localhost:3001/api/leagues/connect")` instead of `api.connectLeague()`.

3. **`packages/frontend/src/app/leagues/[id]/projections/page.tsx`** -- The projections upload page. Uses `fetch("http://localhost:3001/api/projections/upload")` instead of the api.ts upload method.

These are not merely using a different pattern with an env var fallback (like admin/page.tsx and AuthContext.tsx do). These have **no environment variable at all** -- they will fail in any non-localhost deployment.

All other Phase 1 goals are achieved: encryption works, free agents fetch correctly, trade math uses component formulas, all API routes enforce JWT auth and league ownership, rate limiting is configured, snapshot deduplication works, and shared components are created and wired into pages.

**Root cause:** Plan 01-05 listed `leagues/page.tsx` and `leagues/connect/page.tsx` in the files_modified list but they were never actually modified. The `projections/page.tsx` was not listed in any plan's files_modified at all.

---

_Verified: 2026-02-19_
_Verifier: Claude (gsd-verifier)_
