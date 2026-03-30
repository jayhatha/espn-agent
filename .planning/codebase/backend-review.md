# Backend Code Review

**Analysis Date:** 2026-03-26
**Scope:** `packages/backend/src/` — agents, api, db, workers, adapters, utils
**Excludes:** Chrome extension, draft packages

---

## Critical Issues (fix immediately)

### C-01: SQL Injection in League Search Endpoint

**File:** `packages/backend/src/api/leagues.ts`, line 881
**Severity:** CRITICAL — exploitable by any unauthenticated user

```typescript
.where("name", "ilike", `%${name.trim()}%`)
```

The `name` query parameter is interpolated directly into the ILIKE pattern without escaping SQL wildcards (`%`, `_`) or preventing injection through Kysely's parameterized query mechanism. While Kysely parameterizes the value itself (preventing classic SQL injection), the LIKE pattern characters are still injectable. An attacker can craft patterns like `%` to scan all leagues.

More critically, this endpoint has **no authentication** (`onRequest` is absent — only `rateLimit` is configured), so anyone can enumerate all league names in the database.

**Fix:** Add `onRequest: [authenticate]` to the route config. Escape LIKE special characters:
```typescript
const escaped = name.trim().replace(/[%_\\]/g, '\\$&');
.where("name", "ilike", `%${escaped}%`)
```

---

### C-02: Hardcoded scoringPeriodId: 1 in Snapshot Orchestrator

**File:** `packages/backend/src/agents/snapshot-orchestrator.ts`, line 121
**Severity:** CRITICAL — produces incorrect stat values after opening week

```typescript
scoringPeriodId: 1,
```

The snapshot orchestrator always requests ESPN data for `scoringPeriodId: 1` (the first scoring period of the season). This means after the opening week, all daily snapshots still fetch the same period-1 data, producing stale/incorrect team stat totals. The value should be dynamically computed from the current date or fetched from the ESPN season endpoint.

**Impact:** All current standings, category totals, and downstream projections are based on week-1 data. This is the single most impactful data-correctness bug in the codebase.

**Fix:** Compute the current scoring period from the date. ESPN scoring periods are 1-based day numbers from the season start. Use `ESPNAdapter.getFinalScoringPeriod()` or compute from the season start date:
```typescript
const seasonStartDate = new Date(`${league.season}-03-20`); // approximate
const today = new Date(snapshotDate);
const daysDiff = Math.floor((today.getTime() - seasonStartDate.getTime()) / 86400000);
const scoringPeriodId = Math.max(1, daysDiff + 1);
```

---

### C-03: Waiver Simulation O(n*m) DB Queries — Massive N+1 Problem

**File:** `packages/backend/src/agents/waiver-recommendation.ts`, lines 228-284
**Severity:** CRITICAL — performance/stability

The `getRecommendations` method iterates over every (freeAgent, rosterPlayer) pair and calls `simulateSwap` for each one. Inside `simulateSwap` (line 299), there are 5 separate DB queries:
1. `league_daily_snapshot` lookup
2. `league_settings_version` lookup
3. `player_projection` for add player
4. `player_projection` for drop player
5. `team_daily_projected_category` for all teams

With 50 free agents and 25 roster players, that is **1,250 swap simulations * 5 queries = 6,250 DB queries** per recommendation request. The snapshot, settings, and all-teams projections are identical across every swap — they should be fetched once and reused.

**Fix:** Hoist the invariant queries out of `simulateSwap` into `getRecommendations`. Pre-fetch all projections for free agents + roster players in a single batch query. Pass pre-fetched data into `simulateSwap`.

---

### C-04: Projections Ingest Per-Player DB Queries — O(n) Identity Resolution

**File:** `packages/backend/src/agents/projections-ingest.ts`, lines 382-453 (batters), 529-590 (pitchers)
**Severity:** CRITICAL — performance

For each CSV row (typically 300-500 batters + 300 pitchers), the `matchPlayer` method runs:
1. Query `player_identity_map` JOIN `player` (line 122-127)
2. If no cache hit, `findBestMatch` queries ALL players filtered by team (line 103-109)
3. Insert/update `player_identity_map` (line 161-178)
4. Update `player.positions` (line 439-444)

For 600+ players, this is 2,400+ sequential DB queries during CSV upload. The `findBestMatch` method in `PlayerIdentityResolutionAgent` queries **all players for that team** on each call (line 103-109 in player-identity.ts), creating O(n * total_players) behavior.

**Fix:** Pre-load all player identity mappings and all players into memory before processing CSV rows. Batch the identity map inserts and player position updates at the end.

---

## Major Issues (fix before next milestone)

### M-01: Projected Standings Don't Handle Tied Ranks

**File:** `packages/backend/src/agents/standings-projection.ts`, lines 262-300
**Severity:** MAJOR — incorrect roto points

The `rankAndStore` method assigns ranks sequentially (`rank = i + 1`) without handling ties. If two teams are projected to have identical values for a category, they get different ranks and different roto points, which is incorrect for roto scoring. The current standings writer in `snapshot-orchestrator.ts` handles ties correctly via `assignRanksWithTies` (line 658), but the projected standings do not.

**Fix:** Use the same `assignRanksWithTies` approach used in `writeCurrentStandings`. Extract it to a shared utility (it already exists at `utils/roto-ranking.ts`).

---

### M-02: Streaming Pitcher WHIP Uses Wrong Component Keys

**File:** `packages/backend/src/agents/streaming-pitcher.ts`, lines 303-305
**Severity:** MAJOR — incorrect WHIP calculation

```typescript
const perStartH = (components.H || 0) / 30;
const perStartBB = (components.BB || 0) / 30;
```

For pitcher projections, hits allowed is stored as `HA` and walks allowed as `BBA` (to avoid collision with batter stats — see `projections-ingest.ts` lines 550-551). Using `H` and `BB` reads the wrong fields (or zero if the pitcher only has `HA`/`BBA`), producing an incorrect WHIP score of 0 for most pitchers.

**Fix:** Use `components.HA` and `components.BBA`:
```typescript
const perStartH = (components.HA || 0) / 30;
const perStartBB = (components.BBA || 0) / 30;
```

---

### M-03: Player Identity Resolution Uses Character-Set Overlap (Not Levenshtein)

**File:** `packages/backend/src/agents/player-identity.ts`, lines 180-203
**Severity:** MAJOR — incorrect fuzzy matching

The `fuzzyNameMatch` method uses set intersection of characters, not edit distance. This means:
- "Mike Trout" and "Tim Kurot" would get a high score (same character set: {t, i, m, k, r, o, u})
- "Juan Soto" and "Jose Auto" would match highly
- Order of characters is completely ignored

The 0.95 confidence threshold in `projections-ingest.ts` (line 83) mitigates this somewhat, but the underlying algorithm is fundamentally unsuitable for name matching.

**Fix:** Implement Levenshtein distance or Jaro-Winkler similarity. Libraries like `fastest-levenshtein` are available via npm.

---

### M-04: Circuit Breaker is a Shared Singleton Across All ESPN Endpoints

**File:** `packages/backend/src/utils/retry.ts`, line 38
**Severity:** MAJOR — cascading failure risk

```typescript
const circuitBreaker = new CircuitBreaker();
```

A single `CircuitBreaker` instance is shared across ALL axios instances created by `createRetryableAxios`. If the free-agent endpoint returns 5 consecutive 500 errors, the circuit opens and blocks ALL ESPN API calls (league data, transactions, auction values) for 60 seconds, even if those endpoints are healthy.

**Fix:** Either scope circuit breakers per endpoint/purpose, or move the circuit breaker into the `ESPNAdapter` class (one per adapter instance, not a global singleton).

---

### M-05: Race Condition in Snapshot Orchestrator — No Job Lock

**File:** `packages/backend/src/agents/snapshot-orchestrator.ts`, lines 67-82
**Severity:** MAJOR — data corruption risk

The "already exists" check at lines 67-82 is not atomic. If two snapshot jobs for the same league+date execute concurrently (e.g., manual trigger + scheduled job), both can pass the existence check before either writes, leading to duplicate data or unique constraint violations.

The worker has `concurrency: 3` (`snapshot-worker.ts` line 68), and the BullMQ `jobId` deduplication only prevents adding duplicate jobs to the queue — it does not prevent concurrent execution of already-queued jobs.

**Fix:** Use a PostgreSQL advisory lock or SELECT FOR UPDATE at the start of `executeSnapshot`. Alternatively, add an `ON CONFLICT` clause to all writes (most already have this, but the race window between check and write is still problematic).

---

### M-06: Free Agent Fetch Runs Individual INSERT Per Player

**File:** `packages/backend/src/agents/snapshot-orchestrator.ts`, lines 1244-1283
**Severity:** MAJOR — performance

`fetchAndStoreFreeAgents` processes each of the 300 free agents with an individual `INSERT INTO player` + `INSERT INTO league_free_agent_snapshot`. That's 600 sequential DB queries for what should be 2 batch inserts.

**Fix:** Collect all rows into arrays and use batch `insertInto().values(allRows)` like the roster snapshot writer does at line 558.

---

### M-07: Transaction Impact Agent Uses Per-Row Inserts Inside Loops

**File:** `packages/backend/src/agents/transaction-impact.ts`, lines 73-88
**Severity:** MAJOR — performance during backfill

For each team's draft roster (~25 players * 10 teams = 250 moves), the agent executes individual INSERT queries inside a loop. Same pattern repeats for weekly add/drop detection. During a full season backfill (~26 weeks), this produces thousands of sequential inserts.

**Fix:** Batch inserts using `insertInto().values(allRows)`.

---

### M-08: `writeCurrentStandingsFromPlayerStats` Has N+1 for Player Period Stats

**File:** `packages/backend/src/agents/snapshot-orchestrator.ts`, lines 983-995
**Severity:** MAJOR — performance during backfill

```typescript
for (const row of playerRows) {
  await trx
    .insertInto("player_period_stats")
    .values(row as any)
    // ...
}
```

Each player's period stats are inserted individually inside a loop. With 250+ rostered players across all teams per scoring period, this is 250+ sequential INSERT queries per backfill day.

**Fix:** Batch insert using chunks similar to the projections ingest pattern.

---

### M-09: `writeCurrentStandingsFromPlayerStats` N+1 for Category Totals and Ranks

**File:** `packages/backend/src/agents/snapshot-orchestrator.ts`, lines 1006-1061
**Severity:** MAJOR — performance during backfill

Category totals (line 1009) and category ranks (line 1049) and overall standings (line 1076) are all inserted individually per team per category inside nested loops. For 10 teams * 12 categories, that's 120 + 120 + 10 = 250 individual INSERT queries. The `writeCurrentStandings` method (line 584) correctly uses batch inserts — this historical method should follow the same pattern.

---

### M-10: Auth is Completely Bypassed in Single-User Mode

**File:** `packages/backend/src/middleware/auth.ts`, lines 15-53
**Severity:** MAJOR — security

All auth middleware functions are no-ops. The `authenticate` function injects a hardcoded admin user. While this is documented as intentional for single-user mode, it means:
- Any network-accessible instance has full admin access with no credentials
- The rate limiting is the only protection against abuse
- The `/api/leagues/search` endpoint has **no auth at all** (line 854 of leagues.ts)

**Fix:** If the app is deployed on a LAN or public network, at minimum add basic auth or require a static API key. The JWT infrastructure is already in place — just re-enable it.

---

## Minor Issues (fix when convenient)

### m-01: Duplicate `PITCHING_STAT_KEYS` Constant in Three Files

**Files:**
- `packages/backend/src/agents/standings-projection.ts`, line 28
- `packages/backend/src/agents/waiver-recommendation.ts`, line 17
- `packages/backend/src/agents/trade-recommendation.ts`, line 21

The exact same `PITCHING_STAT_KEYS` Set is defined in three separate files, plus the `isPitcherProjection` helper function is duplicated across all three.

**Fix:** Move to a shared location like `packages/shared/src/formulas.ts` or a `packages/backend/src/utils/stat-keys.ts`.

---

### m-02: Double Cache TTL Check in ESPN Adapter

**File:** `packages/backend/src/adapters/espn.ts`, lines 1341-1349

The `getCached` method manually checks `expiresAt > Date.now()` and deletes expired entries, but the LRU cache is already configured with a `ttl` of 1 hour (line 297). The manual TTL management at `setCache` (line 1352-1356, using `expiresAt`) is redundant with the LRU cache's built-in TTL. This dual TTL system is confusing and could lead to stale data if the two TTLs diverge (e.g., the manual TTL says 5 minutes but the LRU TTL says 1 hour).

**Fix:** Remove the manual `expiresAt` tracking and rely solely on the LRU cache's TTL, or configure different TTLs per cache key using the LRU cache's `ttl` option.

---

### m-03: Unused `_baselinePoints` Parameter in `simulateSwap`

**File:** `packages/backend/src/agents/waiver-recommendation.ts`, line 305

```typescript
_baselinePoints: number,
```

The parameter is prefixed with underscore (indicating intentional non-use) but is still passed by the caller at line 243. This is dead code.

**Fix:** Remove the parameter from both the method signature and the call site.

---

### m-04: ESPN Adapter `fetchHistoricalWeek` Has Duplicate Throttle

**File:** `packages/backend/src/adapters/espn.ts`, lines 340-348 vs lines 24-37

`fetchHistoricalWeek` implements its own 2-second throttle (instance-level `this.lastRequestTime`) but `fetchLeague` uses the module-level `throttledEspnCall` function. These are independent throttle mechanisms. A rapid sequence of `fetchHistoricalWeek` + `fetchLeague` calls could fire back-to-back because they track different timestamps.

**Fix:** Use the shared `throttledEspnCall` wrapper in `fetchHistoricalWeek` too, or consolidate to a single throttle mechanism.

---

### m-05: Form-Encoded Body Parser Has Naive Parsing

**File:** `packages/backend/src/index.ts`, lines 141-147

```typescript
body.split("&").forEach((pair) => {
  const [key, value] = pair.split("=");
  parsed[decodeURIComponent(key)] = decodeURIComponent(value || "");
});
```

This does not handle multi-value params (same key repeated), does not handle `+` as space, and will break on values containing `=`. While this only feeds the Slack signature verification path, it could produce incorrect parsed bodies.

**Fix:** Use `new URLSearchParams(body)` instead of manual parsing.

---

### m-06: `GsPacingAgent.getGsFromCategoryTotals` Queries by `category_id = "GS"`

**File:** `packages/backend/src/agents/gs-pacing.ts`, lines 375-389
**Severity:** MINOR — potentially returns null always

The method queries for `category_id = "GS"` but Games Started is not a standard ESPN roto category. The `ESPN_STAT_MAP` in `espn.ts` does not include a `GS` stat key. This means `getGsFromCategoryTotals` always returns null, falling through to the IP-based estimation. This is not wrong per se (the fallback works), but it's misleading dead code.

**Fix:** Either add GS tracking from ESPN data (stat ID 33 = Games Started) or remove the dead code path and document that GS is always estimated from IP.

---

### m-07: Snapshot Worker Creates Redis Connection Without Error Handling

**File:** `packages/backend/src/workers/snapshot-worker.ts`, lines 20-25

```typescript
const connection = new IORedis(
  process.env.REDIS_URL || "redis://localhost:6379",
  { maxRetriesPerRequest: null }
);
```

If Redis is unavailable, the worker process will crash on startup. There is no error event listener on the connection, no graceful fallback, and no health check.

**Fix:** Add a `connection.on('error')` handler and implement a startup health check before creating queues.

---

### m-08: `DraftRankingsAgent` Import Without Null Check

**File:** `packages/backend/src/api/recommendations.ts`, line 7

```typescript
import { DraftRankingsAgent } from "../agents/draft-rankings.js";
```

This import references a draft-related agent that may not exist or may be in the excluded draft package scope. If the module is missing at runtime, the entire recommendations route file fails to load.

**Fix:** Dynamic import at the point of use (the draft recommendations handler on line 1032), which is already done for other agents (e.g., `SnapshotOrchestratorAgent` in `leagues.ts` line 501).

---

### m-09: Category Components Not Stored for Rate Stats in `writeCurrentStandings`

**File:** `packages/backend/src/agents/snapshot-orchestrator.ts`, lines 617-625

```typescript
categoryTotalsRows.push({
  // ...
  components_json: null,
});
```

For live (non-backfill) snapshots, `components_json` is always null because the `writeCurrentStandings` method reads stat values directly from ESPN's `valuesByStat` (pre-computed rate values), not from raw components. This means the `StandingsProjectionAgent` cannot compute component-based projected rate stats from current data — it falls back to the current rate value directly.

This is a known limitation documented in `CLAUDE.md` but worth noting: projected rate stats have lower accuracy for non-backfilled snapshots because they lack the AB, H, IP, ER etc. components needed for proper component math.

**Fix:** Extract per-player stats from the ESPN response and compute component totals (similar to `writeCurrentStandingsFromPlayerStats`), or request the appropriate `x-fantasy-filter` to get per-period stats in the regular snapshot fetch.

---

### m-10: Inconsistent Error Handling in API Routes

**Files:** Multiple API route files
**Severity:** MINOR — inconsistent user experience

Some routes catch errors and return `reply.code(500).send({error: ...})` (e.g., `leagues.ts` line 280), while others let errors propagate as unhandled (e.g., `timeseries.ts` overall standings route at line 71 has no try/catch). Fastify's default error handler returns a 500 with a generic message, but the format differs from the custom error responses, making client-side error handling inconsistent.

**Fix:** Add a global Fastify error handler that normalizes all error responses to `{error: string, details?: string}` format. Add try/catch to routes that lack them.

---

### m-11: `fetchAndStoreAuctionValues` Bypasses ESPN Adapter Entirely

**File:** `packages/backend/src/agents/snapshot-orchestrator.ts`, lines 1419-1493

This method imports `axios` directly and constructs ESPN API URLs manually, bypassing the `ESPNAdapter` class, its throttling, retry logic, schema validation, and caching. This is inconsistent with all other ESPN API calls in the codebase.

**Fix:** Use `this.espnAdapter.fetchGlobalDraftData()` or add a new adapter method instead of raw axios calls.

---

### m-12: Snapshot Orchestrator `writeFreeAgentPlayers` Uses Per-Row Inserts

**File:** `packages/backend/src/agents/snapshot-orchestrator.ts`, lines 1193-1223

Each free agent player is inserted individually inside a loop. With 300+ free agents from the `kona_player_info` view, this is 300+ sequential INSERTs.

**Fix:** Batch insert like the roster player writer does.

---

## Positive Patterns (keep doing)

### P-01: Degraded Snapshot Architecture
The `is_degraded` + `degraded_reasons` pattern on `league_daily_snapshot` is excellent. Every step of the snapshot pipeline has an error boundary that marks degradation without aborting the entire pipeline. This means partial data is always better than no data.

### P-02: Empty Array Guard Pattern
The codebase consistently checks `array.length > 0` before `WHERE IN()` queries (e.g., `projections-ingest.ts` line 134, `waiver-recommendation.ts` line 213). This prevents Kysely from generating invalid SQL.

### P-03: Component-Based Rate Stat Math
Rate stats (AVG, ERA, WHIP) are computed from components (H, AB, IP, ER) rather than averaging rates. This is mathematically correct and the shared formulas in `packages/shared/src/formulas.ts` are well-structured.

### P-04: Batch Insert with Chunk Size Limits
The projections ingest uses 500-row chunks for batch inserts (line 460), staying well under PostgreSQL's parameter limit. This pattern should be replicated in the areas identified above.

### P-05: Schema Fingerprinting for Drift Detection
The ESPN adapter computes SHA-256 fingerprints of response structure (`computeSchemaFingerprint`) and stores them with raw payloads. This enables detecting when ESPN changes their API shape.

### P-06: Zod Validation on User Input
Request bodies for league connection, auth updates, and trade proposals are validated with Zod schemas (`utils/validation.ts`). This prevents malformed input from reaching business logic.

### P-07: Encryption-at-Rest for ESPN Credentials
ESPN cookies (SWID, espn_s2) are encrypted with AES-256-GCM before database storage (`utils/encryption.ts`). The encryption key is validated on use and the implementation uses proper IV + auth tag.

### P-08: Tie Handling in Roto Rankings
The `assignRanksWithTies` method correctly implements average-points-for-tied-positions (e.g., two teams tied for 1st in a 10-team league each get (10+9)/2 = 9.5 roto points). This is accurate roto scoring.

### P-09: BullMQ DLQ Pattern
Failed snapshot jobs are moved to a dead-letter queue after max retries (`snapshot-worker.ts` lines 75-100), with error context preserved for debugging. The `inspectDLQ` function enables admin investigation.

### P-10: Throttled ESPN API Calls
The module-level `throttledEspnCall` function serializes ESPN requests through a p-limit(1) queue with 2-second minimum spacing, preventing rate limit issues.
