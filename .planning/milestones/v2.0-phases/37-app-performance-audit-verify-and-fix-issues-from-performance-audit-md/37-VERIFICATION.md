---
phase: 37-app-performance-audit
verified: 2026-03-09T22:30:00Z
status: passed
score: 21/21 issues verified
re_verification: false
---

# Phase 37: App Performance Audit Verification Report

**Phase Goal:** Verify and fix performance issues identified in PERFORMANCE_AUDIT.md across backend DB queries, frontend React rendering, Chrome extension DOM operations, and infrastructure configuration.
**Verified:** 2026-03-09T22:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                     | Status     | Evidence                                                              |
|----|-------------------------------------------------------------------------------------------|------------|-----------------------------------------------------------------------|
| 1  | DB pool supports 25 concurrent connections with timeout failsafes                         | VERIFIED   | `max: 25, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, maxUses: 7500` in connection.ts |
| 2  | BullMQ worker processes up to 3 snapshot jobs concurrently                                | VERIFIED   | `{ connection: connection as any, concurrency: 3 }` in snapshot-worker.ts:67 |
| 3  | Team projections compute in parallel via Promise.all                                      | VERIFIED   | `const teamProjections = await Promise.all(teams.map(...))` in standings-projection.ts:84 |
| 4  | Snapshot orchestrator reuses espnTeamIdToDbId map without re-querying                    | VERIFIED   | Map declared at line 262 outside transaction, reused at line 371 in step 8 |
| 5  | Snapshot writes players/injury/roster in 3 batch inserts instead of ~1920 individual queries | VERIFIED | Pre-fetch all players (1 SELECT), collect rows in arrays, 3 batch INSERTs in writePlayersAndRosters |
| 6  | Projections ingest batches player_projection inserts in 500-row chunks                   | VERIFIED   | `projectionRows` array collected in loop, chunked INSERT at lines 421-432 and 554-563 |
| 7  | Free-agent endpoint upserts all players in a single batch insert                         | VERIFIED   | `playerRows = espnFreeAgents.map(...)` then single `insertInto("player").values(playerRows)` |
| 8  | Free-agent endpoint supports offset-based pagination                                      | VERIFIED   | `offset` query param, `pageOffset`, pagination metadata in response |
| 9  | Composite indexes exist on team_roster_snapshot and team_daily_category_totals            | VERIFIED   | Migration 017 creates both indexes with IF NOT EXISTS |
| 10 | Timeseries endpoints have a default LIMIT of 1000 rows                                   | VERIFIED   | `queryLimit = limit ? parseInt(limit, 10) : 1000` applied at 4 query sites |
| 11 | League list query has LIMIT 100                                                           | VERIFIED   | `.limit(100)` at leagues.ts:353 |
| 12 | ESPN throttle uses p-limit(1) mutex preventing race conditions                            | VERIFIED   | `pLimit(1)` imported and used in `throttledEspnCall<T>` wrapper; all 5 main call sites updated |
| 13 | Redundant 429 catch blocks removed from main ESPN methods                                 | VERIFIED   | Only 1 remaining `status === 429` check, in `fetchHistoricalWeek` — intentionally left as its own instance-level throttle, per summary |
| 14 | LRU cache holds 2000 entries                                                              | VERIFIED   | `max: 2000` in espn.ts:294 |
| 15 | TanStack staleTime is 5 minutes with 10 minute gcTime                                    | VERIFIED   | `staleTime: 5 * 60_000, gcTime: 10 * 60_000` in providers.tsx:13-14 |
| 16 | DLQ job retention is 7 days                                                               | VERIFIED   | `removeOnComplete: { age: 86400 * 7 }` in snapshot-worker.ts:91 |
| 17 | Standings page memoizes matrix computations                                               | VERIFIED   | `currentMatrix = useMemo(...)` at line 102, `projectedMatrix = useMemo(...)` at line 119 |
| 18 | Turbo cache invalidates when tsconfig files change                                        | VERIFIED   | `"**/tsconfig*.json"` in `globalDependencies`, `inputs` array on build task |
| 19 | Next.js config includes compress:true and productionBrowserSourceMaps:false               | VERIFIED   | Both settings present in next.config.mjs |
| 20 | calculateCategorySGP uses single-pass variance (sumSq pattern)                           | VERIFIED   | `sumSq += val * val` single-pass in formulas.ts:153-159, no intermediate array |
| 21 | JSONB batter/pitcher detection moved to application code                                  | VERIFIED   | `selectFrom("player_projection").select(["pp.stat_components_json"])` then JS loop in projections-ingest.ts:257-278 |
| 22 | Waivers page paginates recommendations client-side (10/page)                             | VERIFIED   | `recPage`, `RECS_PER_PAGE = 10`, prev/next controls in waivers/page.tsx:105-497 |
| 23 | MutationObserver targets narrower container with 5s periodic scan                        | VERIFIED   | `bootstrapTarget` tries ESPN-specific selectors before `document.body`; `setInterval(..., 5000)` |
| 24 | Auction player observer uses only MutationObserver, no setInterval                       | VERIFIED   | Cleanup comment at dom-observers.ts:1387 confirms no `setInterval` in `observeCurrentAuctionPlayer` |
| 25 | Ranking lookup maps are cached at module level with hash invalidation                    | VERIFIED   | `cachedPitcherMap`, `cachedHitterMap`, `cachedRelieverMap`, `cachedLastNameIndex` declared at api-client.ts:309-313 |

**Score:** 21/21 issues (25 supporting truths all pass)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/backend/src/db/connection.ts` | Pool max:25 with timeouts | VERIFIED | max:25, connectionTimeoutMillis:5000, idleTimeoutMillis:30000, maxUses:7500 |
| `packages/backend/src/workers/snapshot-worker.ts` | concurrency:3, DLQ 7 days | VERIFIED | concurrency:3 at line 67; `86400 * 7` at line 91 |
| `packages/backend/src/agents/standings-projection.ts` | Promise.all for projections | VERIFIED | Line 84-88: `await Promise.all(teams.map(...))` |
| `packages/backend/src/agents/snapshot-orchestrator.ts` | Batch inserts, map reuse | VERIFIED | writePlayersAndRosters uses 1 SELECT + 3 batch INSERTs; map declared outside transaction |
| `packages/backend/src/agents/projections-ingest.ts` | Batch projection inserts, app-side JSONB | VERIFIED | Chunk-based batch INSERT; application-level batter/pitcher counting |
| `packages/backend/src/api/recommendations.ts` | Batch upsert, pagination | VERIFIED | Single batch upsert for free agents; offset param, pagination metadata |
| `packages/backend/src/api/timeseries.ts` | Default LIMIT 1000 | VERIFIED | Applied at 4 query sites |
| `packages/backend/src/api/leagues.ts` | LIMIT 100 | VERIFIED | `.limit(100)` at line 353 |
| `packages/backend/src/adapters/espn.ts` | p-limit mutex, LRU 2000 | VERIFIED | `pLimit(1)` with `throttledEspnCall<T>`; `max: 2000` |
| `packages/backend/src/db/migrations/017_add_missing_indexes.sql` | 2 composite indexes | VERIFIED | idx_team_roster_snapshot_league_date_team + idx_team_daily_cat_totals_league_date_team |
| `packages/frontend/src/app/leagues/[id]/standings/page.tsx` | useMemo for both matrices | VERIFIED | Lines 102 and 119 |
| `packages/frontend/src/app/providers.tsx` | staleTime/gcTime | VERIFIED | 5min staleTime, 10min gcTime |
| `packages/frontend/src/app/leagues/[id]/waivers/page.tsx` | Client-side pagination | VERIFIED | recPage, RECS_PER_PAGE=10, prev/next controls |
| `packages/frontend/next.config.mjs` | compress, no source maps | VERIFIED | compress:true, productionBrowserSourceMaps:false |
| `packages/extension/lib/dom-observers.ts` | Narrowed observer, 5s interval, no duplicate polling | VERIFIED | Narrow container selectors, 5000ms interval, no setInterval in auction observer |
| `packages/extension/lib/api-client.ts` | Cached ranking maps | VERIFIED | Module-level cache variables with hash-based invalidation |
| `packages/shared/src/formulas.ts` | Single-pass variance | VERIFIED | sumSq pattern, no intermediate array |
| `turbo.json` | tsconfig globalDependencies, inputs | VERIFIED | Both present |
| `packages/backend/package.json` | p-limit dependency | VERIFIED | `"p-limit": "^7.3.0"` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| connection.ts (pool max:25) | standings-projection.ts (Promise.all) | Pool must support parallel connections | WIRED | 25 max connections supports ~12-team Promise.all without exhaustion |
| snapshot-orchestrator.ts (map) | step 8 (fetchAndStoreTransactions) | espnTeamIdToDbId passed directly | WIRED | Map populated inside transaction (line 305), passed to fetchAndStoreTransactions at line 371 |
| projections-ingest.ts (batch) | player_projection table | Chunk INSERT via Kysely | WIRED | 500-row chunks with ON CONFLICT merge |
| recommendations.ts (batch) | player table | Single INSERT with ON CONFLICT | WIRED | playerRows array batch upserted |
| espn.ts (throttledEspnCall) | all 5 ESPN API call sites | Wrapper replaces direct client.get | WIRED | Lines 506, 632, 712, 870, 1056 all use throttledEspnCall |
| api-client.ts (cachedMaps) | ranking lookup function | Cache check before rebuild | WIRED | rankingsHash check at line 371 before rebuilding maps |
| dom-observers.ts (bootstrapTarget) | ESPN DOM | querySelector with fallback | WIRED | Try specific selectors, fall back to document.body |

### Requirements Coverage

No requirement IDs were declared in the plan frontmatter (`requirements: []` in all plans). The phase was driven by PERFORMANCE_AUDIT.md issue IDs (B-01 through B-17, E-01 through E-03, F-01 through F-03, I-02 through I-05) rather than REQUIREMENTS.md entries.

All 21 targeted issues are addressed:
- **B-01** (snapshot N+1): Batch player/injury/roster writes
- **B-02** (projections ingest N+1): Batch player_projection inserts
- **B-03** (free-agent upsert N+1): Single batch upsert
- **B-04** (espnTeamIdToDbId re-query): Map reused from transaction
- **B-05** (sequential projections): Promise.all parallelism
- **B-06** (pool size): max:25 with timeouts
- **B-07** (worker concurrency): concurrency:3
- **B-08** (free-agent pagination): offset param + pagination metadata
- **B-10** (unbounded timeseries): LIMIT 1000 default at 4 sites
- **B-11** (throttle race): p-limit(1) mutex
- **B-12** (redundant 429): Removed from main ESPN methods
- **B-13** (missing indexes): Migration 017 with 2 composite indexes
- **B-14** (SGP formula): Single-pass variance
- **B-15** (JSONB SQL): App-level batter/pitcher detection
- **B-16** (LRU cache): max:2000
- **B-17** (league list limit): LIMIT 100
- **E-01** (broad observer): Narrowed with ESPN-specific selectors
- **E-02** (duplicate polling): Removed setInterval from auction observer
- **E-03** (ranking map rebuild): Module-level cache with hash invalidation
- **F-01** (standings useMemo): Both matrix builders memoized
- **F-02** (staleTime): 5min staleTime, 10min gcTime
- **F-03** (waivers pagination): 10/page with prev/next
- **I-02** (turbo cache): tsconfig in globalDependencies + inputs
- **I-03** (Next.js): compress:true, productionBrowserSourceMaps:false
- **I-04** (DLQ retention): 7 days
- **I-05** (LRU size): max:2000

**Deferred (intentional):** B-09 (async CSV parsing), F-04 (server components), I-01 (Docker layers), F-05 (recharts tree-shaking)

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/extension/entrypoints/content.tsx` | 421 | Pre-existing TS error: `PlayerRanking[]` not assignable to `DraftRanking[]` | Warning | Pre-existing — not introduced by phase 37; extension files modified by phase 37 are only `dom-observers.ts` and `api-client.ts` |
| `packages/extension/entrypoints/content.tsx` | 433 | Pre-existing TS error: `AuctionValue` type mismatch | Warning | Pre-existing — same as above |
| `packages/extension/components/PlayerCard.tsx` | 145, 155 | Pre-existing TS error: possibly undefined access | Warning | Pre-existing — not in scope of phase 37 |

No anti-patterns were introduced by phase 37. The extension TypeScript errors listed above pre-date this phase and are in files not modified by any phase 37 plan. Backend, frontend, and shared TypeScript checks all pass cleanly (`npx tsc --noEmit` exits 0 for all three).

### Human Verification Required

#### 1. Extension DOM Observer Effectiveness

**Test:** Load the ESPN auction draft page and open browser devtools. Monitor CPU usage and DOM mutation event counts with the updated narrow-container observer.
**Expected:** Significantly fewer MutationObserver callbacks fired per draft interaction compared to observing all of `document.body`.
**Why human:** Cannot verify ESPN's actual DOM structure programmatically — the selector fallback to `document.body` may still be triggering if none of the narrow selectors match ESPN's current markup.

#### 2. Batch INSERT Performance Under Load

**Test:** Trigger a full snapshot for a league with 12 teams and observe backend logs for query counts and timing.
**Expected:** Logs show ~4 database round-trips for player/roster writes, not ~1920. Snapshot completion time materially faster.
**Why human:** No integration test harness available; requires a live league connection.

#### 3. Waivers Pagination UX

**Test:** Navigate to the waivers page with AI recommendations generated. Verify pagination controls appear and navigate correctly.
**Expected:** Shows 10 recommendations per page with working Previous/Next buttons.
**Why human:** Visual and interaction verification needed.

### Gaps Summary

No gaps. All 21 issues are verified in actual code. TypeScript compiles cleanly for backend, frontend, and shared packages. The extension has pre-existing TypeScript errors in files that were not touched by this phase.

---

_Verified: 2026-03-09T22:30:00Z_
_Verifier: Claude (gsd-verifier)_
