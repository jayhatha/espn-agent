---
phase: 25-audit-waiver-and-trade-recommendation-ma
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/backend/src/agents/trade-recommendation.ts
  - packages/shared/src/formulas.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "Trade impact calculations produce non-zero category deltas for trades involving real players"
    - "isCategoryRelevant correctly classifies batter vs pitcher categories for any league configuration"
    - "getProjectedCategoryValue returns correct values for counting stats not in the hardcoded switch"
    - "isLowerBetter correctly identifies lower-better stats from league category data, not a hardcoded list"
    - "WPCT rate stat calculates correctly from W and L components"
  artifacts:
    - path: "packages/backend/src/agents/trade-recommendation.ts"
      provides: "Fixed trade simulation with stat_key (snake_case) and dynamic category logic"
      contains: "category.stat_key"
    - path: "packages/shared/src/formulas.ts"
      provides: "WPCT formula registered in calculateFinalRate"
      contains: "calculateWPCT"
  key_links:
    - from: "trade-recommendation.ts isCategoryRelevant"
      to: "standings-projection.ts PITCHING_STAT_KEYS pattern"
      via: "PITCHING_STAT_KEYS set membership check"
      pattern: "PITCHING_STAT_KEYS\\.has"
    - from: "trade-recommendation.ts getProjectedCategoryValue"
      to: "category.formula_id"
      via: "calculateFinalRate for rate stats, components[category.stat_key] for counting stats"
      pattern: "category\\.formula_id"
    - from: "trade-recommendation.ts isLowerBetter"
      to: "Category.direction field"
      via: "category.direction === 'LOWER_BETTER'"
      pattern: "category\\.direction"
---

<objective>
Fix silent category drop bugs in TradeRecommendationAgent caused by property name mismatches and hardcoded stat lists.

Purpose: Trade impact is always 0 because `category.statKey` (camelCase) is used everywhere, but the Category interface defines `category.stat_key` (snake_case). This makes `catId` undefined throughout the entire trade simulation pipeline. Additionally, hardcoded batter/pitcher lists, hardcoded rate stat maps, and hardcoded lower-better lists all silently drop categories that aren't in the lists.

Output: trade-recommendation.ts with all 7 `statKey` references replaced with `stat_key`, helper methods rewritten to use dynamic PITCHING_STAT_KEYS + formula_id patterns from standings-projection.ts, and WPCT formula added to shared formulas.ts.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@packages/shared/src/types.ts
@packages/shared/src/formulas.ts
@packages/backend/src/agents/trade-recommendation.ts
@packages/backend/src/agents/standings-projection.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix stat_key property name mismatch and dynamic helper methods in trade-recommendation.ts</name>
  <files>packages/backend/src/agents/trade-recommendation.ts</files>
  <action>
Fix all 7 occurrences of `category.statKey` → `category.stat_key` (lines 819, 826, 927, 998, 1001, 1009, 1054). These are in: the originalValues loop, the trade adjustment loop, the re-ranking loop, and all three helper methods.

Add PITCHING_STAT_KEYS constant at the top of the file (after the imports, before POSITION_SCARCITY), identical to the one in standings-projection.ts:

```typescript
const PITCHING_STAT_KEYS = new Set([
  "K", "W", "L", "SV", "HLD", "QS", "CG", "BLSV", "SVO",
  "ER", "OUTS", "HA", "BBA", "HRA",
  "ERA", "WHIP", "K9", "WPCT",
]);
```

Rewrite `isCategoryRelevant()` to replace the two hardcoded arrays with PITCHING_STAT_KEYS:

```typescript
private isCategoryRelevant(category: any, projection: any): boolean {
  const components: StatComponents = JSON.parse(projection.stat_components_json);
  const isPitchingCat = PITCHING_STAT_KEYS.has(category.stat_key);
  if (isPitchingCat) {
    return (components.IP ?? 0) > 0 || components.ER !== undefined;
  } else {
    return (components.AB ?? 0) > 0;
  }
}
```

Rewrite `getProjectedCategoryValue()` to eliminate the switch statement. For rate stats, use `category.formula_id` with `calculateFinalRate`. For counting stats, use `components[category.stat_key]` directly:

```typescript
private getProjectedCategoryValue(category: any, projection: any): number {
  const components: StatComponents = JSON.parse(projection.stat_components_json);

  if (category.type === "RATE" && category.formula_id) {
    try {
      return calculateFinalRate(category.formula_id, {}, components);
    } catch {
      return 0;
    }
  }

  // COUNTING: direct component lookup — no switch needed
  return components[category.stat_key] ?? 0;
}
```

Also fix the `isRateStat` check at line 833 (inside `simulateTradeImpact`). It currently uses a hardcoded array `["AVG", "OBP", "SLG", "OPS", "ERA", "WHIP"]`. Replace with: `const isRateStat = category.type === "RATE";`

Rewrite `isLowerBetter()` to use `category.direction`:

```typescript
private isLowerBetter(category: any): boolean {
  return category.direction === "LOWER_BETTER";
}
```

Also update the `calculateFinalRate` call at line ~877 inside the rate stat adjustment block. It currently lowercases `catId` to pass as formula_id (`catId.toLowerCase()`). Replace that entire block so it uses `category.formula_id` instead of `catId.toLowerCase()`:

```typescript
projectedValue = calculateFinalRate(
  category.formula_id!, // Use formula_id from Category, not lowercased stat_key
  {},
  adjustedComponents
);
```

Update the import at the top of trade-recommendation.ts to include `Category` type from shared:

```typescript
import {
  calculateFinalRate,
  type Category,
  type RosterValidationResult,
  type StatComponents,
} from "../../../shared/dist/index.js";
```
  </action>
  <verify>Run `cd /Users/jay-work/Code/espn-agent && pnpm --filter backend tsc --noEmit` — must pass with no errors related to trade-recommendation.ts</verify>
  <done>TypeScript compiles cleanly. No `category.statKey` references remain in trade-recommendation.ts (grep confirms zero matches). `isCategoryRelevant`, `getProjectedCategoryValue`, and `isLowerBetter` all use dynamic Category fields, not hardcoded lists.</done>
</task>

<task type="auto">
  <name>Task 2: Add WPCT formula to shared formulas.ts</name>
  <files>packages/shared/src/formulas.ts</files>
  <action>
Add `calculateWPCT` function after `calculateK9`:

```typescript
export function calculateWPCT(components: StatComponents): number {
  const { W = 0, L = 0 } = components;
  const total = W + L;
  if (total === 0) return 0;
  return W / total;
}
```

Register it in `calculateFinalRate` switch (add after the `k9` case):

```typescript
case "wpct":
  return calculateWPCT(combined);
```

Register it in `getRequiredComponents` switch (add after the `k9` case):

```typescript
case "wpct":
  return ["W", "L"];
```
  </action>
  <verify>Run `cd /Users/jay-work/Code/espn-agent && pnpm --filter shared tsc --noEmit` — must pass. Also run `pnpm --filter backend tsc --noEmit` to ensure shared dist is consistent.</verify>
  <done>TypeScript compiles cleanly for both shared and backend packages. `calculateWPCT` is exported, registered in `calculateFinalRate` under `"wpct"`, and `getRequiredComponents` returns `["W", "L"]` for `"wpct"`.</done>
</task>

</tasks>

<verification>
After both tasks:
1. `grep -n "statKey" packages/backend/src/agents/trade-recommendation.ts` — must return zero results
2. `grep -n "stat_key" packages/backend/src/agents/trade-recommendation.ts` — must show all 7+ usage sites
3. `grep -n "batterCategories\|pitcherCategories\|lowerBetterCategories\|formulaIdMap" packages/backend/src/agents/trade-recommendation.ts` — must return zero results
4. `grep -n "PITCHING_STAT_KEYS\|formula_id\|direction" packages/backend/src/agents/trade-recommendation.ts` — must show hits confirming dynamic approach
5. `grep -n "calculateWPCT\|wpct" packages/shared/src/formulas.ts` — must show the new function and both registrations
6. `cd /Users/jay-work/Code/espn-agent && pnpm --filter shared build && pnpm --filter backend tsc --noEmit` — must pass cleanly
</verification>

<success_criteria>
- Zero `category.statKey` references in trade-recommendation.ts
- Zero hardcoded category lists (batterCategories, pitcherCategories, lowerBetterCategories, formulaIdMap switch) in trade-recommendation.ts
- PITCHING_STAT_KEYS used for batter/pitcher classification
- category.formula_id used for rate stat value extraction
- category.direction used for lower-better determination
- WPCT formula implemented and registered in shared/formulas.ts
- TypeScript compiles with no errors
</success_criteria>

<output>
After completion, create `.planning/quick/25-audit-waiver-and-trade-recommendation-ma/25-SUMMARY.md`
</output>
