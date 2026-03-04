---
phase: quick-29
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/frontend/src/app/admin/draft-board/page.tsx
autonomous: true
requirements: [QUICK-29]

must_haves:
  truths:
    - "Draft board table always shows a Rank +/- column regardless of CSV uploads"
    - "Positive rank diff (undervalued by ESPN) renders green"
    - "Negative rank diff (overvalued by ESPN) renders red"
    - "Players without external rank show em dash in column"
    - "Sort dropdown includes Rank +/- option that sorts by largest absolute gap first"
  artifacts:
    - path: "packages/frontend/src/app/admin/draft-board/page.tsx"
      provides: "Rank diff column with color coding and sort support"
      contains: "rankDiff"
  key_links:
    - from: "MergedPlayer.rankDiff"
      to: "matchPlayers return"
      via: "p.rank - externalRank computation"
      pattern: "rankDiff.*rank.*externalRank"
---

<objective>
Add an always-visible "Rank +/-" column to the draft board showing whether ESPN over- or undervalues a player relative to their PitcherList external ranking.

Purpose: Enable quick identification of bargains (ESPN ranks lower than PitcherList) and overvalued players (ESPN ranks higher) without needing CSV uploads.
Output: Updated draft board page with new column, sort option, and color coding.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/frontend/src/app/admin/draft-board/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add rankDiff field, computation, sort, column header, cell, and sort option</name>
  <files>packages/frontend/src/app/admin/draft-board/page.tsx</files>
  <action>
All changes in a single file — `packages/frontend/src/app/admin/draft-board/page.tsx`:

1. **MergedPlayer interface** (line ~42-48): Add `rankDiff?: number` field with comment `// ESPN rank - external rank (positive = undervalued bargain, negative = overvalued)`

2. **matchPlayers return** (line ~250-258): After the `valueDiff` computation (line 248), add:
   ```
   const rankDiff = match?.rank != null ? p.rank - match.rank : undefined;
   ```
   Include `rankDiff` in the return object spread.

3. **SortKey union** (line ~72-79): Add `"rankDiff"` to the union type.

4. **Sort case** (inside the `players.sort` switch in the `filtered` useMemo, line ~381-401): Add case for `"rankDiff"`:
   ```
   case "rankDiff":
     return Math.abs(b.rankDiff ?? 0) - Math.abs(a.rankDiff ?? 0);
   ```
   This sorts by absolute value descending so biggest gaps (either direction) appear first.

5. **Table header** (in `<thead>`, after the existing CSV +/- column conditional and before the "Ext Rank" header): Add a new always-visible `<th>` with text "Rank +/-", right-aligned, matching existing header styling.

6. **Table cell** (in `<tbody>` row, positioned to match the new header — after CSV +/- conditional cells, before the Ext Rank cell): Add a `<td>` that:
   - Shows em dash when `player.rankDiff` is undefined
   - Shows `+N` (with plus sign) when positive, `N` (negative sign inherent) when negative, `0` when zero
   - Color coding using existing design tokens:
     - `rankDiff >= 20`: `text-green-600 font-semibold` (strong bargain)
     - `rankDiff > 0`: `text-green-500` (mild bargain)
     - `rankDiff <= -20`: `text-red-600 font-semibold` (strong overvalue)
     - `rankDiff < 0`: `text-red-400` (mild overvalue)
     - `rankDiff === 0`: `text-content-secondary`
   Use the `cn()` utility for conditional classes, matching the pattern used by the existing valueDiff cell.

7. **Sort dropdown** (in the sort `<select>`, line ~501-518): Add a new always-visible `<option>` with value `"rankDiff"` and label `"Rank +/- (ext vs ESPN)"`. Place it after the "External Rank" option and before the conditional CSV options.
  </action>
  <verify>
Run `cd /Users/jay-work/Code/espn-agent && npx tsc --noEmit -p packages/frontend/tsconfig.json` to verify no TypeScript errors.
Then run `cd /Users/jay-work/Code/espn-agent && pnpm --filter frontend build` to confirm the page compiles successfully.
  </verify>
  <done>
Draft board table shows "Rank +/-" column that is always visible. Positive values (undervalued by ESPN) appear green, negative (overvalued) appear red. Sort dropdown includes "Rank +/- (ext vs ESPN)" option. Players without external ranking show em dash. TypeScript compiles clean.
  </done>
</task>

</tasks>

<verification>
- TypeScript compilation passes with no errors
- Frontend build completes successfully
- New column appears in table between CSV +/- (when visible) and Ext Rank columns
- Sort option visible in dropdown without CSV uploads
</verification>

<success_criteria>
- rankDiff column always visible in draft board table
- Color coding: green for positive (bargain), red for negative (overvalued)
- Sort by absolute value (biggest gaps first) works via dropdown
- No regression in existing columns or sort options
</success_criteria>

<output>
After completion, create `.planning/quick/29-add-draft-board-column-showing-over-or-u/29-01-SUMMARY.md`
</output>
