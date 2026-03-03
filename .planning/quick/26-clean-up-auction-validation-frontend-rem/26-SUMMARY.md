---
phase: quick-26
plan: 01
subsystem: frontend/admin
tags: [auction-validation, form-cleanup, categories, api-client]
dependency_graph:
  requires: []
  provides: [clean-auction-validation-form, league-agnostic-auction-api]
  affects: [packages/frontend/src/app/admin/auction-validation/page.tsx, packages/frontend/src/lib/api.ts]
tech_stack:
  added: []
  patterns: [form-state-cleanup, interface-trimming]
key_files:
  created: []
  modified:
    - packages/frontend/src/app/admin/auction-validation/page.tsx
    - packages/frontend/src/lib/api.ts
decisions:
  - Removed espnLeagueId validation entirely since backend uses leaguedefaults endpoint requiring no league auth
  - Added BB after SB in batting categories (counting stat, HIGHER_BETTER)
  - Added L and WPCT after W in pitching categories (L is LOWER_BETTER counting stat, WPCT is RATE HIGHER_BETTER)
  - Added K9 after WHIP in pitching categories (RATE, HIGHER_BETTER, formula_id k9)
metrics:
  duration: 1min
  completed: 2026-03-03
---

# Quick Task 26: Clean Up Auction Validation Frontend

**One-liner:** Removed three unused ESPN auth form fields (League ID, SWID, S2) and added four missing scoring categories (BB, K9, WPCT, L) to the auction validation admin page and API client.

## What Was Done

### Task 1: Remove unused ESPN auth state and fields (762dfbe)

Cleaned up `packages/frontend/src/app/admin/auction-validation/page.tsx`:

- Removed state variables: `espnLeagueId`, `espnSwid`, `espnS2`
- Removed `if (!espnLeagueId)` required validation block from `handleSubmit`
- Removed `espnLeagueId: parseInt(espnLeagueId, 10)`, `espnSwid`, `espnS2` from the params object passed to `api.validateAuctionValues`
- Simplified ESPN Context section from 2-column 4-field grid to single-column with only the ESPN Season input
- Added `BB` to `AVAILABLE_CATEGORIES` at category_id 9 (after SB, before AVG)
- Added `L` (LOWER_BETTER counting) at category_id 25 and `WPCT` (RATE HIGHER_BETTER) at category_id 24 after W
- Added `K9` (RATE HIGHER_BETTER, formula_id k9) at category_id 23 after WHIP
- Updated batting filter to include `"BB"`: `["R", "HR", "RBI", "SB", "BB", "AVG", "OBP", "SLG", "OPS"]`
- Updated pitching filter to include `"L"`, `"WPCT"`, `"K9"`: `["K", "W", "L", "WPCT", "SV", "HLD", "QS", "ERA", "WHIP", "K9"]`

### Task 2: Remove unused ESPN auth params from api.ts (ec6a7e2)

Updated `validateAuctionValues` params interface in `packages/frontend/src/lib/api.ts`:

- Removed `espnLeagueId: number` (required field)
- Removed `espnSwid?: string` (optional)
- Removed `espnS2?: string` (optional)
- Retained all other fields: `numTeams`, `categories`, `rosterSlots`, `budget`, `minBid`, `limit`, `espnSeason`, `projectionsRunId`

## Verification

- TypeScript compilation: zero errors (`npx tsc --noEmit -p packages/frontend/tsconfig.json`)
- No remaining `espnLeagueId`, `espnSwid`, or `espnS2` references in either changed file (the one remaining `espnLeagueId` in api.ts is in the unrelated `connectLeague` function)
- `AVAILABLE_CATEGORIES` contains entries for BB, L, WPCT, and K9
- Batting filter includes `"BB"`, pitching filter includes `"L"`, `"WPCT"`, `"K9"`

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check

Files modified:
- [x] `packages/frontend/src/app/admin/auction-validation/page.tsx` - FOUND
- [x] `packages/frontend/src/lib/api.ts` - FOUND

Commits:
- [x] 762dfbe - feat(quick-26-01): remove ESPN auth fields from auction validation page
- [x] ec6a7e2 - feat(quick-26-02): remove ESPN auth params from validateAuctionValues interface

## Self-Check: PASSED
