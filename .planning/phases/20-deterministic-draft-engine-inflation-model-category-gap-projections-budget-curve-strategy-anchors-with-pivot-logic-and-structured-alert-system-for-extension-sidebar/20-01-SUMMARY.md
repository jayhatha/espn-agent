---
phase: 20-deterministic-draft-engine
plan: 01
subsystem: extension
tags: [draft-engine, inflation, scarcity, category-gap, budget-curve, alerts, zustand]
dependency_graph:
  requires:
    - packages/extension/lib/draft-state.ts
    - packages/extension/entrypoints/content.tsx
    - packages/shared/src/formulas.ts (calculateCategorySGP, calculateFinalRate)
  provides:
    - packages/extension/lib/engine/index.ts (computeDraftEngine orchestrator)
    - packages/extension/lib/engine/types.ts (DraftEngineInput, DraftEngineSignals)
    - packages/extension/lib/engine/inflation.ts (computeInflation)
    - packages/extension/lib/engine/scarcity.ts (computeEnhancedScarcity)
    - packages/extension/lib/engine/category-gap.ts (computeCategoryGaps)
    - packages/extension/lib/engine/budget-curve.ts (computeBudgetCurve)
    - packages/extension/lib/engine/alerts.ts (generateAlerts)
  affects:
    - Phase 20 Plan 02 (UI integration of engine signals in sidebar)
tech_stack:
  added: []
  patterns:
    - Pure function engine modules with no side effects
    - Zustand state extensions for engine inputs
    - Severity threshold > 0.65 for alert generation
key_files:
  created:
    - packages/extension/lib/engine/types.ts
    - packages/extension/lib/engine/inflation.ts
    - packages/extension/lib/engine/scarcity.ts
    - packages/extension/lib/engine/category-gap.ts
    - packages/extension/lib/engine/budget-curve.ts
    - packages/extension/lib/engine/alerts.ts
    - packages/extension/lib/engine/index.ts
  modified:
    - packages/extension/lib/draft-state.ts
    - packages/extension/entrypoints/content.tsx
decisions:
  - "All engine functions are pure with no Zustand reads or DOM access — testable in isolation"
  - "allTeamBudgets persisted in Zustand partialize for reload survivability; leagueCategories not persisted (set fresh from config detection every page load)"
  - "Inflation clamped 0.5-2.0 per Phase 11 locked decision"
  - "Severity threshold 0.65 for all alert types per CONTEXT.md locked decision"
  - "computeEnhancedScarcity sorts rankings by VBD descending to avoid trust in incoming sort order"
  - "Budget fallback: if allTeamBudgets empty, estimate from pick costs and myRemainingBudget * totalTeams"
metrics:
  duration: 5min
  completed: 2026-03-04
  tasks_completed: 2
  files_created: 7
  files_modified: 2
---

# Phase 20 Plan 01: Deterministic Draft Engine Core Summary

**One-liner:** Four pure-function engine models (inflation, scarcity, category-gap, budget-curve) plus alert generator in `packages/extension/lib/engine/` with Zustand store extensions to feed all-team budget and category data.

## What Was Built

### Task 1: Zustand Store Extensions

Extended `draft-state.ts` with two new fields:
- `allTeamBudgets: Array<{ teamName: string; remainingBudget: number }>` — populated every 5 seconds from `detectAllTeamBudgets()` DOM scraping in the pick train. Persisted across reloads so inflation model has data on page refresh.
- `leagueCategories: Category[]` — set from detected or fallback league config immediately after `initializeDraft()`. Not persisted (re-detected fresh each page load from ESPN DOM).

Updated `content.tsx`:
- `startPickTrainBudgetPolling`: calls `detectAllTeamBudgets()` in every 5s tick (not just DEV), stores results via `setAllTeamBudgets()`
- After `initializeDraft()`: calls `setLeagueCategories(cachedLeagueConfig.categories)`

### Task 2: Engine Files (7 new files)

**`types.ts`** — All interfaces: `InflationSignal`, `EnhancedScarcitySignal`, `CategoryGapSignal`, `BudgetCurveSignal`, `DraftAlert`, `DraftEngineInput`, `DraftEngineSignals`

**`inflation.ts`** — `computeInflation()`: Uses live DOM-scraped `allTeamBudgets` as primary source, falls back to pick cost estimates. Formula: `remaining_budget / remaining_projected_value`. Clamped 0.5-2.0. Confidence "low" when < 20 valued players remain.

**`scarcity.ts`** — `computeEnhancedScarcity()`: Sorts rankings by VBD descending (independent of input sort). For each position: computes supply (top-tier undrafted), demand (teams still needing position), tier drop value (VBD gap to next tier), scarcity index (60% demand/supply + 40% tier drop, normalized 0-1).

**`category-gap.ts`** — `computeCategoryGaps()`: Uses `calculateCategorySGP` and `calculateFinalRate` from shared package. For rate stats: sums components across roster then computes rate (never averages rates directly). Returns z-score gap and category risk score (0-1) per category.

**`budget-curve.ts`** — `computeBudgetCurve()`: Computes optimal remaining spend curve, budget pressure ratio, pacing status (ahead/on-track/behind at ±5%), and max bid recommendation (min of: 110% of inflation-adjusted value, 35% of usable budget, full usable budget).

**`alerts.ts`** — `generateAlerts()`: Generates `DraftAlert[]` from all signals. Only surfaces alerts with severity > 0.65. Five alert types: inflation, scarcity, category_gap, budget, tier_break. Sorted by severity descending.

**`index.ts`** — `computeDraftEngine()`: Orchestrates all four models. Builds `rankingsMap` for O(1) lookups. Warns to console if compute exceeds 300ms. Re-exports all public types.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] All 7 engine files exist in `packages/extension/lib/engine/`
- [x] `draft-state.ts` has `allTeamBudgets` and `leagueCategories` fields and setters
- [x] `content.tsx` populates both fields (budgets from polling, categories from config)
- [x] `grep -r "useDraftStore" engine/` returns zero results (all functions are pure)
- [x] `computeDraftEngine` exported from index.ts, accepts `DraftEngineInput`, returns `DraftEngineSignals`
- [x] TypeScript: zero errors from engine files; one pre-existing partialize type error in draft-state.ts (confirmed pre-existing, not introduced by this plan)

## Self-Check: PASSED

All engine files exist and are correctly typed. Pre-existing TypeScript error in draft-state.ts partialize (line 307 in original, line 324 after additions) confirmed to pre-exist before this plan's changes via `git stash` test.
