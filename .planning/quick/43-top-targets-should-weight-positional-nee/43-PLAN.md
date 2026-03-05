---
phase: quick-43
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/engine/index.ts
autonomous: true
requirements: [QUICK-43]

must_haves:
  truths:
    - "A team with 0 players at a position sees that position's players boosted in top targets"
    - "A team fully stocked at a position does not get extra boost for that position"
    - "Combo slots CI (1B/3B) and MI (2B/SS) correctly contribute to positional need"
    - "Raw SGP values displayed in the UI remain unchanged — only sort order changes"
    - "UTIL, P, and BN slots are excluded from positional need calculation"
  artifacts:
    - path: "packages/extension/lib/engine/index.ts"
      provides: "Positional need weighting in top targets sort"
      contains: "needByPosition"
  key_links:
    - from: "input.myRoster"
      to: "filledCounts"
      via: "greedy slot assignment loop"
      pattern: "findBestSlotForPositions"
    - from: "needByPosition"
      to: "hitterPool/pitcherPool sort"
      via: "adjusted SGP multiplier"
      pattern: "adjustedSgp|needBoost"
---

<objective>
Add positional need weighting to the top targets section of `computeRosterOptimization` so that players at positions with empty roster slots are boosted in the ranking.

Purpose: A team with 0 1B drafted currently gets no 1B in top targets because SGP alone does not encode positional need. This fix applies a multiplier (50% per empty slot) to the SGP sort key so scarce positions surface their best available players.

Output: Modified `computeRosterOptimization` function with positional need boost applied to hitter/pitcher pool sorting.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/lib/engine/index.ts
@packages/extension/lib/engine/types.ts
@packages/shared/src/types.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add positional need weighting to top targets sort</name>
  <files>packages/extension/lib/engine/index.ts</files>
  <action>
In `computeRosterOptimization`, in the "Build top 5 targets" section (around line 256-291), add positional need weighting BEFORE the hitterPool/pitcherPool sort.

Step 1: Compute filled positions using the same greedy slot assignment already in the function. After the `remainingSlots` computation (lines 200-212), derive `needByPosition` from `remainingSlots`:

```ts
// Compute positional need from remaining slots (already computed above)
const needByPosition: Record<string, number> = {};
for (const [slot, count] of Object.entries(remainingSlots)) {
  if (slot === 'UTIL' || slot === 'P' || slot === 'BN') continue;
  if (count > 0) {
    needByPosition[slot] = count;
  }
}
// Expand combo slots: CI need applies to 1B and 3B, MI need applies to 2B and SS
if (needByPosition['CI'] && needByPosition['CI'] > 0) {
  needByPosition['1B'] = (needByPosition['1B'] ?? 0) + needByPosition['CI'];
  needByPosition['3B'] = (needByPosition['3B'] ?? 0) + needByPosition['CI'];
}
if (needByPosition['MI'] && needByPosition['MI'] > 0) {
  needByPosition['2B'] = (needByPosition['2B'] ?? 0) + needByPosition['MI'];
  needByPosition['SS'] = (needByPosition['SS'] ?? 0) + needByPosition['MI'];
}
// Remove combo slot keys themselves (players have real positions, not CI/MI)
delete needByPosition['CI'];
delete needByPosition['MI'];
```

Note: `remainingSlots` is already computed on lines 200-212 using the same `findBestSlotForPositions` greedy assignment. Reuse it — do NOT recompute filled positions separately.

Step 2: In the top targets section (line 268), modify the `indexedAll` mapping to include an `adjustedSgp` field:

```ts
const indexedAll = allPlayers.map((p, i) => {
  const sgp = sgpValues[i] ?? 0;
  // Compute max positional need across player's positions
  const maxNeed = p.positions.reduce((max, pos) => {
    const posUpper = pos.toUpperCase();
    return Math.max(max, needByPosition[posUpper] ?? 0);
  }, 0);
  // 50% boost per empty slot at the player's best position
  const adjustedSgp = sgp * (1 + maxNeed * 0.5);
  return { player: p, sgp, adjustedSgp, index: i };
});
```

Step 3: Change the hitter/pitcher pool sorts from `b.sgp - a.sgp` to `b.adjustedSgp - a.adjustedSgp`:

```ts
const hitterPool = indexedAll.filter(e => !e.player.isPitcher).sort((a, b) => b.adjustedSgp - a.adjustedSgp);
const pitcherPool = indexedAll.filter(e => e.player.isPitcher).sort((a, b) => b.adjustedSgp - a.adjustedSgp);
```

Step 4: In the `topTargets` mapping (line 293), continue to use `sgp` (NOT `adjustedSgp`) for `sgpValue` display — the boost only affects sort order, not displayed values.

IMPORTANT: The `needByPosition` computation MUST happen AFTER the `remainingSlots` block (lines 200-212) which already exists in the function. Place it right after line 212 (after the "Remove zero-count slots" loop). The top targets section at line 256+ will then have `needByPosition` in scope.
  </action>
  <verify>
Run `npx tsc --noEmit` from `packages/extension` to confirm no type errors. Verify the `needByPosition` variable is computed from the existing `remainingSlots` object and the sort uses `adjustedSgp` while display uses raw `sgp`.
  </verify>
  <done>
Top targets sort uses `adjustedSgp = sgp * (1 + maxNeed * 0.5)` where `maxNeed` is derived from remaining roster slots. Players at positions with empty slots are boosted in ranking. Displayed SGP values remain unchanged. Combo slots CI/MI correctly expand to their constituent positions.
  </done>
</task>

</tasks>

<verification>
- TypeScript compiles without errors: `cd packages/extension && npx tsc --noEmit`
- The `needByPosition` object is derived from the already-computed `remainingSlots` (no duplicate greedy assignment)
- Hitter and pitcher pools sort by `adjustedSgp` (positionally weighted)
- The `sgpValue` field in `TargetRecommendation` output uses raw `sgp` (not adjusted)
- UTIL, P, BN slots are excluded from need calculation
- CI expands to 1B+3B need, MI expands to 2B+SS need
</verification>

<success_criteria>
Top targets in the draft engine sidebar surface players at positions with empty roster slots. A team with 0 1B drafted sees 1B candidates boosted by 1.5x SGP in the sort. A team fully stocked at all positions sees no boost (multiplier = 1.0x). Displayed SGP values are unchanged.
</success_criteria>

<output>
After completion, create `.planning/quick/43-top-targets-should-weight-positional-nee/43-SUMMARY.md`
</output>
