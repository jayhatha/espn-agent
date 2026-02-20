---
phase: 04-advanced-features-polish
plan: 04
subsystem: recommendations
tags: [lineup-optimizer, streaming-pitchers, api-routes, frontend-pages]
dependency_graph:
  requires: [04-02-SUMMARY.md]
  provides:
    - Lineup optimization API and UI
    - Streaming pitcher recommendations API and UI
  affects:
    - packages/backend/src/index.ts
    - packages/frontend/src/lib/api.ts
tech_stack:
  added: []
  patterns:
    - Team-scoped lineup recommendations with auth enforcement
    - Composite scoring for streaming pitcher matchup analysis
    - Lookahead window controls for multi-day pitcher planning
key_files:
  created:
    - packages/backend/src/api/lineup.ts
    - packages/backend/src/api/streaming.ts
    - packages/frontend/src/app/leagues/[id]/lineup/page.tsx
    - packages/frontend/src/app/leagues/[id]/streaming/page.tsx
  modified:
    - packages/backend/src/index.ts
    - packages/frontend/src/lib/api.ts
decisions:
  - decision: "Lineup route requires team ownership, streaming requires league access only"
    rationale: "Lineup optimizer shows team-specific recommendations (requires ownership). Streaming pitchers are league-wide with optional team filtering (league access sufficient)."
    alternatives: ["Both require team ownership", "Both require league access"]
    scope: "backend-auth"
  - decision: "Streaming page uses composite score badges instead of table layout"
    rationale: "Each pitcher needs space for matchup details, score breakdown, and multi-start indicator. Cards provide better visual hierarchy than cramped table rows."
    alternatives: ["Table with expandable rows", "Hybrid table-card view"]
    scope: "frontend-ui"
  - decision: "Lineup page shows isOptimal banner when no swaps recommended"
    rationale: "Positive feedback when lineup is already optimal reduces user uncertainty. Clear signal that no action needed."
    alternatives: ["Empty state message", "Show all players with no highlighting"]
    scope: "frontend-ux"
metrics:
  duration_minutes: 6
  tasks_completed: 2
  files_created: 4
  files_modified: 2
  commits: 2
  completed_at: "2026-02-20T19:36:19Z"
---

# Phase 04 Plan 04: Lineup & Streaming API + UI Summary

**One-liner:** Lineup optimizer and streaming pitcher recommendation endpoints with interactive frontend pages showing start/sit swaps and matchup favorability analysis.

## What Was Built

### Task 1: Lineup and Streaming API Routes
- Created `packages/backend/src/api/lineup.ts` with `GET /api/leagues/:leagueId/teams/:teamId/lineup/recommendations` endpoint
- Created `packages/backend/src/api/streaming.ts` with `GET /api/leagues/:leagueId/streaming-pitchers` endpoint
- Registered both routes in `packages/backend/src/index.ts`
- Lineup route enforces team ownership via `requireTeamOwnership` middleware
- Streaming route enforces league access via `requireLeagueAccess` middleware
- Both routes instantiate MLBStatsAPIAdapter and respective agents
- Lineup route defaults to latest snapshot date if not provided
- Streaming route accepts query params: `teamId`, `startDate`, `lookAheadDays`, `limit`

**Commit:** `7b53ada`

### Task 2: Lineup and Streaming Frontend Pages
- Created `packages/frontend/src/app/leagues/[id]/lineup/page.tsx` with lineup optimizer UI
- Created `packages/frontend/src/app/leagues/[id]/streaming/page.tsx` with streaming pitchers UI
- Added `getLineupRecommendations` and `getStreamingPitchers` methods to `packages/frontend/src/lib/api.ts`
- Both pages use TeamSelector component with teams fetched from API
- Lineup page shows:
  - Green "optimal" banner when `isOptimal=true`
  - Amber summary banner with swap count and total projected gain
  - Swap cards with two-column layout: green "Start" (bench player) vs red "Sit" (starter)
  - Projected gain badges and reason text per recommendation
- Streaming page shows:
  - Lookahead day controls (1/3/7 days) as button group
  - Date range display
  - Ranked candidate cards with composite score, breakdown, and multi-start badges
  - Color-coded scores: green >30, yellow 15-30, gray <15
- Both pages handle loading, error, and empty states gracefully

**Commit:** `269e2ca`

## Deviations from Plan

None. Plan executed exactly as written.

## Integration Points

**Backend:**
- `lineupRoutes` → `LineupOptimizerAgent` → MLB StatsAPI for game schedules
- `streamingRoutes` → `StreamingPitcherAgent` → MLB StatsAPI for probable pitchers
- Both routes use snapshot date for current team rosters and projections

**Frontend:**
- Lineup page: `api.getLineupRecommendations()` → TanStack Query → UI rendering
- Streaming page: `api.getStreamingPitchers()` → TanStack Query → UI rendering
- TeamSelector manages localStorage persistence per league
- Both pages query `api.getTeams()` for team dropdown population

## Verification

**Backend:**
- TypeScript compilation checked (pre-existing errors in other files, no new errors introduced)
- Route registration verified in `index.ts` via grep
- Middleware pattern matches existing `recommendations.ts` routes

**Frontend:**
- TypeScript compilation clean for lineup and streaming pages
- Both page files created at expected paths
- TeamSelector integration matches pattern from league detail page
- API methods added to centralized client

## Key Technical Decisions

**Auth Enforcement:** Lineup requires team ownership (user can only optimize their own lineup), streaming requires league access (all league members can see available pitchers).

**UI Layout Patterns:** Lineup uses swap cards with visual distinction (green start vs red sit). Streaming uses ranked cards with score badges. Both avoid tables to accommodate rich matchup metadata.

**Lookahead Controls:** Streaming page uses button group (1/3/7 days) instead of slider for discrete, actionable choices. Weekly planning is the most common use case (7 days default).

**Score Visualization:** Composite score displayed prominently with color coding. Breakdown shown in pills (Projection, Matchup, Multi-start bonus) for transparency.

## Testing Notes

**Manual Testing Required:**
- Lineup optimizer page: visit `/leagues/[id]/lineup`, select team, verify optimal/swap display
- Streaming pitchers page: visit `/leagues/[id]/streaming`, select team, test lookahead controls
- Both pages: verify TeamSelector localStorage persistence across page reloads
- API routes: test with auth tokens, verify 401 for unauthenticated, 403 for wrong team ownership

**Known Gaps:**
- LineupOptimizerAgent and StreamingPitcherAgent implementation not verified (created in Plan 02, assumed functional)
- MLB StatsAPI integration not tested (assumes Plan 02 implementation works)
- No integration tests for API routes
- Frontend pages not tested in browser (UI verification pending)

## Related Files

**Dependencies (from Plan 02):**
- `packages/backend/src/agents/lineup-optimizer.ts`
- `packages/backend/src/agents/streaming-pitcher.ts`
- `packages/backend/src/adapters/mlb-statsapi.ts`

**Context:**
- `packages/backend/src/middleware/auth.ts` - Auth middleware used in routes
- `packages/frontend/src/components/league/TeamSelector.tsx` - Team selection component
- `packages/frontend/src/components/ui/PageHeader.tsx` - Page header component
- `packages/frontend/src/components/ui/LoadingSpinner.tsx` - Loading states
- `packages/frontend/src/components/ui/ErrorAlert.tsx` - Error states

## Next Steps

**Navigation Integration:**
- Add `/leagues/[id]/lineup` and `/leagues/[id]/streaming` links to league navigation menu

**Feature Enhancements:**
- Lineup page: Add "Apply All Swaps" bulk action button
- Streaming page: Add ownership % filtering, team affiliation filtering
- Both pages: Add snapshot date selector for historical view

**Testing:**
- Write integration tests for lineup and streaming API routes
- Add E2E tests for frontend pages with mocked API responses
- Verify MLB StatsAPI adapter returns expected data structures

## Self-Check: PASSED

**Files Created:**
```bash
[ -f "/Users/jay-work/Code/espn-agent/packages/backend/src/api/lineup.ts" ] && echo "FOUND: lineup.ts" || echo "MISSING: lineup.ts"
# FOUND: lineup.ts

[ -f "/Users/jay-work/Code/espn-agent/packages/backend/src/api/streaming.ts" ] && echo "FOUND: streaming.ts" || echo "MISSING: streaming.ts"
# FOUND: streaming.ts

[ -f "/Users/jay-work/Code/espn-agent/packages/frontend/src/app/leagues/[id]/lineup/page.tsx" ] && echo "FOUND: lineup/page.tsx" || echo "MISSING: lineup/page.tsx"
# FOUND: lineup/page.tsx

[ -f "/Users/jay-work/Code/espn-agent/packages/frontend/src/app/leagues/[id]/streaming/page.tsx" ] && echo "FOUND: streaming/page.tsx" || echo "MISSING: streaming/page.tsx"
# FOUND: streaming/page.tsx
```

**Commits Exist:**
```bash
git log --oneline --all | grep -q "7b53ada" && echo "FOUND: 7b53ada" || echo "MISSING: 7b53ada"
# FOUND: 7b53ada

git log --oneline --all | grep -q "269e2ca" && echo "FOUND: 269e2ca" || echo "MISSING: 269e2ca"
# FOUND: 269e2ca
```

**Route Registration:**
```bash
grep -q "lineupRoutes" /Users/jay-work/Code/espn-agent/packages/backend/src/index.ts && echo "FOUND: lineupRoutes registered" || echo "MISSING: lineupRoutes"
# FOUND: lineupRoutes registered

grep -q "streamingRoutes" /Users/jay-work/Code/espn-agent/packages/backend/src/index.ts && echo "FOUND: streamingRoutes registered" || echo "MISSING: streamingRoutes"
# FOUND: streamingRoutes registered
```

All verification checks passed.
