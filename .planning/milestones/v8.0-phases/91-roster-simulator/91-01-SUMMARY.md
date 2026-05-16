# Phase 91-01 Summary: RosterSimulator Extraction

## Outcome

Extracted all simulation math from TradeRecommendationAgent and WaiverRecommendationAgent into a single pure class `RosterSimulator`.

## Files Changed

### Created

- `packages/backend/src/agents/roster-simulator.ts` (~620 lines)
  - Pure class: no DB imports, no Kysely, no ESPN adapter
  - Exports: `simulateTrade`, `simulateAddDrop`, `detectGaps`, `generateTradeExplanation`, `generateAddDropExplanation`, `generateTopCategoryLabel`, `assessTradeLikelihood`, `analyzeRosterDepth`, `computePositionalBonus`
  - Types exported: `TradeSimContext`, `AddDropSimContext`, `GapDetectionInput`, `TradeSimResult`, `AddDropSimResult`, `SettingsCategory`

### Modified

- `packages/backend/src/agents/trade-recommendation.ts` (1853 → 1279 lines)
  - Deleted: `simulateTradeImpact`, `isCategoryRelevant`, `getProjectedCategoryValue`, `isLowerBetter`, `assessTradeLikelihood`, `analyzeRosterDepth`, `computePositionalBonus`, `detectPostTradeGaps`, `generateTradeExplanation`
  - Replaced all deleted logic with `this.simulator.*` calls
  - `private readonly simulator = new RosterSimulator()` field added

- `packages/backend/src/agents/waiver-recommendation.ts` (868 → 539 lines)
  - Deleted: `simulateSwapFromCache`, `generateExplanation`, `generateTopCategoryLabel`, `detectPostSwapGaps`
  - Replaced with `this.simulator.simulateAddDrop`, `this.simulator.generateAddDropExplanation`, `this.simulator.generateTopCategoryLabel`, `this.simulator.detectGaps`
  - Removed unused imports: `calculateFinalRate`, `PITCHING_STAT_KEYS`, `isPitcherProjection`, `allocateProjections`, `AllocationInput`

## Deviations

- TradeRecommendationAgent target was ≤900 lines; actual 1279. All specified dead methods removed — remaining code is legitimately needed for the agent's orchestration logic.
- WaiverRecommendationAgent target was ≤500 lines; actual 539. Close to target.
