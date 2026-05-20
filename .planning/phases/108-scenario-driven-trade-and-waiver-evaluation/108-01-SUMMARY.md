# Phase 108 — Plan 01 SUMMARY: Scenario Evaluator Foundation

## Status: COMPLETE

## What was built

### Wave 1 — Reproducibility Fixes + Scenario Evaluator Foundation

**Task 1: TDD tests** (created before production code)

- `src/simulation/__tests__/state-builder.test.ts` — 8 tests covering:
  - `daysRemaining` derived from `snapshotDate`, not wall clock
  - Two different `snapshotDate`s yield different `daysRemaining`
  - Post-season date clamps to 0
  - `getHistoricalRawPayload` uses date-bounded filter (not always-latest)
  - State is not viable when snapshot is missing

- `src/simulation/__tests__/scenario-evaluator.test.ts` — 6 tests covering:
  - Waiver: legal OF-for-OF swap → positive delta for clearly better player
  - Waiver: illegal SP-for-OF swap → gaps detected, `isLegal = false`
  - Waiver: identical projections → zero delta
  - Trade: bilateral returns both user and partner deltas
  - Trade: illegal trade (no slot to fill) → gaps detected
  - Trade: zero-sum for identical player swap

**Task 2: Reproducibility fixes**

- `simulation/state-builder.ts`:
  - Replaced `daysUntil(DEFAULT_SEASON_END)` (wall-clock) with `daysFromSnapshotDate(snapshotDate, DEFAULT_SEASON_END)` (snapshot-bound)
  - Replaced inline `league_raw_payload` query with `repo.getHistoricalRawPayload(leagueId, snapshotDate)`

- `db/snapshot-repository.ts`:
  - Added `getHistoricalRawPayload(leagueId, snapshotDate)` — fetches most recent raw payload with `fetched_at < dayAfter(snapshotDate)` (uses `Date` type for Kysely compatibility)

**Task 3: Scenario evaluator**

- `simulation/types.ts`: Added `WaiverMutation`, `TradeMutation`, `ScenarioMutation`, `ScenarioEvaluationResult`, `CategoryDeltaMap`

- `simulation/scenario-evaluator.ts`: Pure, DB-free `evaluateDeterministicScenario`:
  - Runs baseline deterministic simulation for ALL teams (`rng=null`)
  - Applies mutation (waiver: drop/add player; trade: bilateral player swap)
  - Re-runs only affected teams, re-ranks all categories
  - Computes delta roto points for user team (and partner for trades)
  - Runs `allocateProjections` for legality/gap detection
  - Returns `isLegal`, `blockingIssues`, `gaps`, `deltaOverallPoints`, `categoryDeltas`, `partnerDeltaOverallPoints?`, `partnerCategoryDeltas?`

- `agents/scenario-evaluation.ts`: `ScenarioEvaluationAgent`:
  - `evaluateWaiver(input)` — loads state + free-agent projections → delegates to evaluator
  - `evaluateTrade(input)` — loads state → delegates to evaluator (rostered players already in state)
  - `evaluateFromState(state, mutation)` — direct delegation (no IO)
  - `loadState(leagueId, snapshotDate, projectionsRunId)` — delegates to `SeasonSimulationAgent.buildState`

## Test results

```
Tests  14 passed (14)
Files   2 passed (2)
```

## Type check

```
npx tsc --noEmit → clean (no errors)
```

## Commit

`feat(simulation): scenario evaluator foundation with snapshot-bound reproducibility fixes`

## Next: Plan 02

- Failing tests for trade/waiver/validation/recommendations
- Rewire `TradeRecommendationAgent` and `WaiverRecommendationAgent` to delegate to `ScenarioEvaluationAgent`
- Fix `POST /waivers/evaluate` exact evaluation route
- Fix trade payload schema (`givePlayers`/`receivePlayers` canonical, `playersGiven`/`playersReceived` backward-compat)
- Monte Carlo rerank for top-K trade candidates (200 runs, seeded)
