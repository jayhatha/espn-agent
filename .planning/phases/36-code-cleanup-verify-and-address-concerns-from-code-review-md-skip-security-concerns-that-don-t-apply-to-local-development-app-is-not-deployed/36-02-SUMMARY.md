---
phase: 36-code-cleanup
plan: "02"
subsystem: extension
tags: [error-boundary, logger, production-safety, extension, react]
dependency_graph:
  requires: ["36-01"]
  provides: ["error-recovery-ui", "dev-gated-logger"]
  affects: ["extension/components", "extension/lib", "extension/entrypoints"]
tech_stack:
  added:
    - "ErrorBoundary class component (React class component pattern)"
    - "DEV-gated logger utility (import.meta.env.DEV gate)"
  patterns:
    - "Error boundary per sidebar section for independent recovery"
    - "Production log suppression via build-time constant"
key_files:
  created:
    - packages/extension/components/ErrorBoundary.tsx
    - packages/extension/lib/logger.ts
  modified:
    - packages/extension/components/DraftSidebar.tsx
    - packages/extension/entrypoints/content.tsx
    - packages/extension/entrypoints/background.ts
    - packages/extension/lib/auto-bid-controller.ts
    - packages/extension/lib/api-client.ts
    - packages/extension/lib/dom-observers.ts
    - packages/extension/lib/use-narrator.ts
    - packages/extension/lib/engine/index.ts
    - packages/extension/lib/draft-config-detector.ts
decisions:
  - "logger.ts uses import.meta.env.DEV (WXT build constant) — no typeof check needed since WXT always defines import.meta.env"
  - "DraftSidebar.tsx console.warn left as-is (already guarded by if (import.meta.env.DEV) block)"
  - "ErrorBoundary class component, not function component, per React requirements for error boundaries"
  - "console.error preserved in ErrorBoundary.componentDidCatch and logger.error — real errors always log"
metrics:
  duration: "~8 minutes"
  completed: "2026-03-09T22:57:29Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 11
---

# Phase 36 Plan 02: Error Boundaries and DEV-Gated Logger Summary

React error boundaries added to prevent full sidebar crashes (E-10), and a DEV-gated logger created to eliminate 257+ console.* calls from production extension builds (E-13).

## Tasks Completed

### Task 1: Add React ErrorBoundary to sidebar sections (E-10)

Created `packages/extension/components/ErrorBoundary.tsx` as a React class component with:
- `getDerivedStateFromError` for capturing render errors
- `componentDidCatch` logging (console.error — intentionally kept direct)
- Default fallback UI with "{Section Name} error. [Retry]" pattern
- Retry button resets error state to let users recover without page reload

Wrapped each major DraftSidebar section independently:
- AI Narrator, Auction Budget Tracker, Engine Insights, Position Scarcity Alerts, Auction Recommendations (auction format)
- Roster Summary, Position Scarcity Alerts, Snake Turn Pairs, Draft Recommendations (snake format)
- Nomination Diagnostics panel
- DraftSidebar itself wrapped in content.tsx (both inline and popout render paths)

**Commit:** `709879f`

### Task 2: Create DEV-gated logger and replace console.* (E-13)

Created `packages/extension/lib/logger.ts`:
- `log/warn/debug/info` are no-ops in production (`import.meta.env.DEV === false`)
- `error` is always active (never suppress real errors)
- Uses `console.*.bind(console)` for correct stack traces

Replaced console.* calls across 8 runtime files:
- `auto-bid-controller.ts`: ~66 calls
- `api-client.ts`: ~46 calls (note: grep counted 46, plan estimated 45)
- `dom-observers.ts`: ~48 calls (plan estimated 36)
- `content.tsx`: ~37 calls (plan estimated 30)
- `draft-config-detector.ts`: ~28 calls
- `engine/index.ts`: ~17 calls
- `background.ts`: ~18 calls (plan estimated 10)
- `use-narrator.ts`: 1 call

Initial logger.ts had a syntax error (`typeof import !== 'undefined'` is invalid ES syntax). Fixed to `const isDev = import.meta.env.DEV` (WXT/Vite always defines this constant, no guard needed).

**Commit:** `4f9ed2d`

## Verification

1. `packages/extension/components/ErrorBoundary.tsx` exists (21 lines)
2. `grep -c "ErrorBoundary" DraftSidebar.tsx` returns 21 (9 section pairs + import)
3. `packages/extension/lib/logger.ts` exists
4. Zero `console.log/warn/debug/info` in runtime files (excluding logger.ts itself, comments, and 1 pre-existing DEV-guarded call in DraftSidebar.tsx)
5. Extension builds cleanly: `wxt build` reports `Built extension in 2.835 s`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] logger.ts syntax error with typeof import**
- **Found during:** Task 2 - extension build
- **Issue:** Plan's suggested logger implementation used `typeof import !== 'undefined'` which is invalid JavaScript syntax
- **Fix:** Changed to `const isDev = import.meta.env.DEV` — WXT/Vite always defines this build-time constant, no need for undefined guard
- **Files modified:** `packages/extension/lib/logger.ts`
- **Commit:** Fixed within `4f9ed2d`

## Self-Check: PASSED

Files verified:
- `packages/extension/components/ErrorBoundary.tsx`: EXISTS
- `packages/extension/lib/logger.ts`: EXISTS
- Commits `709879f` and `4f9ed2d`: FOUND in git log
- Extension build: PASSED (2.835s, no errors)
