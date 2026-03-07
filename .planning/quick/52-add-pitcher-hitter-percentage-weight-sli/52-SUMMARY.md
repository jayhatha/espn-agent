---
phase: "52"
plan: 01
type: quick
subsystem: extension-engine
tags: [auction-draft, optimizer, slider, preferences, sgp]
dependency_graph:
  requires: []
  provides:
    - pitcherHitterSplit preference state (persisted)
    - SGP split multiplier in draft engine
    - Hit/Pitch slider UI in DraftSidebar
  affects:
    - packages/extension/lib/engine/index.ts (optimizer, simulation, ideal roster)
    - packages/extension/components/DraftSidebar.tsx (slider UI)
tech_stack:
  added: []
  patterns:
    - Zustand persisted preference with chrome.storage.local
    - SGP multiplier applied after cache, before all optimizer calls
    - String-keyed cache invalidation for split-aware recomputation
key_files:
  created: []
  modified:
    - packages/extension/lib/draft-state.ts
    - packages/extension/lib/engine/types.ts
    - packages/extension/lib/engine/index.ts
    - packages/extension/lib/use-draft-engine.ts
    - packages/extension/components/DraftSidebar.tsx
decisions:
  - Apply split multiplier to adjustedSgpValuesOpt (not the cached base), preserving SGP cache integrity
  - Use string-keyed idealRosterCacheKey (changed from number) to include split value
  - Clamp slider UI to 20-80 range, store accepts 0-100 for API flexibility
  - pitcherHitterSplit not included in reset() since it is a user preference, not draft session data
metrics:
  duration: "~8 minutes"
  completed: "2026-03-07"
  tasks_completed: 2
  files_modified: 5
---

# Quick Task 52: Add Pitcher/Hitter Percentage Weight Slider Summary

**One-liner:** Persisted 0-100 slider controlling hit/pitch SGP multiplier (default 65/35) wired through Zustand into all optimizer, simulation, and ideal roster calls.

## What Was Built

A pitcher/hitter budget allocation preference slider that lets users express draft philosophy (e.g., "spend more on hitting") and have all engine outputs reflect it.

The slider (20-80 range in UI, 0-100 in store) maps to SGP multipliers: hitters get `split/50` and pitchers get `(100-split)/50`. At the default 65/35 split, hitters receive a 1.3x boost and pitchers a 0.7x weight.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add pitcherHitterSplit to state, types, and engine | 1c82725 | draft-state.ts, types.ts, index.ts, use-draft-engine.ts |
| 2 | Add pitcher/hitter split slider UI to DraftSidebar | 84d15fc | DraftSidebar.tsx |

## Key Changes

### draft-state.ts
- Added `pitcherHitterSplit: number` field (default 65) to DraftState interface
- Added `setPitcherHitterSplit: (split: number) => void` action with clamping to 0-100
- Added `pitcherHitterSplit` to `partialize` for chrome.storage.local persistence
- Not added to `reset()` — it is a user preference, not draft-session data

### engine/types.ts
- Added `pitcherHitterSplit?: number` to `DraftEngineInput` with JSDoc explaining the multiplier math

### engine/index.ts
- Computes `splitValue`, `hitterMultiplier = split/50`, `pitcherMultiplier = (100-split)/50`
- Creates `adjustedSgpValuesOpt` by mapping split multiplier over base SGP values per player type
- Uses `adjustedSgpValuesOpt` for: `computeRosterOptimization`, `simulateFullDraft`, `compareDecisions` (bid/pass + draft targets), `recommendNomination` (available SGPs), `computeIdealRoster`
- Updated cache keys: `bidCacheKey` includes `pitcherHitterSplit`, `simulationCacheKey` includes `splitValue`, `idealRosterCacheKey` changed from `number` to `string` to include `splitValue`
- Base `sgpValuesOpt` (the cached SGP vectors) is NOT modified — only the per-call adjusted copy

### use-draft-engine.ts
- Reads `pitcherHitterSplit` from `useDraftStore`
- Passes it into `computeDraftEngine` as `pitcherHitterSplit`
- Added to `useMemo` dependency array for reactive recomputation

### DraftSidebar.tsx
- Reads `pitcherHitterSplit` and `setPitcherHitterSplit` from `useDraftStore`
- Renders compact slider in Draft Status section (auction mode only)
- Shows "Hit/Pitch Split" label + current ratio (e.g., "65/35")
- Range input min=20, max=80 with `accent-accent` styling
- Labels: "Pitch" on left, "Hit" on right

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- TypeScript compiles without new errors: confirmed (all pre-existing errors unchanged)
- `pitcherHitterSplit` flows from Zustand store through `DraftEngineInput` into `computeDraftEngine`
- SGP multiplier math: at split=65, hitters get 1.3x, pitchers get 0.7x; at split=50, both get 1.0x
- Cache keys include split value so slider changes trigger engine recomputation
- Preference persists across reloads via chrome.storage.local partialize

## Self-Check: PASSED

Files modified:
- FOUND: packages/extension/lib/draft-state.ts (pitcherHitterSplit at lines 68, 147, 297, 362)
- FOUND: packages/extension/lib/engine/types.ts (pitcherHitterSplit at line 111)
- FOUND: packages/extension/lib/engine/index.ts (splitValue, adjustedSgpValuesOpt, updated cache keys)
- FOUND: packages/extension/lib/use-draft-engine.ts (pitcherHitterSplit passed to engine)
- FOUND: packages/extension/components/DraftSidebar.tsx (slider UI rendered in Draft Status section)

Commits:
- 1c82725: feat(52-01): add pitcherHitterSplit to state, types, and engine logic
- 84d15fc: feat(52-02): add pitcher/hitter split slider UI to DraftSidebar
