---
phase: 55-use-espn-market-values-asv-for-ideal-ros
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/engine/index.ts
autonomous: true
requirements: [IDEAL-ROSTER-ASV]

must_haves:
  truths:
    - "The ideal roster optimizer uses ESPN ASV as the cost constraint when ASV is available for a player"
    - "FanGraphs dollar values remain unchanged for SGP efficiency calculations and tier classification"
    - "Players without ESPN ASV fall back to FanGraphs dollars (current behavior unchanged)"
  artifacts:
    - path: "packages/extension/lib/engine/index.ts"
      provides: "computeIdealRoster with ASV price overlay applied before optimizeRoster"
      contains: "nameToAsv"
  key_links:
    - from: "computeIdealRoster"
      to: "optimizeRoster"
      via: "price-overlaid PoolPlayer copies where player.dollars = ESPN ASV when available"
      pattern: "asvPrice.*dollars"
---

<objective>
Overlay ESPN ASV (auction suggested values) onto PoolPlayer.dollars before feeding the ideal roster optimizer, so budget constraint math reflects real market prices rather than FanGraphs projections.

Purpose: The ideal roster optimizer uses player.dollars for two things: (1) budget affordability check (`player.dollars > maxSpend`) and (2) SGP/$ efficiency sort. FanGraphs "true value" dollars don't reflect what players actually cost at auction — ESPN ASV represents the market consensus price. Using ASV as the cost input makes the optimizer pick a realistic best roster given actual market prices.

Output: Modified `computeIdealRoster` in index.ts that builds an ASV-overlaid player array before calling `optimizeRoster`. FanGraphs dollars are preserved on the originals for `classifyTier` and `sgpValue` output.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@packages/extension/lib/engine/index.ts
@packages/extension/lib/engine/roster-optimizer.ts
@packages/extension/lib/engine/types.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Overlay ESPN ASV onto PoolPlayer.dollars in computeIdealRoster</name>
  <files>packages/extension/lib/engine/index.ts</files>
  <action>
In `computeIdealRoster`, between building `adjustedSgpValues` and calling `optimizeRoster`, add an ASV overlay step:

1. Build a `nameToAsv` map from `input.espnDomAuctionValues` and `input.auctionValues` — same pattern as in `computeRosterOptimization`:
   ```ts
   const nameToAsvIdeal = new Map<string, number>();
   if (input.espnDomAuctionValues) {
     for (const av of input.auctionValues) {
       const asv = input.espnDomAuctionValues[av.playerId];
       if (asv != null && asv > 0) {
         nameToAsvIdeal.set(normalizeName(av.playerName), asv);
       }
     }
   }
   ```

2. Create price-overlaid player copies only when ASV differs from FanGraphs dollars. Pass these to `optimizeRoster` instead of `allPlayers`:
   ```ts
   const playersForOptimizer = nameToAsvIdeal.size > 0
     ? allPlayers.map(p => {
         const asv = nameToAsvIdeal.get(p.normalizedName);
         return asv != null ? { ...p, dollars: asv } : p;
       })
     : allPlayers;
   ```

3. Call `optimizeRoster(playersForOptimizer, ...)` instead of `optimizeRoster(allPlayers, ...)`.

4. In the `optimizerPlayers` mapping after the optimizer call, use `allPlayers.indexOf(player)` — this still works because `result.roster` contains the same player object references (spread copies share identity issues). Instead, match by `normalizedName` to find the original FanGraphs dollars for tier classification:
   ```ts
   const optimizerPlayers: IdealRosterPlayer[] = result.roster.map((player, i) => {
     // Find original player for FanGraphs dollars (ASV overlay doesn't affect tier or sgpValue)
     const originalPlayer = allPlayers.find(p => p.normalizedName === player.normalizedName) ?? player;
     const poolIdx = allPlayers.indexOf(originalPlayer);
     const sgpValue = sgpValuesRaw[poolIdx] ?? 0;
     return {
       name: player.name,
       positions: player.positions,
       dollars: originalPlayer.dollars,   // FanGraphs $ for tier display
       tier: classifyTier(originalPlayer.dollars),
       sgpValue,
       slot: result.slotAssignments[i] ?? "BN",
       isDrafted: false,
     };
   });
   ```

5. The `budgetUsed` from `result.budgetUsed` will reflect ASV prices (market cost), which is correct — it shows how much the ideal roster would actually cost at auction.

Do NOT change `adjustedSgpValues` (SGP remains FanGraphs-based). Do NOT change any other call sites — only `computeIdealRoster`.
  </action>
  <verify>
TypeScript compiles without errors: `cd /Users/jay-work/Code/espn-agent && pnpm --filter @espn-fantasy/extension tsc --noEmit`
  </verify>
  <done>
- `computeIdealRoster` passes ASV-overlaid players to `optimizeRoster` when `espnDomAuctionValues` is populated
- Tier classification and sgpValue display still use original FanGraphs dollars
- When no ESPN ASV is available, behavior is identical to before (falls back to `allPlayers` unchanged)
- TypeScript compiles clean
  </done>
</task>

</tasks>

<verification>
Run TypeScript check: `cd /Users/jay-work/Code/espn-agent && pnpm --filter @espn-fantasy/extension tsc --noEmit`

Manual smoke test: Open extension during a draft or practice draft where ESPN ASV is scraped. The Ideal Roster tab should show a `budgetUsed` value that reflects market prices (ESPN ASV) rather than FanGraphs projected values. Players with high FanGraphs value but low ESPN ASV should appear more frequently (they look affordable at market price). Players with low FanGraphs value but high ESPN ASV should appear less frequently.
</verification>

<success_criteria>
- TypeScript compiles with no errors
- When `espnDomAuctionValues` is populated: `optimizeRoster` receives player copies with `dollars = ESPN ASV` for affordability and efficiency math
- When `espnDomAuctionValues` is empty: no behavioral change (falls back to FanGraphs dollars)
- `tier` and `sgpValue` in `IdealRosterPlayer` output still reflect FanGraphs dollars/SGP
- `budgetUsed` in `IdealRosterSignal` reflects estimated market cost (ASV-based)
</success_criteria>

<output>
After completion, create `.planning/quick/55-use-espn-market-values-asv-for-ideal-ros/55-01-SUMMARY.md`
</output>
