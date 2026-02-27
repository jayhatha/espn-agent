---
phase: quick-13
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/draft-state.ts
  - packages/extension/lib/value-calculations.ts
  - packages/extension/entrypoints/content.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "During drafts, extension NEVER calls backend API for projected standings"
    - "Extension stores accumulated roster state (all teams) in Zustand draft store"
    - "Projected standings update from stored roster state, not by re-parsing DOM"
    - "Backend API only used for player rankings/projections and player pool data"
  artifacts:
    - path: "packages/extension/lib/draft-state.ts"
      provides: "Team roster state storage in Zustand store"
      exports: ["DraftState with teamRosters field"]
      min_lines: 250
    - path: "packages/extension/lib/value-calculations.ts"
      provides: "Standings calculation from stored roster state"
      exports: ["calculateProjectedStandingsFromState"]
      min_lines: 40
    - path: "packages/extension/entrypoints/content.tsx"
      provides: "DOM parsing on pick detection, update stored state"
      contains: "updateTeamRoster"
  key_links:
    - from: "packages/extension/entrypoints/content.tsx"
      to: "useDraftStore.updateTeamRoster"
      via: "call on each pick detection"
      pattern: "updateTeamRoster.*pick"
    - from: "packages/extension/lib/value-calculations.ts"
      to: "DraftState.teamRosters"
      via: "read roster state from store"
      pattern: "teamRosters.*Map"
---

<objective>
Refactor draft projections approach to use DOM-parsed roster state as the primary source with proper persistent storage in Zustand, eliminating API calls for projected standings during live drafts.

Purpose: Quick-12 implemented API-first with DOM fallback. This creates unnecessary API load for ephemeral practice drafts. During ANY draft (practice or connected), DOM is the source of truth for current roster state. API only needed for player projections, not standings.

Output: Extension that stores accumulated roster state as draft progresses, updates projections from stored state, and never calls backend projected standings endpoint during drafts.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@packages/extension/lib/draft-state.ts
@packages/extension/lib/value-calculations.ts
@packages/extension/entrypoints/content.tsx
@.planning/quick/12-parse-practice-draft-rosters-from-dom-in/12-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Add team roster storage to Zustand draft state</name>
  <files>packages/extension/lib/draft-state.ts</files>
  <action>
Add `teamRosters` field to `DraftState` interface and implement state management:

**1. Add to DraftState interface:**
```typescript
interface DraftState {
  // ... existing fields ...

  // Team rosters accumulated during draft (teamId -> roster data)
  teamRosters: Map<string, { teamId: string; teamName: string; playerIds: number[] }>;

  // ... existing actions ...

  // New actions for roster management
  updateTeamRoster: (teamId: string, teamName: string, playerId: number) => void;
  setAllTeamRosters: (rosters: Map<string, { teamId: string; teamName: string; playerIds: number[] }>) => void;
  clearTeamRosters: () => void;
}
```

**2. Initialize teamRosters in initial state:**
```typescript
teamRosters: new Map(),
```

**3. Implement `updateTeamRoster` action:**
```typescript
updateTeamRoster: (teamId, teamName, playerId) => {
  set((state) => {
    const newRosters = new Map(state.teamRosters);
    const existingRoster = newRosters.get(teamId);

    if (existingRoster) {
      // Check if player already on roster (dedupe)
      if (!existingRoster.playerIds.includes(playerId)) {
        existingRoster.playerIds.push(playerId);
      }
    } else {
      // Create new roster entry
      newRosters.set(teamId, {
        teamId,
        teamName,
        playerIds: [playerId],
      });
    }

    return { teamRosters: newRosters };
  });
}
```

**4. Implement `setAllTeamRosters` action (for bulk initialization from DOM):**
```typescript
setAllTeamRosters: (rosters) => set({ teamRosters: rosters }),
```

**5. Implement `clearTeamRosters` action:**
```typescript
clearTeamRosters: () => set({ teamRosters: new Map() }),
```

**6. Update `reset` action to clear teamRosters:**
```typescript
reset: () => set({
  // ... existing resets ...
  teamRosters: new Map(),
}),
```

**7. Update `partialize` to persist teamRosters:**
```typescript
partialize: (state) => ({
  userRankingOverrides: state.userRankingOverrides,
  selectedPosition: state.selectedPosition,
  showOnlyNeeds: state.showOnlyNeeds,
  teamRosters: Array.from(state.teamRosters.entries()), // Serialize Map to array
}),
```

**8. Update `migrate` to deserialize teamRosters:**
```typescript
migrate: (persistedState) => {
  const state = (persistedState as Partial<DraftState>) ?? {};

  // Deserialize teamRosters from array back to Map
  const teamRostersArray = (state as any).teamRosters;
  const teamRosters = teamRostersArray
    ? new Map(teamRostersArray)
    : new Map();

  return {
    ...state,
    // ... existing fields ...
    teamRosters,
  };
}
```

Implementation notes:
- Map cannot be JSON serialized directly, use `Array.from(map.entries())` for persistence
- Deserialize using `new Map(array)` in migrate function
- `updateTeamRoster` is incremental (called per pick), `setAllTeamRosters` is bulk (initial load)
- Dedupe playerIds to prevent duplicates on re-detection
  </action>
  <verify>
Manual console testing:
```javascript
// Access store from browser console
const store = useDraftStore.getState();

// Test adding roster entries
store.updateTeamRoster("1", "Team 1", 30115);
store.updateTeamRoster("1", "Team 1", 39572);
store.updateTeamRoster("2", "Team 2", 33916);

// Verify state
console.log(Array.from(store.teamRosters.entries()));
// Should show: [["1", {teamId: "1", teamName: "Team 1", playerIds: [30115, 39572]}], ["2", {...}]]

// Test bulk set
const mockRosters = new Map([
  ["3", { teamId: "3", teamName: "Team 3", playerIds: [1, 2, 3] }]
]);
store.setAllTeamRosters(mockRosters);

// Test persistence (refresh page, check chrome.storage.local)
```
  </verify>
  <done>
`DraftState` interface includes `teamRosters` Map field with `updateTeamRoster`, `setAllTeamRosters`, and `clearTeamRosters` actions. Map is properly serialized/deserialized for chrome.storage persistence.
  </done>
</task>

<task type="auto">
  <name>Create standings calculator from stored state (replace DOM parsing variant)</name>
  <files>packages/extension/lib/value-calculations.ts</files>
  <action>
Replace `calculateProjectedStandingsLocal()` with new function that reads from Zustand state instead of accepting Map parameter:

**1. Remove existing `calculateProjectedStandingsLocal()` function (lines ~150-300)**

**2. Add new function `calculateProjectedStandingsFromState()`:**
```typescript
import { useDraftStore } from "./draft-state";
import type { ProjectedStandingsSnapshot } from "./draft-state";

/**
 * Calculate projected standings from stored draft state
 * Reads teamRosters from Zustand store, no DOM parsing required
 */
export function calculateProjectedStandingsFromState(): ProjectedStandingsSnapshot | null {
  const { teamRosters, rankings } = useDraftStore.getState();

  // Guard: need both rosters and rankings
  if (teamRosters.size === 0 || rankings.length === 0) {
    return null;
  }

  // Build playerId -> ranking lookup for O(1) access
  const rankingsMap = new Map(rankings.map((r) => [r.playerId, r]));

  // Step 1: Aggregate categorySGPs per team per category
  const categoryTotals = new Map<string, Map<string, number>>();

  for (const [teamId, roster] of teamRosters.entries()) {
    const teamCategories = new Map<string, number>();

    for (const playerId of roster.playerIds) {
      const ranking = rankingsMap.get(playerId);
      if (!ranking || !ranking.categorySGPs) continue;

      for (const [categoryId, sgp] of Object.entries(ranking.categorySGPs)) {
        if (!Number.isFinite(sgp)) continue;

        const currentTotal = teamCategories.get(categoryId) || 0;
        teamCategories.set(categoryId, currentTotal + sgp);
      }
    }

    categoryTotals.set(teamId, teamCategories);
  }

  // Step 2: Rank teams per category, assign roto points
  const allCategories = new Set<string>();
  for (const teamCategories of categoryTotals.values()) {
    for (const categoryId of teamCategories.keys()) {
      allCategories.add(categoryId);
    }
  }

  const teamRotoPoints = new Map<string, number>();
  const numTeams = teamRosters.size;

  for (const categoryId of allCategories) {
    // Build array of { teamId, total } for this category
    const teamsInCategory = Array.from(teamRosters.keys()).map((teamId) => {
      const teamCategories = categoryTotals.get(teamId) || new Map();
      const total = teamCategories.get(categoryId) || 0;
      return { teamId, total };
    });

    // Sort descending by total SGP
    teamsInCategory.sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return a.teamId.localeCompare(b.teamId); // Tiebreaker
    });

    // Assign roto points
    teamsInCategory.forEach((team, index) => {
      const rank = index + 1;
      const points = numTeams - rank + 1;
      const currentPoints = teamRotoPoints.get(team.teamId) || 0;
      teamRotoPoints.set(team.teamId, currentPoints + points);
    });
  }

  // Step 3: Build overall standings
  const overallStandings = Array.from(teamRosters.entries()).map(([teamId, roster]) => {
    const points = teamRotoPoints.get(teamId) || 0;
    return {
      team_id: Number(teamId) || 0,
      teamName: roster.teamName,
      projected_overall_points: points,
      projected_overall_rank: 0, // Will assign after sorting
    };
  });

  // Sort by points descending
  overallStandings.sort((a, b) => {
    if (b.projected_overall_points !== a.projected_overall_points) {
      return b.projected_overall_points - a.projected_overall_points;
    }
    return a.team_id - b.team_id; // Tiebreaker
  });

  // Assign ranks
  overallStandings.forEach((standing, index) => {
    standing.projected_overall_rank = index + 1;
  });

  // Step 4: Return snapshot
  return {
    snapshotDate: new Date().toISOString(),
    overallStandings,
    currentOverallStandings: overallStandings.map((s) => ({
      team_id: s.team_id,
      teamName: s.teamName,
      overall_rank: s.projected_overall_rank,
      overall_points: s.projected_overall_points,
    })),
  };
}
```

Implementation notes:
- Function takes NO parameters (reads from Zustand directly)
- Returns null if no rosters or rankings (same as before)
- Algorithm identical to previous `calculateProjectedStandingsLocal` (categorySGP aggregation → roto points)
- No DOM parsing - operates on stored state only
  </action>
  <verify>
Manual console testing:
```javascript
// Set up mock state
const store = useDraftStore.getState();
store.setRankings([
  { playerId: 30115, categorySGPs: { HR: 2.5, RBI: 3.0 } },
  { playerId: 39572, categorySGPs: { HR: 1.8, RBI: 2.2 } },
]);
store.updateTeamRoster("1", "Team 1", 30115);
store.updateTeamRoster("2", "Team 2", 39572);

// Calculate standings
const standings = calculateProjectedStandingsFromState();
console.log(standings);
// Should show 2 teams with correct ranks and finite points

// Test with empty state
store.clearTeamRosters();
const emptyStandings = calculateProjectedStandingsFromState();
console.log(emptyStandings); // Should be null
```
  </verify>
  <done>
`calculateProjectedStandingsFromState()` reads teamRosters and rankings from Zustand store, computes projected standings using categorySGP aggregation, returns `ProjectedStandingsSnapshot` or null if insufficient data.
  </done>
</task>

<task type="auto">
  <name>Refactor content script to update stored state on picks and remove API standings calls</name>
  <files>packages/extension/entrypoints/content.tsx</files>
  <action>
Update `refreshAssistantData()` and pick detection logic to use stored state approach:

**1. Remove projected standings API call block (lines ~345-381):**

Delete entire try/catch block:
```typescript
// DELETE THIS:
try {
  const standings = await getProjectedStandings(leagueId.toString(), {
    backendLeagueId: latestBackendLeagueId || undefined,
  });
  useDraftStore.getState().setProjectedStandings(standings);
} catch (apiError) {
  // ... DOM fallback ...
}
```

**2. Replace with stored state approach:**
```typescript
// Update projected standings from stored roster state (no API call, no DOM parsing)
const standings = calculateProjectedStandingsFromState();
useDraftStore.getState().setProjectedStandings(standings);

if (standings) {
  console.log(
    "[ESPN Draft Assistant] Projected standings computed from stored state for",
    standings.overallStandings.length,
    "teams"
  );
}
```

**3. Update imports:**
```typescript
// Remove these imports (no longer needed):
import { parseTeamRostersFromDOM, logRosterDiagnostics } from "../lib/dom-observers";
import { getProjectedStandings } from "../lib/api-client";

// Keep this import but update function name:
import { calculateProjectedStandingsFromState } from "../lib/value-calculations";
```

**4. Add initial roster state load in `main()` function (after DOM ready):**

Find where `observeDraftBoard` is called (around line 500-600), add before observer setup:

```typescript
// Initialize team rosters from DOM on page load
try {
  const initialRosters = parseTeamRostersFromDOM();
  if (initialRosters.size > 0) {
    useDraftStore.getState().setAllTeamRosters(initialRosters);
    console.log(
      "[ESPN Draft Assistant] Initialized rosters for",
      initialRosters.size,
      "teams from DOM"
    );
  }
} catch (error) {
  console.error("[ESPN Draft Assistant] Failed to initialize rosters:", error);
}
```

**5. Update `processDetectedPick()` function to update stored state:**

Find `processDetectedPick` function (around line 200-250), add roster state update:

```typescript
function processDetectedPick(pick: DraftPick) {
  // ... existing pick processing ...
  useDraftStore.getState().addPick(pick);

  // NEW: Update team roster state
  if (pick.teamId && pick.playerId) {
    useDraftStore.getState().updateTeamRoster(
      pick.teamId,
      pick.teamName || `Team ${pick.teamId}`,
      pick.playerId
    );

    // Recompute standings from updated state
    const standings = calculateProjectedStandingsFromState();
    useDraftStore.getState().setProjectedStandings(standings);
  }

  // ... rest of existing logic ...
}
```

**6. Keep `parseTeamRostersFromDOM` import for initial load only:**
```typescript
import { parseTeamRostersFromDOM } from "../lib/dom-observers";
```

**7. Update diagnostic tools (window.espnDraftAssistant):**

Find global diagnostic exposure (around line 600-700), update:

```typescript
(window as any).espnDraftAssistant = {
  diagnoseDOM: diagnoseDOMStructure,
  testParse: testParsePick,
  diagnoseRosters: () => {
    // Show stored state instead of parsing DOM
    const { teamRosters } = useDraftStore.getState();
    console.log("Stored Team Rosters:", Array.from(teamRosters.entries()));

    // Also parse DOM for comparison
    const domRosters = parseTeamRostersFromDOM();
    console.log("DOM-Parsed Rosters:", Array.from(domRosters.entries()));
  },
};
```

Implementation notes:
- API standings call completely removed (not even as fallback)
- DOM parsing happens ONCE on page load to initialize state
- Each pick updates stored state via `updateTeamRoster`
- Standings recalculated from stored state after each pick
- No re-parsing DOM after initial load
- Diagnostic tool shows both stored state and DOM for debugging drift
  </action>
  <verify>
Manual testing in live draft:

**Initial Load:**
1. Open ESPN draft page with extension
2. Check console - should see "Initialized rosters for N teams from DOM"
3. Open sidebar - ProjectedStandingsPanel should show standings
4. No API call to `/api/leagues/:id/standings/projected` in Network tab

**During Draft:**
1. Make a pick (or observe pick)
2. Check console - NO "API standings failed" message
3. Check console - should see "Projected standings computed from stored state"
4. Sidebar should update with new standings
5. Network tab should show NO standings API calls

**Diagnostic:**
1. Open console, run `window.espnDraftAssistant.diagnoseRosters()`
2. Verify "Stored Team Rosters" matches "DOM-Parsed Rosters"
3. Make pick, run diagnostic again
4. Verify stored state includes new pick

**Persistence:**
1. Make several picks
2. Refresh page
3. Check stored state persists across refresh
4. Verify standings recompute from persisted state
  </verify>
  <done>
Extension initializes roster state from DOM on load, updates stored state on each pick, recalculates standings from stored state (not API, not DOM re-parsing). Projected standings API endpoint never called during drafts.
  </done>
</task>

</tasks>

<verification>
Overall success criteria:

1. Extension loads on draft page and initializes team rosters from DOM once
2. Each pick updates stored `teamRosters` state via `updateTeamRoster`
3. Standings computed from stored state, not API or DOM re-parsing
4. Network tab shows NO calls to `/api/leagues/:id/standings/projected` during draft
5. Console logs show "computed from stored state" (not "API failed" or "DOM parsing")
6. Stored rosters persist across page refresh
7. Diagnostic tool shows stored state matches DOM state

Test scenarios:
- Practice draft (no backend league): works from stored state
- Connected draft: works from stored state (no API regression)
- Page refresh mid-draft: state persists, standings recompute
- Rapid picks: state updates correctly, no duplicate playerIds
</verification>

<success_criteria>
- [ ] `DraftState` includes `teamRosters` Map with update/set/clear actions
- [ ] `teamRosters` persists via chrome.storage with Map serialization
- [ ] `calculateProjectedStandingsFromState()` reads from Zustand, no parameters
- [ ] Content script removes all projected standings API calls
- [ ] Initial roster load from DOM on page load stores in Zustand
- [ ] Pick detection updates stored state via `updateTeamRoster`
- [ ] Standings recalculate from stored state after each pick
- [ ] No API calls for standings during drafts (verified in Network tab)
</success_criteria>

<output>
After completion, create `.planning/quick/13-refactor-draft-projections-to-use-dom-ro/13-SUMMARY.md`
</output>
