---
phase: quick-91
plan: 01
subsystem: extension
tags: [bug-fix, dom-observers, auction-draft, mutation-observer, polling]
dependency_graph:
  requires: []
  provides: [resilient-auction-player-detection]
  affects: [packages/extension/lib/dom-observers.ts, packages/extension/entrypoints/content.tsx]
tech_stack:
  added: []
  patterns: [polling-fallback, observer-re-anchoring, deferred-observer-setup]
key_files:
  modified:
    - packages/extension/lib/dom-observers.ts
    - packages/extension/entrypoints/content.tsx
decisions:
  - "Use polling + re-anchoring together: polling catches missed mutations; re-anchoring handles the detached-node case"
  - "Remove attributeFilter entirely to avoid missed ESPN mutations; characterData: true added for bid text changes"
  - "Move observer setup after refreshAssistantData() to give ESPN React time to stabilize before anchoring"
metrics:
  duration: "~10 minutes"
  tasks_completed: 2
  files_modified: 2
  completed_date: "2026-03-16"
---

# Quick Task 91: Fix Nominated Player Detection After Reload Summary

Resilient auction player observer with 2-second polling fallback and 5-second re-anchor interval to survive ESPN React DOM node replacement after page reload.

## What Was Built

Two targeted fixes to `observeCurrentAuctionPlayer` behavior:

**Task 1 — dom-observers.ts:** Rewrote the observer setup to be resilient against ESPN DOM replacement:
- Added `pollingInterval` (2s) calling `checkCurrentPlayer()` as a polling fallback; the existing 200ms debounce inside `checkCurrentPlayer` prevents duplicate emissions
- Added `reAnchorInterval` (5s) that checks `document.contains(observedNode)` — if the container was replaced by ESPN's React reconciler, finds the new container and re-attaches the observer
- Replaced restrictive `attributeFilter: ["class", "data-player-id", "data-bid"]` with `attributes: false` (we have polling fallback; the filter was silently dropping most mutations)
- Added `characterData: true` so text content changes (bid amount updates) trigger the observer
- Updated cleanup function to clear both intervals (`clearInterval(pollingInterval)`, `clearInterval(reAnchorInterval)`) in addition to disconnecting the observer

**Task 2 — content.tsx:** Moved the entire `if (resolvedDraftFormat === "auction")` observer-setup block (previously at line 817) to after `refreshAssistantData()` (previously line 874). The initial refresh triggers DOM scraping which can cause ESPN to re-render, making any observer anchored before the refresh watch a detached node.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `packages/extension/lib/dom-observers.ts` modified — FOUND
- [x] `packages/extension/entrypoints/content.tsx` modified — FOUND
- [x] Commit 236656d exists (Task 1)
- [x] Commit 6052020 exists (Task 2)
- [x] `pnpm --filter extension build` passes with no TypeScript errors

## Self-Check: PASSED
