---
phase: 37-app-performance-audit
plan: "05"
subsystem: extension
tags: [performance, dom-observers, mutation-observer, caching, extension]
dependency_graph:
  requires: []
  provides: [narrowed-dom-observers, cached-ranking-maps]
  affects: [packages/extension/lib/dom-observers.ts, packages/extension/lib/api-client.ts]
tech_stack:
  added: []
  patterns: [module-level-cache, narrowed-mutation-observer, hash-invalidation]
key_files:
  modified:
    - packages/extension/lib/dom-observers.ts
    - packages/extension/lib/api-client.ts
decisions:
  - "Bootstrap observer tries narrow ESPN draft containers before falling back to document.body"
  - "Removed setInterval from observeCurrentAuctionPlayer — MutationObserver with 200ms debounce is sufficient"
  - "Rankings hash uses list lengths as fast change detector since bundled rankings are static per-session"
metrics:
  duration: "2 minutes"
  completed: "2026-03-10"
  tasks: 2
  files_modified: 2
---

# Phase 37 Plan 05: Extension DOM Performance Fixes Summary

Extension DOM performance issues causing lockups: narrowed overly-broad MutationObservers to ESPN-specific containers, eliminated the redundant 2-second setInterval in auction player observer, increased periodic scan from 2s to 5s, and cached PitcherList ranking Maps at module level with O(1) last-name fallback index.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Narrow bootstrap observer target, eliminate duplicate auction player polling (E-01, E-02) | 2fccd57 | packages/extension/lib/dom-observers.ts |
| 2 | Cache PitcherList ranking lookup maps (E-03) | 771aeac | packages/extension/lib/api-client.ts |

## Changes Made

### Task 1: dom-observers.ts (E-01, E-02)

**E-01 — Bootstrap observer narrowed:**
- `observeDraftBoard` now queries for ESPN draft containers (`.draft-board`, `[class*="DraftBoard"]`, `.players-table`, `[class*="playersTable"]`, `#draft-content`) before falling back to `document.body`
- Periodic DOM scan interval increased from 2000ms to 5000ms

**E-02 — Duplicate polling removed from `observeCurrentAuctionPlayer`:**
- Removed `setInterval(checkCurrentPlayer, 2000)` and `clearInterval(periodicCheck)` from cleanup
- MutationObserver with 200ms debounce is sufficient for tracking the auction player
- Auction observer also attempts narrower container (`[class*="auction"]`, `[class*="Auction"]`, `.player-card`) before falling back to `document.body`

### Task 2: api-client.ts (E-03)

**E-03 — Ranking maps cached at module level:**
- Added 5 module-level variables: `cachedPitcherMap`, `cachedHitterMap`, `cachedRelieverMap`, `cachedLastNameIndex`, `cachedRankingsHash`
- Maps are built once on first call; hash (`pitchers.length-hitters.length-relievers.length`) detects data changes
- Pre-built last-name fallback index (`cachedLastNameIndex`) replaces three O(n) `for...of` loops with a single `Map.get()` call

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `packages/extension/lib/dom-observers.ts` modified with bootstrap target narrowing and 5000ms interval
- [x] `packages/extension/lib/api-client.ts` modified with `cachedPitcherMap` module-level cache
- [x] Commit 2fccd57 exists (Task 1)
- [x] Commit 771aeac exists (Task 2)
- [x] No `setInterval(..., 2000)` in `observeCurrentAuctionPlayer`
- [x] `cachedLastNameIndex.get()` replaces `for...of` loops in last-name fallback

## Self-Check: PASSED
