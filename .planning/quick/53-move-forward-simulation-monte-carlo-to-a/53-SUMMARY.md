---
phase: 53-move-forward-simulation-monte-carlo-to-a
plan: 01
subsystem: extension-simulation
tags: [web-worker, performance, monte-carlo, async, off-main-thread]
dependency_graph:
  requires: [simulation (index.ts), draft-simulator.ts, decision-comparison.ts, nomination-strategy.ts]
  provides: [simulation-worker.ts, simulation-worker-client.ts, entrypoints/simulation-worker.ts]
  affects: [use-draft-engine.ts, index.ts, wxt.config.ts]
tech_stack:
  added: [Web Worker API, chrome.runtime.getURL, WXT unlisted script entrypoint]
  patterns: [lazy singleton worker, request ID staleness detection, structured-clone boundary, async callback merge]
key_files:
  created:
    - packages/extension/lib/engine/simulation-worker.ts
    - packages/extension/lib/engine/simulation-worker-client.ts
    - packages/extension/entrypoints/simulation-worker.ts
  modified:
    - packages/extension/lib/engine/index.ts
    - packages/extension/lib/use-draft-engine.ts
    - packages/extension/wxt.config.ts
decisions:
  - WXT unlisted script entrypoint used to produce simulation-worker.js as separate build artifact
  - chrome.runtime.getURL() used in content script context (import.meta.url resolves to page URL, not extension URL)
  - Request ID model handles in-flight stale responses (latest result wins)
  - Set<number> serialized as number[], Maps as Record<string, V> for structured-clone compatibility
metrics:
  duration: 9 minutes
  completed: 2026-03-08
  tasks: 2
  files: 6
---

# Phase 53 Plan 01: Move Forward Simulation (Monte Carlo) to Web Worker Summary

**One-liner:** Monte Carlo forward simulation (200 sims x 3 stages) moved to a Web Worker via WXT unlisted script entrypoint, using chrome.runtime.getURL + request ID staleness model, restoring sim count to 200 without main-thread blocking.

## What Was Built

**simulation-worker.ts** (`lib/engine/simulation-worker.ts`): Web Worker entry point that receives `SimulationWorkerRequest` via `self.onmessage`, runs the full four-stage simulation pipeline (baseline win probability, decision comparison, nomination strategy, draft targets), and posts `SimulationWorkerResponse` back. Sets are deserialized from `number[]` and Maps from `Record<string, V>` at the structured-clone boundary.

**simulation-worker-client.ts** (`lib/engine/simulation-worker-client.ts`): Main-thread facade that lazily spawns a Worker singleton via `chrome.runtime.getURL('simulation-worker.js')` (with fallback to `import.meta.url` for non-extension contexts). Uses a monotonically increasing request ID counter — only the latest request's promise is resolved, older responses are discarded. Includes a 10-second timeout that resolves with null simulation (not a crash) on worker hangs.

**entrypoints/simulation-worker.ts**: WXT `defineUnlistedScript()` entrypoint that imports `lib/engine/simulation-worker.ts` and gets built as a separate `simulation-worker.js` (8.77 kB) in the extension output. This is required because WXT replaces `import.meta.url` with `self.location.href` in content scripts (which resolves to the ESPN page URL, not the extension URL).

**index.ts changes**: `computeDraftEngine` now accepts an optional `onSimulationComplete` callback. The simulation block was replaced: instead of running 150+ synchronous simulation calls, it builds the `SimulationWorkerRequest`, fires `runSimulationInWorker()` as a fire-and-forget, and returns `cachedSimulation` (null on first call, previous result on rerenders). SIMS_PER_DECISION is 200 (up from 50).

**use-draft-engine.ts changes**: Added `useState<ForwardSimulationSignal | null>(null)` for `asyncSimulation`. A `useEffect` resets it to null when `allPicks.length` or `currentPlayerId` changes. `computeDraftEngine` receives `setAsyncSimulation` as `onSimulationComplete`. The returned signal merges `asyncSimulation ?? baseSignals.simulation`.

**wxt.config.ts changes**: `web_accessible_resources` now includes `assets/*.js` and `simulation-worker.js` so the worker is accessible from the ESPN page context.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] WXT content script URL resolution requires chrome.runtime.getURL**

- **Found during:** Task 2 (build verification)
- **Issue:** WXT compiles content scripts as IIFE bundles where `import.meta.url` becomes `self.location.href` (the ESPN page URL). The plan's `new Worker(new URL('./simulation-worker.ts', import.meta.url))` pattern would resolve to `https://fantasy.espn.com/simulation-worker.ts` — not the extension file.
- **Fix:** Used `chrome.runtime.getURL('simulation-worker.js')` in the client with `import.meta.url` fallback for non-extension contexts. Created a WXT `defineUnlistedScript()` entrypoint (`entrypoints/simulation-worker.ts`) to build the worker as a separate `simulation-worker.js` file. Added `simulation-worker.js` explicitly to `web_accessible_resources`.
- **Files modified:** `simulation-worker-client.ts`, `entrypoints/simulation-worker.ts` (created), `wxt.config.ts`
- **Commits:** dac52be, f5798ea

**2. [Rule 1 - Bug] Removed unused imports from index.ts**

- **Found during:** Task 2 (import cleanup)
- **Issue:** Removing the synchronous simulation block left several imports unused: `simulateFullDraft`, `computeSimStandings`, `compareDecisions`, `aggregateOutcomes`, `recommendNomination`, `CandidateAction`, `DecisionComparison`, `DraftTargetRecommendation`
- **Fix:** Removed all unused imports from `index.ts`.
- **Files modified:** `packages/extension/lib/engine/index.ts`

## Verification Results

- Extension builds successfully: `simulation-worker.js` (8.77 kB) appears as separate build artifact
- All 119 existing tests pass
- `chrome.runtime.getURL('simulation-worker.js')` used in content script context
- `simulation-worker.js` listed in `web_accessible_resources`
- SIMS_PER_DECISION = 200 (restored from 50)
- Main thread returns `DraftEngineSignals` synchronously; simulation updates arrive via `onSimulationComplete` callback → `setAsyncSimulation` → re-render

## Commits

| Hash | Message |
|------|---------|
| dac52be | feat(53-01): create simulation Web Worker and main-thread client |
| f5798ea | feat(53-02): wire simulation worker into engine, increase sim count to 200 |

## Self-Check: PASSED

All files exist:
- FOUND: `packages/extension/lib/engine/simulation-worker.ts`
- FOUND: `packages/extension/lib/engine/simulation-worker-client.ts`
- FOUND: `packages/extension/entrypoints/simulation-worker.ts`
- FOUND: `.output/chrome-mv3/simulation-worker.js` (build artifact)

All commits exist:
- FOUND: `dac52be` (Task 1)
- FOUND: `f5798ea` (Task 2)
