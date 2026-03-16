---
phase: 53
plan: 02
subsystem: extension-sidebar-ui
tags: [ui, typography, dark-mode, grafana-tokens, inter-font]
dependency_graph:
  requires: [53-01]
  provides: [grafana-migrated-nomination-diagnostics, token-based-rank-colors, inter-font-bid-verdict, consistent-sidebar-typography]
  affects: [packages/extension/components]
tech_stack:
  added: []
  patterns: [grafana-token-system, text-label-for-badges, text-body-xs-for-section-headers]
key_files:
  created: []
  modified:
    - packages/extension/components/NominationDiagnostics.tsx
    - packages/extension/components/CategoryHeatmap.tsx
    - packages/extension/components/BidVerdict.tsx
    - packages/extension/components/DraftSidebar.tsx
    - packages/extension/components/SignalStrip.tsx
    - packages/extension/components/NextNominee.tsx
    - packages/extension/components/PositionSupplyHeatmap.tsx
    - packages/extension/components/IdealRosterPanel.tsx
decisions:
  - "Section headers use text-body-xs (11px) for readability; badge/pills use text-label (10px) for density"
  - "CategoryHeatmap RANK_COLORS constant uses same hex values as tailwind grafana rank tokens"
  - "DraftSidebar Show Assistant button migrated from bg-accent to bg-grafana-info to avoid light-mode token"
metrics:
  duration: 4m
  completed: 2026-03-16
  tasks_completed: 2
  files_modified: 8
---

# Phase 53 Plan 02: Typography and Grafana Token Migration for 8 Auction Sidebar Components Summary

Migrated all 8 actively-rendered auction sidebar components to consistent grafana-only color tokens and Inter typography — eliminating every light-mode token, arbitrary font size, and DM Serif Display reference from the live sidebar.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Migrate NominationDiagnostics and CategoryHeatmap to grafana tokens | 24c4563 | NominationDiagnostics.tsx, CategoryHeatmap.tsx |
| 2 | Replace font-display, text-[10px], and stray light-mode tokens across remaining 6 sidebar components | 6ba33aa | BidVerdict.tsx, DraftSidebar.tsx, SignalStrip.tsx, NextNominee.tsx, PositionSupplyHeatmap.tsx, IdealRosterPanel.tsx |

## What Was Built

**NominationDiagnostics.tsx** — Full grafana migration: border-surface-tertiary/bg-surface-secondary/text-content/text-accent/text-positive/text-negative/text-warning all replaced with grafana-* equivalents. Section header label uses text-body-xs uppercase tracking-wide. Status badge uses text-label font-semibold. Force Nominate button bg-accent -> bg-grafana-info with hover:bg-grafana-info/80.

**CategoryHeatmap.tsx** — Added `RANK_COLORS` named constant (top/mid/low/bottom) using grafana rank token hex values instead of bare hardcoded strings. All `text-[10px]` replaced: section header button gets text-body-xs (per CONTEXT.md pattern); data labels (stat key, value, OVR, skeleton) get text-label.

**BidVerdict.tsx** — Removed `font-display` from verdict text (`text-h4` token already carries the right weight).

**DraftSidebar.tsx** — Removed `font-display` from remaining budget display (`text-h3`) and current bid display. Show Assistant button migrated from `bg-accent hover:bg-accent-hover` to `bg-grafana-info hover:bg-grafana-info/80`. "Now Nominated" section header text-[10px] -> text-body-xs; tier badge text-[10px] -> text-label.

**SignalStrip.tsx** — `pillBase` string updated from `text-[10px]` to `text-label`.

**NextNominee.tsx** — Section headers ("Nominating...", "Next Nominee") use text-body-xs uppercase tracking-wide. Strategy tag badge uses text-label font-semibold.

**PositionSupplyHeatmap.tsx** — Section header uses text-body-xs uppercase tracking-wide. Data labels (supply count, empty state text) use text-label.

**IdealRosterPanel.tsx** — TGT button uses text-label font-semibold. Rank circle badge: font-display removed, text-label added.

## Decisions Made

1. **Section headers use text-body-xs (11px), not text-label (10px)** — Section labels like "Next Nominee", "Position Supply", "Now Nominated", "Nominating..." serve as navigational anchors; 11px is more readable. Badge/pill elements that communicate state (strategy tags, tier labels, signal pills) use text-label at 10px for density.

2. **CategoryHeatmap RANK_COLORS constant** — Adds semantic names (top/mid/low/bottom) that map 1:1 to grafana rank tokens. Future engineers can update colors by referencing the tailwind config; the constant acts as a bridge since inline `style` props cannot use CSS custom properties.

3. **DraftSidebar Show Assistant button** — The hidden-state button also used bg-accent, so migrated to bg-grafana-info to be consistent. The button only appears when the sidebar is collapsed, so it needs to be visible on the page (dark or light) — bg-grafana-info (#1f60c4) is the correct dark-palette value.

## Deviations from Plan

None — plan executed exactly as written. All specified line references were accurate.

## Verification

- Zero `font-display` references in all 8 auction sidebar components
- Zero `text-[10px]` references in all 8 auction sidebar components
- Zero stray light-mode tokens (text-content, bg-surface, text-accent, bg-accent) in NominationDiagnostics
- Zero `bg-accent` / `hover:bg-accent-hover` in DraftSidebar
- `text-label` now appears in 7 of the 8 components (CategoryHeatmap, SignalStrip, NextNominee, PositionSupplyHeatmap, IdealRosterPanel, DraftSidebar, NominationDiagnostics)
- Extension builds cleanly: `wxt build` completes in ~3s with no TypeScript errors

## Self-Check: PASSED

All 8 modified files exist and contain the expected tokens. Both commits exist (24c4563, 6ba33aa).
