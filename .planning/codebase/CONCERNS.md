# Codebase Concerns

**Analysis Date:** 2026-03-13

## Tech Debt

**Free Agent Pool Never Fetched from ESPN:**
- Issue: `packages/backend/src/adapters/espn.ts` has `fetchFreeAgents()` method (line 579-676) but ESPN free agents endpoint is ineffective or unreliable. Method returns empty arrays in practice.
- Files: `packages/backend/src/adapters/espn.ts`, `packages/backend/src/api/recommendations.ts` (lines 84-94)
- Impact: Waiver recommendations and trade analysis work with incomplete player pools. Free agent suggestions are not data-driven.
- Fix approach: Verify ESPN free agents endpoint parameters, implement fallback to fetch unrostered players, or implement manual free agent list management.

**PlayerIdentityResolutionAgent Disconnected from Projections Ingest:**
- Issue: `packages/backend/src/agents/player-identity.ts` provides fuzzy name matching with confidence scores, but `packages/backend/src/agents/projections-ingest.ts` (line 388, 521) has duplicate fuzzy matching logic instead of using the agent.
- Files: `packages/backend/src/agents/projections-ingest.ts`, `packages/backend/src/agents/player-identity.ts`
- Impact: Code duplication, inconsistent matching thresholds (FUZZY_MATCH_CONFIDENCE_THRESHOLD = 0.95 hardcoded in ingest), missed opportunity for shared identity mapping table optimization.
- Fix approach: Refactor projections ingest to exclusively use PlayerIdentityResolutionAgent for matching, eliminate inline fuzzy matching logic.

**Frontend API Client Library Never Used:**
- Issue: `packages/frontend/src/lib/api.ts` provides TypeScript-first API client using TanStack Query, but all pages hardcode `localhost:3001` directly (e.g., `packages/frontend/src/lib/constants.ts` line 13).
- Files: `packages/frontend/src/lib/api.ts`, all `packages/frontend/src/app/*/page.tsx` files
- Impact: No centralized error handling, no request deduplication, duplicate API logic across pages, harder to maintain.
- Fix approach: Migrate all pages to use `packages/frontend/src/lib/api.ts` client, remove hardcoded URLs.

**No Shared Frontend Components:**
- Issue: Frontend UI components are duplicated across multiple pages (e.g., team cards, stat tables, loading states).
- Files: Multiple files in `packages/frontend/src/app/`
- Impact: Inconsistent styling, harder to maintain, harder to implement design changes globally.
- Fix approach: Extract common components to `packages/frontend/src/components/`, establish shared layout patterns.

**Recharts Library Installed But Not Used:**
- Issue: Recharts is in `package.json` but trends page renders HTML tables instead of charts (line 6-7 of CLAUDE.md).
- Files: All trend/chart rendering in frontend
- Impact: Dependency bloat, missed visualization features for trends and projections.
- Fix approach: Either implement chart visualizations or remove recharts from dependencies.

**Home Page Routes to Non-existent Endpoints:**
- Issue: Home page links to `/projections`, `/waivers`, `/trends` which are 404s. Correct routes are under `/leagues/[id]/...`.
- Files: `packages/frontend/src/app/page.tsx` (assumed)
- Impact: Poor UX, users cannot navigate to features from homepage.
- Fix approach: Update homepage navigation to use `/leagues/[id]/...` routes or redirect to first available league.

**Hardcoded Localhost URLs Across Codebase:**
- Issue: Multiple hardcoded `localhost:3001` and `localhost:3000` URLs instead of environment variables.
- Files:
  - `packages/extension/entrypoints/background.ts` (line 21)
  - `packages/frontend/src/lib/constants.ts` (line 13)
  - `packages/backend/src/index.ts` (line 52)
  - `packages/backend/src/workers/slack-approval-worker.ts` (line 19)
  - `packages/backend/src/db/migrate.ts` (line 31) - includes plaintext credentials
  - `packages/extension/lib/api-client.ts` (line 135)
  - `packages/extension/entrypoints/popup/index.tsx` (lines 12, 67, 201)
- Impact: Development-only code may be deployed to production, environment-specific configuration scattered.
- Fix approach: Centralize all environment-aware URLs, ensure fallbacks are tested in production.

**ESPN DOM Selectors Are Placeholders/Brittle:**
- Issue: `packages/extension/lib/dom-observers.ts` (lines 1-50) uses broad CSS selectors that target ESPN's JSX-generated class names (e.g., `.jsx-XXXXX`). These may change with ESPN site updates.
- Files: `packages/extension/lib/dom-observers.ts`, `packages/extension/lib/draft-config-detector.ts`
- Impact: Extension breaks when ESPN updates their DOM structure, no graceful degradation.
- Fix approach: Add fallback selectors, implement observer pattern for DOM mutation detection, add logging to track which selectors are matching, implement selector validation on every draft session start.

**Type Casting with `any` Throughout Codebase:**
- Issue: Excessive use of `as any` and `request: any` casts in backend API routes (50+ instances).
- Files: `packages/backend/src/api/`, `packages/backend/src/workers/`, `packages/backend/src/agents/`
- Impact: Loses TypeScript safety, harder to catch errors at compile time, makes refactoring dangerous.
- Fix approach: Create proper Fastify request/reply type definitions, avoid casting by improving type annotations.

## Known Bugs

**Extension Hard Stops on 429 Rate Limiting:**
- Symptoms: Extension becomes unresponsive when ESPN returns 429 (Too Many Requests)
- Files: `packages/backend/src/adapters/espn.ts` (throttle implementation at lines 22-37), test at `packages/backend/src/adapters/__tests__/espn.test.ts` (line 67)
- Trigger: Multiple extension instances + frequent ESPN API calls, or ESPN rate limit drops
- Workaround: Manual extension restart, wait for ESPN rate limit reset
- Root cause: No exponential backoff strategy, only fixed 2-second throttle between calls
- Fix approach: Implement axios-retry with exponential backoff, respect Retry-After headers, queue requests when rate limited.

**Trade Recommendation Missing Rate Stat Adjustments:**
- Symptoms: Trade impact analysis shows incorrect ERA/WHIP changes when trading pitchers
- Files: `packages/backend/src/agents/trade-recommendation.ts` (line 97 in CLAUDE.md notes "rate stat adjustments not fully implemented")
- Trigger: Analyze any trade involving pitchers in rate stat categories
- Root cause: Code only adjusts counting stats (K, W, SV) but not ERA/WHIP components (ER, IP, H, BB)
- Fix approach: Implement component-based rate stat adjustment (subtract traded-away pitcher components, add received pitcher components, recalculate rate), add test coverage for pitcher trades.

**User Team ID Detection Not Implemented in Extension:**
- Symptoms: Extension cannot automatically detect user's team in draft, requires manual configuration
- Files: `packages/extension/lib/draft-config-detector.ts`, extension settings
- Impact: User friction during draft setup, potential errors if wrong team selected
- Fix approach: Implement DOM scraping for team ID from ESPN draft page, store in session, validate on page load.

**Waiver Delta Simulation Hardcoded to 0.5:**
- Symptoms: All waiver recommendations show identical point delta regardless of impact
- Files: `packages/backend/src/agents/waiver-recommendation.ts` (line 84 in CLAUDE.md)
- Trigger: Request any waiver recommendations
- Root cause: Simulation returns hardcoded 0.5 instead of actual projected standings impact
- Fix approach: Use StandingsProjectionAgent to simulate add/drop and compute actual delta overall points.

## Security Considerations

**ESPN Auth Cookies Stored in Plaintext (Old Pattern):**
- Risk: If database is compromised, ESPN auth cookies are exposed
- Files: `packages/backend/src/api/leagues.ts` (lines 125-130 assume old plaintext storage), though newer code uses encryption
- Current mitigation: Encryption utility exists at `packages/backend/src/utils/encryption.ts` (AES-256-GCM), but migration incomplete
- Recommendations:
  - Audit all ESPN credential storage to verify encryption is applied
  - Set ENCRYPTION_KEY in production environment
  - Implement data migration to encrypt existing plaintext credentials
  - Add decryption validation on league fetch (already in place at `packages/backend/src/api/recommendations.ts` line 67-80)

**JWT Secret Hardcoded to Insecure Default:**
- Risk: Development default `"development-secret-change-in-production"` may be used in production
- Files: `packages/backend/src/index.ts` (line 89)
- Current mitigation: Uses `process.env.JWT_SECRET ||` pattern with fallback
- Recommendations:
  - Verify production deployment sets JWT_SECRET env var
  - Add startup validation to reject insecure defaults in production

**Chrome Extension Uses Session Auth via Browser Cookies:**
- Risk: Works for local dev but incompatible with production (no way to authenticate extension to backend service)
- Files: `packages/extension/entrypoints/popup/index.tsx` (line 160), extension auth implementation
- Impact: Extension cannot be published to Chrome Web Store without API token system
- Recommendations:
  - Implement OAuth2 token endpoint for extension auth
  - Store tokens in Chrome's secure storage (chrome.storage.session)
  - Add token refresh logic
  - Test against production API endpoints

**Slack Webhook URLs and Bot Tokens Stored Encrypted:**
- Risk: Tokens are encrypted in database, but ENCRYPTION_KEY leakage would expose all Slack integration credentials
- Files: `packages/backend/src/api/slack.ts` (lines 144-172)
- Current mitigation: Encryption utility in place
- Recommendations: Consider using Slack's secret rotation API, add logging for token refresh events

## Performance Bottlenecks

**Large Monolithic Agent Files:**
- Problem: Individual agent files have high line counts, making them hard to understand and test
- Files:
  - `packages/backend/src/agents/transaction-impact.ts` (1451 lines)
  - `packages/extension/lib/auto-bid-controller.ts` (1639 lines)
  - `packages/extension/lib/engine/index.ts` (1463 lines)
  - `packages/backend/src/adapters/espn.ts` (1331 lines)
  - `packages/backend/src/agents/snapshot-orchestrator.ts` (1384 lines)
- Impact: Cognitive load during development, harder to locate bugs, larger test files
- Improvement path: Break into smaller focused modules (e.g., separate logic for rate stat calculation from trade analysis), improve test organization.

**No Parallel Free Agent + Transaction Fetch:**
- Problem: `packages/backend/src/agents/snapshot-orchestrator.ts` (line 369) uses `Promise.allSettled()` but main snapshot workflow blocks on ESPN fetch before starting parallel work
- Impact: Snapshot can take 5-10 seconds when ESPN has latency
- Improvement path: Start free agent + transaction fetches immediately after initial ESPN fetch, before writing to database.

**In-Memory ESPN Cache (Not Redis):**
- Problem: `packages/backend/src/adapters/espn.ts` (line 4) uses `LRUCache` instead of shared Redis cache
- Impact: Multiple backend instances cannot share cached ESPN responses, unnecessary redundant API calls
- Improvement path: Move cache to Redis, set 5-minute TTL on league data.

**No Request Deduplication in Frontend:**
- Problem: Multiple requests to same endpoint in parallel (e.g., standings page + sidebar both fetch team data)
- Files: All frontend pages
- Impact: Increased backend load, unnecessary transfers
- Improvement path: Use TanStack Query's built-in request deduplication (migrate to `packages/frontend/src/lib/api.ts` client).

## Fragile Areas

**Snapshot Orchestrator with No Job Lock:**
- Files: `packages/backend/src/agents/snapshot-orchestrator.ts`
- Why fragile: If multiple snapshot jobs trigger simultaneously (e.g., manual + scheduled), both write to database concurrently, causing race conditions
- Safe modification: Always acquire distributed lock before writing snapshots (use Redis SETNX or BullMQ job lock)
- Test coverage: No test for concurrent snapshot execution
- Known issues: `packages/backend/src/agents/__tests__/snapshot-orchestrator.test.ts` only tests happy path

**Rate Stat Component Math:**
- Files: `packages/shared/src/formulas.ts`, all agents using `calculateFinalRate()`
- Why fragile: Component math depends on correct extraction of IR, H, BB, IP, ER etc. from ESPN data. Missing or incorrect components silently produce wrong rates.
- Safe modification: Always validate component presence before rate calculation, return null if components incomplete
- Test coverage: Limited test cases for edge cases (0 IP pitchers, 0 AB batters)

**ESPN API Response Schema Validation:**
- Files: `packages/backend/src/utils/espn-schemas.ts`, `packages/backend/src/adapters/espn.ts`
- Why fragile: ESPN API can return schema variations (missing fields, renamed fields). No runtime validation catches these until downstream processing fails.
- Safe modification: Use strict Zod schema validation on ESPN responses, reject if validation fails, mark league as degraded
- Test coverage: No test for schema drift detection

**Empty Array Guards in Kysely Queries:**
- Files: Multiple locations use `.where("id", "in", array)` without checking array.length
- Why fragile: Kysely generates invalid SQL for empty arrays (`WHERE id IN ()` is syntax error)
- Safe modification: Always check `if (array.length === 0) return []` before using `.where("col", "in", array)`
- Test coverage: `packages/backend/src/agents/__tests__/empty-array-guards.test.ts` verifies guards exist but coverage is incomplete

**DOM Selector Fragility in Extension:**
- Files: `packages/extension/lib/dom-observers.ts` (1418 lines), `packages/extension/lib/draft-config-detector.ts` (872 lines)
- Why fragile: All selectors target ESPN DOM structure which changes with site updates. Fallback selectors are broad/non-specific.
- Safe modification: Add mutation observer to detect when selectors fail, implement selector self-healing with logging
- Test coverage: No integration tests against real ESPN DOM

## Scaling Limits

**BullMQ Redis Job Queues Single Connection:**
- Current capacity: Default queue concurrency = 3 workers per queue
- Limit: Each backend instance has its own queue connection; no job distribution across instances
- Scaling path: Implement shared BullMQ connection pool, route jobs through single Redis queue, allow multiple backend instances to consume

**Database Connection Pool:**
- Current capacity: Kysely default connection pool (likely 10-20 connections)
- Limit: Under heavy load (many concurrent leagues), connections may exhaust
- Scaling path: Configure `pool.min` and `pool.max` in Kysely options, monitor connection usage, consider read replicas for reporting queries

**ESPN API Rate Limit (2 Requests/Second):**
- Current capacity: 2 reqs/sec throttle implemented
- Limit: If supporting >100 leagues with daily snapshots, throttle becomes bottleneck
- Scaling path: Implement request batching (multi-league queries), use ESPN's bulk endpoint if available, move to async task queue with exponential backoff

## Dependencies at Risk

**axios-retry Configuration Incomplete:**
- Risk: Retry strategy may not handle all ESPN failure modes (429, timeouts, network errors)
- Files: `packages/backend/src/adapters/espn.ts` (line 6), retry configuration
- Impact: Failed ESPN fetches mark league degraded, user sees stale data
- Migration plan: Audit retry logic against ESPN API error catalog, add exponential backoff, implement circuit breaker pattern

**Kysely Migration System:**
- Risk: No migration rollback strategy documented, no way to safely revert schema changes
- Files: `packages/backend/src/db/migrations/`
- Impact: Schema mistakes are hard to undo in production
- Migration plan: Document rollback procedure, add down migrations, test against staging

**TypeScript Version Pinning:**
- Risk: Monorepo may have incompatible TS versions across packages (shared vs backend vs frontend)
- Files: Multiple `tsconfig.json`, `packages/*/package.json`
- Impact: Type errors only caught in certain packages, harder to use shared types
- Migration plan: Pin TypeScript version in root `pnpm-workspace.yaml`, ensure all packages use same version

## Missing Critical Features

**Transaction Ingestion Not Implemented:**
- Problem: ESPN transactions (trades, waivers, drops) are fetched but not parsed into `league_transaction_event` table
- Blocks: Transaction timeline analysis, trade history, waiver history
- Files: `packages/backend/src/adapters/espn.ts` (fetchTransactions method exists but unused), `packages/backend/src/agents/snapshot-orchestrator.ts` (line 90 notes this gap)

**DraftAssistantAgent Not Implemented (Chrome Extension Built Separately):**
- Problem: Backend has no agent for draft recommendations; extension implements its own deterministic draft engine
- Blocks: Sharing draft logic between web and extension, using backend projections in extension
- Files: Entire `packages/extension/lib/` contains duplicate draft logic

**Time Series Endpoints Missing:**
- Problem: `category-total` and `projected-category` time series endpoints not implemented
- Blocks: Historical tracking of category performance and projections
- Files: `packages/backend/src/api/timeseries.ts`

**Activity Feed Parsing:**
- Problem: ESPN activity feed (trades, waivers, injuries) never fetched or parsed
- Blocks: Daily transaction notifications, injury alerts
- Files: None (feature not started)

## Test Coverage Gaps

**ESPN Adapter Integration Tests:**
- What's not tested: Real ESPN API responses (only mocked), schema drift detection
- Files: `packages/backend/src/adapters/__tests__/espn.test.ts` (only happy path mocks)
- Risk: Breaking changes to ESPN API discovered in production
- Priority: High - ESPN integration is critical path

**Trade Recommendation Rate Stat Accuracy:**
- What's not tested: Pitcher trades with rate stat impacts, component adjustment correctness
- Files: `packages/backend/src/agents/__tests__/trade-recommendation.test.ts` (line 957) - 957 lines but missing pitcher scenarios
- Risk: Users get incorrect trade recommendations for pitchers
- Priority: High - impacts user decisions

**Extension DOM Observer Robustness:**
- What's not tested: Selector failures, ESPN DOM variations, fallback selector matching
- Files: `packages/extension/lib/__tests__/` has 0 integration tests for DOM observers
- Risk: Extension silently fails to detect picks/budget/rosters
- Priority: High - extension is primary user interface

**Encryption Key Rotation:**
- What's not tested: Decryption of tokens encrypted with old keys, migration between keys
- Files: `packages/backend/src/utils/encryption.ts` - no rotation logic
- Risk: Token compromise requires full re-encryption (downtime)
- Priority: Medium - affects credential security

**Concurrent Snapshot Execution:**
- What's not tested: Two snapshots running simultaneously, database consistency
- Files: `packages/backend/src/agents/__tests__/snapshot-orchestrator.test.ts`
- Risk: Data corruption, duplicate projections
- Priority: Medium - affects data consistency

---

*Concerns audit: 2026-03-13*
