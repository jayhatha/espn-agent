---
phase: quick-47
plan: 01
subsystem: ui
tags: [chrome-extension, auction-values, espn-asv, fangraphs, value-detection]

# Dependency graph
requires:
  - phase: quick-35
    provides: ESPN DOM auction value scraping (espnDomAuctionValues store)
  - phase: 11
    provides: value-detection.ts with ValueIndicator type and calculateAuctionValue
provides:
  - calculateFgVsMarket function for comparing FG analytical value to ESPN market price
  - ESPN ASV as primary display value across all auction UI surfaces
  - FG comparison badge with colored over/under indicator
affects: [extension-ui, auction-display]

# Tech tracking
tech-stack:
  added: []
  patterns: [market-value-primary-display, fg-comparison-badge]

key-files:
  created: []
  modified:
    - packages/extension/lib/value-detection.ts
    - packages/extension/components/AuctionPlayerCard.tsx
    - packages/extension/components/DraftSidebar.tsx
    - packages/extension/components/AuctionRecommendations.tsx

key-decisions:
  - "ESPN ASV shown as primary dollar number; FG value demoted to colored comparison badge"
  - "FG label shown when ESPN ASV unavailable so user knows value source is analytical not market"
  - "Affordability filter uses market value (ESPN ASV) not FG value for budget pacing"
  - "No engine calculations changed -- SGP, bid optimizer, inflation all still use FG values internally"

patterns-established:
  - "Market-first display: ESPN ASV is what other managers see, show it prominently; analytical data (FG) shown as badge"
  - "Graceful source labeling: when falling back to non-market data, label source explicitly (FG)"

requirements-completed: [QUICK-47]

# Metrics
duration: 2min
completed: 2026-03-06
---

# Quick-47: ESPN ASV as Primary Market Value with FG Over/Under Badge

**Flipped extension value display so ESPN ASV (Average Salary Value) is the primary dollar number across auction cards, nominated banner, and recommendations list, with FanGraphs value shown as a colored over/under comparison badge**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-06T19:37:01Z
- **Completed:** 2026-03-06T19:39:51Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- New `calculateFgVsMarket` utility compares FG analytical value against ESPN market price with 15%/30% thresholds
- AuctionPlayerCard shows ESPN ASV as big primary dollar number with colored FG badge (green up-arrow when underpriced, red down-arrow when overpriced)
- DraftSidebar nominated banner shows "Market Value" prominently with (live) indicator and FG comparison badge
- AuctionRecommendations sort tiebreaker and affordability filter use ESPN ASV when available
- When ESPN ASV unavailable, FG value shown as fallback with explicit "FG" label
- Zero changes to engine calculation logic (SGP, bid optimizer, inflation, scarcity all untouched)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add calculateFgVsMarket to value-detection.ts** - `7e7b27c` (feat)
2. **Task 2: Flip primary/secondary value display in all three UI components** - `de20c00` (feat)

## Files Created/Modified
- `packages/extension/lib/value-detection.ts` - Added calculateFgVsMarket function for FG vs ESPN ASV comparison
- `packages/extension/components/AuctionPlayerCard.tsx` - ESPN ASV as primary, FG badge secondary, "FG" label fallback
- `packages/extension/components/DraftSidebar.tsx` - Nominated banner with "Market Value" display and FG comparison
- `packages/extension/components/AuctionRecommendations.tsx` - ESPN ASV for sort tiebreaker and affordability filter

## Decisions Made
- ESPN ASV shown as primary dollar number; FG value demoted to colored comparison badge
- "FG" label shown when ESPN ASV unavailable so user knows value source is analytical not market
- Affordability filter in AuctionRecommendations uses market value (ESPN ASV when available) rather than FG value -- reflects what user actually bids against
- No engine calculations changed -- all SGP, bid optimizer, inflation, and scarcity logic still uses FanGraphs values internally

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ESPN ASV is now the primary display value across all auction surfaces
- FG comparison badge provides analytical context without cluttering the primary display
- Engine internals remain FG-based for accurate optimization

## Self-Check: PASSED

All 4 files verified present. Both commit hashes (7e7b27c, de20c00) verified in git log.

---
*Phase: quick-47*
*Completed: 2026-03-06*
