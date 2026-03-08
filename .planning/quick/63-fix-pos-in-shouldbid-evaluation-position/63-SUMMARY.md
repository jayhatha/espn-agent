---
phase: quick-63
plan: 01
subsystem: extension-auto-bid
tags: [auto-bid, player-matching, ranking-lookup]

# Dependency graph
requires:
  - phase: 61
    provides: Strategy-based auto-bid with PL undervalued path using rankings
provides:
  - Correct ranking lookups in auto-bid controller (position, external rank, ASV fallback)
affects: [auto-bid-controller, shouldBid-evaluation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Name-based ranking lookup: match by playerName instead of playerId when ID systems differ"

key-files:
  created: []
  modified:
    - packages/extension/lib/auto-bid-controller.ts

key-decisions:
  - "Match rankings by player name (lowercase) instead of playerId — ESPN DOM provides ESPN IDs but rankings use FanGraphs MLBAM IDs"
  - "Move nominatedName declaration before ESPN ASV lookup to avoid forward reference"
  - "Guard name-based lookups with nominatedName truthiness check"

patterns-established:
  - "When crossing ESPN/FanGraphs ID boundaries, use name matching as the common key"

requirements-completed: [POS-FIX]

# Metrics
duration: 2min
completed: 2026-03-08
---

# Quick-63: Fix pos=? in shouldBid Evaluation

**Rankings matched by player name instead of mismatched ESPN/MLBAM player IDs — fixes position, external rank, and ASV fallback resolution**

## Root Cause

`state.rankings?.find((r) => r.playerId === playerId)` at line 553 compared ESPN player IDs (from DOM) against FanGraphs MLBAM IDs (from bundled rankings). These are completely different ID systems and never match, so `ranking` was always `undefined`, causing `pos=?` in logs and broken opportunity/PL-undervalued path evaluation.

Same issue affected ESPN ASV fallback at line 520.

## Fix

1. Moved `nominatedName` declaration before its first use (was forward-referenced)
2. Changed both ranking lookups to use `r.playerName.toLowerCase() === nominatedName`
3. Added truthiness guard on `nominatedName` before name-based finds

## Files Modified
- `packages/extension/lib/auto-bid-controller.ts` — 3 changes: moved nominatedName up, fixed ASV fallback lookup, fixed ranking lookup

## Commit
- `dce6c45` (fix)

---
*Phase: quick-63*
*Completed: 2026-03-08*
