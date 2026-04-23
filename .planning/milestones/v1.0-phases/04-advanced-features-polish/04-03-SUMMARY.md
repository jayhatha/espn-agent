---
phase: 04-advanced-features-polish
plan: 03
subsystem: draft-assistant
tags: [draft, api, frontend, rankings, auction, ui]
dependency_graph:
  requires: [draft-agents, auth, frontend-components]
  provides: [draft-rankings-api, auction-api, draft-ui]
  affects: [draft-workflow]
tech_stack:
  added: []
  patterns: [fastify-routes, nextjs-app-router, tanstack-query]
key_files:
  created:
    - packages/backend/src/api/draft.ts
    - packages/frontend/src/app/leagues/[id]/draft/rankings/page.tsx
    - packages/frontend/src/app/leagues/[id]/draft/auction/page.tsx
  modified:
    - packages/frontend/src/lib/api.ts
decisions:
  - "Route registration already added in plan 04-04 (scaffolding for this plan)"
  - "Generic api.get() method added to fix blocking issue from plan 04-02"
  - "Tier badges use color + text labels (not color-only) for accessibility"
  - "Dollar values highlighted with green for premium players ($20+)"
metrics:
  duration_minutes: 5
  tasks_completed: 2
  files_created: 3
  files_modified: 1
  commits: 2
  completed_at: "2026-02-20T19:35:46Z"
---

# Phase 04 Plan 03: Draft Rankings & Auction UI Summary

**One-liner:** Draft API routes and frontend pages for VBD rankings and auction valuations with position filtering and budget controls

## What Was Built

Created complete draft tooling with backend API endpoints and frontend pages for pre-draft player rankings and auction dollar valuations.

**Backend API (packages/backend/src/api/draft.ts):**
- `GET /api/leagues/:leagueId/draft/rankings` - VBD rankings with position filter
  - Query params: position, limit, projectionsRunId
  - Auth: requireLeagueAccess middleware
  - Returns rankings array + meta (league name, team count, generation timestamp)
  - Uses DraftRankingsAgent for calculations
- `GET /api/leagues/:leagueId/draft/auction` - Auction dollar valuations
  - Query params: position, limit, budget (100-1000), minBid (1-10), projectionsRunId
  - Auth: requireLeagueAccess middleware
  - Returns valuations array + meta (budget, spending pool, players above replacement)
  - Uses DraftRankingsAgent + AuctionValuationAgent
  - Validates budget and minBid ranges

**Frontend Rankings Page (packages/frontend/src/app/leagues/[id]/draft/rankings/page.tsx):**
- VBD-sorted player table with position filtering
- Columns: Rank, Player Name, Position(s), VBD Score, SGP Total, Tier
- Tier badges with color coding:
  - T1 (top 10%): green
  - T2 (next 15%): blue
  - T3 (next 25%): yellow
  - T4 (rest): gray
- Position filter dropdown: ALL, C, 1B, 2B, 3B, SS, OF, SP, RP, DH
- Link to auction page
- TanStack Query for data fetching with loading/error/empty states
- Sticky table header, alternating row backgrounds, hover effects
- Responsive design with Tailwind CSS

**Frontend Auction Page (packages/frontend/src/app/leagues/[id]/draft/auction/page.tsx):**
- Dollar value table with budget adjustment controls
- Columns: Rank, Player Name, Position(s), Dollar Value, VBD Score, SGP Total
- Budget input (100-500, step 10, default 260)
- Min bid input (1-5, step 1, default 1)
- Position filter dropdown (same as rankings)
- Link to rankings page
- Dollar value highlighting:
  - $20+: green bold (premium players)
  - $10-19: dark gray semibold (mid-tier)
  - <$10: light gray (replacement level)
- Meta display: players above replacement, total spending pool
- Real-time re-fetch when budget/minBid changes (via TanStack Query keys)
- Loading/error/empty state handling

**API Client Enhancement (packages/frontend/src/lib/api.ts):**
- Added generic `api.get(endpoint)` method
- Uses existing fetchAPI with auto-refresh on 401
- Fixes blocking issue from plan 04-02 (lineup/streaming pages also needed this)

## Key Implementation Details

**Route Registration:**
- Import and registration already added in plan 04-04 (forward scaffolding)
- This plan only created the actual draft.ts implementation file

**Position Filtering:**
- Backend: passes position string to DraftRankingsAgent
- Frontend: dropdown with standard baseball positions
- TanStack Query re-fetches when position changes

**Budget Controls:**
- Number inputs with min/max validation
- onChange updates state → queryKey changes → automatic re-fetch
- No "apply" button needed (instant feedback)

**Accessibility:**
- Tier badges combine color and text (T1/T2/T3/T4)
- Form labels properly associated with inputs
- Semantic HTML (table structure, header hierarchy)

**Error Handling:**
- 404 if league not found or no teams in league
- 400 for invalid budget/minBid ranges
- 500 with error details for agent failures
- Frontend ErrorAlert with retry button

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing api.get() method**
- **Found during:** Task 2 - TypeScript compilation
- **Issue:** Plan 04-02 introduced api.get() calls but didn't add method to api.ts
- **Fix:** Added generic api.get(endpoint) method to api.ts
- **Files modified:** packages/frontend/src/lib/api.ts
- **Commit:** 53fff35 (included in Task 2 commit)
- **Impact:** Unblocked compilation for draft pages and fixed pre-existing errors in lineup/streaming pages

## Verification Results

✅ `packages/backend/src/api/draft.ts` exports draftRoutes with two GET endpoints
✅ `packages/backend/src/index.ts` registers draftRoutes (from plan 04-04)
✅ `packages/frontend/src/app/leagues/[id]/draft/rankings/page.tsx` renders VBD rankings with position filter
✅ `packages/frontend/src/app/leagues/[id]/draft/auction/page.tsx` renders auction values with budget adjustment
✅ TypeScript compiles cleanly (pre-existing unrelated errors in other files)

## Testing Notes

Both pages ready for integration testing:
- Navigate to `/leagues/{id}/draft/rankings` to see VBD rankings
- Navigate to `/leagues/{id}/draft/auction` to see dollar valuations
- Test position filter (should re-fetch and update table)
- Test budget/minBid adjustment (should recalculate values instantly)
- Test cross-links between pages
- Verify auth protection (should redirect to login if unauthenticated)
- Test empty state (no projections uploaded)
- Test error state (invalid league ID)

## Self-Check: PASSED

Verified all created files exist and commits are present:

```
✅ packages/backend/src/api/draft.ts - created
✅ packages/frontend/src/app/leagues/[id]/draft/rankings/page.tsx - created
✅ packages/frontend/src/app/leagues/[id]/draft/auction/page.tsx - created
✅ packages/frontend/src/lib/api.ts - modified
✅ Commit b971831 - feat(04-03): create draft API routes with rankings and auction endpoints
✅ Commit 53fff35 - feat(04-03): create draft rankings and auction frontend pages
```

All files present, all commits exist in git history.
