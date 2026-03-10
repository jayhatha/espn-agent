---
phase: 38-ux-audit-and-fixes
plan: 01
subsystem: ui
tags: [react, extension, chrome-extension, zustand, ux]

# Dependency graph
requires:
  - phase: 38-ux-audit-and-fixes
    provides: Research and UX audit findings identifying bid verdict and player card improvements
  - phase: 22-ai-narrator-layer
    provides: useNarratorStore with narration field
  - phase: 23-roster-optimization-engine
    provides: DraftEngineSignals with optimization.maxBid, optimization.shouldBid, optimization.expectedMarketPrice
provides:
  - "BidVerdict.tsx consolidated bid/pass decision card rendered in DraftSidebar during auction"
  - "AuctionPlayerCard.tsx with expand/collapse defaulting to compact single-row view"
  - "PlayerCard.tsx with expand/collapse defaulting to compact single-row view"
affects: [auction-draft-ui, extension-sidebar, player-cards]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Expand/collapse pattern: useState(false) for isExpanded, onClick toggle on outer div, compact vs full render branches"
    - "Inline SVG chevrons: no external icon library needed in extension"
    - "BidVerdict: null-guard on currentAuctionPlayer + engineSignals.optimization before rendering"

key-files:
  created:
    - packages/extension/components/BidVerdict.tsx
  modified:
    - packages/extension/components/DraftSidebar.tsx
    - packages/extension/components/AuctionPlayerCard.tsx
    - packages/extension/components/PlayerCard.tsx

key-decisions:
  - "BidVerdict reads narration from useNarratorStore and truncates to first sentence (split on '. ' at index 0)"
  - "Risky threshold defined as: shouldBid AND (remainingBudget - maxBid) < remainingBudget * 0.15"
  - "Inline SVG chevrons used instead of lucide-react (not installed in extension package)"
  - "BidVerdict placed between nominated player banner and auto-pilot toggle in DraftSidebar"
  - "Player cards default to collapsed (isExpanded=false) to reduce visual noise"

patterns-established:
  - "Inline SVG for icons: use polyline points for chevron up/down without external library"
  - "Null-guard pattern for engine signal components: return null when currentAuctionPlayer === null or optimization === null"

requirements-completed: []

# Metrics
duration: 4min
completed: 2026-03-10
---

# Phase 38 Plan 01: UX Fixes - BidVerdict and Compact Player Cards Summary

**BidVerdict consolidated bid/pass decision card with color-coded border, max bid, market price, win probability, and narrator rationale; AuctionPlayerCard and PlayerCard defaulting to compact single-row expand/collapse view**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-10T15:23:27Z
- **Completed:** 2026-03-10T15:27:30Z
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- Created BidVerdict.tsx: during auction nominations, shows BID/PASS verdict with color-coded border (green/amber/red), max bid amount, market price pill, optional win probability pill, and truncated first-sentence narrator rationale
- Added expand/collapse state to AuctionPlayerCard: compact single row (rank badge, name, position, dollar value, chevron) expands to full stats view on click
- Added expand/collapse state to PlayerCard: compact single row (rank, name, position, VBD score, chevron) expands to full stats view on click
- Extension builds without TypeScript errors (verified via `pnpm --filter extension build`)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create BidVerdict consolidated decision card** - `696d020` (feat, committed in prior 38-02 run)
2. **Task 2: Add expand/collapse to extension player cards** - `c528d77` (feat)

## Files Created/Modified
- `packages/extension/components/BidVerdict.tsx` - New consolidated bid/pass verdict card: reads from useDraftStore (currentAuctionPlayer, remainingBudget) and useNarratorStore (narration); renders null when no nomination or no optimization data
- `packages/extension/components/DraftSidebar.tsx` - Imports and renders BidVerdict between nominated player banner and auto-pilot toggle, wrapped in ErrorBoundary, auction-format only
- `packages/extension/components/AuctionPlayerCard.tsx` - Added isExpanded state, compact row (rank/name/position/value/chevron) and expanded full view toggle
- `packages/extension/components/PlayerCard.tsx` - Added isExpanded state, compact row (rank/name/position/VBD/chevron) and expanded full view toggle

## Decisions Made
- Used inline SVG polyline elements for chevron icons instead of lucide-react (which is not installed in the extension package — avoided adding a new dependency)
- BidVerdict "risky" threshold: `remainingBudget - maxBid < remainingBudget * 0.15` (budget would drop below 15% of current remaining after bid)
- Narrator rationale truncation: `narration.indexOf(". ")` split, taking first sentence only — clean without regex dependency
- Player cards default to collapsed (compact view) to reduce information density in the sidebar
- Nominated player banner in DraftSidebar is unaffected — always shows full detail as primary focus element

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Replaced lucide-react import with inline SVG**
- **Found during:** Task 2 (Add expand/collapse to extension player cards)
- **Issue:** Plan specified `ChevronDown` and `ChevronUp` from `lucide-react`, but lucide-react is not in the extension's package.json dependencies
- **Fix:** Replaced `ChevronDown`/`ChevronUp` component imports with inline SVG `<polyline>` elements rendering equivalent chevron shapes
- **Files modified:** packages/extension/components/AuctionPlayerCard.tsx, packages/extension/components/PlayerCard.tsx
- **Verification:** Build succeeds without import errors
- **Committed in:** c528d77 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking - missing dependency)
**Impact on plan:** Auto-fix avoids adding an unnecessary dependency. Inline SVG achieves identical visual result with zero bundle overhead.

## Issues Encountered
- Task 1 files (BidVerdict.tsx and DraftSidebar.tsx changes) were found already committed in the repository from a prior phase 38-02 execution. Verified they matched the plan spec and proceeded directly to Task 2.

## Next Phase Readiness
- BidVerdict card provides at-a-glance bid/pass signal during auction nominations
- Player card compact defaults reduce sidebar scroll depth significantly
- Extension sidebar UX is cleaner; further UX improvements from the 38-RESEARCH.md audit can be addressed in subsequent plans

---
*Phase: 38-ux-audit-and-fixes*
*Completed: 2026-03-10*
