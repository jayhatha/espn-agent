---
phase: "62"
plan: "01"
subsystem: extension
tags: [bug-fix, ideal-roster, persist, reload, cross-validation]
dependency_graph:
  requires: []
  provides: [validMyRoster-filter]
  affects: [computeIdealRoster, IdealRosterSignal]
tech_stack:
  added: []
  patterns: [cross-validation-before-loop, set-lookup-with-fallback]
key_files:
  modified:
    - packages/extension/lib/engine/index.ts
decisions:
  - "Use allPicks as single source of truth for what is actually drafted; myRoster from persist is treated as unverified"
  - "Match on playerId first (exact, O(1)); fall back to normalizedName for id=0 edge case"
  - "Empty allPicks intentionally produces empty validMyRoster — correct pre-draft state"
metrics:
  duration: "4 minutes"
  completed: "2026-03-07"
---

# Quick Task 62: Fix Phantom Locked-In Players After Reload — Summary

Cross-validate myRoster against allPicks inside computeIdealRoster() to eliminate phantom drafted players that appear after page reload due to stale chrome.storage.local persist state.

## What Was Done

Added a `validMyRoster` filter directly before the draftedPlayers loop in `computeIdealRoster()` (packages/extension/lib/engine/index.ts). The filter discards any `myRoster` entry that has no corroborating record in `allPicks`.

The root cause: after page reload, Zustand persist restores `myRoster` from `chrome.storage.local`. A separate team ID mismatch bug (team name vs. team number) prevents `myRoster` from being re-populated correctly from the freshly parsed DOM, but the stale persisted entries remain. `computeIdealRoster()` was unconditionally trusting `myRoster`, marking those ghost entries as `isDrafted: true`.

`allPicks` is rebuilt from the ESPN draft DOM on every reload — it is not subject to the team ID mismatch and is the authoritative source.

## Changes

`packages/extension/lib/engine/index.ts`

Before the `draftedSlotMap` loop (was line 491), added:

```typescript
const allPicksNormalizedNames = new Set(
  input.allPicks.map(p => normalizeName(p.playerName))
);
const allPicksPlayerIds = new Set(
  input.allPicks.filter(p => p.playerId > 0).map(p => p.playerId)
);
const validMyRoster = input.myRoster.filter(drafted => {
  if (drafted.playerId > 0 && allPicksPlayerIds.has(drafted.playerId)) return true;
  if (allPicksNormalizedNames.has(normalizeName(drafted.playerName))) return true;
  return false;
});
```

Changed `for (const drafted of input.myRoster)` to `for (const drafted of validMyRoster)`.

## Verification

- Build: `pnpm --filter @espn-agent/extension build` — exit 0, no TypeScript errors.
- Tests: `pnpm --filter @espn-agent/extension test` — 119 tests passed (10 test files).

## Commits

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Cross-validate myRoster against allPicks in computeIdealRoster | d276475 |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- File modified: `packages/extension/lib/engine/index.ts` — FOUND
- Commit d276475 — FOUND
- `validMyRoster` filter exists in computeIdealRoster() — CONFIRMED
- Loop iterates over `validMyRoster` not `input.myRoster` — CONFIRMED
