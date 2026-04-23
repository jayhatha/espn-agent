---
phase: 22-ai-narrator-layer
plan: "02"
subsystem: ui
tags: [zustand, react, chrome-extension, hooks, typescript]

# Dependency graph
requires:
  - phase: 22-01
    provides: DraftEngineSignals type with archetype field, engine signal structure
  - phase: 20-deterministic-draft-engine
    provides: computeDraftEngine, DraftAlert, BudgetCurveSignal, InflationSignal, CategoryGapSignal, EnhancedScarcitySignal
  - phase: 21-dynamic-build-archetype-analysis
    provides: BuildArchetypeSignal, CategoryCeiling, PivotPlayer types on DraftEngineSignals
provides:
  - narrator-state.ts: non-persisted Zustand store (narration, isLoading, sessionCallCount, lastTriggeredAt)
  - narrator-types.ts: NarratorPayload interface matching backend contract
  - use-narrator.ts: hook with debounce (1500ms), deduplication key, 120-call session cap, AbortController, requestAdvice()
  - Strategy object on DraftState: anchorPlayerName, anchorAcquired, fallbackPaths, strategyState with setStrategy/updateStrategyState actions
affects:
  - 22-03: DraftNarrator UI component reads from narrator-state.ts and calls requestAdvice from this hook
  - 22-01: Backend endpoint receives NarratorPayload from this hook's buildNarratorPayload()

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Non-persisted Zustand store (no persist middleware) for ephemeral session state
    - getState() pattern for stale closure avoidance in debounced callbacks
    - AbortController for in-flight request cancellation on re-trigger
    - Specific sub-field dependency array in useEffect to prevent over-triggering

key-files:
  created:
    - packages/extension/lib/narrator-types.ts
    - packages/extension/lib/narrator-state.ts
    - packages/extension/lib/use-narrator.ts
  modified:
    - packages/extension/lib/draft-state.ts

key-decisions:
  - "Non-persisted Zustand store for narrator: create() without persist middleware so sessionCallCount resets on page reload (per-draft-session cap)"
  - "getState() for sessionCallCount in debounced fireNarration callback to avoid stale closure that would bypass the 120-call cap"
  - "Deduplication key = sorted alert IDs + archetypeLabel + pacingStatus + triggerReason — prevents re-calling narrator for same engine state"
  - "AbortController cancels in-flight narrator request when new trigger fires in debounce window — serializes narrator calls"
  - "Graceful degradation: backend failure logs console.warn only, never shows error to user (extension works with engine signals only)"
  - "Strategy object not in partialize — not persisted across sessions (anchor changes each draft by user choice)"

patterns-established:
  - "Pattern 1: Stale closure avoidance — read Zustand counter via store.getState().field inside debounced callbacks, not from hook closure"
  - "Pattern 2: Specific dep array sub-fields — use engineSignals?.alerts, engineSignals?.archetype, engineSignals?.budgetCurve.pacingStatus (not whole object) to prevent excessive re-runs"
  - "Pattern 3: AbortController pattern for narrator — cancel previous in-flight before starting new, store ref, check err.name !== AbortError in catch"

requirements-completed: []

# Metrics
duration: 10min
completed: 2026-03-04
---

# Phase 22 Plan 02: AI Narrator Layer - Extension State & Hook Summary

**Non-persisted Zustand narrator store, NarratorPayload type, and useNarrator hook with 1500ms debounce, deduplication, 120-call session cap via getState(), and AbortController for in-flight cancellation**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-04T19:46:37Z
- **Completed:** 2026-03-04T19:56:37Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Created non-persisted Zustand store for narrator (narration, isLoading, sessionCallCount) — no persist middleware, resets on page reload
- Defined NarratorPayload interface on extension side matching the backend contract from 22-RESEARCH.md
- Added strategy object (anchorPlayerName, anchorAcquired, fallbackPaths, strategyState) to DraftState with setStrategy/updateStrategyState actions, excluded from partialize
- Implemented useNarrator hook with full trigger logic: alert severity > 0.65, archetype change (>= 3 picks), pacing status change; 1500ms debounce, deduplication key, 120-call cap via getState(), AbortController cancellation, graceful degradation

## Task Commits

Each task was committed atomically:

1. **Task 1: Create narrator state store and types, add strategy to draft store** - `9e021ec` (feat)
2. **Task 2: Create useNarrator hook with trigger logic, debounce, and session cap** - `0dfd159` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified

- `packages/extension/lib/narrator-types.ts` - NarratorPayload interface (extension-side, independent of shared package)
- `packages/extension/lib/narrator-state.ts` - Non-persisted Zustand store with narration, isLoading, sessionCallCount, lastTriggeredAt
- `packages/extension/lib/use-narrator.ts` - Hook with buildDedupeKey(), buildNarratorPayload(), useNarrator() exporting requestAdvice()
- `packages/extension/lib/draft-state.ts` - Added strategy object (anchorPlayerName, anchorAcquired, fallbackPaths, strategyState) + setStrategy/updateStrategyState actions + strategy: null in reset()

## Decisions Made

- Used `useNarratorStore.getState().sessionCallCount` (not closure value) inside fireNarration callback to ensure cap is always checked against current count even after 1500ms debounce delay (Pitfall #6 from RESEARCH.md)
- Excluded strategy from partialize to keep it session-only — anchor player selection changes each draft by user decision
- Used AbortController to cancel previous in-flight narrator request when new trigger fires, ensuring only one narrator call is in-flight at a time
- Specific sub-fields in useEffect dep array (not whole engineSignals object) to match computeDraftEngine memoization pattern and avoid excessive trigger evaluations

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors in draft-state.ts (partialize function type mismatch) confirmed as pre-existing (present before our changes) via git stash verification. Not introduced by this plan.

## Next Phase Readiness

- narrator-state.ts, narrator-types.ts, and use-narrator.ts are ready for 22-03 (DraftNarrator UI component)
- useNarrator hook exports requestAdvice() for wiring into "Ask for advice" button in DraftSidebar
- strategy object is in place on DraftState for strategy anchor/pivot UI in 22-03

---
*Phase: 22-ai-narrator-layer*
*Completed: 2026-03-04*
