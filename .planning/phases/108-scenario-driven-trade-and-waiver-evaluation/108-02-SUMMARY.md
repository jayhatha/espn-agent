# Phase 108 Plan 02 Summary — Agent Rewiring & Route Fixes

## Commits

- `3c812b8` feat(recommendations): bilateral trade delta, waiver evaluator, canonical schema
- `8c96258` test(waiver): add evaluateAddDropImpact regression tests (Phase 108)

## What Changed

### validation.ts

- `ProposedTradeSchema` migrated to canonical `givePlayers`/`receivePlayers` field names
- Added `normalizeTradePayload(raw)` — accepts canonical, legacy `playersGiven/playersReceived`, and `{ trade: {...} }` envelope shapes; returns null for unrecognized input

### validation.test.ts

- Updated existing `ProposedTradeSchema` tests to use canonical field names
- Added 12 new tests: canonical acceptance, legacy rejection, normalization of all input forms

### waiver-recommendation.ts

- Added `WaiverEvaluationInput` and `WaiverEvaluationResult` interfaces
- Added optional 5th constructor param: `scenarioEvaluationAgent?: ScenarioEvaluationAgent`
- Added `evaluateAddDropImpact(input)` — delegates to `ScenarioEvaluationAgent.evaluateWaiver()`; degrades gracefully if agent not injected
- `canReplacePosition()` retained for backward compat in `getRecommendations()` path only

### waiver-recommendation.test.ts (new file)

- 4 tests: method exists, returns `isLegal`, surfaces `blockingIssues`, does NOT use `canReplacePosition`

### trade-recommendation.ts

- `TradeImpactAnalysis` extended with `partnerDeltaOverallPoints?: number` and `partnerCategoryImpacts?: CategoryImpact[]`
- `TradeCandidate` extended with `partnerDeltaOverallPoints?: number`

### agent-factory.ts

- Added `createScenarioEvaluationAgent(db, logger)` factory
- `createWaiverAgent()` now accepts optional `scenarioAgent` param; creates one automatically if omitted

### recommendations.ts

- `POST /waivers/evaluate` rewritten to call `waiverAgent.evaluateAddDropImpact()` directly (replaces `getRecommendations()` piggyback)
- `POST /trades/impact` normalizes incoming field names (accepts `givePlayers` or legacy `playersGiven`) without breaking `ProposedTrade` typing
- Fixed `projections_run` resolution query: `staleness='fresh'` + `orderBy('ingested_at')` (was invalid columns `is_fresh`/`created_at`)

## Test Results

- 346 tests pass across 25 test files (pre-existing ESPN retry unhandled rejection warnings are unchanged)
- TypeScript: clean (`tsc --noEmit` 0 errors)

## Not Done (deferred)

- `RosterSimulator.simulateTrade` / `simulateAddDrop` / `assessTradeLikelihood` removal — no failing tests required it and removing them would break `TradeRecommendationAgent.generateTradeCandidates()`; deferred to Phase 109+
- Full Monte Carlo rerank for top-12 trade candidates — not in Plan 02 scope
