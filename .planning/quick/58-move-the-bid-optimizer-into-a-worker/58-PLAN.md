---
quick_task: 58
plan: 1
status: pending
---

# Quick Task 58: Move Bid Optimizer into Web Worker

## Objective

Move `computeMaxBid` (binary search) and `runMonteCarlo` off the main thread into a dedicated Web Worker. These currently run synchronously inside `computeRosterOptimization()` on every nomination change, blocking the UI for 10-15 `optimizeRoster` calls (binary search) plus 200 Monte Carlo simulations.

**Pattern:** Follow the existing simulation worker pattern exactly (Phase 53): worker entry point + blob-URL client facade + WXT unlisted script entrypoint.

**After this change:**
- `computeRosterOptimization()` returns immediately with `maxBid: 0, shouldBid: false` (placeholder values)
- Bid results arrive asynchronously via a new `onBidComplete` callback, same pattern as `onSimulationComplete`
- `use-draft-engine.ts` merges async bid results into signals using a second `useState`

## Task 1: Create bid-optimizer-worker and client facade

**Files:**
- `packages/extension/lib/engine/bid-optimizer-worker.ts` (new)
- `packages/extension/lib/engine/bid-optimizer-worker-client.ts` (new)
- `packages/extension/entrypoints/bid-optimizer-worker.ts` (new)
- `packages/extension/wxt.config.ts` (modify)

**Action:**

1. **Create `bid-optimizer-worker.ts`** — Web Worker entry point that handles `computeMaxBid` + `runMonteCarlo`. Model after `simulation-worker.ts`:

   Define message types:
   ```typescript
   export interface BidOptimizerWorkerRequest {
     requestId: number;
     // Nominated player data
     nominatedPlayer: PoolPlayer;
     nominatedAsv: number | null;  // ESPN ASV market price override
     // Player pool
     availablePlayers: PoolPlayer[];
     sgpValues: number[];
     // Budget and roster
     budget: number;
     rosterSlots: Record<string, number>;  // remainingSlots
     inflationFactor: number;
     // Opponent model (serialized — Maps converted to plain objects)
     opponentModel: SerializedOpponentModel;  // Reuse type from simulation-worker.ts
     // Monte Carlo params
     myCurrentRosterSGP: number;
     opponentBudgets: number[];
     numSimulations: number;  // 200
   }

   export interface BidOptimizerWorkerResponse {
     requestId: number;
     maxBid: number;
     expectedMarketPrice: number;
     valueSurplus: number;
     shouldBid: boolean;
     simulationEV: number;
     simulationStdDev: number;
     computeTimeMs: number;
   }
   ```

   `self.onmessage` handler:
   - Deserialize `opponentModel` (reconstruct Maps from plain objects) — reuse or duplicate the `deserializeOpponentModel` helper from `simulation-worker.ts`
   - Call `computeMaxBid(nominatedPlayer, availablePlayers, sgpValues, budget, rosterSlots, opponentModel, inflationFactor, nominatedAsv)`
   - Call `runMonteCarlo({ availablePlayers, sgpValues, myCurrentRoster: [], myCurrentRosterSGP, myBudget: budget, opponentBudgets, rosterSlots, nominatedPlayer, nominatedBid: maxBidResult.maxBid, numSimulations })`
   - Post response with combined results

   Imports: `computeMaxBid` from `./bid-optimizer`, `runMonteCarlo` from `./monte-carlo`, types from `./types`. The worker bundles these via WXT/Vite — same as simulation-worker bundles `draft-simulator.ts`.

2. **Create `bid-optimizer-worker-client.ts`** — Main-thread facade. Clone the structure of `simulation-worker-client.ts` exactly:
   - Lazy singleton worker via blob URL + `importScripts(chrome.runtime.getURL("bid-optimizer-worker.js"))`
   - `nextRequestId` / `latestRequestId` pattern for staleness detection
   - `pendingResolve` / `pendingReject` / `pendingTimeout` (10s timeout)
   - Export `runBidOptimizerInWorker(request: Omit<BidOptimizerWorkerRequest, "requestId">): Promise<BidOptimizerWorkerResponse>`
   - Export `terminateBidOptimizerWorker(): void`
   - On timeout, resolve with a null-ish response: `{ requestId, maxBid: 0, expectedMarketPrice: 0, valueSurplus: 0, shouldBid: false, simulationEV: 0, simulationStdDev: 0, computeTimeMs: 0 }`

3. **Create `entrypoints/bid-optimizer-worker.ts`** — WXT unlisted script entrypoint (identical structure to `entrypoints/simulation-worker.ts`):
   ```typescript
   import "../lib/engine/bid-optimizer-worker";
   export default defineUnlistedScript(() => {});
   ```

4. **Update `wxt.config.ts`** — Add `"bid-optimizer-worker.js"` to `web_accessible_resources[0].resources` array alongside `"simulation-worker.js"`.

**Verify:** `pnpm --filter extension build` compiles without errors. Check that `bid-optimizer-worker.js` appears in the build output alongside `simulation-worker.js`.

**Done:** Worker entry point, client facade, and WXT entrypoint exist. Build produces `bid-optimizer-worker.js` as a web-accessible resource.


## Task 2: Wire async bid computation into engine and React hook

**Files:**
- `packages/extension/lib/engine/index.ts` (modify)
- `packages/extension/lib/use-draft-engine.ts` (modify)

**Action:**

1. **Modify `computeRosterOptimization()`** in `index.ts`:

   - Remove the synchronous `computeMaxBid()` and `runMonteCarlo()` calls (lines ~287-365 in the function, which correspond to the bid cache section that calls `computeMaxBid` and `runMonteCarlo` directly)
   - Remove the `import { computeMaxBid } from "./bid-optimizer"` and `import { runMonteCarlo } from "./monte-carlo"` imports from `index.ts` (these are now only used inside the worker)
   - The `bidCacheKey` and `cachedBidResult` module-level variables can be removed
   - Instead, `computeRosterOptimization()` should always return placeholder values for bid fields: `maxBid: 0, expectedMarketPrice: 0, valueSurplus: 0, shouldBid: false, simulationEV: 0, simulationStdDev: 0`
   - Keep the `topTargets` computation and `opponentPressure` as-is (they remain synchronous)
   - Keep `computeTimeMs` for the synchronous portion

2. **Add async bid dispatch in `computeDraftEngine()`** (in `index.ts`):

   - Add a new parameter: `onBidComplete?: (bid: BidOptimizerWorkerResponse) => void`
   - Add module-level cache variables: `let bidWorkerCacheKey = ""; let cachedBidWorkerResult: BidOptimizerWorkerResponse | null = null;`
   - After `computeRosterOptimization()` returns, if there is a nominated player (same detection logic currently in `computeRosterOptimization`), build a `BidOptimizerWorkerRequest` and fire it to the worker:
     - Cache key: `${input.currentAuctionPlayerId ?? 'none'}_${input.allPicks.length}_${input.pitcherHitterSplit ?? 65}`
     - Only fire if cache key changed (same pattern as simulation worker dispatch)
     - Find `nominatedPlayer` in `allPlayersOpt` using the same two-strategy lookup (auctionValues ID -> name match, then DOM name fallback)
     - Find `nominatedAsv` from `nameToAsv` (the ESPN ASV lookup built earlier in `computeRosterOptimization` — this logic must be hoisted or duplicated in `computeDraftEngine` since `computeRosterOptimization` no longer does bid computation)
     - Build `opponentBudgets` array from `opponentModelOpt.teamBudgets`
     - Compute `myCurrentRosterSGP` by summing SGP values of drafted players
     - Serialize `opponentModelOpt` Maps to plain objects for structured clone (same pattern as simulation worker serialization)
     - Call `runBidOptimizerInWorker(request).then(result => { cachedBidWorkerResult = result; bidWorkerCacheKey = capturedKey; onBidComplete?.(result); })`
   - Import `runBidOptimizerInWorker` from `./bid-optimizer-worker-client` and `BidOptimizerWorkerResponse` type from `./bid-optimizer-worker`

3. **Modify `use-draft-engine.ts`**:

   - Add a second `useState` for async bid results: `const [asyncBid, setAsyncBid] = useState<BidOptimizerWorkerResponse | null>(null)`
   - Reset `asyncBid` to null in the existing `useEffect` that resets `asyncSimulation` (same deps: `allPicks.length, currentPlayerId`)
   - Pass `setAsyncBid` as the `onBidComplete` callback to `computeDraftEngine(input, setAsyncSimulation, setAsyncBid)`
   - In the final merge `useMemo`, when `asyncBid` is available, overlay the bid fields onto `optimization`:
     ```typescript
     const mergedOptimization = baseSignals.optimization && asyncBid
       ? {
           ...baseSignals.optimization,
           maxBid: asyncBid.maxBid,
           expectedMarketPrice: asyncBid.expectedMarketPrice,
           valueSurplus: asyncBid.valueSurplus,
           shouldBid: asyncBid.shouldBid,
           simulationEV: asyncBid.simulationEV,
           simulationStdDev: asyncBid.simulationStdDev,
         }
       : baseSignals.optimization;
     return { ...baseSignals, optimization: mergedOptimization, simulation: asyncSimulation ?? baseSignals.simulation };
     ```
   - Add `asyncBid` to the `useMemo` dependency array

   - Import `BidOptimizerWorkerResponse` type from `./engine/bid-optimizer-worker`

**Important considerations:**
- The simulation worker dispatch (step 7 in `computeDraftEngine`) currently reads `optimization.maxBid` to set `maxBid` in the simulation request. After this change, `optimization.maxBid` will be 0 initially. The simulation worker request should still use 0 — it has its own independent bid/pass comparison logic. If the simulation needs a real maxBid, it can be updated on the next engine recompute after `asyncBid` arrives. This is acceptable because simulation results are already async and will naturally re-fire.
- The `cachedBidResult` used to prevent re-calling `computeMaxBid` on every render when nothing changed. The new `bidWorkerCacheKey` serves the same purpose — only posts to the worker when the cache key changes.

**Verify:**
- `pnpm --filter extension build` compiles without errors
- `pnpm --filter extension test` passes (existing tests should still work since bid-optimizer.ts and monte-carlo.ts are unchanged — they're just called from worker now)
- Open the extension in a draft. On nomination: UI should NOT block. Bid results should appear after a short delay (watch console for `[DraftEngine]` logs).

**Done:** `computeMaxBid` and `runMonteCarlo` no longer run on the main thread. Bid results arrive asynchronously via the worker. The UI remains responsive during nominations. The `optimization` signal starts with placeholder bid values (maxBid=0) and updates when the worker responds.
