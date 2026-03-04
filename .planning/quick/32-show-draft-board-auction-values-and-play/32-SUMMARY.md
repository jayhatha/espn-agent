---
phase: quick-32
plan: 01
subsystem: ui
tags: [chrome-extension, react, typescript, pitcherlist, auction-draft]

# Dependency graph
requires:
  - phase: quick-28
    provides: getDraftBoardData() merging ESPN players with PitcherList rankings including tierName
  - phase: quick-31
    provides: design token classes (bg-surface-tertiary, text-content-secondary) for badges
provides:
  - PlayerRanking interface with tierName, externalRank, espnAuctionValue fields
  - DraftSidebar nominated player banner showing ESPN Value + PitcherList tier badge + PL rank
  - AuctionPlayerCard PitcherList tier badge and rank display
affects: [extension-components, auction-draft-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - packages/extension/lib/api-client.ts
    - packages/extension/components/DraftSidebar.tsx
    - packages/extension/components/AuctionPlayerCard.tsx
    - packages/shared/src/types.ts

key-decisions:
  - "Add tierName/externalRank/espnAuctionValue to shared DraftRanking type (not just local PlayerRanking) so store typing is compatible and components can access fields without casting"
  - "Nominated banner uses dual lookup: auctionValues.find() for ESPN dollar value, rankings.find() for PitcherList tier — fixes pre-existing bug where rankings.dollarValue didn't exist on DraftRanking"
  - "Tier badge uses bg-surface-tertiary text-content-secondary px-1.5 py-0.5 rounded consistent with quick-31 design token migration"

patterns-established: []

requirements-completed: [QUICK-32]

# Metrics
duration: 2min
completed: 2026-03-04
---

# Quick Task 32: Show Draft Board Auction Values and PitcherList Tier Summary

**PitcherList tier badges (e.g., "STUD", "AGA 1") and ESPN pre-draft dollar values propagated from getDraftBoardData() through to nominated player banner and auction player cards**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-04T21:04:50Z
- **Completed:** 2026-03-04T21:06:28Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- `PlayerRanking` and shared `DraftRanking` interfaces now carry `tierName`, `externalRank`, and `espnAuctionValue` optional fields
- `getDraftBoardData()` populates the new fields from PitcherList match data per player
- DraftSidebar nominated player banner shows ESPN Value (from auctionValues lookup), PitcherList tier badge, and PL rank number
- AuctionPlayerCard renders tier badge and PL rank below the positions line when data is available
- Pre-existing bug fixed: banner no longer looks up `matchedRanking?.dollarValue` (which never existed on `DraftRanking`); instead uses `auctionValues` for dollar value

## Task Commits

1. **Task 1: Enhance PlayerRanking interface and getDraftBoardData()** - `3e6210a` (feat)
2. **Task 2: Show PitcherList tier and ESPN value in components** - `e49c93f` (feat)

## Files Created/Modified
- `packages/extension/lib/api-client.ts` - Added tierName, externalRank, espnAuctionValue to PlayerRanking; populated from PitcherList match in getDraftBoardData()
- `packages/shared/src/types.ts` - Added matching optional fields to DraftRanking so store typing is correct and components can access without type errors
- `packages/extension/components/DraftSidebar.tsx` - Pull auctionValues from store; dual lookup for nominated banner; display ESPN Value, tier badge, PL rank
- `packages/extension/components/AuctionPlayerCard.tsx` - Tier badge and PL rank below positions line when playerRanking has tierName or externalRank

## Decisions Made
- Added the new fields to shared `DraftRanking` (not just local `PlayerRanking`) because the draft store types `rankings` as `DraftRanking[]` and components access rankings from the store — adding only to `PlayerRanking` would cause TypeScript errors in components
- Used a dual lookup pattern in the nominated player banner: `auctionValues` for the dollar value (has `dollarValue`), `rankings` for PitcherList info (`tierName`, `externalRank`) — this fixes the pre-existing TS error where code was accessing `.dollarValue` on `DraftRanking` which doesn't have that field

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed nominated banner accessing non-existent dollarValue on DraftRanking**
- **Found during:** Task 2 (DraftSidebar banner update)
- **Issue:** The existing IIFE tried `matchedRanking?.dollarValue` but `DraftRanking` has no `dollarValue` field — this was causing a TypeScript error (already present before this task) and would return null at runtime
- **Fix:** Replaced with dual lookup — `auctionValues.find()` for dollar value, `rankings.find()` for tier info. This is exactly what the plan instructed.
- **Files modified:** packages/extension/components/DraftSidebar.tsx
- **Verification:** TypeScript no longer errors on these lines; DraftSidebar.tsx now correctly sources dollar values from auctionValues
- **Committed in:** e49c93f (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (pre-existing bug that the plan explicitly directed fixing)
**Impact on plan:** Fix was planned — plan description says "Replace the current IIFE block that looks up matchedRanking?.dollarValue (which does NOT exist on DraftRanking)". No scope creep.

## Issues Encountered
- Shared package `dist/` needed rebuild after updating `src/types.ts` for TypeScript to pick up the new `DraftRanking` fields in the extension. Ran `npx tsc -p packages/shared/tsconfig.json` before checking extension errors.

## Next Phase Readiness
- Extension auction draft experience now shows PitcherList tiers + ESPN dollar values in both the nominated player banner and the player cards
- All pre-existing TypeScript errors in extension are pre-existing (WXT globals, CSS imports, content.tsx type mismatches) — unrelated to this task

---
*Phase: quick-32*
*Completed: 2026-03-04*
