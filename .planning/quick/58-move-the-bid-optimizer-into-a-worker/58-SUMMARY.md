---
quick_task: 58
plan: 1
subsystem: extension
tags: [web-worker, bid-optimizer, monte-carlo, performance, auction-draft]

# Dependency graph
requires:
  - phase: 23
    provides: bid-optimizer.ts, monte-carlo.ts, roster-optimizer.ts
  - phase: 53
    provides: simulation-worker pattern (blob URL, WXT unlisted script)
provides:
  - bid-optimizer-worker.ts: Web Worker running computeMaxBid + runMonteCarlo off main thread
  - bid-optimizer-worker-client.ts: lazy singleton facade with staleness detection
  - async bid computation pattern in computeDraftEngine
affects: [extension-sidebar, draft-engine]

# Tech tracking
tech-stack:
  added: []
  patterns: [async worker dispatch with cache key dedup, same pattern as simulation-worker]

key-files:
  created:
    - packages/extension/lib/engine/bid-optimizer-worker.ts
    - packages/extension/lib/engine/bid-optimizer-worker-client.ts
    - packages/extension/entrypoints/bid-optimizer-worker.ts
  modified:
    - packages/extension/lib/engine/index.ts
    - packages/extension/lib/use-draft-engine.ts
    - packages/extension/wxt.config.ts

key-decisions:
  - "Followed simulation-worker pattern exactly: blob URL + importScripts + WXT unlisted script"
  - "Simulation worker uses cachedBidWorkerResult.maxBid when available, 0 otherwise"
  - "Bid computation guard no longer blocks nomination player index resolution in simulation"

patterns-established:
  - "Dual async worker pattern: both simulation and bid optimizer run off main thread with independent cache keys and staleness detection"

requirements-completed: []

# Metrics
duration: 12min
completed: 2026-03-07
---

# Quick Task 58: Move Bid Optimizer into Worker Summary

**Moved computeMaxBid binary search and runMonteCarlo (200 simulations) off the main thread into a dedicated Web Worker, eliminating UI blocking during auction nominations**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-08T00:44:35Z
- **Completed:** 2026-03-08T00:56:48Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created bid-optimizer-worker.ts Web Worker entry point that runs computeMaxBid + runMonteCarlo entirely off the main thread
- Created bid-optimizer-worker-client.ts with lazy singleton, request ID staleness detection, and 10s timeout (identical pattern to simulation-worker-client.ts)
- Wired async bid results into React hook via useState + useMemo merge, so bid fields (maxBid, shouldBid, simulationEV, etc.) overlay onto optimization signal when worker responds
- Build produces separate bid-optimizer-worker.js (7.47 kB) as web-accessible resource

## Task Commits

Each task was committed atomically:

1. **Task 1: Create bid-optimizer-worker and client facade** - `7e618db` (feat)
2. **Task 2: Wire async bid computation into engine and React hook** - `bffe6fa` (feat)

## Files Created/Modified
- `packages/extension/lib/engine/bid-optimizer-worker.ts` - Web Worker entry point: receives serialized request, deserializes OpponentModel Maps, runs computeMaxBid + runMonteCarlo, posts combined response
- `packages/extension/lib/engine/bid-optimizer-worker-client.ts` - Main-thread facade: blob URL worker spawn, staleness detection, 10s timeout with placeholder fallback
- `packages/extension/entrypoints/bid-optimizer-worker.ts` - WXT unlisted script entrypoint for build system
- `packages/extension/wxt.config.ts` - Added bid-optimizer-worker.js to web_accessible_resources
- `packages/extension/lib/engine/index.ts` - Removed synchronous computeMaxBid/runMonteCarlo from computeRosterOptimization; added async bid worker dispatch in computeDraftEngine with cache key dedup
- `packages/extension/lib/use-draft-engine.ts` - Added asyncBid useState, reset on nomination change, merge bid fields into optimization signal via useMemo

## Decisions Made
- Followed simulation-worker pattern exactly (blob URL + importScripts + WXT unlisted script) for consistency and proven reliability
- Simulation worker's decision comparison now uses cachedBidWorkerResult.maxBid when available (0 on first render) -- the simulation naturally re-fires when state changes, so the next render picks up the async bid result
- Removed optimization.maxBid > 0 guard from simulation player index resolution so simulation can still find the nominated player regardless of bid state

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Bid optimizer and simulation now run as independent Web Workers
- Main thread only computes synchronous signals (scarcity, category gaps, budget curve, alerts, targets)
- Ready for further performance work or additional async worker extraction

---
*Quick Task: 58*
*Completed: 2026-03-07*
