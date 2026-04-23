---
phase: 72-ui-audit-fixes
plan: 02
subsystem: ui
tags: [tailwind, semantic-tokens, typography, dark-mode, frontend]

requires: []
provides:
  - Semantic color tokens (text-positive, text-negative, text-warning) replacing raw Tailwind colors in all audit-flagged files
  - text-caption and text-h2 semantic type scale tokens replacing arbitrary text-[Npx] sizes
  - Formatted snapshot date display in standings page (locale string instead of raw ISO timestamp)
affects: [future UI plans that reference trends, streaming, standings, trades pages]

tech-stack:
  added: []
  patterns:
    - "Use text-positive/text-negative/text-warning instead of raw text-green-400/text-red-400/text-amber-400 for semantic meaning"
    - "Use bg-positive/bg-negative/bg-warning with opacity (/10) for semantic background fills"
    - "Use text-caption (0.75rem) instead of text-[10px] or text-[11px]"
    - "Use text-h2 instead of text-[28px] for large data numerics"
    - "Use toLocaleDateString('en-US', {month,day,year}) for snapshot dates in UI"

key-files:
  created: []
  modified:
    - packages/frontend/src/app/leagues/[id]/trends/page.tsx
    - packages/frontend/src/app/leagues/[id]/streaming/page.tsx
    - packages/frontend/src/components/league/FaabGauge.tsx
    - packages/frontend/src/components/league/GsTracker.tsx
    - packages/frontend/src/components/league/CategoryOpportunityMap.tsx
    - packages/frontend/src/app/leagues/[id]/trades/page.tsx
    - packages/frontend/src/app/leagues/[id]/_sections/IdentitySection.tsx
    - packages/frontend/src/app/leagues/[id]/standings/page.tsx

key-decisions:
  - "Extended raw-color cleanup beyond plan spec to cover all semantic uses in trends/efficiency section (lineup warning badges and bg fills)"
  - "Out-of-scope text-[10px] instances found in CategoryPaceBar, ImpactDetailCard, AtRiskSummary, GapDetailRow — deferred to preserve scope boundary"

patterns-established:
  - "All semantic positive/negative/warning states flow through semantic token classes — no raw green/red/amber/emerald in semantic contexts"
  - "Snapshot dates formatted with toLocaleDateString in UI, not raw ISO strings"

requirements-completed: [UI-AUDIT-04, UI-AUDIT-05]

duration: 12min
completed: 2026-03-25
---

# Phase 72 Plan 02: Semantic Token Cleanup Summary

**All raw Tailwind color classes (green-400, red-400, amber-400, emerald-500) replaced with semantic tokens (text-positive, text-negative, text-warning) across 8 audit-flagged files; arbitrary text-[Npx] sizes replaced with text-caption/text-h2; standings date now shows locale-formatted string**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-03-25T00:42:27Z
- **Completed:** 2026-03-25T00:54:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Migrated TrendBadge (HOT/COLD), OPS/ERA ratio coloring, efficiency section, and pace alerts in trends/streaming pages from raw green/red/amber to semantic positive/negative/warning tokens
- Updated FaabGauge and GsTracker progress bar fill colors to use bg-positive/bg-warning/bg-negative semantic tokens
- Updated CategoryOpportunityMap difficulty badges to use text-warning, text-negative, text-shell-accent (medium/hard/elite) and replaced text-[10px] with text-caption
- Replaced text-[11px] in trades page (You Give/You Get labels) and text-[28px] in IdentitySection (rank/points) with semantic type scale tokens
- Fixed standings page ISO timestamp to display as formatted locale date (e.g., "Mar 25, 2026")

## Task Commits

1. **Task 1: Migrate raw color classes to semantic tokens** - `2d66250` (feat)
2. **Task 2: Fix arbitrary text sizes, typography, and copywriting** - `d806162` (feat)

**Plan metadata:** (see final docs commit)

## Files Created/Modified

- `packages/frontend/src/app/leagues/[id]/trends/page.tsx` - TrendBadge, efficiency section, OPS/ERA ratios all use semantic tokens
- `packages/frontend/src/app/leagues/[id]/streaming/page.tsx` - Pace alert banners use bg-negative/bg-warning
- `packages/frontend/src/components/league/FaabGauge.tsx` - fillColor/textColor use bg-positive/bg-warning/bg-negative
- `packages/frontend/src/components/league/GsTracker.tsx` - fillColor uses bg-positive/bg-warning/bg-negative
- `packages/frontend/src/components/league/CategoryOpportunityMap.tsx` - difficulty badges use semantic tokens; text-[10px] replaced with text-caption
- `packages/frontend/src/app/leagues/[id]/trades/page.tsx` - text-[11px] replaced with text-caption on You Give/You Get labels
- `packages/frontend/src/app/leagues/[id]/_sections/IdentitySection.tsx` - text-[28px] replaced with text-h2 on rank/points displays
- `packages/frontend/src/app/leagues/[id]/standings/page.tsx` - text-[10px] replaced with text-caption; toLocaleDateString for snapshot date

## Decisions Made

- Extended raw-color cleanup in trends/page.tsx beyond the plan spec to cover the efficiency section (lineup warning badges, no-issues badge, warning div backgrounds) — these were semantic uses discovered during the same file pass (Rule 1: auto-fix).
- Found additional text-[10px] instances in CategoryPaceBar.tsx, ImpactDetailCard.tsx, AtRiskSummary.tsx, GapDetailRow.tsx — these are out-of-scope for this plan (not in audit-flagged file list). Deferred per scope boundary rule.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/Scope Extension] Fixed additional raw color instances in trends/page.tsx efficiency section**
- **Found during:** Task 1 (Migrate raw color classes to semantic tokens)
- **Issue:** After fixing TrendBadge and ratio columns, grep revealed 2 more raw green/amber instances in the efficiency view's warning badge and "No issues" badge (lines 743-779)
- **Fix:** Applied same semantic token migration to efficiency section: warning badges use bg-warning/text-warning, positive states use bg-positive/text-positive
- **Files modified:** packages/frontend/src/app/leagues/[id]/trends/page.tsx
- **Verification:** `grep -c "text-green-400|text-amber-400|bg-green-500|bg-amber-500" trends/page.tsx` returns 0
- **Committed in:** 2d66250 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (scope extension within same file)
**Impact on plan:** Fix was necessary to complete the audit-flagged file correctly. No new files touched.

## Known Stubs

None — all changes are pure class replacements with no data stubs.

## Issues Encountered

None — all edits were straightforward class substitutions.

## Next Phase Readiness

- All audit-flagged files use semantic token classes exclusively
- No raw green/red/amber classes remain in semantic contexts across the 8 modified files
- Deferred: CategoryPaceBar, ImpactDetailCard, AtRiskSummary, GapDetailRow still contain text-[10px]/text-[11px] instances — a future quick task can sweep these if desired

## Self-Check: PASSED

- All 8 files verified to contain zero instances of removed raw color classes and arbitrary text sizes
- Both commits exist: 2d66250 (Task 1), d806162 (Task 2)
- standings page contains toLocaleDateString at lines 503, 506

---
*Phase: 72-ui-audit-fixes*
*Completed: 2026-03-25*
