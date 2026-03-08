---
phase: 67-fix-pitcher-dampening-auto-bid
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/auto-bid-controller.ts
autonomous: true
requirements: [PITCHER-DAMPEN-01]

must_haves:
  truths:
    - "Auto-bid caps for SP/RP players are reduced by the pitcher dampening multiplier from the pitcherHitterSplit slider"
    - "At default slider value 65, a $20 ASV SP with IDEAL TARGET path caps at $16 instead of $22"
    - "Hitter auto-bid caps remain unchanged"
    - "All three bid paths (IDEAL TARGET, PL UNDERVALUED, OPPORTUNITY) apply pitcher dampening"
  artifacts:
    - path: "packages/extension/lib/auto-bid-controller.ts"
      provides: "Pitcher-dampened auto-bid caps"
      contains: "pitcherMultiplier"
  key_links:
    - from: "packages/extension/lib/auto-bid-controller.ts"
      to: "useDraftStore.getState().pitcherHitterSplit"
      via: "Zustand store read"
      pattern: "pitcherHitterSplit"
---

<objective>
Apply pitcher/hitter split dampening to auto-bid caps in the AutoBidController.

Purpose: Auto-bid currently uses raw ESPN ASV-based caps that ignore the pitcher dampening slider, causing the controller to overpay for starting pitchers. The pitcher dampening multiplier (computed from pitcherHitterSplit slider) is already used in the SGP engine but not in the auto-bid cap calculation.

Output: Modified auto-bid-controller.ts where all three bid paths (IDEAL TARGET, PL UNDERVALUED, OPPORTUNITY) apply the pitcher dampening multiplier to autoBidCap when the nominated player is a pitcher (SP or RP).
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/lib/auto-bid-controller.ts
@packages/extension/lib/draft-state.ts
@packages/extension/lib/engine/index.ts (lines 808-815 for pitcherMultiplier formula)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Apply pitcher dampening multiplier to auto-bid caps</name>
  <files>packages/extension/lib/auto-bid-controller.ts</files>
  <action>
In the `evaluateAndBid()` method, after the autoBidCap is computed (around line 622, after the if/else chain for isIdealTarget/isPLUndervalued/isOpportunity), apply the pitcher dampening multiplier when the nominated player is a pitcher.

1. Read `pitcherHitterSplit` from the Zustand store: `const pitcherHitterSplit = state.pitcherHitterSplit ?? 65;`
   - The store state `state` is already available at the top of evaluateAndBid().

2. Determine if the player is a pitcher. The variable `isSP` already exists (line 559). Also check for RP:
   `const isPitcher = ranking?.primaryPosition === "SP" || ranking?.primaryPosition === "RP";`
   Replace the existing `isSP` variable with `isPitcher` since it's needed in more places. Keep a separate `isSP` for the SP-specific opportunity rank threshold logic that already exists.

   Actually, to minimize diff: keep `isSP` as-is (line 559), add `const isRP = ranking?.primaryPosition === "RP";` right after it, and add `const isPitcher = isSP || isRP;`.

3. After the if/else chain that sets `autoBidCap` and `capSource` (after line 622), apply dampening:
   ```typescript
   // Apply pitcher/hitter split dampening to bid caps for pitchers
   // Same formula as engine/index.ts: pitcherMultiplier = (100 - split) / 50
   // At default split=65: pitcherMultiplier = 0.7, so $22 cap becomes $16
   if (isPitcher) {
     const pitcherMultiplier = (100 - pitcherHitterSplit) / 50;
     const rawCap = autoBidCap;
     autoBidCap = Math.ceil(autoBidCap * pitcherMultiplier);
     capSource += ` → pitcher dampened ×${pitcherMultiplier.toFixed(2)} = $${autoBidCap} (raw $${rawCap})`;
   }
   ```

4. Use `Math.max(1, ...)` to ensure autoBidCap never drops below $1:
   `autoBidCap = Math.max(1, Math.ceil(autoBidCap * pitcherMultiplier));`

This ensures:
- IDEAL TARGET path: ASV $20 * 1.1 = $22 * 0.7 = $16 (at default 65 split)
- PL UNDERVALUED path: ASV $15 * 1.15 = $18 * 0.7 = $13
- OPPORTUNITY path: ASV $20 * 0.7 = $14
- Hitters: unchanged (no dampening applied)
- At 50/50 split: multiplier = 1.0, no change for pitchers or hitters
  </action>
  <verify>
Run TypeScript compilation check:
```bash
cd packages/extension && npx tsc --noEmit --pretty 2>&1 | head -30
```
Verify the pitcher dampening logic is present:
```bash
grep -n "pitcherMultiplier\|pitcher dampened\|isPitcher" packages/extension/lib/auto-bid-controller.ts
```
  </verify>
  <done>
- autoBidCap for SP/RP players is multiplied by `(100 - pitcherHitterSplit) / 50` before the price guard check
- At default slider 65: pitcher caps reduced by 0.7x (e.g., $22 IDEAL TARGET becomes $16)
- Hitter caps remain unchanged
- All three bid paths (IDEAL, PL UNDERVALUED, OPPORTUNITY) are dampened for pitchers
- Console logs include dampening info for debugging
- TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
1. `cd packages/extension && npx tsc --noEmit` passes
2. `grep "pitcherMultiplier" packages/extension/lib/auto-bid-controller.ts` shows the dampening formula
3. Manual review: trace through evaluateAndBid() for a SP with ASV=$20 at default split=65:
   - IDEAL TARGET: ceil(20 * 1.1) = 22 → ceil(22 * 0.7) = 16
   - PL UNDERVALUED: ceil(20 * 1.15) = 23 → ceil(23 * 0.7) = 17
   - OPPORTUNITY: 20 → ceil(20 * 0.7) = 14
</verification>

<success_criteria>
- Auto-bid caps for pitchers are reduced by the pitcher dampening multiplier
- The dampening formula matches the engine's formula: `(100 - pitcherHitterSplit) / 50`
- Hitter auto-bid caps are unaffected
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/67-investigate-why-we-re-overpaying-for-top/67-01-SUMMARY.md`
</output>
