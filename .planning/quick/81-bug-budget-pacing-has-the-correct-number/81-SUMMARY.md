---
phase: quick-81
plan: 1
subsystem: extension
tags: [draft-engine, roster-optimizer, ideal-roster, budget-pacing]

# Dependency graph
requires:
  - phase: quick-29
    provides: computeIdealRoster and idealRoster signal
  - phase: quick-20
    provides: Budget Pacing rosterSize from Position Tracker DOM
provides:
  - Reconciled activeSlots BN count so Ideal Roster total matches Budget Pacing rosterSize
affects: [extension-draft-engine, ideal-roster-panel, auction-budget-tracker]

# Tech tracking
tech-stack:
  added: []
  patterns: [slot-count reconciliation via BN adjustment before downstream consumers]

key-files:
  created: []
  modified:
    - packages/extension/lib/engine/index.ts

key-decisions:
  - "Reconcile BN slot count rather than changing DEFAULT_ROSTER_SLOTS to avoid affecting the fallback constant"
  - "Apply reconciliation before all downstream uses of activeSlotsOpt so SGP, opponent model, optimizer, and ideal roster all see the corrected total"
  - "Use Math.max(0, ...) to prevent negative BN counts if rosterSize somehow undershoots the non-BN slot total"

patterns-established:
  - "Slot reconciliation pattern: compare activeTotalOpt to input.rosterSize, adjust BN in a shallow copy, reassign let variable"

requirements-completed: ["81-BUG"]

# Metrics
duration: 3min
completed: 2026-03-08
---

# Quick Task 81: Budget Pacing / Ideal Roster Slot Count Reconciliation Summary

**BN slot count reconciliation so Ideal Roster total always matches rosterSize reported by Budget Pacing Position Tracker DOM**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-08T00:00:00Z
- **Completed:** 2026-03-08T00:03:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Fixed mismatch between Budget Pacing "Roster Spots Left" (uses `rosterSize` from DOM) and Ideal Roster slot total (used `activeSlotsOpt` which could sum to a different number, e.g. DEFAULT_ROSTER_SLOTS sums to 26 vs rosterSize of 28)
- Reconciliation adjusts the BN (bench) slot count so the `activeSlotsOpt` total equals `input.rosterSize` before any downstream consumer sees it
- All consumers — SGP vectors, opponent model, roster optimizer, ideal roster — automatically receive the reconciled value since `activeSlotsOpt` is now `let` and reassigned in-place

## Task Commits

1. **Task 1: Reconcile activeSlots BN count to match rosterSize** - `38ad7c8` (fix)

## Files Created/Modified

- `/Users/jay-work/Code/espn-agent/packages/extension/lib/engine/index.ts` - Changed `const activeSlotsOpt` to `let`, added reconciliation block after computing `activeTotalOpt`

## Decisions Made

- Adjust BN specifically (not any other slot) since bench is the variable-size slot by design
- Keep `DEFAULT_ROSTER_SLOTS` unchanged — it's the fallback constant, not the source of truth
- Emit `console.log` in DEV when reconciliation fires to aid debugging
- Use `Math.max(0, ...)` guard to prevent negative BN if rosterSize is unexpectedly small

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Pre-existing TypeScript errors in other files (test files, api-client, wxt config) are unrelated to this change and were present before this task. No errors in `lib/engine/index.ts`.

## Next Phase Readiness

- Ideal Roster now shows the same total slot count as Budget Pacing when both start from the same `rosterSize`
- No further changes needed for this bug fix

---
*Phase: quick-81*
*Completed: 2026-03-08*
