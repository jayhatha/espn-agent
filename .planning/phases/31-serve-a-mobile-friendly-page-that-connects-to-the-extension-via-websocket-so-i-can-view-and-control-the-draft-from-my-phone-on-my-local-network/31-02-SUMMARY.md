---
phase: 31-mobile-draft-companion
plan: 02
subsystem: extension
tags: [chrome-extension, websocket, background-service-worker, chrome-storage, zustand]

# Dependency graph
requires:
  - phase: 31-mobile-draft-companion-plan-01
    provides: Fastify WebSocket hub at ws://localhost:3001/draft/live with role-based connections
provides:
  - Extension background SW WS client connecting as role=extension to the hub
  - chrome.storage.local writes of engine signals and draft state from DraftSidebar
  - STATE_SNAPSHOT relay from storage changes to the WS hub
  - CONTROL command forwarding from hub to content script Zustand store
affects:
  - 31-mobile-draft-companion-plan-03 (mobile page reads STATE_SNAPSHOT, sends CONTROL)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "WebSocket client in background SW with exponential backoff reconnect (3s-30s)"
    - "20-second keepalive ping to prevent service worker from sleeping"
    - "1-second debounced chrome.storage.local writes from React component"
    - "Storage-mediated bridge: React context (content script) -> storage -> background SW -> WS hub"
    - "chrome.tabs.sendMessage for CONTROL command relay to matching tabs"

key-files:
  created: []
  modified:
    - packages/extension/components/DraftSidebar.tsx
    - packages/extension/entrypoints/background.ts
    - packages/extension/entrypoints/content.tsx

key-decisions:
  - "Write only a mobile-relevant subset of engine signals to storage (inflation, budgetCurve summary, alerts, optimization core fields, simulation outcome) to keep payloads small"
  - "1-second debounce on storage writes to avoid thrashing chrome.storage.local on every intermediate React render"
  - "Reconnect delay resets to 3s on successful WS connection, preventing stuck exponential backoff"
  - "Storage change listener checks for OPEN state before building payload to avoid wasted work"
  - "CONTROL listener returns false (synchronous) since sendResponse is called inline"

patterns-established:
  - "Storage-mediated bridge pattern: React component writes to chrome.storage.local; background SW listens via onChanged and relays"
  - "Background SW auto-connects on startup; close handler schedules reconnect with backoff"

requirements-completed:
  - WS-EXT-01
  - WS-EXT-02
  - WS-EXT-03
  - WS-EXT-04

# Metrics
duration: 4min
completed: 2026-03-08
---

# Phase 31 Plan 02: Extension WebSocket Relay Summary

**Chrome extension wired into WS relay pipeline: background SW connects as role=extension client with reconnect/keepalive, DraftSidebar debounce-writes engine signals to chrome.storage.local, and content script handles mobile CONTROL commands via Zustand store**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-08T07:42:32Z
- **Completed:** 2026-03-08T07:45:52Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- DraftSidebar now writes mobile-relevant engine signals to `draft-engine-signals` storage key and draft state to `draft-mobile-state` storage key, both debounced to 1 second
- Background service worker connects to `ws://localhost:3001/draft/live?role=extension`, maintains 20-second keepalive ping, and reconnects with exponential backoff (3s-30s)
- Storage change listener in background SW builds `STATE_SNAPSHOT` messages and sends to hub when draft-engine-signals or draft-mobile-state keys change
- Content script handles four CONTROL commands from background SW: SET_AUTO_MODE, SET_POSITION_FILTER, TOGGLE_SIDEBAR, SET_PITCHER_HITTER_SPLIT

## Task Commits

Each task was committed atomically:

1. **Task 1: Write engine signals to chrome.storage.local from DraftSidebar** - `0f76b1a` (feat)
2. **Task 2: Add WebSocket client relay to background service worker** - `468893c` (feat)
3. **Task 3: Add CONTROL command listener to content script** - `bfd70cb` (feat)

**Plan metadata:** (docs commit pending)

## Files Created/Modified
- `packages/extension/components/DraftSidebar.tsx` - Added useRef debounce timer + useEffect writing mobile-relevant engine signals and draft state to chrome.storage.local (1s debounce)
- `packages/extension/entrypoints/background.ts` - Added connectDraftRelay() with WS client, keepalive, exponential backoff reconnect, storage change listener relaying STATE_SNAPSHOT to hub
- `packages/extension/entrypoints/content.tsx` - Added chrome.runtime.onMessage listener handling CONTROL commands and applying to Zustand store

## Decisions Made
- Wrote only a mobile-relevant subset of engine signals (not the full DraftEngineSignals object) to keep chrome.storage.local writes small and fast
- Combined engine signals and draft state into a single 1-second debounce timeout to minimize storage write frequency
- `picksLength` field in draft-mobile-state is hardcoded to 0 to avoid pulling in `allPicks` as a dependency (heavy array); the mobile page doesn't need this
- CONTROL listener is placed early in content script main() (before DOM injection) so it's active even before React sidebar renders

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- None. Pre-existing TypeScript errors in the extension package (WXT framework globals like `defineBackground`, `defineContentScript`, and type mismatches in `api-client.ts`) are unrelated to this plan's changes. No new errors introduced.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Extension relay pipeline is complete: data flows from React -> storage -> background SW -> WS hub
- Control commands flow: hub -> background SW -> content script -> Zustand store
- Plan 03 (mobile page) can now subscribe to STATE_SNAPSHOT messages and send CONTROL commands
- No blockers

---
*Phase: 31-mobile-draft-companion*
*Completed: 2026-03-08*
