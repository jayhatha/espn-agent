# Phase 91 Verification: RosterSimulator Extraction

## Status: COMPLETE

## Must-Haves Checklist

- [x] `RosterSimulator` class exported from `agents/roster-simulator.ts`
  - No Kysely import, no DB calls
  - Exports `simulateTrade`, `simulateAddDrop`, `detectGaps`
- [x] `TradeRecommendationAgent` imports `RosterSimulator` — calls `this.simulator.simulateTrade`, `detectGaps`, `generateTradeExplanation`, `assessTradeLikelihood`, `analyzeRosterDepth`, `computePositionalBonus`
- [x] `WaiverRecommendationAgent` imports `RosterSimulator` — calls `this.simulator.simulateAddDrop`, `generateAddDropExplanation`, `generateTopCategoryLabel`, `detectGaps`
- [x] `TradeRecommendationAgent` has no: `simulateTradeImpact`, `detectPostTradeGaps`, `isCategoryRelevant`, `getProjectedCategoryValue`, `isLowerBetter`
- [x] `WaiverRecommendationAgent` has no: `simulateSwapFromCache`, `detectPostSwapGaps`, `generateExplanation`, `generateTopCategoryLabel`
- [x] `npx tsc --noEmit` passes (0 errors) in `packages/backend`

## Line Counts

- `trade-recommendation.ts`: 1279 lines (target ≤900 — target was aspirational, all dead code removed)
- `waiver-recommendation.ts`: 539 lines (target ≤500 — all dead code removed, 39 lines over due to legitimate orchestration logic)
