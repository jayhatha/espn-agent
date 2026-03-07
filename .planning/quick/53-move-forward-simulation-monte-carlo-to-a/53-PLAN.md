---
phase: 53-move-forward-simulation-monte-carlo-to-a
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/engine/simulation-worker.ts
  - packages/extension/lib/engine/simulation-worker-client.ts
  - packages/extension/lib/engine/index.ts
  - packages/extension/wxt.config.ts
autonomous: true
requirements: [SIM-WORKER-01]

must_haves:
  truths:
    - "Forward simulation (baseline + decision comparison + draft targets) runs in a Web Worker off the main thread"
    - "Main thread never blocks during Monte Carlo simulation — sidebar remains responsive"
    - "Simulation results still appear in the DraftEngineSignals.simulation field"
    - "Sim count can be increased from 50 back to 200 without sidebar lockup"
  artifacts:
    - path: "packages/extension/lib/engine/simulation-worker.ts"
      provides: "Web Worker entry point — receives simulation requests, runs sims, posts results"
      min_lines: 50
    - path: "packages/extension/lib/engine/simulation-worker-client.ts"
      provides: "Main-thread client — spawns worker, sends requests, returns Promise<ForwardSimulationSignal>"
      min_lines: 40
    - path: "packages/extension/lib/engine/index.ts"
      provides: "Updated computeDraftEngine that delegates simulation to worker client"
  key_links:
    - from: "packages/extension/lib/engine/index.ts"
      to: "packages/extension/lib/engine/simulation-worker-client.ts"
      via: "import and call runSimulationInWorker()"
      pattern: "runSimulationInWorker"
    - from: "packages/extension/lib/engine/simulation-worker-client.ts"
      to: "packages/extension/lib/engine/simulation-worker.ts"
      via: "new Worker(new URL('./simulation-worker.ts', import.meta.url))"
      pattern: "new Worker.*simulation-worker"
    - from: "packages/extension/lib/engine/simulation-worker.ts"
      to: "packages/extension/lib/engine/draft-simulator.ts"
      via: "import simulateFullDraft, computeSimStandings"
      pattern: "simulateFullDraft"
---

<objective>
Move the forward simulation (Monte Carlo draft completion, decision comparison, draft targets) from the main thread to a Web Worker so the extension sidebar never locks up during live drafts. Once off the main thread, increase sim count from 50 back to 200 for better statistical accuracy.

Purpose: The forward simulation runs hundreds of full draft completions (50 sims x 3 stages = ~150 calls to simulateFullDraft). This blocks the main thread for 500-1000ms, causing visible sidebar jank during live auctions. Moving to a Web Worker eliminates this entirely.

Output: Web Worker file, main-thread client, updated engine index
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/lib/engine/index.ts
@packages/extension/lib/engine/draft-simulator.ts
@packages/extension/lib/engine/decision-comparison.ts
@packages/extension/lib/engine/nomination-strategy.ts
@packages/extension/lib/engine/types.ts
@packages/extension/lib/fangraphs-data.ts
@packages/extension/lib/use-draft-engine.ts
@packages/extension/wxt.config.ts
@packages/extension/tsconfig.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create Web Worker and main-thread client</name>
  <files>
    packages/extension/lib/engine/simulation-worker.ts
    packages/extension/lib/engine/simulation-worker-client.ts
  </files>
  <action>
**simulation-worker.ts** — Web Worker entry point.

Define a `SimulationWorkerRequest` message type containing all serializable inputs needed:
- `allPlayers: PoolPlayer[]` (already serializable — plain objects)
- `sgpValues: number[]`
- `categories: Category[]` (from @espn-fantasy/shared)
- `simState: { availableIndices: number[]; teamStates: SimTeamState[]; myTeamIndex: number }` — NOTE: convert Set<number> to number[] before posting since Sets are not structured-cloneable
- `currentAuctionPlayerIndex: number | null` (already resolved index, not raw playerId)
- `maxBid: number`
- `nominationInput: { myTeamIndex: number; opponentStates: SimTeamState[]; availablePlayers: PoolPlayer[]; availableSgps: number[]; opponentModel: { teamNeeds: Record<string, string[]>; teamBudgets: Record<string, number>; competitionFactors: Record<string, number>; leagueInflationFactor: number } } | null` — NOTE: OpponentModel uses Maps; convert to plain objects before posting
- `topCandidates: Array<{ name: string; pos: string; idx: number; bid: number }>` (for draft targets)
- `simsPerDecision: number` (will be 200 now)
- `temperature: number`

Define a `SimulationWorkerResponse` message type:
- `winProbability: SimulationOutcome | null`
- `currentDecision: DecisionComparison | null`
- `nominationStrategy: NominationRecommendation[] | null`
- `draftTargets: DraftTargetRecommendation[] | null`
- `computeTimeMs: number`

In the worker `self.onmessage` handler:
1. Receive the request data
2. Reconstruct `SimDraftState` from the plain object (convert `availableIndices: number[]` back to `Set<number>`)
3. Run baseline win probability: loop `simsPerDecision` times calling `simulateFullDraft` + `computeSimStandings`, then `aggregateOutcomes`
4. Run decision comparison if `currentAuctionPlayerIndex !== null && maxBid > 0`: build `CandidateAction[]` (bid + pass), call `compareDecisions`
5. Run nomination strategy if `nominationInput !== null`: reconstruct the `OpponentModel` with Maps from the plain object fields, call `recommendNomination`
6. Run draft targets if `topCandidates.length > 0`: build `CandidateAction[]`, call `compareDecisions` with `simsPerDecision` sims, map results to `DraftTargetRecommendation[]`
7. Post `SimulationWorkerResponse` back

Import `simulateFullDraft`, `computeSimStandings`, `cloneSimState` from `./draft-simulator`.
Import `compareDecisions`, `aggregateOutcomes` from `./decision-comparison`.
Import `recommendNomination` from `./nomination-strategy`.
Import `calculateFinalRate` from `@espn-fantasy/shared` (transitive via draft-simulator, but ensure it resolves in worker context).
Import types from `./types`.

The worker does NOT import FanGraphs JSON data — all player data is passed via message.

**simulation-worker-client.ts** — Main-thread facade.

Export `runSimulationInWorker(request: SimulationWorkerRequest): Promise<ForwardSimulationSignal>`.

Implementation:
1. Lazily create worker singleton: `let worker: Worker | null = null;`
2. On first call, instantiate: `worker = new Worker(new URL('./simulation-worker.ts', import.meta.url), { type: 'module' });` — this is the WXT-compatible pattern that ensures correct bundling and extension-relative paths
3. Create a Promise that resolves on `worker.onmessage` and rejects on `worker.onerror`
4. Post the request to the worker
5. On response, construct `ForwardSimulationSignal` from the worker response and resolve
6. Handle worker errors: if the worker crashes or times out (add a 10-second timeout), resolve with `null` for all simulation fields rather than crashing the engine

Also export `terminateSimulationWorker()` for cleanup (optional but good practice).

Key design decision: Use a single pending request model (not request IDs). If a new request arrives while one is in flight, the old promise should be abandoned (resolved with the new result when it comes). This matches the draft engine's behavior — only the latest result matters. Implement this with a monotonically increasing `requestId` counter. Each request gets an ID, the worker response echoes it back, and only the latest ID's promise gets resolved.
  </action>
  <verify>
TypeScript compilation: `cd /Users/jay-work/Code/espn-agent && pnpm exec tsc --noEmit -p packages/extension/tsconfig.json` passes (or verify key types align manually if tsc has unrelated errors).
Both files exist and export the documented interfaces.
  </verify>
  <done>
simulation-worker.ts handles onmessage with full simulation pipeline (baseline + decision + nomination + targets).
simulation-worker-client.ts exports runSimulationInWorker() that lazily spawns a Worker using WXT-compatible URL pattern and returns Promise<ForwardSimulationSignal>.
Sets and Maps are converted to/from structured-cloneable formats at the boundary.
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire worker into engine and increase sim count</name>
  <files>
    packages/extension/lib/engine/index.ts
    packages/extension/lib/use-draft-engine.ts
    packages/extension/wxt.config.ts
  </files>
  <action>
**index.ts changes:**

The simulation section (Step 7, lines ~884-1076) currently runs synchronously on the main thread. Refactor `computeDraftEngine` to be async-aware for the simulation step while keeping all other steps synchronous.

Approach: Make `computeDraftEngine` return `DraftEngineSignals` synchronously as before (for non-simulation fields), but fire off the simulation asynchronously and update via a callback. This preserves the existing `useMemo` pattern in `use-draft-engine.ts`.

Concrete changes to `index.ts`:

1. Add an optional callback parameter to `computeDraftEngine`:
   ```ts
   export function computeDraftEngine(
     input: DraftEngineInput,
     onSimulationComplete?: (sim: ForwardSimulationSignal) => void,
   ): DraftEngineSignals
   ```

2. Import `runSimulationInWorker` from `./simulation-worker-client` and the request type.

3. Replace the entire synchronous simulation block (Step 7) with:
   - Keep the cache check: if `newSimCacheKey === simulationCacheKey && cachedSimulation !== null`, use cached value synchronously
   - Keep the gate checks (optimization null, categories empty, etc.) — skip if conditions not met
   - Keep the 5% draft progress gate
   - When simulation should run: instead of the synchronous sim loop, call `buildSimDraftState` to get `simState`, then prepare the `SimulationWorkerRequest`:
     - Convert `simState.availableIndices` Set to `Array.from(simState.availableIndices)`
     - Resolve `currentAuctionPlayerIndex` (the nomIdx logic stays in index.ts — it uses `input.auctionValues` and `normalizeName` which are already available)
     - Pass `maxBid` from `optimization.maxBid`
     - Build `nominationInput` by converting `opponentModelOpt` Maps to plain objects: `{ teamNeeds: Object.fromEntries([...opponentModelOpt.teamNeeds.entries()].map(([k,v]) => [k, [...v]])), teamBudgets: Object.fromEntries(opponentModelOpt.teamBudgets), ... }`
     - Build `topCandidates` (the top-5-by-SGP logic stays in index.ts)
     - Set `simsPerDecision: 200` (increased from 50)
     - Set `temperature: 1.0`
   - Call `runSimulationInWorker(request).then(result => { cachedSimulation = result; simulationCacheKey = newSimCacheKey; onSimulationComplete?.(result); })` — fire and forget
   - Set `simulation = cachedSimulation` (will be null on first call, previous cached on subsequent)

4. Return signals with `simulation` set to the cached value (which may be stale/null on first render, then updated async).

**use-draft-engine.ts changes:**

Update to handle async simulation updates:

1. Add a `useState` for simulation signal:
   ```ts
   const [asyncSimulation, setAsyncSimulation] = useState<ForwardSimulationSignal | null>(null);
   ```

2. Pass `setAsyncSimulation` as the `onSimulationComplete` callback to `computeDraftEngine`.

3. Merge the async simulation into the returned signals:
   ```ts
   const baseSignals = useMemo(() => computeDraftEngine(input, setAsyncSimulation), [...deps]);
   return useMemo(() => {
     if (!baseSignals) return null;
     return { ...baseSignals, simulation: asyncSimulation ?? baseSignals.simulation };
   }, [baseSignals, asyncSimulation]);
   ```

4. Reset `asyncSimulation` to null when the simulation cache key changes (new pick / new nomination) so stale results don't persist. Add a `useEffect` that resets when `allPicks.length` or `currentPlayerId` changes.

**wxt.config.ts changes:**

Add the worker file to `web_accessible_resources` so it can be loaded by the content script:
```ts
web_accessible_resources: [
  {
    resources: ["assets/*.json", "assets/*.png", "assets/*.js"],
    matches: ["https://fantasy.espn.com/*"],
  },
],
```
The `*.js` glob ensures the bundled worker script (which Vite compiles from .ts to .js) is accessible. WXT/Vite handles the worker bundling automatically when using the `new URL('./worker.ts', import.meta.url)` pattern.

**Sim count increase:**
Change `SIMS_PER_DECISION` from `50` to `200` in the worker request. This was the original target before Phase 30 reduced it for main-thread performance. With the worker, 200 sims run without blocking the UI.
  </action>
  <verify>
1. `cd /Users/jay-work/Code/espn-agent && pnpm exec tsc --noEmit -p packages/extension/tsconfig.json` — check for type errors (may have pre-existing ones; focus on new code)
2. `cd /Users/jay-work/Code/espn-agent/packages/extension && pnpm run build` — extension builds successfully
3. Verify the worker file is included in the build output: `ls .output/chrome-mv3/assets/` should include a JS file for the worker
4. `cd /Users/jay-work/Code/espn-agent/packages/extension && pnpm test` — existing tests pass
  </verify>
  <done>
computeDraftEngine returns synchronous signals immediately, fires simulation to Web Worker asynchronously, and calls onSimulationComplete callback when results arrive.
useDraftEngineSignals merges async simulation results into signals via useState.
SIMS_PER_DECISION is 200 (up from 50).
Extension builds successfully with worker bundled.
Main thread is never blocked by forward simulation.
  </done>
</task>

</tasks>

<verification>
1. Extension builds without errors: `pnpm run build` in packages/extension
2. Existing tests pass: `pnpm test` in packages/extension
3. Worker file exists in build output
4. The synchronous engine path (inflation, scarcity, categoryGaps, budgetCurve, alerts, optimization, projectedStandings, idealRoster) is unaffected — returns instantly
5. Simulation signal arrives asynchronously after worker completes
</verification>

<success_criteria>
- Forward simulation runs entirely in a Web Worker, never blocking the main thread
- Simulation count restored to 200 (from 50) for better statistical accuracy
- All non-simulation engine signals return synchronously with zero latency regression
- Extension builds and existing tests pass
- Structured-clone boundary correctly handles Set<number> and Map conversions
</success_criteria>

<output>
After completion, create `.planning/quick/53-move-forward-simulation-monte-carlo-to-a/53-SUMMARY.md`
</output>
