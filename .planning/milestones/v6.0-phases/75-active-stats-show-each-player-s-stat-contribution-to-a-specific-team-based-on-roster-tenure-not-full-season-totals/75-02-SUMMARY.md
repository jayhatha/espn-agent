---
phase: 75-active-stats
plan: 02
subsystem: ui
tags: [react, nextjs, typescript, player-stats, tenure]

# Dependency graph
requires:
  - phase: 75-01
    provides: tenureStats field in roster API response, player_period_stats table, tenure computation backend
provides:
  - On Team label variant in PlayerStatLine with cyan-400 styling
  - Tenure stats display in lineup page roster section (hitters and pitchers)
  - Tenure stats display in waivers page drop/roster column
affects: [lineup-page, waivers-page, player-stat-display]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Three-line stat display pattern: Proj RoS (accent) → On Team (cyan) → YTD (muted)"
    - "tenureStats in RosterPlayer interface mirrors currentStats shape (Record<string, number> | null)"

key-files:
  created: []
  modified:
    - packages/frontend/src/components/league/PlayerStatLine.tsx
    - packages/frontend/src/app/leagues/[id]/lineup/page.tsx
    - packages/frontend/src/app/leagues/[id]/waivers/page.tsx

key-decisions:
  - "On Team label uses cyan-400 color to visually distinguish it as a third stat context (between green accent Proj RoS and muted YTD)"
  - "Tenure stats render before YTD (On Team above YTD) — shows contribution-since-acquired before full-season view"
  - "Free agents excluded from On Team display — they have no team tenure, tenureStats field not in FreeAgent interface"
  - "Conditional render {player.tenureStats && ...} used in lineup page — null guard prevents empty rendering when no tenure data"

patterns-established:
  - "On Team stat line: always between Proj RoS and YTD to maintain projection-then-actual ordering"

requirements-completed: [ACTIVE-04, ACTIVE-05, ACTIVE-06]

# Metrics
duration: 2min
completed: 2026-03-26
---

# Phase 75 Plan 02: Active Stats Frontend Summary

**PlayerStatLine extended with cyan-400 "On Team" label; lineup and waivers pages now show tenure-based stats alongside Proj RoS and YTD for all roster players**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-26T19:08:10Z
- **Completed:** 2026-03-26T19:09:52Z
- **Tasks:** 1 of 1
- **Files modified:** 3

## Accomplishments

- Extended PlayerStatLine label type union to `"YTD" | "Proj RoS" | "On Team"` with cyan-400 color styling for the new variant
- Added `tenureStats` field to RosterPlayer interface in both lineup and waivers pages — typed as `Record<string, number> | null`
- Lineup page now renders "On Team" PlayerStatLine above "YTD" for each hitter and pitcher in the roster table
- Waivers page drop column renders three stat lines per player: Proj RoS → On Team → YTD; free agent column unchanged (no tenure)

## Task Commits

1. **Task 1: Add On Team label to PlayerStatLine and wire into lineup + waivers pages** - `94072cf` (feat)

## Files Created/Modified

- `packages/frontend/src/components/league/PlayerStatLine.tsx` - Added "On Team" to label union, added cyan-400 color branch
- `packages/frontend/src/app/leagues/[id]/lineup/page.tsx` - Added tenureStats to RosterPlayer, added On Team stat line for hitters and pitchers
- `packages/frontend/src/app/leagues/[id]/waivers/page.tsx` - Added tenureStats to RosterPlayer, added On Team stat line in roster column only

## Decisions Made

- On Team uses cyan-400 to create a distinct visual tier: accent (projection) → cyan (tenure) → muted (full season)
- Tenure stats render above YTD in the lineup page player name cell — most relevant context (what you own) shown first
- Free agents have no `tenureStats` field in their interface — the field only exists on `RosterPlayer`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- Phase 75 complete — both backend (01) and frontend (02) tenure stats are fully wired
- Roster API returns `tenureStats`, lineup and waivers pages consume and display it
- Rate stats computed from component sums via existing calculateAVG/calculateERA functions in PlayerStatLine — no new math required

---
*Phase: 75-active-stats*
*Completed: 2026-03-26*
