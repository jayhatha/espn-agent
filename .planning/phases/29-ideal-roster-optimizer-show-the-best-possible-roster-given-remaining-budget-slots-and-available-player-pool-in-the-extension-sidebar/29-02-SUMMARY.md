---
phase: 29-ideal-roster-optimizer
plan: 02
subsystem: extension-ui
tags: [ideal-roster, tier-badges, collapsible-panel, engine-insights, sidebar-ui]
dependency_graph:
  requires:
    - packages/extension/lib/engine/types.ts (IdealRosterSignal, IdealRosterPlayer types)
    - packages/extension/lib/engine/index.ts (DraftEngineSignals.idealRoster populated in Plan 01)
    - packages/extension/components/ShoppingList.tsx (placement reference: IdealRosterPanel goes after)
    - packages/extension/components/EngineInsights.tsx (host component for integration)
  provides:
    - IdealRosterPanel component (self-contained collapsible panel)
    - EngineInsights.tsx integration rendering idealRoster signal
  affects:
    - packages/extension/components/EngineInsights.tsx (added IdealRosterPanel import and render)
tech_stack:
  added: []
  patterns:
    - details/summary collapsible pattern matching existing EngineInsights sections
    - tier badge color system (anchor=warning, core=info, value=surface-tertiary)
    - locked player visual distinction via text-content-secondary + bullet marker
    - null/empty early return guard before rendering
key_files:
  created:
    - packages/extension/components/IdealRosterPanel.tsx
  modified:
    - packages/extension/components/EngineInsights.tsx
decisions:
  - "IdealRosterPanel.tsx placed between Shopping List and League Analysis — actionable plan flows naturally before league dynamics"
  - "Tier summary built as helper function buildTierSummary() omitting zero counts — only non-zero tiers appear in summary line"
  - "Locked players show text-content-secondary (dimmed) with a bullet marker rather than strikethrough — visually distinct without aggressive styling"
  - "Total SGP and budget used shown as muted footer metadata line — quantitative summary for users who want it without dominating the panel"
  - "Tier badges use design token classes matching EngineInsights pattern — bg-warning-light/text-warning, bg-info-light/text-info, bg-surface-tertiary/text-content-secondary"
metrics:
  duration: 1min
  completed: 2026-03-07
  tasks_completed: 1
  files_modified: 2
---

# Phase 29 Plan 02: IdealRosterPanel UI Component and EngineInsights Integration Summary

Collapsed tier-badge panel for ideal roster display: IdealRosterPanel component with anchor/core/value pills, locked-player dimming, tier count summary, and SGP/budget footer; integrated into EngineInsights sidebar between Shopping List and League Analysis.

## What Was Built

**Task 1 — IdealRosterPanel.tsx (created) and EngineInsights.tsx (updated)**

**A. IdealRosterPanel.tsx (93 lines)**

Self-contained collapsible React component following the exact `<details className="group">` pattern used by existing EngineInsights sections:

- **Early return null** when `idealRoster` is null or `idealRoster.players.length === 0` — section hidden when no data
- **Summary line** shows "Ideal Roster" label and tier count string (e.g. "2 anchors + 5 core + 11 value") via `buildTierSummary()` helper that omits zero-count tiers
- **Player rows** map over `idealRoster.players` with:
  - Tier badge: small pill using design token classes (`bg-warning-light text-warning` for anchor, `bg-info-light text-info` for core, `bg-surface-tertiary text-content-secondary` for value)
  - Player name: `font-semibold text-content` for undrafted, `text-content-secondary` for locked players — visually distinct
  - Dollar value: right-aligned `text-content-secondary` formatted as `$XX`
- **Unfilled slots notice**: muted line when `unfilledSlots > 0`
- **SGP + budget footer**: `totalSGPValue.toFixed(1) projected SGP · $budgetUsed budget used`
- Collapsed by default — no `open` attribute on `<details>`

**B. EngineInsights.tsx (updated)**

- Added `import IdealRosterPanel from "./IdealRosterPanel"`
- Destructured `idealRoster` from `engineSignals` alongside existing fields
- Rendered `<IdealRosterPanel idealRoster={idealRoster} />` between ShoppingList and League Analysis sections

## Verification Results

1. `npx tsc --noEmit -p packages/extension/tsconfig.json` — no errors in IdealRosterPanel.tsx or EngineInsights.tsx
2. `IdealRosterPanel.tsx` exists at `packages/extension/components/IdealRosterPanel.tsx` (93 lines)
3. `EngineInsights.tsx` imports and renders IdealRosterPanel at line 4 (import) and line 140 (render)
4. `<details className="group">` with no `open` attribute — collapsed by default
5. Tier badges use anchor/core/value with `bg-warning-light text-warning`, `bg-info-light text-info`, `bg-surface-tertiary text-content-secondary`
6. Locked players: `text-content-secondary` vs undrafted `font-semibold text-content`
7. Summary line renders tier count string from `buildTierSummary()` (omits zero counts)
8. Returns null when idealRoster is null or players.length === 0

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `packages/extension/components/IdealRosterPanel.tsx` — FOUND (created, 93 lines, exports default function)
- `packages/extension/components/EngineInsights.tsx` — FOUND (modified, imports and renders IdealRosterPanel)
- Commit b1b4e6d — Task 1 commit (both files)
