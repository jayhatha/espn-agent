---
phase: quick-42
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/engine/opponent-model.ts
  - packages/extension/lib/engine/index.ts
  - packages/extension/lib/__tests__/opponent-model.test.ts
autonomous: true
requirements: [FIX-INFLATED-MAXBID]

must_haves:
  truths:
    - "estimateMarketPrice never returns more than 2x a player's dollar value"
    - "Top target maxBid never exceeds 2x the player's dollar value"
    - "High-value players (e.g. $40 dollar value) can still inflate to reasonable prices"
    - "A $1 player with high SGP gets capped at $2 max market price, not $30+"
  artifacts:
    - path: "packages/extension/lib/engine/opponent-model.ts"
      provides: "estimateMarketPrice with playerDollarValue parameter and 2x cap"
      exports: ["estimateMarketPrice"]
    - path: "packages/extension/lib/engine/index.ts"
      provides: "Top targets maxBid capped to 2x dollar value"
    - path: "packages/extension/lib/__tests__/opponent-model.test.ts"
      provides: "Tests verifying 2x cap behavior"
  key_links:
    - from: "packages/extension/lib/engine/index.ts"
      to: "estimateMarketPrice"
      via: "passes player.dollars as new parameter"
      pattern: "estimateMarketPrice.*dollars"
---

<objective>
Fix inflated max bid recommendations for low-value players by adding a 2x dollar value cap to estimateMarketPrice and top targets maxBid.

Purpose: A $1 player with high SGP and favorable budget/SGP ratio can produce a $30 market price estimate, leading to absurd max bid recommendations. Capping to 2x dollar value accounts for real draft inflation while preventing nonsensical bids.

Output: Patched estimateMarketPrice with playerDollarValue param + 2x clamp, top targets maxBid capped, updated tests.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/lib/engine/opponent-model.ts
@packages/extension/lib/engine/index.ts
@packages/extension/lib/engine/bid-optimizer.ts
@packages/extension/lib/__tests__/opponent-model.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add playerDollarValue cap to estimateMarketPrice and update all callers</name>
  <files>
    packages/extension/lib/engine/opponent-model.ts
    packages/extension/lib/engine/index.ts
    packages/extension/lib/engine/bid-optimizer.ts
  </files>
  <action>
1. In `packages/extension/lib/engine/opponent-model.ts`, update `estimateMarketPrice` signature:
   - Add a 5th parameter: `playerDollarValue: number`
   - After computing the final `Math.round(basePrice * competitionAdjustment)`, clamp the result:
     `return Math.min(Math.round(basePrice * competitionAdjustment), Math.max(1, Math.ceil(playerDollarValue * 2.0)))`
   - Update the JSDoc to document the new parameter and the 2x cap rationale ("allows up to 2x inflation to account for draft inflation, but prevents SGP-ratio-driven runaway prices for low-value players")

2. In `packages/extension/lib/engine/index.ts` (top targets, ~line 301):
   - Pass `player.dollars` as the 5th argument to `estimateMarketPrice(sgp, totalSGP, totalBudget, competitionFactor, player.dollars)`
   - Also cap the `maxBid` line (currently line 314) to: `maxBid: Math.min(myBudget, expectedPrice, Math.max(1, Math.ceil(player.dollars * 2.0)))` — this double-caps via both the estimateMarketPrice output AND the maxBid assignment for defense-in-depth

3. In `packages/extension/lib/engine/bid-optimizer.ts`, update all 3 call sites of `estimateMarketPrice` to pass the player's dollar value as the 5th argument:
   - Line ~60 (player not in pool fallback): pass `nominatedPlayer.dollars`
   - Line ~130 (player at price=1 doesn't improve baseline): pass `nominatedPlayer.dollars`
   - Line ~182 (final expected market price): pass `nominatedPlayer.dollars`
   - NOTE: Do NOT change the binary search upper bound (line ~95, `Math.ceil(nominatedPlayer.dollars * 3)`) — the 3x cap for the nominated player bid search is intentionally higher because the user is actively deciding on the nominated player and needs the full binary search range. The 2x cap on estimateMarketPrice affects the *expected market price* (what opponents would pay), not the max profitable bid.
  </action>
  <verify>
    Run `cd packages/extension && npx tsc --noEmit` to confirm no type errors from the signature change. All callers must pass the 5th argument.
  </verify>
  <done>estimateMarketPrice accepts playerDollarValue and clamps output to 2x. All 4 call sites (1 in index.ts, 3 in bid-optimizer.ts) pass the dollar value. Top targets maxBid also independently capped to 2x dollar value.</done>
</task>

<task type="auto">
  <name>Task 2: Update tests to verify 2x dollar value cap</name>
  <files>
    packages/extension/lib/__tests__/opponent-model.test.ts
  </files>
  <action>
1. Update all existing `estimateMarketPrice` test calls to pass a 5th argument (playerDollarValue). Choose values that keep existing expectations unchanged — set playerDollarValue high enough that the 2x cap doesn't activate for those tests:
   - Test "applies inflation + competition" (expects 13): pass `playerDollarValue = 20` (cap = 40, no clamp)
   - Test "returns $1 when totalRemainingValue is 0": pass `playerDollarValue = 1`
   - Test "returns at least $1 even when SGP * ratio is very small": pass `playerDollarValue = 1`
   - Test "competition factor 0 applies no competition premium" (expects 10): pass `playerDollarValue = 10` (cap = 20, no clamp)
   - Test "competition factor 1.0 applies maximum 20% premium" (expects 12): pass `playerDollarValue = 10` (cap = 20, no clamp)

2. Add new test: "caps result to 2x playerDollarValue for low-value players":
   - `estimateMarketPrice(5, 100, 600, 0, 1)` — raw base price would be 5*(600/100) = $30, but cap = ceil(1*2) = $2, so result should be $2
   - `expect(result).toBe(2)`

3. Add new test: "does not cap high-value players when market price is within 2x":
   - `estimateMarketPrice(10, 100, 100, 0, 10)` — base = 10, cap = 20, result = 10 (no clamp)
   - `expect(result).toBe(10)`

4. Add new test: "caps at exactly 2x for mid-range scenario":
   - `estimateMarketPrice(10, 100, 300, 0, 5)` — base = 30, cap = 10, result = 10
   - `expect(result).toBe(10)`
  </action>
  <verify>
    Run `cd packages/extension && npx vitest run lib/__tests__/opponent-model.test.ts` — all tests pass including new cap tests.
  </verify>
  <done>All existing estimateMarketPrice tests pass with updated signatures. Three new tests verify the 2x dollar value cap activates for low-value players, does not activate for high-value players, and clamps exactly at 2x.</done>
</task>

</tasks>

<verification>
1. `cd packages/extension && npx tsc --noEmit` — no type errors
2. `cd packages/extension && npx vitest run lib/__tests__/opponent-model.test.ts` — all tests pass
3. Manual sanity check: a $1 player with SGP=5 and budget/SGP=6 would previously produce $30 market price; now produces $2
</verification>

<success_criteria>
- estimateMarketPrice returns at most 2x the player's dollar value (never $30 for a $1 player)
- Top targets maxBid capped to min(budget, expectedPrice, 2x dollarValue)
- Bid optimizer's binary search upper bound (3x) unchanged for nominated player path
- All existing and new tests pass
</success_criteria>

<output>
After completion, create `.planning/quick/42-fix-inflated-max-bid-recommendations-for/42-01-SUMMARY.md`
</output>
