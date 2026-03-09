---
phase: "88"
plan: "01"
subsystem: "extension/auto-bid-controller"
tags: ["extension", "queue", "search", "espn-dom", "autopilot"]
dependency_graph:
  requires: []
  provides: ["searchAndQueue", "search-based queue population"]
  affects: ["populateQueue", "NominationDiagnostics"]
tech_stack:
  added: []
  patterns: ["recursive-setTimeout polling", "Promise wrapping async DOM interaction", "React-compatible input events"]
key_files:
  modified:
    - packages/extension/lib/auto-bid-controller.ts
decisions:
  - "TARGET_QUEUE_SIZE set to 3 (was MAX_QUEUE_SIZE = 10) — keep a small tight queue of top targets"
  - "searchAndQueue is separate from searchAndNominate — no clickNominateButton call, just Queue click"
  - "Sequential processing — await each searchAndQueue call in the candidate loop, no parallelism"
metrics:
  duration: "5 minutes"
  completed: "2026-03-09"
  tasks_completed: 1
  files_modified: 1
---

# Quick Task 88: Keep 3 Players in ESPN Queue (Search-and-Queue)

One-liner: Search-based ESPN queue population — when queue has fewer than 3 players, uses the search bar to find and queue top engine candidates not visible in the table.

## What Was Built

Extended `populateQueue()` in `auto-bid-controller.ts` with a search-bar fallback so the extension can queue players that aren't visible in the ESPN player table. Previously, if a top engine candidate wasn't rendered in the DOM table, `populateQueue()` would skip them. Now it falls through to `searchAndQueue()` which uses the same search-bar DOM interaction pattern as `searchAndNominate()` but for queueing instead of nominating.

### Changes Made

**A. TARGET_QUEUE_SIZE = 3** (renamed from MAX_QUEUE_SIZE = 10)

The queue threshold was lowered from 10 to 3. The extension now targets a tighter queue of top candidates rather than bulk-queuing.

**B. populateQueue() made async**

Required to properly await sequential `searchAndQueue()` calls. Callers don't await it, so this is backward-compatible.

**C. searchAndQueue() method added**

`private searchAndQueue(candidateName: string, playerId: number): Promise<boolean>`

Flow:
1. Finds the search input (`.playersSearch input.form__control, input[placeholder="Player Name"]`)
2. Uses last name as search term
3. Focuses and types via React-compatible nativeInputValueSetter + InputEvent/change/keyup dispatch
4. Polls for `.player--search--matches` dropdown (300ms initial delay, 200ms poll interval, 2000ms max)
5. Matches by `data-player-search-playerid` attribute first, then normalized name fallback
6. Clicks the match button, waits 500ms for ESPN to process
7. Looks for `button[data-player-id="${playerId}"]` with text containing "queue"
8. Clicks Queue button, calls `clearPlayerSearch()`, waits 500ms, resolves `true`
9. On any failure (no search input, no dropdown match, no queue button): clears search, resolves `false`

**D. populateQueue() fallback wired in**

In the candidate loop, when `button` is `null` (player not visible in table):
- Calls `await this.searchAndQueue(candidate.name, playerId)`
- If returns `true`: adds to `queuedPlayerIds`, increments `queued`, adds 500ms gap before next iteration
- Always `continue` to next candidate after the search attempt

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- TypeScript compiles — the only errors in `auto-bid-controller.ts` (line 1310, `rank` possibly undefined) are pre-existing and unrelated to this change
- `populateQueue()` is now `async` and calls `searchAndQueue` when button not found
- `searchAndQueue` returns `Promise<boolean>` and handles full search-click-queue-clear cycle
- `TARGET_QUEUE_SIZE` (renamed from `MAX_QUEUE_SIZE`) is set to 3
- No calls to `clickNominateButton` from `searchAndQueue`
- `clearPlayerSearch()` is called after every search attempt (success or failure)

## Self-Check: PASSED

Files created/modified:
- FOUND: packages/extension/lib/auto-bid-controller.ts

Commits:
- FOUND: ebeca59 (feat(quick-88): add searchAndQueue method and search-based queue population)
