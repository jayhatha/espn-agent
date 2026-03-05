---
phase: quick-40
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/engine/index.ts
autonomous: true
requirements: [QUICK-40]

must_haves:
  truths:
    - "Top targets list includes both hitters and pitchers proportional to roster composition"
    - "With standard 14-hitter/9-pitcher roster, top targets shows ~3 hitters and ~2 pitchers"
    - "Each sub-pool is still sorted by SGP descending (best hitter first, best pitcher first)"
  artifacts:
    - path: "packages/extension/lib/engine/index.ts"
      provides: "Proportional hitter/pitcher top targets selection"
      contains: "isPitcher"
  key_links:
    - from: "packages/extension/lib/engine/index.ts"
      to: "PoolPlayer.isPitcher"
      via: "filter into hitter and pitcher sub-pools"
      pattern: "isPitcher"
---

<objective>
Fix top targets in computeRosterOptimization to include pitchers by splitting the selection pool into hitters and pitchers, then taking top N from each proportional to roster composition.

Purpose: Currently all 5 top targets are hitters because hitter SGP values are systematically higher than pitcher SGP values (Ohtani SGP=23.55 vs Skubal SGP=15.43). This makes the top targets section useless for pitcher recommendations.

Output: Modified computeRosterOptimization that selects top targets from both hitter and pitcher pools proportionally.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/lib/engine/index.ts
@packages/extension/lib/engine/types.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Split top targets selection into proportional hitter/pitcher pools</name>
  <files>packages/extension/lib/engine/index.ts</files>
  <action>
In `computeRosterOptimization`, replace the "Build top 5 targets" block (lines 255-287) with proportional hitter/pitcher selection:

1. Compute hitter and pitcher slot counts from `activeSlots`:
   - Pitcher slots = `activeSlots["P"] ?? 0`
   - Hitter slots = `activeTotal - pitcherSlots` (where activeTotal is already computed above on line 131)
   - If either is 0, fall back to taking all 5 from the other pool

2. Compute proportional counts for 5 total targets:
   - `pitcherCount = Math.round(5 * pitcherSlots / activeTotal)`
   - `hitterCount = 5 - pitcherCount`
   - Clamp: `pitcherCount = Math.max(1, Math.min(4, pitcherCount))` and `hitterCount = 5 - pitcherCount` (ensure at least 1 of each when both pools have players)

3. Create indexed arrays for each pool:
   ```typescript
   const indexedAll = allPlayers.map((p, i) => ({ player: p, sgp: sgpValues[i] ?? 0, index: i }));
   const hitterPool = indexedAll.filter(e => !e.player.isPitcher).sort((a, b) => b.sgp - a.sgp);
   const pitcherPool = indexedAll.filter(e => e.player.isPitcher).sort((a, b) => b.sgp - a.sgp);
   ```

4. Take `hitterCount` from hitterPool and `pitcherCount` from pitcherPool. If one pool has fewer than its allotment, give the remainder to the other pool:
   ```typescript
   const topHitters = hitterPool.slice(0, hitterCount);
   const topPitchers = pitcherPool.slice(0, pitcherCount);
   // If one pool was short, fill from the other
   const remaining = 5 - topHitters.length - topPitchers.length;
   if (remaining > 0 && topHitters.length < hitterCount) {
     topPitchers.push(...pitcherPool.slice(pitcherCount, pitcherCount + remaining));
   } else if (remaining > 0 && topPitchers.length < pitcherCount) {
     topHitters.push(...hitterPool.slice(hitterCount, hitterCount + remaining));
   }
   const indexedPlayers = [...topHitters, ...topPitchers];
   ```

5. Keep the existing `topTargets` mapping logic (lines 263-287) unchanged — it works on `indexedPlayers` which now contains the proportional mix.

Do NOT change any other logic in computeRosterOptimization. The SGP computation, opponent model, bid optimizer, and Monte Carlo sections remain untouched.
  </action>
  <verify>
Run `cd /Users/jay-work/Code/espn-agent && pnpm --filter extension exec tsc --noEmit` to verify no TypeScript errors. Inspect the modified block to confirm hitter and pitcher pools are separated by `isPitcher` and merged proportionally.
  </verify>
  <done>Top targets selection splits allPlayers into hitter/pitcher pools using PoolPlayer.isPitcher, takes proportional counts based on roster slot composition (standard: 3 hitters + 2 pitchers), and merges them. TypeScript compiles without errors.</done>
</task>

</tasks>

<verification>
- TypeScript compiles: `pnpm --filter extension exec tsc --noEmit`
- Code review: the top targets block in computeRosterOptimization uses `isPitcher` to split pools
- With standard roster (14 hitter / 9 pitcher slots), pitcherCount = round(5 * 9/23) = round(1.96) = 2, hitterCount = 3
</verification>

<success_criteria>
- Top targets includes both hitters and pitchers when both pools have available players
- Proportions match roster composition (standard: 3 hitters, 2 pitchers out of 5)
- Each sub-pool sorted by SGP descending (best available first)
- Graceful fallback when one pool is empty (all 5 from the other)
- No TypeScript compilation errors
</success_criteria>

<output>
After completion, create `.planning/quick/40-fix-top-targets-to-include-pitchers-comp/40-SUMMARY.md`
</output>
