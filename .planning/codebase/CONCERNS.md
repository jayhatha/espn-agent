# Codebase Concerns

**Analysis Date:** 2026-02-19

## Security Issues

### ESPN Auth Cookies Stored in Plaintext
- **Files:** `packages/backend/src/api/leagues.ts`, `packages/backend/src/db/schema.ts`
- **Impact:** Anyone with database access can impersonate users' ESPN accounts. CLAUDE.md explicitly lists this as a known issue: "ESPN auth cookies stored in plaintext (design doc requires encrypted-at-rest)"
- **Fix:** Implement encryption-at-rest using AES-256-GCM similar to `packages/backend/src/utils/encryption.ts` which already encrypts Slack tokens. Create migration to encrypt existing cookies.

### JWT Secret Hardcoded Fallback
- **Files:** `packages/backend/src/index.ts` (line 47)
- **Impact:** `JWT_SECRET || 'development-secret-change-in-production'` means production without JWT_SECRET set uses a hardcoded string, compromising all JWT tokens
- **Fix:** Throw error if JWT_SECRET is not set when NODE_ENV=production.

### Slack OAuth Missing State Validation
- **Files:** `packages/backend/src/api/slack.ts` (explicit TODOs in code)
- **Impact:** CSRF vulnerability — attacker could trigger OAuth callback with their code
- **Fix:** Store state tokens in Redis with 5-minute expiration, validate on callback.

### Frontend API Client Not Used
- **Files:** `packages/frontend/src/lib/api.ts`, all pages under `packages/frontend/src/app/leagues/[id]/`
- **Impact:** Pages hardcode `localhost:3001` instead of using the API client. Breaks in production.
- **Fix:** Consolidate all API calls to use `api.ts`, remove hardcoded URLs.

---

## Tech Debt

### Free Agent Pool Never Populated
- **Files:** `packages/backend/src/adapters/espn.ts`, `packages/backend/src/agents/waiver-recommendation.ts`
- **Impact:** Waiver recommendations cannot suggest available free agents; only drop suggestions work. `fetchFreeAgents()` method exists but returns empty.
- **Fix:** Wire `fetchFreeAgents()` into `SnapshotOrchestratorAgent`. Requires ESPN kona_player_info view parsing.

### PlayerIdentityResolution Not Wired Into Projections Ingest
- **Files:** `packages/backend/src/agents/projections-ingest.ts` (uses ILIKE), `packages/backend/src/agents/player-identity.ts` (unused)
- **Impact:** Projection upload fails to match players with name variations; no fuzzy matching fallback.
- **Fix:** Have ProjectionsIngestAgent call PlayerIdentityResolutionAgent for ambiguous matches.

### ESPN Adapter Missing Retry/Backoff
- **Files:** `packages/backend/src/adapters/espn.ts`
- **Impact:** Single network blip causes entire snapshot job to fail. ESPN rate limiting not handled.
- **Fix:** Wrap HTTP calls with exponential backoff (100ms, 500ms, 2s). Add circuit breaker for repeated 429/503.

### In-Memory Cache Not Distributed
- **Files:** `packages/backend/src/adapters/espn.ts` (uses local `Map<>`)
- **Impact:** Each server instance has separate cache; multi-instance deployments cause redundant ESPN API calls.
- **Fix:** Switch to Redis for caching. Connection already available via `@fastify/redis`.

### Rate Stat Trade Simulation Incomplete
- **Files:** `packages/backend/src/agents/trade-recommendation.ts` (TODO at line 611)
- **Impact:** Trade impact analysis for ERA/WHIP/AVG shows 0 delta because rate stat component adjustment not implemented. Only counting stats work.
- **Fix:** Implement component-based recalculation using formulas from `packages/shared/src/formulas.ts`.

### No Transaction Ingestion
- **Files:** `packages/backend/src/db/schema.ts` (league_transaction_event table), `packages/backend/src/agents/snapshot-orchestrator.ts`
- **Impact:** Cannot track trades, acquisitions, or drops. Timeline annotations incomplete.
- **Fix:** Parse ESPN transaction data in SnapshotOrchestratorAgent, store with type and affected players.

### DraftAssistantAgent Not Implemented
- **Files:** `packages/backend/src/api/recommendations.ts` (stub endpoint)
- **Impact:** `/api/leagues/:id/draft/recommendations` returns placeholder response.

### No Job Locking for Snapshot Orchestrator
- **Files:** `packages/backend/src/agents/snapshot-orchestrator.ts`, `packages/backend/src/workers/`
- **Impact:** Race conditions could cause duplicate snapshots if multiple workers trigger same league.
- **Fix:** Implement Redis-based distributed lock before snapshot start.

---

## Performance Bottlenecks

### Trade Candidate Generation O(n^2)
- **Files:** `packages/backend/src/agents/trade-recommendation.ts`
- **Impact:** `generateTradeCandidates` runs up to 500 full trade simulations. Each recalculates rankings for all teams. Can take 30+ seconds for large leagues.
- **Fix:** Cache projected standings per league. Compute delta incrementally. Consider async job queue.

### Single-Server Database Pool
- **Files:** `packages/backend/src/db/connection.ts`
- **Impact:** 10 concurrent connections. Pool exhaustion at ~10 RPS load.
- **Fix:** Increase pool size for multi-instance. Consider PgBouncer.

### Missing Time Series Indexes
- **Files:** `packages/backend/src/api/timeseries.ts`
- **Impact:** Time series queries may full-scan for leagues with many years of data.
- **Fix:** Add composite index on (league_id, snapshot_date, team_id).

### Projection Ingestion Single-Threaded
- **Files:** `packages/backend/src/agents/projections-ingest.ts`
- **Impact:** Large CSV uploads (5000+ players) take 30+ seconds serially.
- **Fix:** Batch insert in chunks, parallelize player identity resolution.

---

## Fragile Areas

### Projection CSV Format Brittle
- **Files:** `packages/backend/src/agents/projections-ingest.ts`
- **Impact:** Expects exact column names; no validation of required columns per league scoring format. Upload fails silently with wrong column order.
- **Safe fix:** Add header validation, check for required stat columns, return detailed error messages.

### ESPN API Response Structure Assumed Stable
- **Files:** `packages/backend/src/adapters/espn.ts`
- **Impact:** `normalizeLeagueData()` assumes specific nested object structure. Single ESPN API change breaks normalization with no graceful degradation.
- **Safe fix:** Add null-coalescing, array existence checks, and logged warnings for unexpected structure.

### Frontend Links to Non-Existent Routes
- **Files:** `packages/frontend/src/app/page.tsx`
- **Impact:** Home page CTA links go to `/leagues` generically rather than feature-specific routes under `/leagues/[id]/...`
- **Safe fix:** Update links to route through league selection first.

### Empty Array Kysely Query Bug
- **Files:** Multiple agents and API routes
- **Impact:** `WHERE col IN ()` generates invalid SQL. Must always check `array.length > 0` before using `.where("col", "in", array)`.

---

## Test Coverage Gaps

| Area | Risk | Priority |
|------|------|----------|
| Trade recommendation rate stat logic | Returns wrong deltas | HIGH |
| Waiver free agent scenarios | Always empty pool | HIGH |
| ESPN schema drift detection | Silent normalization failures | MEDIUM |
| Empty roster edge cases | Crashes on new leagues | MEDIUM |
| CSV column validation | Silent upload failures | MEDIUM |

---

## Dependencies at Risk

- **ESPN API:** No retry strategy. Temporary downtime blocks all snapshots and recommendations.
- **Slack OAuth + Redis:** OAuth flow doesn't validate state token. If SLACK_ENABLED but Redis unavailable, CSRF possible.
- **Encryption Key:** Static `ENCRYPTION_KEY` not rotatable. If leaked, all Slack tokens exposed.

---

## Known Workarounds in Place

| Workaround | Location | Why |
|------------|----------|-----|
| Free agent pool defaults to empty | `waiver-recommendation.ts` | ESPN doesn't reliably expose free agents |
| Rate stat trade delta always zero | `trade-recommendation.ts:611` | Component recalculation not implemented |
| Degraded snapshots on missing projections | `snapshot-orchestrator.ts` | Allows system to function with partial data |

---

*Concerns audit: 2026-02-19*
