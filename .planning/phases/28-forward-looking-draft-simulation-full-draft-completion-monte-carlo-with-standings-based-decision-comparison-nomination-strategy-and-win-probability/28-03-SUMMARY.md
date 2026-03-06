---
phase: 28-forward-looking-draft-simulation
plan: 03
subsystem: ui
tags: [extension, sidebar, win-probability, decision-comparison, nomination-strategy, simulation]

requires:
  - phase: 28-02
    provides: ForwardSimulationSignal type, simulation field on DraftEngineSignals, nomination-strategy.ts
  - phase: 27-01
    provides: EngineInsights.tsx collapsible details pattern, ShoppingList integration
provides:
  - Win Probability section in EngineInsights sidebar with expectedFinish, win%, top-3%, top-6% probability bars
  - Decision Comparison (bid vs pass) embedded inside Win Probability section
  - Nomination Strategy section at bottom of sidebar with trap nominations
affects: [packages/extension/components/EngineInsights.tsx]

tech-stack:
  added: []
  patterns:
    - Null-guarded simulation sections using optional chaining (simulation?.winProbability != null)
    - Progress bar pattern via inline style width calculated from 0-1 probability values
    - Ring highlight pattern for recommended action matching Projected Standings "you" highlight
    - Embedded sub-section pattern (Decision Comparison inside Win Probability collapsible)

key-files:
  created: []
  modified:
    - packages/extension/components/EngineInsights.tsx

key-decisions:
  - "Win Probability section placed between Inflation and Shopping List (prime positioning for most impactful new signal)"
  - "Decision Comparison embedded inside Win Probability section rather than standalone — keeps bid/pass context near the expected finish signal"
  - "Nomination Strategy collapsed by default at bottom of sidebar — informational, not actionable urgency"
  - "trapScore color thresholds: > 0.6 = text-positive, > 0.3 = text-content, else text-content-secondary — maps to high/med/low signal strength"

requirements-completed: [SIM-07, SIM-08]

duration: 1min
completed: 2026-03-06
---

# Phase 28 Plan 03: EngineInsights Win Probability and Nomination Strategy UI Summary

**Three new forward-simulation sections added to EngineInsights sidebar: Win Probability with progress bars, bid-vs-pass Decision Comparison, and trap Nomination Strategy — surfacing Phase 28 simulation output in real-time during auction drafts.**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-06T15:46:02Z
- **Completed:** 2026-03-06T15:47:02Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Win Probability section displays simulation outcome: large expectedFinish number, win/top-3/top-6 probability bars with fill scaled to 0-100%, sim count and compute time metadata
- Decision Comparison appears inside Win Probability when a player is nominated — shows bid label vs pass label side-by-side, recommended action highlighted with ring-accent + checkmark
- Nomination Strategy shows trap nominations sorted by trapScore with expectedDrain dollar amount and color-coded score (green/neutral/muted threshold-based)
- All three sections gracefully handle null simulation data — render nothing, no crashes, backward compatible

## Task Commits

1. **Task 1: Add Win Probability, Decision Comparison, and Nomination Strategy sections** - `21e5a09` (feat)

## Files Created/Modified

- `packages/extension/components/EngineInsights.tsx` - Added simulation destructuring, Win Probability section (open), Decision Comparison subsection, Nomination Strategy section (collapsed)

## Decisions Made

- Win Probability section placed between Inflation and Shopping List for prime positioning as the most valuable new signal
- Decision Comparison embedded inside Win Probability collapsible rather than as a standalone section — keeps bid/pass context adjacent to baseline probability for easy comparison
- Nomination Strategy collapsed by default — useful context but not urgently actionable during nomination, avoids sidebar clutter
- trapScore color thresholds match design token semantics: > 0.6 triggers text-positive (high trap potential), > 0.3 text-content (moderate), else text-content-secondary (low)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Pre-existing TypeScript errors in other files (DraftSidebar.tsx, entrypoints, api-client.ts, test files) were already present before this plan and are out of scope. Zero errors in EngineInsights.tsx.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 28 complete — all three plans delivered: forward simulation engine (01), nomination strategy wiring (02), and UI surface (03)
- Win Probability, Decision Comparison, and Nomination Strategy are live in the sidebar when simulation data is available (requires 10%+ draft progress and myTeamId detection)
- No blockers

---
*Phase: 28-forward-looking-draft-simulation*
*Completed: 2026-03-06*
