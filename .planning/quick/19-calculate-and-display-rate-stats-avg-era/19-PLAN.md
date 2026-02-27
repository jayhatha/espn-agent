---
phase: quick-19
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/components/PlayerCard.tsx
  - packages/extension/components/AuctionPlayerCard.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "Player cards display calculated rate stats (AVG, ERA, WHIP, OPS) from stat components, not raw values"
    - "Batters show AVG and OPS calculated from H, AB, BB, HBP, SF, TB components"
    - "Pitchers show ERA and WHIP calculated from ER, IP, H, BB components"
    - "Rate stats display with appropriate precision (AVG/OPS: .XXX, ERA/WHIP: X.XX)"
  artifacts:
    - path: "packages/extension/components/PlayerCard.tsx"
      provides: "Snake draft player card with calculated rate stats"
      exports: ["default"]
    - path: "packages/extension/components/AuctionPlayerCard.tsx"
      provides: "Auction draft player card with calculated rate stats"
      exports: ["default"]
  key_links:
    - from: "packages/extension/components/PlayerCard.tsx"
      to: "packages/shared/src/formulas.ts"
      via: "imports calculateAVG, calculateERA, calculateWHIP, calculateOPS"
      pattern: "import.*calculate.*from.*formulas"
    - from: "packages/extension/components/AuctionPlayerCard.tsx"
      to: "packages/shared/src/formulas.ts"
      via: "imports calculateAVG, calculateERA, calculateWHIP, calculateOPS"
      pattern: "import.*calculate.*from.*formulas"
---

<objective>
Calculate and display rate stats (AVG, ERA, WHIP, OPS) in extension player cards using component-based math from shared formulas library.

Purpose: Ensure rate stats shown to users during drafts are correctly calculated from counting stat components, matching the project's component-based math philosophy and preventing incorrect stat displays.

Output: Updated PlayerCard and AuctionPlayerCard components that calculate rate stats on the fly from StatComponents.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Component Math Philosophy
Rate stats MUST be calculated from components, never averaged or taken directly from raw data.
- AVG = H / AB
- ERA = 9 * ER / IP
- WHIP = (H + BB) / IP
- OPS = OBP + SLG = [(H + BB + HBP) / (AB + BB + HBP + SF)] + [TB / AB]

Formulas already implemented in packages/shared/src/formulas.ts and used throughout backend.

# Current Implementation
Both PlayerCard.tsx and AuctionPlayerCard.tsx display stats from `player.projectedStats` object.
- PlayerCard shows: HR, RBI, SB, AVG, W, SV, ERA (lines 122-142)
- AuctionPlayerCard shows: HR, RBI, SB, W, SV (lines 118-124)

Problem: `player.projectedStats.AVG` and `player.projectedStats.ERA` are raw values, not component-calculated.
The `projectedStats` field is of type `StatComponents` which contains counting stats (AB, H, ER, IP, etc.).

# Files
@packages/extension/components/PlayerCard.tsx
@packages/extension/components/AuctionPlayerCard.tsx
@packages/shared/src/formulas.ts
</context>

<tasks>

<task type="auto">
  <name>Update PlayerCard to calculate rate stats from components</name>
  <files>packages/extension/components/PlayerCard.tsx</files>
  <action>
Import rate stat calculation functions from shared formulas library:
- calculateAVG, calculateERA, calculateWHIP, calculateOPS from "@espn-fantasy/shared/formulas"

Replace direct stat display (lines 122-142) with calculated rate stats:

For batters (when AB > 0):
- Calculate AVG using calculateAVG(player.projectedStats)
- Calculate OPS using calculateOPS(player.projectedStats)
- Display: "AVG: {formatNumber(avg, 3)}" and "OPS: {formatNumber(ops, 3)}"
- Keep counting stats as-is: HR, RBI, SB from player.projectedStats

For pitchers (when IP > 0):
- Calculate ERA using calculateERA(player.projectedStats)
- Calculate WHIP using calculateWHIP(player.projectedStats)
- Display: "ERA: {formatNumber(era, 2)}" and "WHIP: {formatNumber(whip, 2)}"
- Keep counting stats as-is: W, SV from player.projectedStats

Guard against division by zero - formulas return 0 when denominator is 0.
Display all stats in single flex row with gap-3 spacing (existing pattern).

Do NOT change the formatNumber function - it already handles numeric formatting correctly.
  </action>
  <verify>
1. File imports from "@espn-fantasy/shared/formulas" (not "@espn-fantasy/shared" - formulas is a submodule)
2. Rate stats (AVG, ERA, WHIP, OPS) calculated via formula functions, not read from projectedStats object
3. Counting stats (HR, RBI, SB, W, SV) still read directly from projectedStats
4. No TypeScript errors: `npm run build` in packages/extension succeeds
  </verify>
  <done>
PlayerCard.tsx displays calculated AVG/OPS for batters and ERA/WHIP for pitchers using component-based formulas, formatted to 3 decimals (batting) and 2 decimals (pitching).
  </done>
</task>

<task type="auto">
  <name>Update AuctionPlayerCard to calculate rate stats from components</name>
  <files>packages/extension/components/AuctionPlayerCard.tsx</files>
  <action>
Import rate stat calculation functions from shared formulas library:
- calculateAVG, calculateERA, calculateWHIP, calculateOPS from "@espn-fantasy/shared/formulas"

The projected stats come from `playerRanking?.projectedStats` (lines 56-65 find the ranking).

After existing counting stats display (lines 118-124), add calculated rate stats:

For batters (when projectedStats.AB > 0):
- Calculate and display AVG: {formatNumber(calculateAVG(projectedStats), 3)}
- Calculate and display OPS: {formatNumber(calculateOPS(projectedStats), 3)}

For pitchers (when projectedStats.IP > 0):
- Calculate and display ERA: {formatNumber(calculateERA(projectedStats), 2)}
- Calculate and display WHIP: {formatNumber(calculateWHIP(projectedStats), 2)}

Guard: Only calculate/display if projectedStats exists (it's optional from the find operation).
Use existing conditional pattern from counting stats (lines 119-123): `{projectedStats.HR && <span>...}</span>`

Maintain existing flex gap-3 layout for consistent spacing.
  </action>
  <verify>
1. File imports from "@espn-fantasy/shared/formulas"
2. Rate stats calculated from projectedStats when available
3. Conditional rendering prevents errors when projectedStats is undefined
4. No TypeScript errors: `npm run build` in packages/extension succeeds
  </verify>
  <done>
AuctionPlayerCard.tsx displays calculated AVG/OPS/ERA/WHIP alongside counting stats when projection data is available, using component-based formulas with proper decimal precision.
  </done>
</task>

</tasks>

<verification>
Build extension to confirm no TypeScript errors:
```bash
cd packages/extension && npm run build
```

Manual verification (if extension is tested):
1. Load extension in ESPN draft page
2. Check player cards in sidebar
3. Confirm rate stats show reasonable values (.250-.350 for AVG, 3.00-5.00 for ERA, etc.)
4. Verify counting stats (HR, RBI, etc.) still display correctly
</verification>

<success_criteria>
- PlayerCard.tsx imports and uses calculateAVG, calculateERA, calculateWHIP, calculateOPS
- AuctionPlayerCard.tsx imports and uses calculateAVG, calculateERA, calculateWHIP, calculateOPS
- Rate stats calculated from StatComponents, not read as raw values
- Batters show AVG (3 decimals) and OPS (3 decimals)
- Pitchers show ERA (2 decimals) and WHIP (2 decimals)
- Counting stats unchanged (still read directly from projectedStats)
- Extension builds without TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/19-calculate-and-display-rate-stats-avg-era/19-SUMMARY.md`
</output>
