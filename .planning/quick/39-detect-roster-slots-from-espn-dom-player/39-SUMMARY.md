---
phase: quick-39
plan: 01
subsystem: extension
tags: [dom-detection, roster-slots, draft-engine, zustand]
dependency_graph:
  requires: []
  provides: [detectRosterSlotsFromPlayersTable, detectedRosterSlots, DraftEngineInput.rosterSlots]
  affects: [draft-config-detector, draft-state, engine/types, engine/index, use-draft-engine, content]
tech_stack:
  added: []
  patterns: [DOM table row parsing, Zustand persist partialize, optional engine input with fallback]
key_files:
  created: []
  modified:
    - packages/extension/lib/draft-config-detector.ts
    - packages/extension/lib/draft-state.ts
    - packages/extension/lib/engine/types.ts
    - packages/extension/lib/engine/index.ts
    - packages/extension/lib/use-draft-engine.ts
    - packages/extension/entrypoints/content.tsx
decisions:
  - "detectRosterSlotsFromPlayersTable queries .ResponsiveTable.players-table with fallback to .players-table — handles ESPN responsive layout variants"
  - "2B/SS -> MI and 1B/3B -> CI label mapping aligns with engine DEFAULT_ROSTER_SLOTS key convention"
  - "BE slots counted separately as benchCount, excluded from rosterSlots — bench doesn't participate in SGP or bid optimization"
  - "detectedRosterSlots not cleared in initializeDraft — roster config doesn't change mid-draft, persisting avoids re-detection on re-init"
  - "3-second retry in content.tsx because players-table may render after document_idle when ESPN loads progressively"
  - "activeSlots = input.rosterSlots ?? DEFAULT_ROSTER_SLOTS in computeRosterOptimization — single fallback point, all 4 internal uses replaced"
  - "detectedRosterSlots in useMemo deps — engine recomputes when slots first detected (null -> slots transition)"
metrics:
  duration: 4min
  completed: 2026-03-05
  tasks: 2
  files: 6
---

# Quick Task 39: Detect Roster Slots from ESPN DOM players-table Summary

Dynamic roster slot detection from ESPN's players-table DOM, stored in Zustand, threaded through all draft engine computations (SGP vectors, opponent model, bid optimizer, remaining slots) with fallback to hardcoded DEFAULT_ROSTER_SLOTS.

## What Was Built

### detectRosterSlotsFromPlayersTable() (draft-config-detector.ts)

New exported function that:
- Queries `.ResponsiveTable.players-table` with fallback to `.players-table`
- Reads `<div title="...">` from the first `<td>` of each `<tbody tr>`
- Maps ESPN slot labels: `2B/SS` -> `MI`, `1B/3B` -> `CI`, `BE` -> benchCount (excluded from rosterSlots)
- Returns `{ rosterSlots: Record<string, number>; benchCount: number } | null`
- Logs detection result with full slot breakdown

### Zustand Store (draft-state.ts)

- Added `detectedRosterSlots: Record<string, number> | null` to `DraftState` interface
- Initial value: `null`
- `setDetectedRosterSlots(slots)` action
- Included in `partialize` so it persists across page reloads (roster config stable mid-draft)
- Reset to `null` in `reset()`, but NOT cleared in `initializeDraft()` per spec

### Engine Input Type (engine/types.ts)

- Added `rosterSlots?: Record<string, number>` optional field to `DraftEngineInput`
- Positioned after `rosterSize` field with explanatory comment

### Engine Consumption (engine/index.ts)

- Derives `const activeSlots = input.rosterSlots ?? DEFAULT_ROSTER_SLOTS` at top of `computeRosterOptimization`
- Replaces all 4 `DEFAULT_ROSTER_SLOTS` references inside the function with `activeSlots`:
  - `activeTotal` warning check
  - `buildSGPVectors(... activeSlots ...)`
  - `buildOpponentModel(... activeSlots ...)`
  - `const remainingSlots = { ...activeSlots }`
- `DEFAULT_ROSTER_SLOTS` constant preserved as module-level fallback

### Hook and Content Script

- `use-draft-engine.ts`: reads `detectedRosterSlots` from store, passes as `rosterSlots: detectedRosterSlots ?? undefined`, adds to `useMemo` deps
- `content.tsx`: calls `detectRosterSlotsFromPlayersTable()` at page load and in a 3-second retry (for progressively-loaded ESPN DOM), stores in Zustand via `setDetectedRosterSlots`

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | `150d26e` | DOM detector, Zustand field, engine input type |
| Task 2 | `aa15127` | Engine consumption, hook wiring, content script |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- TypeScript: All errors pre-existing (no new errors introduced by this task)
- Tests: 87/87 passing (`pnpm --filter extension test -- --run`)
- `DEFAULT_ROSTER_SLOTS` references in `engine/index.ts`: only constant declaration (line 32) and single fallback assignment (line 128)
- `detectRosterSlotsFromPlayersTable` exported from `draft-config-detector.ts`
- `detectedRosterSlots` in Zustand `partialize` — persists across reloads

## Self-Check: PASSED

- `/Users/jay-work/Code/espn-agent/packages/extension/lib/draft-config-detector.ts` — FOUND (contains `detectRosterSlotsFromPlayersTable`)
- `/Users/jay-work/Code/espn-agent/packages/extension/lib/draft-state.ts` — FOUND (contains `detectedRosterSlots`)
- `/Users/jay-work/Code/espn-agent/packages/extension/lib/engine/types.ts` — FOUND (contains `rosterSlots?`)
- `/Users/jay-work/Code/espn-agent/packages/extension/lib/engine/index.ts` — FOUND (contains `activeSlots`, `input.rosterSlots`)
- `/Users/jay-work/Code/espn-agent/packages/extension/lib/use-draft-engine.ts` — FOUND (contains `detectedRosterSlots`)
- `/Users/jay-work/Code/espn-agent/packages/extension/entrypoints/content.tsx` — FOUND (contains `detectRosterSlotsFromPlayersTable`, `setDetectedRosterSlots`)
- Commit `150d26e` — FOUND
- Commit `aa15127` — FOUND
