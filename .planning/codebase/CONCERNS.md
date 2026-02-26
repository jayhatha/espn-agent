# Codebase Concerns

**Analysis Date:** 2026-02-23

## Tech Debt

**Free Agent Pool Never Populated:**
- Issue: `ESPNAdapter.fetchFreeAgents()` is implemented (lines 518-616) but never called during snapshot orchestration. Waiver and trade recommendation agents use empty fallbacks.
- Files: `packages/backend/src/adapters/espn.ts`, `packages/backend/src/agents/waiver-recommendation.ts` (lines 84-105), `packages/backend/src/agents/snapshot-orchestrator.ts`
- Impact: Free agent availability is incorrect; waiver recommendations and trade candidates cannot assess replacement-level players
- Fix approach: Wire `fetchFreeAgents()` into `SnapshotOrchestratorAgent.executeSnapshot()` and store results in a persistent table for consistent access

**PlayerIdentityResolution Not Wired into Projections Ingest:**
- Issue: `ProjectionsIngestAgent` instantiates `PlayerIdentityResolutionAgent` (line 54) but uses SQL ILIKE matching as primary path. Fuzzy matching is secondary only.
- Files: `packages/backend/src/agents/projections-ingest.ts` (lines 47-54, 72-110)
- Impact: Player name mismatches during CSV ingest fail silently, resulting in missing projections for misspelled or nickname variations
- Fix approach: Make fuzzy matching via `PlayerIdentityResolutionAgent` the primary path in `matchPlayer()` before ILIKE fallback

**Frontend API Client Library Unused:**
- Issue: `packages/frontend/src/lib/api.ts` provides typed API wrapper but is never imported. All pages hardcode `http://localhost:3001` fetch calls.
- Files: `packages/frontend/src/lib/api.ts` (402 lines), all page files in `packages/frontend/src/app/`
- Impact: API endpoint URLs scattered across 8+ page files; changes require edits in multiple places; breaks in production without NEXT_PUBLIC_API_URL env var
- Fix approach: Replace all hardcoded fetch calls with imports from `api.ts`; consolidate API logic

**Hardcoded Default Secrets in Development:**
- Issue: JWT_SECRET defaults to `"development-secret-change-in-production"` and COOKIE_SECRET falls back to same
- Files: `packages/backend/src/index.ts` (lines 71-79)
- Impact: Development/staging instances have weak secrets unless explicitly set; production instances silently use weak default if ENCRYPTION_KEY not set
- Fix approach: Fail at startup if JWT_SECRET missing in production; make encryption optional with graceful degradation

**Slack OAuth State Token Not Validated (CSRF):**
- Issue: State token generated but not persisted or validated on callback. OAuth callback accepts any state value.
- Files: `packages/backend/src/api/slack.ts` (lines 32, 77 marked with TODOs)
- Impact: CSRF vulnerability; attacker can trick user into authorizing malicious app by crafting OAuth callback URL
- Fix approach: Store state in Redis with 5-minute expiration; validate on callback before token exchange

**Rate Stat Adjustments in Trade Analysis Incomplete:**
- Issue: `TradeRecommendationAgent` computes category impact using counting stats only. Rate stats (ERA, WHIP, AVG) use current snapshot values with no trade adjustment simulation.
- Files: `packages/backend/src/agents/trade-recommendation.ts` (entire file, 1272 lines)
- Impact: Trade impact analysis underestimates value of pitchers in ERA/WHIP leagues and batters in AVG leagues; fairness scores misleading
- Fix approach: Implement component-based rate stat recalculation using `calculateFinalRate()` from shared types for both teams in trade scenarios

**Transaction Ingestion Missing from Snapshot Orchestrator:**
- Issue: `SnapshotOrchestratorAgent` fetches ESPN data and has transaction parsing logic, but never stores to `league_transaction_event` table
- Files: `packages/backend/src/agents/snapshot-orchestrator.ts` (1122 lines), `packages/backend/src/adapters/espn.ts` (transaction parsing lines 680-720)
- Impact: Trade/waiver history is incomplete; transaction-based reports cannot distinguish acquisition history; timeline annotations empty
- Fix approach: Add transaction ingest loop to `SnapshotOrchestratorAgent.executeSnapshot()` after ESPN fetch

**No Job Lock for Concurrent Snapshots:**
- Issue: If BullMQ job retry or manual trigger fires while snapshot already running, multiple workers can execute simultaneously for same league/date
- Files: `packages/backend/src/agents/snapshot-orchestrator.ts`, workers/background jobs registry
- Impact: Duplicate rows in daily snapshot tables; inconsistent state across snapshot runs; double-counting stats
- Fix approach: Use Redis-based distributed lock or PostgreSQL advisory lock before starting snapshot

**ESPN Adapter Retry/Backoff Missing:**
- Issue: `ESPNAdapter` uses `createRetryableAxios()` from `packages/backend/src/utils/retry.ts` but retry wrapper not applied to all HTTP calls
- Files: `packages/backend/src/adapters/espn.ts` (lines 1-50), `packages/backend/src/utils/retry.ts` (37 lines with retry logic)
- Impact: Single transient ESPN API error (timeout, 503) causes entire snapshot job to fail; ESPN rate limiting (429) not handled gracefully
- Fix approach: Apply retry wrapper consistently to all ESPN adapter HTTP calls; add circuit breaker for repeated errors

## Known Bugs

**Injury Data Always Empty:**
- Symptoms: `MorningReportAgent` marks injury alerts as TODO; positions array returned as empty; injury_event table never populated
- Files: `packages/backend/src/agents/morning-report.ts` (lines 162, 179)
- Trigger: Any call to morning report generation
- Workaround: None; feature not yet implemented

**Draft Recommendations Returns Placeholder:**
- Symptoms: GET `/api/leagues/:id/draft/recommendations` returns stub response with no actual rankings
- Files: `packages/backend/src/api/recommendations.ts` (line 962)
- Trigger: Any draft recommendation request
- Workaround: Chrome extension has local draft assistant but not backend-integrated

**Chrome Extension Cannot Detect User Team ID:**
- Symptoms: Draft sidebar shows all team rankings without filtering to logged-in user's team
- Files: `packages/extension/entrypoints/content.tsx` (line 97), relies on URL teamId query parameter
- Trigger: Draft page load when teamId not in URL query string
- Workaround: Manual team ID configuration or detection from page DOM

**DOM Selectors Are Placeholders:**
- Symptoms: Extension components may not find ESPN draft board elements if ESPN updates page structure
- Files: `packages/extension/lib/dom-observers.ts` (451 lines of selector logic)
- Trigger: ESPN redesign or element ID changes
- Workaround: Manual selector updates required; no automated validation or fallback

## Security Considerations

**ESPN Auth Cookies Stored in Plaintext at Rest:**
- Risk: If database is compromised, attacker gains full ESPN account access for all leagues with stored SWID/espn_s2 cookies
- Files: `packages/backend/src/db/schema.ts` (league table columns), `packages/backend/src/adapters/espn.ts` (lines 306-307 constructs cookie header)
- Current mitigation: Database encryption via host-level controls (if any); credentials sent over HTTPS in flight
- Recommendations:
  - Encrypt `espn_swid` and `espn_s2` before storage using `encryptToken()` already available in `packages/backend/src/utils/encryption.ts`
  - Require `ENCRYPTION_KEY` env var; fail startup if missing
  - Decrypt only when needed for API calls; clear from memory after use
  - Consider expiring stored cookies and requiring fresh auth flow quarterly

**Slack OAuth State Token Not Persisted:**
- Risk: CSRF attack; attacker can trick user into authorizing malicious Slack app, gaining workspace access and ability to impersonate user
- Files: `packages/backend/src/api/slack.ts` (lines 30-45 generate state, 77 validate state with TODO)
- Current mitigation: None; state is generated but not stored or validated
- Recommendations:
  - Implement Redis store for state tokens with 5-minute TTL
  - Reject callback if state not found in Redis
  - Log failed state validations for security monitoring

**Default JWT Secret Hardcoded:**
- Risk: If `process.env.JWT_SECRET` not set, uses public default string; any JWT tool can forge tokens for any user
- Files: `packages/backend/src/index.ts` (line 79)
- Current mitigation: String is marked "development-secret-change-in-production" which is obvious but not enforced
- Recommendations:
  - Require `JWT_SECRET` env var at startup if `NODE_ENV=production`
  - Fail fast rather than silently using weak default
  - Enforce minimum 32-character length

**Extension Uses Session Cookies for Auth:**
- Risk: Extension cannot authenticate to backend without user being logged in on frontend; no service-to-service auth; no API token system
- Files: `packages/extension/lib/api-client.ts` (entire file, 1054 lines), uses session cookies for auth
- Current mitigation: Works in local dev; production requires frontend user session
- Recommendations:
  - Implement API token system with long-lived tokens for extension registration
  - Generate tokens with limited scope (e.g., read-only, specific league)
  - Support token rotation and expiration

## Performance Bottlenecks

**Transaction-Impact Agent Complexity at 1451 Lines:**
- Problem: `packages/backend/src/agents/transaction-impact.ts` is monolithic; computes replacement players, impact scoring, and projections in single class
- Cause: All transaction analysis logic bundled without separation of concerns
- Improvement path:
  - Extract replacement player logic to separate `ReplacementPlayerAgent`
  - Extract impact scoring to separate class
  - Cache replacement player pool per position to avoid recomputation per transaction
  - Use result memoization for frequently called scoring functions

**Large Frontend Pages Lack Code Splitting (1194 lines):**
- Problem: `packages/frontend/src/app/leagues/[id]/moves/page.tsx` contains all charts, tables, filters in single component
- Files: Multiple page files in `packages/frontend/src/app/leagues/[id]/` (moves, waivers, trades all 800+ lines)
- Cause: All UI logic in single page component; no component extraction or lazy loading
- Improvement path:
  - Extract reusable components (data tables, chart wrappers, filter UI)
  - Use Next.js `lazy()` with Suspense for below-fold components
  - Implement route-based code splitting via dynamic imports

**No Caching for ESPN API Responses:**
- Problem: `ESPNAdapter` has in-memory cache only; if server restarts or multiple replicas run, ESPN gets re-fetched
- Files: `packages/backend/src/adapters/espn.ts` (line 58 note "in-memory cache")
- Cause: Redis available via `@fastify/redis` but not used for ESPN response caching
- Improvement path:
  - Add Redis cache layer in `ESPNAdapter.fetchLeague()` with 15-minute TTL
  - Key by `leagueId:season:scoringPeriodId`
  - Implement cache invalidation on manual snapshot trigger

**PlayerIdentityResolution Fuzzy Match on Every Ingest:**
- Problem: `ProjectionsIngestAgent.matchPlayer()` calls fuzzy matching for every unmatched player row; no batch optimization
- Files: `packages/backend/src/agents/projections-ingest.ts` (lines 100-110)
- Cause: Player matching is per-row inside CSV parse loop; no pre-indexing
- Improvement path:
  - Pre-build fuzzy index once per ingest (use `fuse.js` or similar)
  - Batch-query identity map for all new names upfront
  - Cache confidence scores to avoid recomputation within single ingest

## Fragile Areas

**ESPN Adapter Response Parsing Assumes Stable Structure:**
- Files: `packages/backend/src/adapters/espn.ts` (normalizeLeagueData at lines 750+)
- Why fragile: Assumes nested object structure matches ESPN API contract; single ESPN change breaks normalization silently
- Safe modification:
  - Add null-coalescing operators (`?.` chains)
  - Check array existence before accessing elements
  - Log warnings for unexpected structure deviations
  - Store raw response in `league_raw_payload` for debugging
- Test coverage: No unit tests for ESPN normalization; integration tests only

**SnapshotOrchestratorAgent Missing Error Boundaries:**
- Files: `packages/backend/src/agents/snapshot-orchestrator.ts` (1122 lines)
- Why fragile: If any step fails (ESPN fetch, parse, write), subsequent steps may use stale data or crash; no rollback
- Safe modification:
  - Wrap each major step in try-catch
  - Mark snapshot as degraded on partial failures
  - Don't overwrite successful prior state on partial failure
  - Store error details in degraded_reasons for debugging
- Test coverage: Only integration tests exist; no unit tests for error paths

**Empty Array Check Not Enforced:**
- Files: Multiple agents and API routes (20+ instances found)
- Why fragile: Kysely generates invalid SQL for `.where("col", "in", [])` causing runtime query failures
- Safe modification: Audit all `.where("col", "in", array)` calls; add `if (array.length > 0)` guard per CLAUDE.md pattern
- Test coverage: No pattern test; grep found instances in transaction-impact, waiver-recommendation, draft-rankings

**ESPN Lineup Slot Mapping May Drift:**
- Files: `packages/extension/lib/api-client.ts` (lines 31-45 ESPN_LINEUP_SLOT_MAP)
- Why fragile: Hardcoded slot ID mappings; if ESPN changes slot IDs, position detection breaks silently
- Safe modification:
  - Add validation to detect unknown slot IDs
  - Log warnings for unmapped slots
  - Fetch slot mapping from `/api/leagues/:id/status` which provides ESPN settings
  - Add fallback detection from ESPN DOM
- Test coverage: No tests for slot ID detection

## Scaling Limits

**Projections are Global, Not League-Specific:**
- Current capacity: Single `projections_run` table shared across all leagues
- Limit: If 100+ leagues all upload different CSV versions same day, queries grow unbounded; performance degrades
- Scaling path:
  - Add `league_id` column to `projections_run` (make composite key with date)
  - Partition `player_projection` table by league_id
  - Archive old projection runs after 90 days
  - Add index on (league_id, as_of_date)

**In-Memory Snapshot State:**
- Current capacity: Snapshot orchestrator loads entire league data into memory before writing
- Limit: 1000+ player leagues hit Node.js memory limits; process crashes during processing
- Scaling path:
  - Stream player/team data via batch inserts (chunks of 100)
  - Use database cursors for large result sets
  - Implement pagination in ESPN fetch
  - Monitor heap usage; add warnings at 80% threshold

**No Connection Pooling Configuration:**
- Current capacity: Kysely default pool size (10 connections)
- Limit: 20+ concurrent requests cause queue backlog; queries timeout
- Scaling path:
  - Configure pool size in `connection.ts` based on instance count
  - Implement request-level transaction boundaries
  - Add query timeout warnings
  - Consider PgBouncer for multi-instance deployments

## Dependencies at Risk

**Recharts Installed But Unused:**
- Risk: Maintenance burden; no value being delivered
- Impact: Trends page renders tables instead of charts; users cannot visualize season progression
- Migration plan: Either remove from `package.json` or implement actual charts in `packages/frontend/src/app/leagues/[id]/trends/page.tsx`

**axios-retry Uses Defaults:**
- Risk: Retry policy (3 attempts with exponential backoff) may not suit all endpoints; ESPN rate limiting may need different strategy
- Impact: Some failures retry 3x (9s total wait) while others fail fast; inconsistent behavior
- Migration plan: Make retry policy configurable per endpoint; implement circuit breaker for repeated failures

**Player CSV Parser (csv-parse) No Validation:**
- Risk: Malformed CSVs cause silent errors; rows drop without logging
- Impact: Projections appear incomplete but error is invisible to user
- Migration plan: Add validation report to `ProjectionsIngestAgent`; return detailed unmatch report to frontend

## Missing Critical Features

**DraftAssistantAgent Not Implemented in Backend:**
- Problem: Chrome extension has local draft ranking logic but cannot scale to multiple users/leagues without backend
- Blocks: Auction valuation, snake tier drafting, real-time rankings across users
- Impact: Extension works in isolation; no data sharing; cannot power live draft assistant

**Transaction Impact Analysis Not Wired to Recommendations:**
- Problem: `TransactionImpactAgent` computes WPA but results are not surfaced in `/api/leagues/:id/teams/:teamId/trades/recommendations`
- Blocks: Trade fairness scoring is hardcoded; cannot compare actual ROS value impact
- Impact: Trade recommendations use simplified projected points, missing contextual nuance

**Team Injury Status Not Tracked:**
- Problem: No `injury_event` table; `MorningReportAgent` cannot surface out/day-to-day players
- Blocks: Cannot flag trades involving injured players; cannot simulate full-squad scenarios
- Impact: Users unaware of roster health risks; recommendations may include injured players

**Waiver Priority / Claim Status Not Stored:**
- Problem: No `league_waiver_claim` table; API cannot return which teams have pending claims
- Blocks: Waiver recommendations cannot factor in competing claims; add recommendations may be invalid
- Impact: UI shows stale waiver status; user adds player already claimed by another team

## Test Coverage Gaps

**Integration Tests Minimal (2 Test Files):**
- What's not tested: Agent orchestration, end-to-end snapshot flows, ESPN adapter error handling, database transactions
- Files: Only `packages/backend/src/agents/__tests__/trade-recommendation.test.ts` has meaningful test coverage (638 lines)
- Risk: Regression in core snapshot logic can silently corrupt data; no regression protection
- Priority: High - Add tests for:
  - Snapshot orchestrator with mock ESPN adapter (both success and error cases)
  - Transaction ingest and deduplication
  - Rate stat calculation edge cases (0 denominators, negative values)
  - Empty roster / free agent list handling
  - Database transaction rollback scenarios

**Frontend Components Not Tested:**
- What's not tested: Data fetching, error states, localStorage persistence, TanStack Query cache invalidation
- Files: No `.test.tsx` files in `packages/frontend/src/app/leagues/[id]/`
- Risk: UI bugs go undetected until production; broken components degrade user experience
- Priority: Medium - Add tests for:
  - League selection and persistence flow
  - Trade impact calculation in moves page
  - Waiver recommendations sorting and filtering
  - Responsive layout on mobile
  - Token refresh middleware

**Extension Logic Not Tested:**
- What's not tested: DOM observer reliability, draft state persistence, player name normalization, ranking application
- Files: `packages/extension/lib/api-client.ts` (1054 lines), `packages/extension/lib/dom-observers.ts` (451 lines) - no tests
- Risk: DOM changes break extension silently; users get stale or wrong rankings
- Priority: High - Add tests for:
  - Player name matching (accents, Jr/Sr, suffixes)
  - Draft state Zustand store (persistence, hydration, recovery)
  - DOM observer resilience to ESPN structure changes
  - Value calculations edge cases

**Database Migration Tests Missing:**
- What's not tested: Schema changes don't corrupt existing data; migrations are idempotent
- Files: `packages/backend/src/db/migrations/` (6+ migration files)
- Risk: Production migration fails mid-way; rollback needed; potential data loss
- Priority: High - Implement:
  - Schema validation tests (up + down)
  - Data integrity checks (foreign keys, constraints preserved)
  - Rollback scenarios
  - Backward compatibility verification

---

*Concerns audit: 2026-02-23*
