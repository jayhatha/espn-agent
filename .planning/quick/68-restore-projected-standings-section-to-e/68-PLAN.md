---
phase: 68-restore-projected-standings
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/components/EngineInsights.tsx
autonomous: true
requirements: [RESTORE-PROJECTED-STANDINGS]

must_haves:
  truths:
    - "Projected Standings section appears in sidebar when projectedStandings has >= 3 teams with data"
    - "Section is collapsed by default to save sidebar space"
    - "User's team is highlighted with accent ring and (you) label"
    - "Per-category ranks and values shown for user's team"
    - "Strong/weak category summary displayed"
    - "Confidence badge (LOW/MED/HIGH) shown based on draftProgressWeight"
  artifacts:
    - path: "packages/extension/components/EngineInsights.tsx"
      provides: "Projected Standings collapsible section"
      contains: "Projected Standings"
  key_links:
    - from: "packages/extension/components/EngineInsights.tsx"
      to: "DraftEngineSignals.projectedStandings"
      via: "destructuring from engineSignals"
      pattern: "projectedStandings"
---

<objective>
Restore the Projected Standings section to the extension sidebar EngineInsights component.

Purpose: The section was removed in Phase 29-02 (commit b1b4e6d) to make room for IdealRosterPanel. The engine still computes and returns `projectedStandings` in `DraftEngineSignals` but it is no longer rendered. Re-adding it gives users visibility into projected roto standings during the draft.

Output: Updated EngineInsights.tsx with Projected Standings section restored.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/components/EngineInsights.tsx
@packages/extension/lib/engine/types.ts (ProjectedStandingsSignal, ProjectedTeamStanding interfaces)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Restore Projected Standings section to EngineInsights</name>
  <files>packages/extension/components/EngineInsights.tsx</files>
  <action>
1. Add `projectedStandings` to the destructuring on line 14:
   `const { simulation, idealRoster, projectedStandings } = engineSignals;`

2. Insert the Projected Standings section AFTER the IdealRosterPanel (line 136) and BEFORE the Draft Targets section (line 139). This is a `<details>` element, collapsed by default (no `open` attribute). The section renders when `projectedStandings != null && projectedStandings.teamsWithData >= 3`.

3. The section structure (restore from git history at commit 5cd3e4f):

   **Summary line:** "Projected Standings" label + user's rank badge (`#{myTeamRank}` in accent, shown when > 0) + confidence badge (HIGH if draftProgressWeight >= 0.5, MED if >= 0.2, LOW otherwise; HIGH uses `bg-positive-light text-positive`, MED/LOW uses `bg-warning-light text-warning`) + chevron.

   **Standings table:** Map over `projectedStandings.standings` (already sorted). Each row shows `projectedOverallRank`, truncated teamName (max 15 chars + ellipsis), "(you)" label for user's team, and `projectedRotoPts`. User's team row gets `ring-1 ring-accent rounded px-1.5 py-1`.

   **My Projected Categories sub-section:** Only shown when `myTeamRank > 0`. Find user's standing from the array by matching `projectedOverallRank === myTeamRank`. Map over `Object.entries(categoryRanks)`. For each category: show stat key, the projected value from `categoryValues` (rate stats AVG/OBP/SLG/OPS/ERA/WHIP formatted with `.toFixed(3)`, counting stats with `Math.round()`), and rank as `{rank}/{totalTeams}`. Color the rank: top 3 = `text-positive`, bottom 3 (when totalTeams >= 4 and rank >= totalTeams - 2) = `text-negative`, otherwise `text-content-secondary`.

   **Strong/Weak summary:** Shown when either `myStrongCategories` or `myWeakCategories` has entries. Strong in `text-positive`: "Strong: {joined}". Weak in `text-negative`: "Weak: {joined}".

4. Use the same design tokens already in the file: `bg-surface-secondary`, `bg-surface`, `text-body-sm`, `text-body-xs`, `font-display`, `text-accent`, `text-content`, `text-content-secondary`, `border-surface-tertiary`, `group` class for chevron rotation.

5. Use `&#9662;` for the chevron character (matching the existing sections in the file) rather than the raw unicode character.
  </action>
  <verify>
Run `cd /Users/jay-work/Code/espn-agent && npx tsc --noEmit -p packages/extension/tsconfig.json` to verify no TypeScript errors. Also verify the string "Projected Standings" appears in the file with `grep "Projected Standings" packages/extension/components/EngineInsights.tsx`.
  </verify>
  <done>
EngineInsights.tsx renders a collapsible Projected Standings section after Ideal Roster and before Draft Targets. The section shows all teams sorted by rank, highlights the user's team, displays per-category ranks with values, strong/weak summary, and a confidence badge. TypeScript compiles without errors.
  </done>
</task>

</tasks>

<verification>
- TypeScript compilation: `npx tsc --noEmit -p packages/extension/tsconfig.json` passes
- The string "Projected Standings" exists in EngineInsights.tsx
- `projectedStandings` is destructured from `engineSignals`
- Section is gated on `projectedStandings != null && projectedStandings.teamsWithData >= 3`
- Section uses `<details>` without `open` (collapsed by default)
</verification>

<success_criteria>
Projected Standings section restored to the extension sidebar between Ideal Roster and Draft Targets, matching the original Phase 25 implementation with all sub-sections (standings table, category ranks, strong/weak summary, confidence badge). TypeScript compiles cleanly.
</success_criteria>

<output>
After completion, create `.planning/quick/68-restore-projected-standings-section-to-e/68-SUMMARY.md`
</output>
