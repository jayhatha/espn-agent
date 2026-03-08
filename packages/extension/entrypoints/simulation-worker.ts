/**
 * simulation-worker entrypoint (WXT unlisted script)
 *
 * WXT unlisted script entrypoint for the simulation Web Worker.
 * Built as a separate simulation-worker.js file, loaded by content script
 * via chrome.runtime.getURL('simulation-worker.js').
 *
 * Worker logic lives in lib/engine/simulation-worker.ts.
 */

// Import the worker implementation — WXT/Vite bundles all imports
import "../lib/engine/simulation-worker";

export default defineUnlistedScript(() => {
  // Worker implementation is initialized via self.onmessage in simulation-worker.ts
  // This export satisfies WXT's entrypoint requirements.
});
