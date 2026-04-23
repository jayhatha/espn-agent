---
phase: 73-show-current-and-projected-stats-for-each-player-on-waivers-and-roster-pages
plan: 02
subsystem: ui
tags: [nextjs, tailwind, typescript, tanstack-query, formulas]

# Dependency graph
requires:
  - phase: 73-show-current-and-projected-stats-for-each-player-on-waivers-and-roster-pages
    plan: 01
    provides: PlayerStatLine component + currentStats field on API responses
  - phase: 66-roto-math-foundation
    provides: formulas.ts with calculateAVG, calculateOBP, calculateERA, calculateWHIP
provides:
  - Waivers page manual eval mode shows Proj RoS and YTD stat lines below each player name
  - Lineup page has a "Your Roster" section with separate Hitters and Pitchers projection tables
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - PlayerStatLine wired below PlayerRow inside flex-1 div with px-3 pb-2 padding wrapper
    - Roster stats section uses IIFE pattern (() => { ... })() for Hitters/Pitchers table conditional rendering
    - formatRate helper checks denominator key before calling formula — used in both lineup and PlayerStatLine
    - isPitcher defined at module level in lineup page — same SP/RP/P logic as PlayerStatLine component

key-files:
  created: []
  modified:
    - packages/frontend/src/app/leagues/[id]/waivers/page.tsx
    - packages/frontend/src/app/leagues/[id]/lineup/page.tsx

key-decisions:
  - "PlayerStatLine placed inside flex-1 div (not outside label) so padding matches PlayerRow layout"
  - "Roster query uses same queryKey pattern as waivers page — ['roster', leagueId, selectedTeamId]"
  - "isPitcher and formatStat/formatRate defined at module level in lineup page for reuse across hitter/pitcher IIFE blocks"
  - "useEffect for localStorage loading added to lineup page — consistent with waivers page pattern"

patterns-established:
  - "PlayerStatLine wiring pattern: place after PlayerRow inside flex-1, wrap in px-3 pb-2 div"
  - "Roster stats section: IIFE per player group (hitters/pitchers), returns null when group is empty"

requirements-completed: [PSTAT-04, PSTAT-05, PSTAT-06]

# Metrics
duration: 10min
completed: 2026-03-25
---

# Phase 73 Plan 02: Wire PlayerStatLine into Waivers and Lineup Pages Summary

**PlayerStatLine component wired into waivers manual eval mode (free agent list + roster drop list) and lineup page now shows a "Your Roster" section with separate Hitters and Pitchers projection tables**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-25T07:15:00Z
- **Completed:** 2026-03-25T07:25:00Z
- **Tasks:** 2 (+ 1 auto-approved visual checkpoint)
- **Files modified:** 2

## Accomplishments

- Wired `PlayerStatLine` below each `PlayerRow` in both the free agents list and roster drop list in waivers manual eval mode — Proj RoS and YTD lines visible at a glance
- Added `currentStats` to `FreeAgent` and `RosterPlayer` interfaces in waivers page so TypeScript correctly types the API response
- Added "Your Roster" section to lineup page with separate Hitters (HR, R, RBI, SB, AVG, OBP) and Pitchers (W, SV, K, ERA, WHIP) tables
- Rate stats in lineup tables use `calculateAVG`, `calculateOBP`, `calculateERA`, `calculateWHIP` from `@espn-fantasy/shared` — no hand-rolled math
- IP=0 and AB=0 guards in lineup page show "--" for ERA/WHIP/AVG/OBP when denominator is zero
- Added `useEffect` localStorage team loading to lineup page — consistent with waivers page pattern
- Both files pass TypeScript compilation cleanly

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire PlayerStatLine into waivers page free agent and roster lists** - `2c29c11` (feat)
2. **Task 2: Add roster stats section to lineup page** - `8ec7dfc` (feat)
3. **Task 3: Visual verification checkpoint** - auto-approved (auto_advance=true)

## Files Created/Modified

- `packages/frontend/src/app/leagues/[id]/waivers/page.tsx` - Added PlayerStatLine import, currentStats to FreeAgent/RosterPlayer interfaces, stat line JSX below each PlayerRow in free agents and roster drop lists
- `packages/frontend/src/app/leagues/[id]/lineup/page.tsx` - Added PlayerStatLine + formula imports, RosterPlayer interface, isPitcher/formatStat/formatRate helpers, localStorage useEffect, roster query, Your Roster section with Hitters/Pitchers tables

## Decisions Made

- `PlayerStatLine` placed inside `flex-1` div (not sibling to it) so horizontal padding aligns with `PlayerRow` content — consistent visual hierarchy
- `isPitcher`, `formatStat`, and `formatRate` defined at module level in lineup page (not inline) so both the IIFE hitter block and IIFE pitcher block can share them
- `useEffect` for localStorage loading added to lineup page even though it has a `TeamSelector` — ensures the correct team is pre-selected on page load without user action, matching waivers page behavior
- Roster query in lineup page uses `enabled: !!selectedTeamId` (not `viewMode` guard) since the roster section is always visible when a team is selected

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Rebased worktree onto main before executing**
- **Found during:** Pre-task setup
- **Issue:** Worktree was based on "initial commit" (a5240a3), predating PlayerStatLine component and currentStats API changes from Plan 01
- **Fix:** Ran `git rebase main` to bring the worktree onto the merged state including all Plan 01 changes
- **Files modified:** All worktree files (rebase brings in upstream commits)
- **Committed in:** Not committed (rebase, not a code change)

---

**Total deviations:** 1 auto-fixed (1 blocking — worktree rebase)
**Impact on plan:** Required prerequisite. Plan depends on PlayerStatLine existing and currentStats being in API responses — the rebase made both true.

## Issues Encountered

Same worktree initialization pattern as Plan 01 — worktree created from "initial commit" before merged changes. `git rebase main` resolves it cleanly each time.

## Known Stubs

None — all stat data flows from real API responses. `PlayerStatLine` returns null when `components` is null (no placeholder rendered). Lineup page shows "--" for missing stats (not placeholder text).

## Next Phase Readiness

- Phase 73 is complete — both plans executed, all requirements PSTAT-01 through PSTAT-06 satisfied
- Players on waivers page and roster/lineup page now show projected and current stats at a glance
- No blockers for future phases

---
*Phase: 73-show-current-and-projected-stats-for-each-player-on-waivers-and-roster-pages*
*Completed: 2026-03-25*
