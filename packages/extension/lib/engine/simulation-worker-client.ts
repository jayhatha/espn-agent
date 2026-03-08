/**
 * simulation-worker-client.ts
 *
 * Main-thread facade for the simulation Web Worker (Phase 53).
 *
 * Exports:
 *   runSimulationInWorker(request) — send request to worker, return Promise<ForwardSimulationSignal>
 *   terminateSimulationWorker()   — cleanup (optional)
 *
 * Design decisions:
 *   - Lazy singleton worker: spawned on first call, reused for all subsequent requests
 *   - Request ID model: each request gets a monotonically increasing ID. Worker echoes it back.
 *     Only the latest request ID's promise is resolved — older responses are discarded.
 *     This prevents stale results from overwriting newer ones during rapid nominations.
 *   - Timeout: 10 seconds. If worker doesn't respond, resolve with null simulation fields
 *     rather than crashing the engine.
 *   - Blob URL wrapper: content scripts run in the page's origin, so we can't construct
 *     a Worker from chrome-extension:// URLs directly. Instead, a tiny blob with
 *     importScripts() loads the real worker from web_accessible_resources.
 */

import type { ForwardSimulationSignal } from "./types";
import type { SimulationWorkerRequest, SimulationWorkerResponse } from "./simulation-worker";

// ============================================================
// Worker singleton + request tracking
// ============================================================

let worker: Worker | null = null;
let nextRequestId = 0;
let latestRequestId = -1;
let pendingResolve: ((result: ForwardSimulationSignal) => void) | null = null;
let pendingReject: ((err: Error) => void) | null = null;
let pendingTimeout: ReturnType<typeof setTimeout> | null = null;

const WORKER_TIMEOUT_MS = 10_000;

/** Null simulation signal returned on timeout or error */
function nullSimulation(): ForwardSimulationSignal {
  return {
    winProbability: null,
    currentDecision: null,
    nominationStrategy: null,
    draftTargets: null,
    computeTimeMs: 0,
  };
}

/** Lazily spawn the singleton worker */
function getOrCreateWorker(): Worker {
  if (worker !== null) return worker;

  // Content scripts run in the page's origin (e.g., fantasy.espn.com), so
  // `new Worker(chrome.runtime.getURL(...))` fails with a SecurityError.
  // Workaround: create a blob URL that uses importScripts to load the
  // extension-bundled worker. importScripts CAN access chrome-extension://
  // URLs listed in web_accessible_resources from a classic worker context.
  const scriptUrl = chrome.runtime.getURL("simulation-worker.js");
  const blob = new Blob([`importScripts("${scriptUrl}")`], {
    type: "application/javascript",
  });
  const blobUrl = URL.createObjectURL(blob);

  worker = new Worker(blobUrl);
  URL.revokeObjectURL(blobUrl);

  worker.onmessage = (event: MessageEvent<SimulationWorkerResponse>) => {
    const response = event.data;

    // Discard stale responses — only the latest request ID matters
    if (response.requestId !== latestRequestId) return;

    // Clear timeout
    if (pendingTimeout !== null) {
      clearTimeout(pendingTimeout);
      pendingTimeout = null;
    }

    // Resolve with the simulation signal
    const resolve = pendingResolve;
    pendingResolve = null;
    pendingReject = null;

    if (resolve) {
      const result: ForwardSimulationSignal = {
        winProbability: response.winProbability,
        currentDecision: response.currentDecision,
        nominationStrategy: response.nominationStrategy,
        draftTargets: response.draftTargets,
        computeTimeMs: response.computeTimeMs,
      };
      resolve(result);
    }
  };

  worker.onerror = (err) => {
    // Clear timeout
    if (pendingTimeout !== null) {
      clearTimeout(pendingTimeout);
      pendingTimeout = null;
    }

    const reject = pendingReject;
    const resolve = pendingResolve;
    pendingResolve = null;
    pendingReject = null;

    if (reject) {
      reject(new Error(`Simulation worker error: ${err.message}`));
    } else if (resolve) {
      resolve(nullSimulation());
    }

    // Terminate and reset so a new worker can be spawned on next call
    worker?.terminate();
    worker = null;
  };

  return worker;
}

// ============================================================
// Public API
// ============================================================

/**
 * Send a simulation request to the Web Worker and return a Promise that resolves
 * with the ForwardSimulationSignal when computation completes.
 *
 * If a previous request is still in flight, it is abandoned (its promise will never
 * be resolved — the new request takes over). Only the latest result matters.
 *
 * On timeout or worker error, resolves with a null simulation signal rather than
 * crashing the engine.
 */
export function runSimulationInWorker(
  request: Omit<SimulationWorkerRequest, "requestId">,
): Promise<ForwardSimulationSignal> {
  const w = getOrCreateWorker();

  // Assign a new request ID — this becomes the "latest"
  const requestId = nextRequestId++;
  latestRequestId = requestId;

  // Clear any previous pending promise (it will never resolve — abandoned)
  if (pendingTimeout !== null) {
    clearTimeout(pendingTimeout);
    pendingTimeout = null;
  }
  // Note: we don't call the old resolve/reject — the old promise is simply abandoned.
  // This is intentional: callers use .then() callbacks that update state, so
  // an abandoned promise just means that state update never fires.
  pendingResolve = null;
  pendingReject = null;

  return new Promise<ForwardSimulationSignal>((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;

    // Set up timeout — resolve with null simulation if worker takes too long
    pendingTimeout = setTimeout(() => {
      if (latestRequestId !== requestId) return; // Already superseded
      pendingResolve = null;
      pendingReject = null;
      resolve(nullSimulation());
    }, WORKER_TIMEOUT_MS);

    // Post request to worker (structured clone handles serialization)
    const fullRequest: SimulationWorkerRequest = { ...request, requestId };
    w.postMessage(fullRequest);
  });
}

/**
 * Terminate the simulation worker.
 * Call this on extension unload or settings reset for cleanup.
 */
export function terminateSimulationWorker(): void {
  if (pendingTimeout !== null) {
    clearTimeout(pendingTimeout);
    pendingTimeout = null;
  }
  pendingResolve = null;
  pendingReject = null;

  worker?.terminate();
  worker = null;
}
