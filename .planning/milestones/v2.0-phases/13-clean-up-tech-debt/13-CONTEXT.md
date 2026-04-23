# Phase 13: Clean up tech debt - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Systematically address technical debt identified through comprehensive code review. Focus on critical bugs, performance issues, security gaps, and code quality improvements that weren't covered in Phase 12's concern-based fixes.

</domain>

<decisions>
## Implementation Decisions

### Priority Tiers
- **Critical/High** — Broken functionality, security vulnerabilities, data corruption risks
- **Medium** — Performance bottlenecks, maintainability issues, missing validation
- **Low** — Code quality, consistency, technical debt that doesn't impact current functionality

### Approach
- **Fix critical issues first** — TradeRecommendationAgent broken projection access, N+1 queries, missing request validation
- **Batch similar fixes** — Group all parseInt validations, all request body validations, all N+1 query fixes
- **Progressive refinement** — Start with fixes that have clear correctness criteria, defer complex refactors

### Out of Scope
- Complete rewrite of any agents or routes
- Migration to different frameworks or libraries
- Adding new features disguised as "improvements"
- Comprehensive test coverage (target critical paths only)

</decisions>

<specifics>
## Specific Issues

### 1. Backend Agents - Critical/High

**Broken projection field access (trade-recommendation.ts:988-1075)**
- `isCategoryRelevant` checks `projection.ab` and `projection.ip`
- `getProjectedCategoryValue` references `projection.h`, `projection.bb`, etc.
- Reality: projections store data in `stat_components_json` with uppercase keys (AB, IP)
- Impact: Trade recommendations silently produce incorrect results
- Fix: Access via `JSON.parse(projection.stat_components_json)` with uppercase keys

**N+1 query patterns across agents**
- `standings-projection.ts:288-320` — 120+ individual INSERTs per snapshot
- `snapshot-orchestrator.ts:557-638` — same pattern for totals, ranks, overall
- `historical-backfill.ts:354-405` — individual INSERTs for ranks/overall
- `waiver-recommendation.ts:211-275` — O(freeAgents * roster) individual lookups
- `player-pool-sync.ts:145-192` — individual SELECT + UPSERT per player
- Fix: Batch operations using Kysely's `.insertInto().values([array])` pattern

**Hardcoded ESPN league ID (player-pool-sync.ts:51)**
- `GENERIC_LEAGUE_ID = 1` assumes league ID 1 always exists
- Fix: Use environment variable with validation, fail fast if unset

**Dynamic require() calls (draft-rankings.ts:160-168, 378-388)**
- `require("../../../shared/dist/index.js")` called at runtime
- Fix: Static import at top of file

**Potential undefined array access (projections-ingest.ts:295, 409-414)**
- `rows[0]` without checking `rows.length > 0`
- Fix: Guard with length check, return error on empty CSV

**Weak fuzzy matching (player-identity.ts:180-204)**
- Character set overlap instead of Levenshtein distance
- "Mike Trout" vs "Tim Truou" scores high similarity
- Fix: Implement proper string distance algorithm or use library

### 2. API Routes - Critical/High

**Missing request body validation (auth.ts:15-20, 94-98)**
- Body cast as `{ email, password }` with no runtime validation
- Malformed requests crash handler
- Fix: Add Zod schemas for all request bodies

**CSRF state never validated (auth-oauth.ts:172-193, slack.ts:32-33)**
- OAuth state parameter generated but TODO to validate is unimplemented
- Fix: Compare callback state with session/cookie state, reject mismatches

**Unauthenticated endpoints**
- `draft.ts:262-480` — rankings, values, projections have no auth
- `leagues.ts:713` — search endpoint public
- Fix: Add auth middleware or document why public is intentional

**ILIKE wildcard injection (leagues.ts:740)**
- User-supplied name in ILIKE pattern
- `%` and `_` act as wildcards
- Fix: Escape wildcards or use exact match

**Empty array SQL risk (timeseries.ts:84-85, 131-133)**
- `"".split(",").map(Number)` produces `[NaN]`
- Feeds into `WHERE team_id IN (NaN)`
- Fix: Check for empty string before split, return early

**No parseInt validation**
- Dozens of `parseInt(request.params.leagueId, 10)` with no NaN check
- Fix: Helper function that validates and throws on NaN

**N+1 in recommendations (recommendations.ts:96-114)**
- Free agents upserted one at a time
- Fix: Batch upserts

### 3. Database & Infrastructure - Critical/High

**No dead letter queue for BullMQ (snapshot-worker.ts:38-67)**
- Failed jobs after 3 retries logged and discarded
- Fix: Configure DLQ for manual inspection/retry

**player-pool-worker uses node-cron (player-pool-worker.ts:15-48)**
- No retry, no persistence, no deduplication across instances
- Fix: Migrate to BullMQ repeatable jobs

**morning-report-worker calls process.exit(0) (morning-report-worker.ts:12-18)**
- Kills co-located workers when Slack disabled
- Fix: Log warning and continue, don't exit

**Missing UNIQUE on refresh_tokens.token_hash (migration 008)**
- Permits duplicate token hashes
- Fix: Add migration with unique constraint

**transaction_impact constraint too narrow (migration 009:48)**
- Only includes `player_gained_id`, not `player_lost_id`
- Drop-only transactions can duplicate
- Fix: Add migration with composite unique on both columns

**No rollback migrations (migrate.ts:98-126)**
- All migrations forward-only
- Fix: Document that rollbacks are manual SQL operations

### 4. Frontend - High

**Pervasive any usage**
- `admin/page.tsx:120, 356, 680, 764, 828, 1026` — users, leagues, jobs, projections untyped
- `trades/page.tsx:69`, `moves/page.tsx:191, 395`, `StatsTable.tsx:9,18`
- Fix: Define proper TypeScript interfaces

**Duplicated code**
- COLORS constant duplicated between trends and moves pages
- Loading spinner SVG duplicated 6+ times
- TeamSelector logic duplicated
- API_URL defined in both api.ts and AuthContext
- Fix: Extract to shared components/constants

**No root error boundary in layout.tsx**
- Unhandled errors crash entire app
- Fix: Add ErrorBoundary component wrapping app

### 5. Testing

**8 placeholder tests**
- All 5 tests in `empty-array-guards.test.ts:14-58`
- 3 tests in `trade-recommendation.test.ts:254-272`
- All assert `expect(true).toBe(true)`
- Fix: Write real assertions or delete tests

**Zero coverage for critical paths**
- ESPNAdapter, ProjectionsIngestAgent, StandingsProjectionAgent
- All API routes
- Fix: Add tests for TradeRecommendationAgent (broken code), ESPNAdapter (429 handling), auth routes (validation)

**Singleton circuit breaker shares state**
- `retry.ts:38` — state leaks across test runs
- Fix: Reset circuit breaker state in beforeEach hooks

### 6. ESPN Adapter

**Unbounded in-memory cache (espn.ts:252)**
- `new Map()` with no max size
- Lazy eviction only on access
- Fix: Implement LRU cache with max size

**Inconsistent rate limiting**
- Only `fetchHistoricalWeek` has 2-second throttle
- Other methods can trigger 429s
- Fix: Apply throttle to all ESPN methods

**validateStatus treats 429 as success (espn.ts:450-454)**
- Prevents axios-retry from retrying on 429
- Fix: Remove validateStatus or explicitly handle 429

**No schema validation on ESPN responses (espn.ts:734-827)**
- Normalizer trusts `raw.settings as any`
- API changes silently corrupt data
- Fix: Add Zod schemas for ESPN response shapes

</specifics>

<deferred>
## Deferred Ideas

- Complete TypeScript strict mode across entire codebase
- Comprehensive integration test suite
- Performance profiling and optimization
- Migration to newer framework versions
- Refactoring monolithic files into smaller modules
- Accessibility improvements beyond critical issues

</deferred>

---

*Phase: 13-clean-up-tech-debt*
*Context gathered: 2026-02-26*
