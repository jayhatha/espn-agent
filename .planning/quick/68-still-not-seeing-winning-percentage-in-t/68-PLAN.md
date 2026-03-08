---
phase: 68
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/draft-config-detector.ts
  - packages/extension/lib/fangraphs-data.ts
  - packages/extension/scripts/convert-fangraphs-csvs.ts
  - packages/extension/lib/engine/archetype.ts
  - packages/extension/lib/engine/sgp.ts
  - packages/extension/lib/__tests__/draft-config-detector.test.ts
autonomous: true
requirements: ["WPCT-01"]

must_haves:
  truths:
    - "WPCT category detected from ESPN DOM is recognized as RATE stat with HIGHER_BETTER direction"
    - "FanGraphs pitcher projections include L (Losses) field"
    - "Pool players have precomputed WPCT = W/(W+L) in their stats map"
    - "SGP engine recognizes WPCT as a pitching category"
  artifacts:
    - path: "packages/extension/lib/draft-config-detector.ts"
      provides: "WPCT entry in mapStatNameToCategory"
      contains: "WPCT"
    - path: "packages/extension/lib/fangraphs-data.ts"
      provides: "L field on FgPitcherProjection"
      contains: "L: number"
    - path: "packages/extension/scripts/convert-fangraphs-csvs.ts"
      provides: "L extraction from CSV row"
      contains: "L: num"
    - path: "packages/extension/lib/engine/archetype.ts"
      provides: "L and WPCT stat copying in pool builder"
      contains: "stats.WPCT"
    - path: "packages/extension/lib/engine/sgp.ts"
      provides: "WPCT in PITCHING_STAT_KEYS set"
      contains: "WPCT"
  key_links:
    - from: "packages/extension/scripts/convert-fangraphs-csvs.ts"
      to: "packages/extension/lib/fangraphs-data.ts"
      via: "L field extraction feeds FgPitcherProjection interface"
      pattern: "L: num\\(r\\[\"L\"\\]\\)"
    - from: "packages/extension/lib/engine/archetype.ts"
      to: "packages/extension/lib/engine/sgp.ts"
      via: "stats.WPCT precomputed in pool builder, read by SGP getPlayerStat"
      pattern: "stats\\.WPCT"
---

<objective>
Fix WPCT (Winning Percentage) not appearing in extension sidebar by threading L (Losses) through the entire data pipeline and computing WPCT = W/(W+L) as a precomputed rate stat.

Purpose: Users whose ESPN leagues include WPCT as a scoring category see it ignored — no SGP contribution, no auction value impact. This breaks draft recommendations for those leagues.
Output: WPCT flows end-to-end: ESPN DOM detection -> category mapping -> FanGraphs data -> pool builder -> SGP engine.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/lib/draft-config-detector.ts (mapStatNameToCategory at line 802)
@packages/extension/lib/fangraphs-data.ts (FgPitcherProjection interface at line 51)
@packages/extension/scripts/convert-fangraphs-csvs.ts (convertPitcherLeaderboard at line 156)
@packages/extension/lib/engine/archetype.ts (pool builder pitcher stats at lines 106-121 and 728-740)
@packages/extension/lib/engine/sgp.ts (PITCHING_STAT_KEYS at line 29)
@packages/extension/lib/__tests__/draft-config-detector.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add WPCT to category mapping and SGP recognition</name>
  <files>
    packages/extension/lib/draft-config-detector.ts
    packages/extension/lib/engine/sgp.ts
    packages/extension/lib/__tests__/draft-config-detector.test.ts
  </files>
  <action>
1. In `packages/extension/lib/draft-config-detector.ts`, add WPCT entry to the `categoryMap` in `mapStatNameToCategory()` (around line 818, after the WHIP entry):
   ```
   "WPCT": { category_id: "WPCT", stat_key: "WPCT", type: "RATE", direction: "HIGHER_BETTER", name: "Winning Percentage", formula_id: "wpct", required_components: ["W", "L"] },
   ```

2. In `packages/extension/lib/engine/sgp.ts`, add "WPCT" to the `PITCHING_STAT_KEYS` Set on line 29. The line should become:
   ```
   const PITCHING_STAT_KEYS = new Set(["W", "SV", "HLD", "ERA", "WHIP", "K", "SO", "QS", "IP", "WPCT"]);
   ```

3. In `packages/extension/lib/__tests__/draft-config-detector.test.ts`, add a test case for WPCT:
   - Test that `mapStatNameToCategory("WPCT")` returns type "RATE", direction "HIGHER_BETTER", formula_id "wpct", required_components ["W", "L"].
   - Add WPCT to the "correctly classifies rate vs counting" test: `expect(mapStatNameToCategory("WPCT").type).toBe("RATE");`
  </action>
  <verify>Run `cd /Users/jay-work/Code/espn-agent && npx vitest run packages/extension/lib/__tests__/draft-config-detector.test.ts` — all tests pass including new WPCT test.</verify>
  <done>WPCT is recognized as a RATE/HIGHER_BETTER pitching category by both the config detector and SGP engine.</done>
</task>

<task type="auto">
  <name>Task 2: Thread L (Losses) through FanGraphs data pipeline and compute WPCT in pool builder</name>
  <files>
    packages/extension/lib/fangraphs-data.ts
    packages/extension/scripts/convert-fangraphs-csvs.ts
    packages/extension/lib/engine/archetype.ts
  </files>
  <action>
1. In `packages/extension/lib/fangraphs-data.ts`, add `L: number;` field to the `FgPitcherProjection` interface (after `W: number;` on line 56).

2. In `packages/extension/scripts/convert-fangraphs-csvs.ts`, add `L: num(r["L"]),` to the pitcher map output object inside `convertPitcherLeaderboard()` (after the `W: num(r["W"]),` line at ~171).

3. In `packages/extension/lib/engine/archetype.ts`, update BOTH pitcher stat-copying blocks (undrafted pitchers at ~line 107 AND drafted pitchers at ~line 728):
   - Add `stats.L = proj.L;` after `stats.W = proj.W;`
   - Add WPCT precomputation after all stats are copied:
     ```
     const totalDecisions = (proj.W || 0) + (proj.L || 0);
     stats.WPCT = totalDecisions > 0 ? proj.W / totalDecisions : 0;
     ```
   This follows the same pattern as ERA/WHIP — precomputed rate stored in stats map, read directly by SGP's `getPlayerStat()`.

4. After making all changes, re-run the conversion script to regenerate the pitcher JSON with L values:
   ```
   cd /Users/jay-work/Code/espn-agent/packages/extension && npx tsx scripts/convert-fangraphs-csvs.ts
   ```
   Verify the output JSON includes L values by spot-checking a pitcher.
  </action>
  <verify>
1. `cd /Users/jay-work/Code/espn-agent && npx vitest run packages/extension/lib/__tests__/archetype.test.ts` — existing tests still pass.
2. Spot-check generated JSON: `node -e "const d=require('./packages/extension/data/fangraphs-leaderboard-pitchers.json'); const p=d[0]; console.log(p.name, 'W:', p.W, 'L:', p.L);"` — L field is present and numeric.
3. `grep -c '"L":' packages/extension/data/fangraphs-leaderboard-pitchers.json` — count matches pitcher count (confirms all pitchers have L).
  </verify>
  <done>L (Losses) flows from CSV through the FanGraphs interface and conversion script into the generated JSON. Pool builder copies L and precomputes WPCT = W/(W+L) for every pitcher, making it available to the SGP engine via getPlayerStat().</done>
</task>

</tasks>

<verification>
1. All existing tests pass: `cd /Users/jay-work/Code/espn-agent && npx vitest run packages/extension/lib/__tests__/`
2. TypeScript compiles without errors: `cd /Users/jay-work/Code/espn-agent/packages/extension && npx tsc --noEmit`
3. Regenerated pitcher JSON contains L field for all pitchers
4. mapStatNameToCategory("WPCT") returns correct RATE category definition
5. PITCHING_STAT_KEYS includes "WPCT"
</verification>

<success_criteria>
- WPCT detected from ESPN DOM is correctly mapped as RATE/HIGHER_BETTER with formula_id "wpct"
- FgPitcherProjection interface includes L field
- Conversion script extracts L from CSV
- Pool builder computes WPCT = W/(W+L) as precomputed rate for all pitchers
- SGP engine recognizes WPCT as pitching-relevant category
- All existing tests pass, new WPCT test passes
</success_criteria>

<output>
After completion, create `.planning/quick/68-still-not-seeing-winning-percentage-in-t/68-SUMMARY.md`
</output>
