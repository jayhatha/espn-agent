---
phase: 93-fix-ideal-roster-optimizer-for-value-dra
plan: 93
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/engine/roster-optimizer.ts
  - packages/extension/lib/engine/index.ts
autonomous: true
requirements: [IDEAL-ROSTER-VALUE-FIX]

must_haves:
  truths:
    - "Ideal roster is built purely by SGP/$ efficiency without expensive-star upgrades"
    - "SP slots in ideal roster respect tier caps ($18/$12/$10/$5/$3)"
    - "Ideal roster uses FanGraphs model values, not ESPN ASV market prices"
    - "Ideal roster SGP values are not inflated by external rank boost"
  artifacts:
    - path: "packages/extension/lib/engine/roster-optimizer.ts"
      provides: "Value-oriented greedy optimizer without Phase 4 upgrade pass, with SP tier cap enforcement"
    - path: "packages/extension/lib/engine/index.ts"
      provides: "computeIdealRoster passes raw SGP and original dollars to optimizer"
  key_links:
    - from: "packages/extension/lib/engine/index.ts"
      to: "packages/extension/lib/engine/roster-optimizer.ts"
      via: "optimizeRoster call uses raw sgpValuesRaw and original allPlayers (no ASV overlay, no rank boost)"
    - from: "packages/extension/lib/engine/roster-optimizer.ts"
      to: "packages/extension/lib/engine/draft-constants.ts"
      via: "import getSpTierCap for SP slot dollar caps"
---

<objective>
Fix the ideal roster optimizer so it produces value-oriented rosters aligned with the draft engine's value strategy.

Purpose: The current optimizer undermines value drafting by (1) replacing cheap efficient picks with expensive stars in Phase 4, (2) using inflated ESPN ASV prices instead of model values, (3) applying rank boost multipliers that bias toward stars, and (4) not enforcing SP tier caps. These four issues cause the ideal roster to recommend expensive stars instead of efficient value picks.

Output: A roster optimizer that builds rosters purely by SGP/$ efficiency with SP tier caps, using FanGraphs model values without rank boost inflation.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/lib/engine/roster-optimizer.ts
@packages/extension/lib/engine/index.ts
@packages/extension/lib/engine/draft-constants.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove Phase 4 budget upgrade pass and add SP tier cap enforcement in roster-optimizer.ts</name>
  <files>packages/extension/lib/engine/roster-optimizer.ts</files>
  <action>
Two changes to roster-optimizer.ts:

**1. Delete Phase 4 entirely (lines 284-334).**
Remove the entire "Phase 4: Budget upgrade pass" block including its comment header. This is the section that sorts greedyEntries by cheapest, then loops through looking for higher-raw-SGP alternatives. The greedy SGP/$ fill from Phase 3 + backfill from Phase 3b already produces a good value-oriented roster. Remaining budget is better left as savings.

Also remove the `greedyEntries` tracking array since it was only used by Phase 4:
- Delete the declaration on line 205: `const greedyEntries: { player: PoolPlayer; sgp: number; slot: string; rosterIdx: number }[] = [];`
- Delete the push on line 231: `greedyEntries.push({ player, sgp, slot, rosterIdx: roster.length - 1 });`
- Delete the push on line 268: `greedyEntries.push({ player: cheapest.player, sgp: cheapest.sgp, slot, rosterIdx: roster.length - 1 });`

**2. Add SP tier cap enforcement in the Phase 3 greedy fill loop.**
Import `getSpTierCap` from `./draft-constants`.

In Phase 3's greedy fill loop (the `for (const { player, sgp } of indexed)` block), after finding the slot with `findBestSlot`, add a check: if the assigned slot is "SP" or "P", count how many SP/P slots have already been filled in this optimizer run (including locked players), call `getSpTierCap(spCount)` to get the max dollar amount, and skip the player if `player.dollars > tierCap`. Track SP count with a simple counter initialized before the loop, incremented when an SP/P slot is filled.

Also apply the same SP tier cap check in Phase 3b backfill: when filling an SP or P slot, skip candidates whose `player.dollars > getSpTierCap(currentSpCount)`. If no candidate passes the tier cap, fall back to cheapest eligible (existing behavior) to ensure roster completeness.

The SP count should include locked players who were assigned SP/P slots in Phase 1. Initialize `spCount` after Phase 1 by counting locked player slot assignments that are "SP" or "P".
  </action>
  <verify>
Run `cd /Users/jay-work/Code/espn-agent && npx tsc --noEmit -p packages/extension/tsconfig.json` to confirm no type errors. Visually confirm Phase 4 block is completely gone and SP tier cap logic is present in Phase 3.
  </verify>
  <done>
Phase 4 budget upgrade pass is deleted. SP tier caps are enforced during greedy fill (Phase 3) and backfill (Phase 3b). The greedyEntries tracking array is removed. TypeScript compiles cleanly.
  </done>
</task>

<task type="auto">
  <name>Task 2: Skip ASV overlay and rank boost for ideal roster in index.ts</name>
  <files>packages/extension/lib/engine/index.ts</files>
  <action>
Two changes in the `computeIdealRoster` function in index.ts:

**1. Skip the rank boost multiplier for ideal roster SGP values.**
Currently lines 447-452 build `adjustedSgpValues` by applying `computeExternalRankBoost` to each player's raw SGP. Instead, use `sgpValuesRaw` directly as the base for the optimizer. Change the variable that feeds into the deficit-boost logic and ultimately into `sgpValuesForOptimizer`:

Replace:
```typescript
const adjustedSgpValues = allPlayers.map((player, i) => {
  const rawSgp = sgpValuesRaw[i] ?? 0;
  const extRank = nameToExternalRank.get(player.normalizedName);
  const boost = computeExternalRankBoost(extRank);
  return rawSgp * boost;
});
```

With:
```typescript
// Use raw SGP values without rank boost for ideal roster construction.
// Rank boost biases toward expensive top-ranked players, undermining value drafting.
// Rank boost is still applied in bid-optimizer for bid recommendations.
const adjustedSgpValues = allPlayers.map((_player, i) => sgpValuesRaw[i] ?? 0);
```

The deficit-boost logic below can still operate on these raw values — it only needs relative SGP differences between players, which raw SGP provides correctly.

**2. Skip the ASV overlay for ideal roster player pool.**
Currently lines 543-580 build `nameToAsvIdeal` and create `playersForOptimizer` with ESPN ASV prices replacing FanGraphs dollars. The ideal roster should use FanGraphs model values so the SGP/$ efficiency sort reflects true value, not inflated market prices.

Replace the entire ASV overlay block (lines 543-580) with:
```typescript
// Skip ASV overlay for ideal roster: use FanGraphs model dollars so SGP/$
// efficiency reflects true projected value, not inflated ESPN market prices.
// ASV overlay is still applied in bid-optimizer for market-aware bidding.
const playersForOptimizer = allPlayers;
```

Delete the `nameToAsvIdeal` map construction and all supporting variables (`idToNameIdeal`, the loops over auctionValues/rankings/allPicks, and the conditional map creation). None of these are used elsewhere in computeIdealRoster.
  </action>
  <verify>
Run `cd /Users/jay-work/Code/espn-agent && npx tsc --noEmit -p packages/extension/tsconfig.json` to confirm no type errors. Verify that `computeExternalRankBoost` is still imported (used elsewhere in the file for bid calculations) but no longer called in `computeIdealRoster`. Verify `nameToAsvIdeal` and related variables are fully removed.
  </verify>
  <done>
Ideal roster uses raw SGP values (no rank boost multiplier) and original FanGraphs dollar values (no ASV overlay). The optimizer now sees true model efficiency for roster construction. Bid-optimizer path remains unchanged — it still uses rank boost and ASV for market-aware bidding. TypeScript compiles cleanly.
  </done>
</task>

</tasks>

<verification>
1. TypeScript compiles: `npx tsc --noEmit -p packages/extension/tsconfig.json`
2. Extension builds: `cd packages/extension && pnpm build`
3. Grep confirms Phase 4 is gone: `grep -n "Phase 4" packages/extension/lib/engine/roster-optimizer.ts` returns nothing
4. Grep confirms SP tier cap import: `grep -n "getSpTierCap" packages/extension/lib/engine/roster-optimizer.ts` shows import and usage
5. Grep confirms no ASV overlay in computeIdealRoster: `grep -n "nameToAsvIdeal" packages/extension/lib/engine/index.ts` returns nothing
6. Grep confirms rank boost not called in computeIdealRoster: the `computeExternalRankBoost` call is only in bid-optimizer sections, not in computeIdealRoster
</verification>

<success_criteria>
- Phase 4 budget upgrade pass completely removed from roster-optimizer.ts
- SP tier caps enforced in Phase 3 greedy fill and Phase 3b backfill
- Ideal roster uses raw SGP (no rank boost) and FanGraphs dollars (no ASV overlay)
- Bid-optimizer path unchanged (still uses rank boost + ASV)
- Extension compiles and builds without errors
</success_criteria>

<output>
After completion, create `.planning/quick/93-fix-ideal-roster-optimizer-for-value-dra/93-SUMMARY.md`
</output>
