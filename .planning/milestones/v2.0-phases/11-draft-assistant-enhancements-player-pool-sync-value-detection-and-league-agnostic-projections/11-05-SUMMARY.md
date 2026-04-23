---
phase: 11-draft-assistant-enhancements-player-pool-sync-value-detection-and-league-agnostic-projections
plan: 05
subsystem: draft-assistant
tags: [api, projected-standings, league-agnostic, draft]
dependency_graph:
  requires: [11-01]
  provides: [projected-standings-endpoint, draft-standings-calculation]
  affects: [extension-draft-ui]
tech_stack:
  added: []
  patterns: [component-aggregation, roto-scoring, league-agnostic-api]
key_files:
  created: []
  modified:
    - packages/backend/src/agents/draft-rankings.ts
    - packages/backend/src/api/draft.ts
decisions:
  - POST endpoint with config in body avoids URL length limits for complex objects
  - No authentication required for generic endpoint (no league-specific data)
  - Rate limit 50 requests/minute balances draft frequency with server load
  - Component-based aggregation ensures rate stats calculated correctly from totals
metrics:
  duration_minutes: 2
  tasks_completed: 2
  files_modified: 2
  commits: 2
  completed_date: 2026-02-25
---

# Phase 11 Plan 05: Projected Standings Endpoint Summary

Backend API endpoint for league-agnostic projected standings calculations using detected draft configuration and team rosters.

## Tasks Completed

### Task 1: Add Projected Standings Calculation to DraftRankingsAgent
**Commit:** 55f54c8

Implemented `calculateProjectedStandings()` method in `DraftRankingsAgent` that:
- Accepts draft configuration and team rosters (league-agnostic)
- Fetches player projections from database (latest fresh run if not specified)
- Aggregates projected stats per team using component-based math
- Ranks teams by category using configurable direction (HIGHER_BETTER/LOWER_BETTER)
- Computes roto points using formula: `numTeams - rank + 1` per category
- Returns sorted standings array with projected overall rank and total points

**Key implementation details:**
- Component aggregation for all stats (never averages rates)
- Rate stats calculated from aggregated components using shared formulas
- Handles teams with zero players (returns empty stats)
- Reuses existing patterns from `StandingsProjectionAgent`

### Task 2: Create Projected Standings API Endpoint
**Commit:** 2f3f04a

Added `POST /api/draft/projected-standings` endpoint that:
- Accepts config and rosters in request body (not query params)
- Validates configuration structure (categories, rosterSlots, totalTeams)
- Validates roster format (teamId, players array)
- Returns 400 on invalid input with descriptive error messages
- Returns 500 on calculation failure with error details
- Rate limited to 50 requests per minute

**Response format:**
```json
{
  "standings": [
    {
      "team_id": 1,
      "teamName": "Team 1",
      "projected_overall_rank": 1,
      "projected_overall_points": 95
    }
  ],
  "meta": {
    "totalTeams": 12,
    "categories": ["R", "HR", "RBI", ...],
    "generatedAt": "2026-02-25T12:00:00.000Z"
  }
}
```

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

**Automated checks:**
- calculateProjectedStandings method added: PASS
- Component aggregation implemented: PASS
- Roto scoring formula (totalTeams - rank + 1): PASS
- Endpoint added: PASS
- Validation implemented: PASS
- TypeScript compilation: PASS (no errors in modified files)

**Integration points:**
- Extension can now call `/api/draft/projected-standings` with detected config
- No league ID required - fully generic endpoint
- Compatible with both snake and auction draft formats
- Ready for extension integration in future phases

## Self-Check: PASSED

Verified files modified:
```
FOUND: /Users/jay-work/Code/espn-agent/packages/backend/src/agents/draft-rankings.ts
FOUND: /Users/jay-work/Code/espn-agent/packages/backend/src/api/draft.ts
```

Verified commits exist:
```
FOUND: 55f54c8 (Task 1)
FOUND: 2f3f04a (Task 2)
```

## Next Steps

For extension integration (future phase or manual follow-up):
1. Update `packages/extension/lib/api-client.ts` to add `getProjectedStandings(config, rosters)` function
2. Call from `packages/extension/entrypoints/content.tsx` after each pick to refresh standings
3. Display in `ProjectedStandingsPanel` component
4. Handle loading/error states in UI

## Technical Notes

**Component-based aggregation pattern:**
The `aggregateTeamStats()` method sums all stat components (AB, H, BB, IP, ER, etc.) across players, then calculates rate stats (AVG, ERA, WHIP) from the aggregated totals. This ensures accuracy - averaging rates directly would produce incorrect results.

**Roto scoring explanation:**
In rotisserie scoring, teams earn points based on their rank in each category. Formula: `points = numTeams - rank + 1`. Example for 12-team league:
- 1st place: 12 points
- 6th place: 7 points
- 12th place: 1 point

Total roto points across all categories determines overall standings rank.

**API design rationale:**
POST with JSON body chosen over GET with query parameters because:
- Avoids URL length limits (categories array can be large)
- Cleaner for complex nested objects (rosters with players arrays)
- More conventional for mutation-like operations
- Easier for extension to construct requests
