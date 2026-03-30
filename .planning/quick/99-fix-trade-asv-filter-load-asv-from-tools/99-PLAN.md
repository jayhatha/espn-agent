---
phase: 99-fix-trade-asv-filter-load-asv-from-tools
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/backend/src/agents/trade-recommendation.ts
autonomous: true
requirements: [TRADE-ASV-FIX]

must_haves:
  truths:
    - "ASV filter actively filters out unrealistic trade pairs (players with large salary gaps are skipped)"
    - "Trade candidates display ASV dollar values in explanations"
    - "Players not in the static ASV file are treated gracefully (filter skipped for that pair)"
  artifacts:
    - path: "packages/backend/src/agents/trade-recommendation.ts"
      provides: "ASV lookup from static JSON file instead of DB column"
      contains: "espn-predraft-values.json"
  key_links:
    - from: "packages/backend/src/agents/trade-recommendation.ts"
      to: "tools/espn-predraft-values.json"
      via: "fs.readFileSync or dynamic import at class init"
      pattern: "espn-predraft-values"
---

<objective>
Fix the trade ASV filter so it actually filters unrealistic trade pairs.

Purpose: The `espn_asv` DB column is always NULL (migrations never ran, ESPN in-season API lacks ASV data). The existing ASV filter logic (lines 517-533) is correct but gets no data. Load ASV values from the existing static file `tools/espn-predraft-values.json` (160 players with {name, salary}) instead of relying on the DB column.

Output: TradeRecommendationAgent uses static ASV data to filter trade pairs by salary similarity.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/backend/src/agents/trade-recommendation.ts
@tools/espn-predraft-values.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Load static ASV data and replace DB column lookups</name>
  <files>packages/backend/src/agents/trade-recommendation.ts</files>
  <action>
In TradeRecommendationAgent, add a static ASV lookup mechanism:

1. At the top of the file, add imports for `fs` and `path` (from node:fs, node:path).

2. Add a module-level lazy-loaded ASV map. Create a function `loadAsvMap()` that:
   - Reads `tools/espn-predraft-values.json` using a path resolved relative to the project root. Use `path.resolve(process.cwd(), 'tools/espn-predraft-values.json')` since the backend runs from the project root via turbo.
   - Parses the JSON array of `{name: string, salary: number}` objects.
   - Builds a `Map<string, number>` keyed by LOWERCASE player name for case-insensitive matching.
   - Caches the result in a module-level variable so it's only loaded once.
   - If the file doesn't exist or fails to parse, log a warning and return an empty Map (graceful degradation).

3. Add a helper function `getAsvForPlayer(playerName: string): number | null` that:
   - Calls `loadAsvMap()` to get the cached map.
   - Looks up `playerName.toLowerCase()` in the map.
   - Returns the salary number or null if not found.

4. In `generateTradeCandidates` method, replace the two ASV lookup sites:

   **Site 1 (pre-filter, around line 518-519):** Replace:
   ```
   const giveAsv = givePlayer.espn_asv != null ? Number(givePlayer.espn_asv) : null;
   const receiveAsv = receivePlayer.espn_asv != null ? Number(receivePlayer.espn_asv) : null;
   ```
   With:
   ```
   const giveAsv = getAsvForPlayer(givePlayer.player_name);
   const receiveAsv = getAsvForPlayer(receivePlayer.player_name);
   ```
   Keep the existing filter logic (lines 522-533) exactly as-is.

   **Site 2 (post-simulation display, around line 608-609):** Same replacement pattern — use `getAsvForPlayer(givePlayer.player_name)` and `getAsvForPlayer(receivePlayer.player_name)` instead of reading from `givePlayer.espn_asv`.

5. Do NOT remove `player.espn_asv` from the SQL query (line 404) — it's harmless and removing it could break type inference elsewhere. Just stop using it for the filter.
  </action>
  <verify>
    Run `npx tsc --noEmit -p packages/backend/tsconfig.json` to confirm no type errors.
    Grep for `getAsvForPlayer` to confirm both call sites are wired up.
    Grep for `espn-predraft-values` to confirm the file path reference exists.
  </verify>
  <done>
    ASV filter uses static JSON data instead of always-NULL DB column. Players in the 160-player file get filtered by salary similarity (within 30% or $5). Players not in the file gracefully skip the filter. TypeScript compiles cleanly.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit -p packages/backend/tsconfig.json` passes
- The ASV lookup loads from `tools/espn-predraft-values.json`, not from DB
- Filter logic unchanged: pairs within 30% OR $5 pass, others are skipped
- Missing players (not in JSON) skip the filter gracefully
</verification>

<success_criteria>
TradeRecommendationAgent's ASV filter is functional — trade pairs between players with known ASV values are filtered by salary similarity, preventing unrealistic "Shohei Ohtani for a $1 player" recommendations.
</success_criteria>

<output>
After completion, create `.planning/quick/99-fix-trade-asv-filter-load-asv-from-tools/99-SUMMARY.md`
</output>
