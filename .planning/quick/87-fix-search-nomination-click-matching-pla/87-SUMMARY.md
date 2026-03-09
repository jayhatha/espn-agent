---
phase: "87"
plan: "01"
subsystem: extension
tags: [auto-nominate, search-dropdown, espn-dom, nomination-flow]
dependency_graph:
  requires: []
  provides: [searchAndNominate-dropdown-click]
  affects: [auto-bid-controller]
tech_stack:
  added: []
  patterns: [recursive-setTimeout-polling, ESPN-search-dropdown-matching]
key_files:
  created: []
  modified:
    - packages/extension/lib/auto-bid-controller.ts
decisions:
  - "Poll with recursive setTimeout (not setInterval) for clean termination at 2s timeout"
  - "ESPN ID match preferred over name match for reliability when playerId is available"
  - "300ms initial delay before first poll to give ESPN time to open dropdown"
  - "1500ms clear delay (vs 500ms nominate delay) so clear doesn't race with nomination"
metrics:
  duration: "4 minutes"
  completed: "2026-03-09"
  tasks: 1
  files: 1
---

# Phase 87 Plan 01: Fix Search Nomination Click Matching Player Summary

**One-liner:** Rewrote searchAndNominate to click ESPN search dropdown buttons (`.player--search--match`) matched by ESPN player ID or name instead of polling for table `button[data-player-id]` elements that never appear in search results.

## What Was Built

The `searchAndNominate` method in `auto-bid-controller.ts` previously typed a search term into ESPN's player search box, then waited 1200ms and looked for a `button[data-player-id]` element in the player table. This approach was broken because ESPN renders search results as a dropdown (`.player--search--matches`) with `button.player--search--match` elements — the table buttons the old code looked for never appear in search context.

The fix replaces the post-typing logic with a polling strategy:

1. After typing, poll every 200ms (up to 2000ms) for the `.player--search--matches` dropdown container
2. Once the dropdown appears with `button.player--search--match` elements, find the correct button:
   - Primary: `data-player-search-playerid` attribute matching the ESPN player ID
   - Fallback: `data-player-search-playername` attribute matched case-insensitively via `normalizeName`
3. Click the match button, then after 500ms call `clickNominateButton` for the confirmation
4. After 1500ms, call `clearPlayerSearch` to reset the input
5. On timeout (no match after 2s): log warning, increment attempts, clear search

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check

### Files Created
- `.planning/quick/87-fix-search-nomination-click-matching-pla/87-SUMMARY.md` — FOUND

### Commits
- `00835ab` fix(quick-87): click ESPN search dropdown match instead of table button in searchAndNominate — FOUND

## Self-Check: PASSED
