---
phase: 60-sp-logic
plan: "01"
subsystem: bid-engine
tags: [sp-tier-caps, savings-reallocation, rank-based, bug-fix, tests]
dependency_graph:
  requires: []
  provides: [getRankBasedTierCap, draftedSpTierCaps, rank-based-sp-savings]
  affects: [strategy-caps, use-draft-engine, bid-ceiling-tests]
tech_stack:
  added: []
  patterns: [rank-based-tier-cap, per-sp-tier-cap-tracking]
key_files:
  created: []
  modified:
    - packages/extension/lib/engine/draft-constants.ts
    - packages/extension/lib/engine/strategy-caps.ts
    - packages/extension/lib/use-draft-engine.ts
    - packages/extension/lib/engine/__tests__/bid-ceiling.test.ts
decisions:
  - "getRankBasedTierCap always falls back to $3 when rank is undefined (no slot-based fallback needed for undefined case)"
  - "draftedSpTierCaps falls back to getSpTierCap(s) when not provided — backward compatible with callers that don't pass it"
metrics:
  duration: "4 minutes"
  completed: "2026-03-19"
  tasks_completed: 2
  files_changed: 4
---

# Phase 60 Plan 01: SP Tier Cap and Savings Reallocation Fix Summary

Fixed two SP bid cap bugs and added 12 new tests covering all SP/RP bid rules.

## What Was Built

Fixed SP savings reallocation using rank-based per-SP tier caps instead of slot-position ideal spend. Fixed current-player tierCap to use `getRankBasedTierCap(externalRank)` so a PL#28 always gets $12 cap regardless of how many SPs were previously drafted.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Fix SP tier cap assignment and savings reallocation | fe2edbc | strategy-caps.ts, draft-constants.ts, use-draft-engine.ts |
| 2 | Add SP savings tests for out-of-order drafting | 6eaa8d9 | bid-ceiling.test.ts |

## Changes Made

### draft-constants.ts
- Added `getRankBasedTierCap(rank: number | undefined): number` helper:
  - rank 1-20: $18, rank 21-30: $12, rank 31-40: $10, rank 41-60: $5, rank 61+/undefined: $3

### strategy-caps.ts
- Added `draftedSpTierCaps?: number[]` to `StrategyCapInput` interface
- Fixed current-player tierCap: uses `getRankBasedTierCap(rank)` instead of inline if/else (same logic, now shared)
- Fixed SP savings reallocation: uses `draftedSpTierCaps?.[s] ?? getSpTierCap(s)` instead of `getSpTierCap(s)`
- Fixed RP savings reallocation: same fix
- Removed stale pitcher dampening comment block (5 lines)
- Updated doc comment: removed "Pitcher dampening (x pitcherMultiplier)", added "Need multiplier" and "Budget flush"

### use-draft-engine.ts
- Added import for `getRankBasedTierCap`
- Built `draftedSpTierCaps` array from drafted SPs using rank lookup
- Passed `draftedSpTierCaps` to `computeStrategyBidCap`

### bid-ceiling.test.ts
- Added `computeStrategyBidCap` import
- Added `describe("SP savings reallocation")` block with 12 test cases:
  1. Out-of-order SP4-before-SP1 — no fake savings
  2. Normal order savings carry-forward
  3. No savings when paid exactly the cap
  4. RP gets SP savings when 5+ SPs drafted
  5. RP hard cap $15 cannot be exceeded by savings
  6a/6b. Ranked SP tier cap is both floor and ceiling
  7a/7b. Filler SP cap-down only (no floor)
  8. 7+ SPs drafted — all further cap at $3
  9. No pitcher SGP multiplier — rawMaxBid unaffected before tier cap
  10. Current-player tierCap uses rank, not slot position

## Deviations from Plan

None — plan executed exactly as written.

## Test Results

- 312 tests pass across 18 test files (was 300 before adding 12 new tests)
- All existing tests pass (no regression)
- 0 new type errors in modified files

## Self-Check: PASSED

Files exist:
- packages/extension/lib/engine/draft-constants.ts — FOUND
- packages/extension/lib/engine/strategy-caps.ts — FOUND
- packages/extension/lib/use-draft-engine.ts — FOUND
- packages/extension/lib/engine/__tests__/bid-ceiling.test.ts — FOUND

Commits:
- fe2edbc — FOUND
- 6eaa8d9 — FOUND
