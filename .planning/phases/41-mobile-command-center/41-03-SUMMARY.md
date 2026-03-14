---
phase: 41-mobile-command-center
plan: 03
subsystem: ui
tags: [nextjs, websocket, react, mobile, tabs, wake-lock, typescript]

requires:
  - phase: 41-01
    provides: expanded extension relay with idealRoster, scarcity, queue, autoNominateMode, skippedPlayerIds
  - phase: 41-02
    provides: EXTENSION_STATUS messages in the hub for connection tracking
provides:
  - Tabbed mobile layout shell (Live/Strategy/Queue) with bottom TabBar
  - Typed sendControl discriminated union (ControlActionMap) for compile-time action/payload safety
  - extensionConnected state driven by EXTENSION_STATUS WebSocket messages
  - ConnectionBanner component for extension disconnect warnings
  - useWakeLock hook preventing screen dimming during draft
  - LiveTab component with all existing draft content extracted from page.tsx
  - New data type interfaces (IdealRosterSignal, ScarcitySignal, NominationQueueEntry, CategoryProgress)
affects: [41-04, 41-05, mobile-command-center]

tech-stack:
  added: [Screen Wake Lock API]
  patterns: [discriminated-union-controls, tab-based-mobile-layout, connection-status-banner]

key-files:
  created:
    - packages/frontend/src/app/draft/live/useWakeLock.ts
    - packages/frontend/src/app/draft/live/components/ConnectionBanner.tsx
    - packages/frontend/src/app/draft/live/components/TabBar.tsx
    - packages/frontend/src/app/draft/live/tabs/LiveTab.tsx
  modified:
    - packages/frontend/src/app/draft/live/useDraftLiveSocket.ts
    - packages/frontend/src/app/draft/live/page.tsx
    - packages/frontend/src/app/draft/live/tabs/QueueTab.tsx

key-decisions:
  - "Used sendControlUntyped adapter in page.tsx for QueueTab compatibility rather than refactoring QueueTab props"
  - "Bottom TabBar always visible (not conditional on hasData) for consistent navigation"
  - "Control bar (auto-bid, position filter, split slider) stays inside LiveTab, not in page shell"

patterns-established:
  - "ControlActionMap discriminated union: all sendControl calls must match typed action/payload pairs"
  - "Tab content rendered via conditional rendering, not route-based navigation"

requirements-completed: [MOB-04, MOB-06, MOB-10, MOB-11, MOB-12, MOB-13]

duration: 6min
completed: 2026-03-14
---

# Phase 41 Plan 03: Mobile Tabbed Layout Summary

**Tabbed mobile layout with typed WebSocket controls, wake lock, connection banner, and LiveTab extraction from monolithic page**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-14T00:22:23Z
- **Completed:** 2026-03-14T00:28:10Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Typed sendControl as ControlActionMap discriminated union rejecting invalid action/payload at compile time
- Refactored monolithic page.tsx into thin shell with LiveTab, ConnectionBanner, TabBar components
- Added useWakeLock hook that acquires screen wake lock and re-acquires on visibilitychange
- Added extensionConnected state from EXTENSION_STATUS WebSocket messages with ConnectionBanner UI
- Added new data type interfaces for Plan 01 expanded relay data (IdealRosterSignal, ScarcitySignal, NominationQueueEntry)

## Task Commits

Each task was committed atomically:

1. **Task 1: Type sendControl as discriminated union and add extensionConnected state + useWakeLock hook** - `9390145` (feat)
2. **Task 2: Refactor page.tsx into tabbed layout with LiveTab, ConnectionBanner, and TabBar** - `47c2dfc` (refactor)

## Files Created/Modified
- `packages/frontend/src/app/draft/live/useDraftLiveSocket.ts` - Added ControlActionMap, extensionConnected, IdealRosterSignal/ScarcitySignal/NominationQueueEntry types
- `packages/frontend/src/app/draft/live/useWakeLock.ts` - New wake lock hook with acquire/release/re-acquire lifecycle
- `packages/frontend/src/app/draft/live/components/ConnectionBanner.tsx` - Extension disconnect warning banner with pulsing dot
- `packages/frontend/src/app/draft/live/components/TabBar.tsx` - Bottom tab navigation (Live/Strategy/Queue) with 44px touch targets
- `packages/frontend/src/app/draft/live/tabs/LiveTab.tsx` - Extracted live draft content (nomination, bid verdict, budget, roster, alerts, controls)
- `packages/frontend/src/app/draft/live/page.tsx` - Thin shell with header, ConnectionBanner, tab routing, TabBar
- `packages/frontend/src/app/draft/live/tabs/QueueTab.tsx` - Fixed pre-existing playerId type narrowing

## Decisions Made
- Used sendControlUntyped adapter wrapper in page.tsx for QueueTab compatibility, since QueueTab expects `(action: string, payload?: unknown)` and the typed sendControl has a narrower signature. This avoids modifying QueueTab's prop interface while maintaining type safety for LiveTab.
- Bottom TabBar renders always (not gated on hasData) so users can switch tabs before data arrives.
- Kept control bar (auto-bid toggle, position filter, pitcher/hitter split) inside LiveTab rather than the page shell since it only applies to the live view.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed pre-existing QueueTab playerId type error**
- **Found during:** Task 2 (refactoring page.tsx)
- **Issue:** QueueTab.tsx line 90 had `currentPlayer.playerId` typed as `number | undefined` being passed where `number` was required, despite a runtime guard check. Pre-existing from Plan 05.
- **Fix:** Added non-null assertion `currentPlayer.playerId!` since the guard `currentPlayer?.playerId !== undefined` ensures it is defined at runtime.
- **Files modified:** packages/frontend/src/app/draft/live/tabs/QueueTab.tsx
- **Verification:** TypeScript compiles cleanly
- **Committed in:** 47c2dfc (Task 2 commit)

**2. [Rule 3 - Blocking] Adapted to existing QueueTab/StrategyTab already present from Plans 04/05**
- **Found during:** Task 2 (rewriting page.tsx)
- **Issue:** Plans 04 and 05 had already been partially executed, creating QueueTab.tsx and StrategyTab.tsx. Page.tsx had partial tab support but was still monolithic. Plan 03 expected placeholder tabs.
- **Fix:** Integrated existing QueueTab and StrategyTab imports into the new tabbed shell instead of creating placeholders. Added sendControlUntyped adapter for QueueTab compatibility. Used type casts for StrategyTab engineSignals prop.
- **Files modified:** packages/frontend/src/app/draft/live/page.tsx
- **Verification:** TypeScript compiles cleanly, all tabs render
- **Committed in:** 47c2dfc (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both auto-fixes necessary for compilation and integration with existing code. No scope creep.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Tabbed layout shell is complete, ready for Plans 04 and 05 to fill Strategy and Queue tabs (already partially done)
- ControlActionMap exported for any component needing typed sendControl
- extensionConnected state available for any component needing connection awareness

---
*Phase: 41-mobile-command-center*
*Completed: 2026-03-14*

## Self-Check: PASSED
