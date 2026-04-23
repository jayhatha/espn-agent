---
phase: 24-feed-phase-23-optimization-signals-to-narrator
plan: 01
subsystem: ui
tags: [extension, narrator, optimization, openai, typescript, auction-draft]

# Dependency graph
requires:
  - phase: 23-roster-optimization-engine
    provides: RosterOptimizationSignal on DraftEngineSignals with topTargets, shouldBid, maxBid, simulationEV, opponentPressure
  - phase: 22-ai-narrator-layer
    provides: NarratorPayload contract, useNarrator hook, DraftNarratorAgent buildUserMessage
provides:
  - NarratorPayload extended with optimization field (shouldBid, maxBid, valueSurplus, simulationEV, simulationConfidence, topTargets max 3, opponentPressure max 3)
  - Nomination trigger in useNarrator fires on new player auction nomination
  - Backend buildUserMessage serializes OPTIMIZATION block with BID/PASS, EV, targets, pressure
  - System prompt instructs LLM to lead with bid recommendation and reference optimization signals
affects: [narrator, extension-sidebar, auction-draft, tactical-advice]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Simulation confidence derived from stdDev/EV ratio (< 0.1 = high, < 0.3 = medium, else low) with guard against EV === 0
    - opponentPressure Record<string,number> converted to sorted array for compact serialization
    - Nomination trigger uses prevAuctionPlayerRef tracking alongside existing alert/budget triggers
    - buildDedupeKey includes player name and shouldBid so each new nomination forces fresh narration

key-files:
  created: []
  modified:
    - packages/extension/lib/narrator-types.ts
    - packages/extension/lib/use-narrator.ts
    - packages/backend/src/agents/draft-narrator.ts

key-decisions:
  - "Simulation confidence derived from stdDev/EV ratio: < 0.1 = high, < 0.3 = medium, else low — guards against EV === 0 returning low"
  - "opponentPressure Record<string,number> sorted descending and sliced to top 3 before serialization — keeps payload compact"
  - "Nomination trigger fires before alert/budget triggers in useEffect priority order — ensures immediate narration on new player regardless of alert state"
  - "buildDedupeKey includes player name and shouldBid to prevent deduplication suppressing nomination-triggered calls"
  - "Backend OPTIMIZATION block only appended when payload.optimization is non-null — no empty sections in LLM prompt"

patterns-established:
  - "Pattern 1: Compact payload serialization — opponentPressure Record<string,number> converted to sorted array, topTargets sliced to 3, before crossing extension-to-backend boundary"
  - "Pattern 2: Confidence derivation from ratio — stdDev/EV < threshold approach for classifying simulation confidence, reusable for other Monte Carlo signals"

requirements-completed: [NARRATOR-OPT-01, NARRATOR-OPT-02, NARRATOR-OPT-03]

# Metrics
duration: 4min
completed: 2026-03-05
---

# Phase 24 Plan 01: Feed Phase 23 Optimization Signals to Narrator Summary

**Phase 23 optimization signals (topTargets, simulationEV, shouldBid, maxBid, opponentPressure) piped through NarratorPayload contract to LLM with nomination trigger and OPTIMIZATION prompt section**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-05T20:23:07Z
- **Completed:** 2026-03-05T20:27:33Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- NarratorPayload on both extension and backend now includes `optimization` field (null when no nomination) with shouldBid, maxBid, valueSurplus, simulationEV, simulationConfidence, topTargets (max 3), opponentPressure (max 3)
- `triggerReason` union extended with `"nomination"` on both sides; useNarrator fires narrator on each new player nomination via `prevAuctionPlayerRef` tracking
- Backend `buildUserMessage` serializes optimization into a labeled OPTIMIZATION block with BID/PASS recommendation, simulation EV + confidence, top target names, and position pressure factors
- System prompt instructs model to lead with BID/PASS, reference simulation confidence, and mention top targets when advising a PASS

## Task Commits

Each task was committed atomically:

1. **Task 1: Add optimization fields to NarratorPayload and update extension payload builder** - `a5eaa48` (feat)
2. **Task 2: Update backend NarratorPayload, buildUserMessage, and system prompt for optimization signals** - `4a5ec6f` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `packages/extension/lib/narrator-types.ts` - Added `optimization` field to NarratorPayload; added "nomination" to triggerReason union
- `packages/extension/lib/use-narrator.ts` - buildNarratorPayload maps signals.optimization to compact format; buildDedupeKey includes player name; nomination trigger in useEffect
- `packages/backend/src/agents/draft-narrator.ts` - Matching NarratorPayload update; buildUserMessage OPTIMIZATION section; system prompt optimization instructions

## Decisions Made
- Simulation confidence derived from `stdDev/EV` ratio: `< 0.1` = high, `< 0.3` = medium, else low — guards against `simulationEV === 0` returning low instead of dividing by zero
- `opponentPressure` `Record<string, number>` sorted descending and sliced to top 3 before crossing the extension-to-backend boundary — keeps prompt compact
- Nomination trigger fires first in the useEffect priority order (before alert/budget checks) so every new player gets immediate narration regardless of alert state
- `buildDedupeKey` now includes player name and shouldBid to prevent the deduplication logic from suppressing nomination-triggered calls when alerts are unchanged
- OPTIMIZATION block only appended when `payload.optimization !== null` — no empty sections in the LLM prompt

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. Pre-existing TypeScript errors exist in other extension files (entrypoints, api-client, test files) but none in the narrator files modified by this plan. Backend compiles clean.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Narrator now has full optimization signal visibility — LLM can reference SGP-based max bid, Monte Carlo simulation confidence, top undrafted targets, and position competition pressure in tactical commentary
- Extension fires narrator automatically on each new player nomination (not just alert/budget triggers)
- Ready for live draft validation to assess quality of optimization-informed narration

---
*Phase: 24-feed-phase-23-optimization-signals-to-narrator*
*Completed: 2026-03-05*
