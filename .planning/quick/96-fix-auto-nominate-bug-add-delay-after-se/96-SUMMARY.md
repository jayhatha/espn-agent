---
phase: 96-fix-auto-nominate-bug
plan: "01"
subsystem: extension
tags: [auto-nominate, timing, chrome-extension]
dependency_graph:
  requires: []
  provides: [tuned-search-timing]
  affects: [auto-bid-controller]
tech_stack:
  added: []
  patterns: [setTimeout-settle-delay, diagnostic-logging]
key_files:
  modified:
    - packages/extension/lib/auto-bid-controller.ts
decisions:
  - SEARCH_INITIAL_DELAY_MS set to 500ms (up from hardcoded 300ms) to give ESPN's async search more time before polling begins
  - SEARCH_DROPOUT_TIMEOUT_MS increased to 3000ms (up from 2000ms) for slower network/rendering conditions
  - SEARCH_MATCH_SETTLE_MS introduced at 150ms — short settle after dropdown appears before clicking to ensure DOM is fully interactive
metrics:
  duration: 5m
  completed: 2026-03-22
  tasks: 1
  files: 1
---

# Quick Task 96: Fix Auto-Nominate Bug — Add Delay After Search

**One-liner:** Increased ESPN search dropdown timing constants and added 150ms settle delay before clicking the match button to fix nomination failures.

## What Was Done

The auto-nominate flow in `auto-bid-controller.ts` was failing because:
1. The 300ms initial delay before polling was too short for ESPN's async search to respond.
2. Once the dropdown appeared and match buttons were found, the match button was clicked immediately with no settle time — risky when the DOM may not be fully interactive yet.

### Changes Made

**Timing constants (lines 112-121):**
- `SEARCH_DROPDOWN_TIMEOUT_MS`: `2000` → `3000` — gives ESPN more time to render results
- `SEARCH_INITIAL_DELAY_MS`: new constant, `500` — replaces hardcoded `300` on the initial poll start
- `SEARCH_MATCH_SETTLE_MS`: new constant, `150` — settle delay before clicking match button

**Settle delay before click:**
The match button click (and all follow-up logic) is now wrapped in a `setTimeout(..., SEARCH_MATCH_SETTLE_MS)`. This ensures the DOM is fully interactive before the click is dispatched.

**Diagnostic logging:**
- First-poll log: `[AutoNominate] First poll: dropdown=..., matchButtons=...`
- Enhanced timeout warning includes dropdown visibility and live match button count for easier debugging.

**Hardcoded value removed:**
`setTimeout(() => pollForDropdown(0), 300)` replaced with `AutoBidController.SEARCH_INITIAL_DELAY_MS`.

## Verification

- `pnpm --filter extension build` — passed, 0 TypeScript errors
- `SEARCH_INITIAL_DELAY_MS`, `SEARCH_MATCH_SETTLE_MS`, `SEARCH_DROPDOWN_TIMEOUT_MS` all present in source
- No hardcoded `300` for initial poll delay remains
- First-poll diagnostic log confirmed

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Increase search timing constants and add settle delay | b3b5787 | packages/extension/lib/auto-bid-controller.ts |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- [x] `packages/extension/lib/auto-bid-controller.ts` modified with all required changes
- [x] Commit b3b5787 exists
- [x] Extension build passes cleanly
