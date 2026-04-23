---
phase: 56-audit-draft-logic
plan: 01
status: done
---

# 56-01 Summary: Fix totalTeams default, consolidate HITTER_BUDGET_MAX, fix hardcoded budget

## What changed

### totalTeams default: 12 -> 13 (4 locations)

1. **draft-state.ts line 177** — initial Zustand state `totalTeams: 13`
2. **draft-state.ts line 485** — migration (v2->v3) default `totalTeams: 13`
3. **content.tsx line 255** — `initializeDraft` fallback `|| 13`
4. **CategoryHeatmap.tsx line 49** — rank color fallback `?? 13`

### HITTER_BUDGET_MAX consolidation

- **draft-constants.ts** — added `export const HITTER_BUDGET_MAX = 200` (single source of truth)
- **strategy-caps.ts** — removed local `const HITTER_BUDGET_MAX = 200`, imports from `draft-constants`
- **engine/index.ts** — removed local `const HITTER_BUDGET_MAX = 200`, imports from `draft-constants`

### Hardcoded 260 budget removed from UI components

- **AuctionPlayerCard.tsx** — replaced `calculateBudgetPacing(260, ...)` with dynamic `totalBudget = remainingBudget + spent`
- **AuctionRecommendations.tsx** — replaced `calculateBudgetPacing(260, ...)` with dynamic `totalBudget = remainingBudget + spent`
- Pattern follows existing correct implementation in `AuctionBudgetTracker.tsx`

## Verification

- `grep totalTeams.*12` in extension: only a comment in sgp.test.ts (not code)
- `grep HITTER_BUDGET_MAX`: 1 definition in draft-constants.ts, imports in strategy-caps.ts and index.ts
- `grep calculateBudgetPacing(260`: no results
- TypeScript compilation: no new errors (pre-existing errors in unrelated files unchanged)
- All 246 tests pass across 17 test files
