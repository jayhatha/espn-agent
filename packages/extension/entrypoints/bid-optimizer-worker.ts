/**
 * bid-optimizer-worker entrypoint (WXT unlisted script)
 *
 * WXT unlisted script entrypoint for the bid optimizer Web Worker.
 * Built as a separate bid-optimizer-worker.js file, loaded by content script
 * via chrome.runtime.getURL('bid-optimizer-worker.js').
 *
 * Worker logic lives in lib/engine/bid-optimizer-worker.ts.
 */

// Import the worker implementation -- WXT/Vite bundles all imports
import "../lib/engine/bid-optimizer-worker";

export default defineUnlistedScript(() => {
  // Worker implementation is initialized via self.onmessage in bid-optimizer-worker.ts
  // This export satisfies WXT's entrypoint requirements.
});
