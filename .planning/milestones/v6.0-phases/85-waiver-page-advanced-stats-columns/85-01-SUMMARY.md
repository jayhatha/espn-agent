---
phase: 85-waiver-page-advanced-stats-columns
plan: 01
subsystem: waiver-stats
tags: [fastify, nextjs, typescript, baseball-savant, espn]

# Dependency graph
requires:
  - phase: 73-show-current-and-projected-stats-for-each-player-on-waivers-and-roster-pages
    provides: waiver manual-eval tables and current/player stat wiring patterns
  - phase: 77-sp-sit-start-recommendations-from-pitcherlist-and-rotoballer-scrape-weekly-rankings-match-to-rostered-sps-display-start-sit-verdict-with-source-links
    provides: external-data adapter pattern with in-process cache
  - phase: 84-streaming-results-live-standings-category-rankings
    provides: current v6.0 baseline before closeout
provides:
  - free-agent and roster waiver APIs expose advancedStats payloads
  - waiver manual-eval tables show sortable advanced hitter and pitcher columns
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - backend request-time enrichment adapter with 6-hour LRU cache
    - Baseball Savant CSV ingestion via axios + csv-parse/sync
    - graceful-degradation null contract for unavailable external metrics

key-files:
  created:
    - packages/backend/src/adapters/advanced-stats.ts
  modified:
    - packages/backend/src/api/recommendations.ts
    - packages/frontend/src/app/leagues/[id]/waivers/page.tsx

key-decisions:
  - "Used existing waiver endpoint data flow instead of adding DB tables or snapshot work"
  - "Matched Savant rows by normalized player name and refused duplicate-name guesses"
  - "Returned null for xFIP and SIERA because Fangraphs is not a reliable backend source in this environment"

patterns-established:
  - "Waiver endpoint enrichment can combine ESPN live data, DB stats, and public-source overlays in one response"

requirements-completed: [WAIVER-ADV-01, WAIVER-ADV-02, WAIVER-ADV-03]

# Metrics
duration: 1 session
completed: 2026-05-04
---

# Phase 85 Plan 01: Waiver Page Advanced Stats Columns Summary

**Waiver manual-evaluation mode now exposes advanced hitter and pitcher columns by combining Statcast expected stats with existing ESPN component data**

## Accomplishments

- Added `AdvancedStatsAdapter` to fetch Baseball Savant expected-stat exports and cache them by season
- Derived `BABIP`, `ISO`, `K/9`, `K-BB%`, and `FIP` from existing ESPN component stats already stored in the player table
- Exposed `currentStats` on free-agent responses and `advancedStats` on both free-agent and roster waiver API responses
- Added sortable advanced-stat columns to both manual-eval tables on the waiver page
- Made missing-source metrics explicit: `xFIP` and `SIERA` render as `--` instead of guessed values

## Files Created/Modified

- `packages/backend/src/adapters/advanced-stats.ts` — Baseball Savant CSV adapter, derived-metric helpers, 6-hour cache
- `packages/backend/src/api/recommendations.ts` — free-agent and roster response enrichment with `currentStats` and `advancedStats`
- `packages/frontend/src/app/leagues/[id]/waivers/page.tsx` — advanced stat types, row shaping, sortable headers/cells, explanatory note

## Decisions Made

- Kept the feature scoped to the existing waiver page data path instead of changing snapshot ingestion or schema
- Used Statcast expected stats where exact public exports are available and degraded gracefully where they are not
- Preserved the existing wide-table interaction model because the page already supports horizontal overflow

## Known Gaps

- `xFIP` and `SIERA` remain unavailable until a reliable backend-consumable public source is added
- Name-only Statcast matching intentionally skips duplicate-name collisions instead of guessing

---

_Phase: 85-waiver-page-advanced-stats-columns_
_Completed: 2026-05-04_
