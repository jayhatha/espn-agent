---
phase: quick-12
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/dom-observers.ts
  - packages/extension/lib/value-calculations.ts
  - packages/extension/entrypoints/content.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "Extension shows projected standings during practice drafts without backend API"
    - "Extension parses team rosters from ESPN DOM to compute standings locally"
    - "Extension falls back to API for connected leagues (existing behavior preserved)"
  artifacts:
    - path: "packages/extension/lib/dom-observers.ts"
      provides: "DOM parsing functions for team rosters"
      exports: ["parseTeamRostersFromDOM"]
      min_lines: 50
    - path: "packages/extension/lib/value-calculations.ts"
      provides: "Local standings calculation from roster projections"
      exports: ["calculateProjectedStandingsLocal"]
      min_lines: 40
    - path: "packages/extension/entrypoints/content.tsx"
      provides: "Integration of DOM roster parsing with fallback logic"
      contains: "parseTeamRostersFromDOM"
  key_links:
    - from: "packages/extension/entrypoints/content.tsx"
      to: "parseTeamRostersFromDOM"
      via: "import and call on API failure"
      pattern: "parseTeamRostersFromDOM"
    - from: "packages/extension/lib/value-calculations.ts"
      to: "rankings with projections"
      via: "aggregate team stats from player projections"
      pattern: "categorySGPs.*reduce"
---

<objective>
Enable Chrome extension to show projected standings during ESPN practice drafts by parsing team rosters from DOM and computing standings locally, eliminating dependency on backend API for ephemeral mock drafts.

Purpose: Practice drafts are not connected to backend leagues, so the `/api/leagues/:id/standings/projected` endpoint returns 401. Parsing rosters from DOM allows extension to work in both practice and real drafts.

Output: Extension displays live projected standings panel during practice drafts using locally computed standings from DOM roster data.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@packages/extension/lib/dom-observers.ts
@packages/extension/lib/value-calculations.ts
@packages/extension/lib/draft-state.ts
@packages/extension/entrypoints/content.tsx
@packages/extension/components/ProjectedStandingsPanel.tsx
</context>

<tasks>

<task type="auto">
  <name>Parse team rosters from ESPN draft DOM</name>
  <files>packages/extension/lib/dom-observers.ts</files>
  <action>
Add `parseTeamRostersFromDOM()` function that:

1. Identifies team roster containers using ESPN's draft DOM structure:
   - Try primary selectors: `[class*="teamRoster"]`, `[class*="TeamRoster"]`, `[data-testid*="roster"]`
   - Try grid-based layout: completed picks grouped by team (column from grid-area)
   - Fallback: group all completed picks by `teamId` field

2. For each team, extract:
   - Team ID (from data-team-id, grid column, or teamId field)
   - Team name (from parsePickElement results)
   - List of drafted playerIds

3. Return `Map<string, { teamId: string; teamName: string; playerIds: number[] }>`

Implementation notes:
- Reuse existing `collectCompletedPicksSnapshot()` to get all picks
- Group picks by `teamId` field (already parsed by `parsePickElement`)
- Use diagnostic logging similar to existing observer code
- Handle edge cases: no picks yet (return empty Map), missing teamId (skip pick)

Add helper function `logRosterDiagnostics()` to console.log team counts and sample roster for debugging.
  </action>
  <verify>
Run extension on ESPN practice draft page, open browser console, call `window.espnDraftAssistant?.diagnoseRosters()` (export the function globally), verify:
- Console logs show correct number of teams
- Each team has expected playerIds matching visible picks
- Sample roster output matches what's visible on screen
  </verify>
  <done>
`parseTeamRostersFromDOM()` returns Map with entry per team, each entry contains teamId/teamName/playerIds array matching ESPN DOM state.
  </done>
</task>

<task type="auto">
  <name>Calculate projected standings locally from roster data</name>
  <files>packages/extension/lib/value-calculations.ts</files>
  <action>
Add `calculateProjectedStandingsLocal()` function that:

1. Accepts parameters:
   - `teamRosters: Map<string, { teamId: string; teamName: string; playerIds: number[] }>`
   - `rankings: DraftRanking[]` (has categorySGPs for each player)

2. For each team, compute projected category totals:
   - For each playerId in roster, find matching ranking
   - Sum categorySGPs across all players (e.g., team HR = sum of each player's HR SGP)
   - Store in `Map<string, Record<string, number>>` (teamId -> categoryId -> total SGP)

3. Rank teams within each category:
   - Sort teams by total SGP descending
   - Assign roto points: (numTeams - rank + 1)

4. Compute overall standings:
   - Sum roto points across all categories
   - Sort by overall points descending
   - Assign overall rank

5. Return `ProjectedStandingsSnapshot` matching existing interface:
   - `snapshotDate`: current ISO timestamp
   - `overallStandings`: array of `{ team_id, teamName, projected_overall_rank, projected_overall_points }`
   - `currentOverallStandings`: same as projected (no historical data in practice drafts)

Implementation notes:
- Guard against missing rankings: if playerId not found in rankings, skip (don't count toward team total)
- Use `Number.isFinite()` guards for all arithmetic
- Handle empty rosters: team with 0 players gets 0 points in all categories
- Use deterministic tiebreaker: team_id ascending when points are equal
  </action>
  <verify>
Unit test approach (manual console testing):
```javascript
const mockRankings = [
  { playerId: 1, categorySGPs: { HR: 2.5, RBI: 3.0, AVG: 1.2 } },
  { playerId: 2, categorySGPs: { HR: 1.8, RBI: 2.2, AVG: 2.1 } }
];
const mockRosters = new Map([
  ["team1", { teamId: "team1", teamName: "Team 1", playerIds: [1] }],
  ["team2", { teamId: "team2", teamName: "Team 2", playerIds: [2] }]
]);
const result = calculateProjectedStandingsLocal(mockRosters, mockRankings);
// Verify result.overallStandings has 2 teams, correct ranks, finite points
```
  </verify>
  <done>
`calculateProjectedStandingsLocal()` returns `ProjectedStandingsSnapshot` with ranked teams based on aggregated player categorySGPs from rankings.
  </done>
</task>

<task type="auto">
  <name>Integrate DOM roster parsing with API fallback in content script</name>
  <files>packages/extension/entrypoints/content.tsx</files>
  <action>
Update `throttledRefreshRankings()` function (around line 340) to use two-tier fallback for projected standings:

**Current flow:**
```typescript
try {
  const standings = await getProjectedStandings(leagueId.toString(), { backendLeagueId });
  useDraftStore.getState().setProjectedStandings(standings);
} catch {
  useDraftStore.getState().setProjectedStandings(null);
}
```

**New flow:**
```typescript
try {
  const standings = await getProjectedStandings(leagueId.toString(), { backendLeagueId });
  useDraftStore.getState().setProjectedStandings(standings);
} catch (apiError) {
  console.log("[ESPN Draft Assistant] API standings failed, falling back to DOM parsing");

  try {
    // Fallback: parse rosters from DOM and compute locally
    const teamRosters = parseTeamRostersFromDOM();
    const { rankings } = useDraftStore.getState();

    if (teamRosters.size > 0 && rankings.length > 0) {
      const localStandings = calculateProjectedStandingsLocal(teamRosters, rankings);
      useDraftStore.getState().setProjectedStandings(localStandings);
      console.log("[ESPN Draft Assistant] Local standings computed for", teamRosters.size, "teams");
    } else {
      useDraftStore.getState().setProjectedStandings(null);
    }
  } catch (domError) {
    console.error("[ESPN Draft Assistant] DOM fallback failed:", domError);
    useDraftStore.getState().setProjectedStandings(null);
  }
}
```

Add imports:
```typescript
import { parseTeamRostersFromDOM } from "../lib/dom-observers";
import { calculateProjectedStandingsLocal } from "../lib/value-calculations";
```

Implementation notes:
- Preserve existing API-first approach (try API before DOM)
- Only fall back to DOM on API failure (network error, 401, 404, etc.)
- Log when using DOM fallback for diagnostics
- DOM fallback requires both rosters AND rankings (rankings loaded earlier in refresh flow)
  </action>
  <verify>
Manual testing:
1. Open ESPN practice draft in Chrome with extension
2. Observe console logs during draft picks
3. Verify "API standings failed, falling back to DOM parsing" message appears
4. Verify "Local standings computed for N teams" message follows
5. Check extension sidebar - ProjectedStandingsPanel should show standings (not "unavailable" message)
6. Make picks and verify standings update after each pick

For connected leagues (non-practice):
1. Connect real league to backend
2. Verify extension still uses API (no fallback message)
3. Verify standings still work via API path
  </verify>
  <done>
Extension shows projected standings during practice drafts using DOM-parsed rosters, while preserving API-first behavior for connected leagues.
  </done>
</task>

</tasks>

<verification>
Overall success criteria:

1. Extension loads on ESPN practice draft page without errors
2. After first few picks, ProjectedStandingsPanel shows standings (not "unavailable")
3. Console shows "API standings failed, falling back to DOM parsing" on practice drafts
4. Standings update after each pick with teams re-ranked
5. Connected leagues still use API path (no regression)

Test both draft formats:
- Practice snake draft: DOM fallback works
- Practice auction draft: DOM fallback works
- Connected league snake/auction: API path works
</verification>

<success_criteria>
- [ ] `parseTeamRostersFromDOM()` parses ESPN DOM and returns Map of team rosters
- [ ] `calculateProjectedStandingsLocal()` computes standings from rosters and rankings
- [ ] Extension content script integrates DOM fallback with try/catch around API call
- [ ] Extension shows standings in practice drafts without 401 errors
- [ ] Connected leagues preserve API-based standings (no regression)
- [ ] Console diagnostics log DOM fallback usage and team counts
</success_criteria>

<output>
After completion, create `.planning/quick/12-parse-practice-draft-rosters-from-dom-in/12-SUMMARY.md`
</output>
