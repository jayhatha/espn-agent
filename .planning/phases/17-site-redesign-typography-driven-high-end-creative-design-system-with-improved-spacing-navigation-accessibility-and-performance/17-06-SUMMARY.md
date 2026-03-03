---
phase: 17-site-redesign
plan: 06
subsystem: ui
tags: [design-system, tailwind, react, nextjs, lucide-react, cva]

# Dependency graph
requires:
  - phase: 17-03
    provides: Container, Card, Button, Heading, Badge design system components

provides:
  - Redesigned trades page with Container, Card, Button, design tokens
  - Redesigned waivers page with Container, Card, Badge, design tokens
  - Redesigned standings page with Container, Card, design token table styling
  - PlayerRow with design token colors (text-body-sm, text-data, text-content, semantic variants)
  - ScarcityBadge using Badge component variants (positive/negative/default)
  - ImpactBadge using bg-positive-light/bg-negative-light design tokens
  - ImpactDetailCard using Card component and semantic colors

affects:
  - trades page
  - waivers page
  - standings page
  - moves page (uses ImpactBadge and ImpactDetailCard)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Container size="wide" wraps all data-heavy pages instead of max-w-7xl inline
    - Button variant primary/secondary for mode toggles (active/inactive states)
    - Badge variant positive/negative/warning for semantic status indicators
    - text-data token for monospace stat values in tables
    - text-body-sm for standard text, text-content/text-content-secondary for hierarchy
    - bg-positive-light/bg-negative-light for tinted card sections (add/drop/give/receive)
    - lucide-react icons replace all inline SVGs throughout

key-files:
  created: []
  modified:
    - packages/frontend/src/app/leagues/[id]/trades/page.tsx
    - packages/frontend/src/app/leagues/[id]/waivers/page.tsx
    - packages/frontend/src/app/leagues/[id]/standings/page.tsx
    - packages/frontend/src/components/league/PlayerRow.tsx
    - packages/frontend/src/components/league/ScarcityBadge.tsx
    - packages/frontend/src/components/league/ImpactBadge.tsx
    - packages/frontend/src/components/league/ImpactDetailCard.tsx

key-decisions:
  - "ScarcityBadge delegates entirely to Badge component variants (positive/negative/default) using lucide-react Check/ArrowDown/Minus icons"
  - "ImpactDetailCard wraps in Card component but CardContent with p-4 override for compact display"
  - "Standings tab active state uses border-accent/text-content to match design system (was border-blue-500/text-blue-600)"
  - "Trades page AI suggestions mode uses bg-info-light/border-info-border for positions-of-need notice"
  - "ESPN action links use bg-accent/bg-positive directly since they're external links (not Button component due to anchor vs button element)"

patterns-established:
  - "Positive/negative delta display: text-positive for gains, text-negative for losses, text-content-secondary for neutral"
  - "Player add sections: bg-positive-light border-positive-border; drop sections: bg-negative-light border-negative-border"
  - "Mode toggles: Button variant=primary for active, variant=secondary for inactive in flex container"
  - "Data tables: bg-surface-secondary headers, hover:bg-surface-secondary rows, border-neutral-100 row dividers"

requirements-completed: [DS-07]

# Metrics
duration: 15min
completed: 2026-03-02
---

# Phase 17 Plan 06: Trades, Waivers, Standings Design System Migration Summary

**Trades, waivers, and standings pages plus 4 supporting components (PlayerRow, ScarcityBadge, ImpactBadge, ImpactDetailCard) migrated to design system with Container layout, semantic color tokens, and lucide-react icons**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-02T22:13:57Z
- **Completed:** 2026-03-02T22:28:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Trades page: Container, Card, Button mode toggle, semantic positive/negative delta colors, lucide-react ArrowRightLeft/ArrowRight/ExternalLink icons, no inline SVGs
- Waivers page: Container, Card, Button mode toggle, Badge component, semantic colors throughout, lucide-react icons replace SVGs
- Standings page: Container, Card, design token table (bg-surface-secondary headers, hover:bg-surface-secondary rows, border-accent tab indicators)
- PlayerRow: Uses text-body-sm/text-data/text-content tokens, bg-accent-light/bg-positive-light/bg-negative-light selection states
- ScarcityBadge: Fully delegates to Badge variant positive/negative/default with lucide-react icons
- ImpactBadge: Uses bg-positive-light/text-positive and bg-negative-light/text-negative tokens
- ImpactDetailCard: Wrapped in Card component, all semantic colors via design tokens, inline SVGs removed

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate trades and waivers pages** - `de5c7ff` (feat)
2. **Task 2: Migrate standings page and impact components** - `fbf7a96` (feat)

**Plan metadata:** (docs commit pending)

## Files Created/Modified

- `packages/frontend/src/app/leagues/[id]/trades/page.tsx` - Redesigned with Container, Card, Button, semantic colors, lucide icons
- `packages/frontend/src/app/leagues/[id]/waivers/page.tsx` - Redesigned with Container, Card, Button, Badge, semantic colors, lucide icons
- `packages/frontend/src/app/leagues/[id]/standings/page.tsx` - Redesigned with Container, Card, design token table styling
- `packages/frontend/src/components/league/PlayerRow.tsx` - Design token colors for position/selection states
- `packages/frontend/src/components/league/ScarcityBadge.tsx` - Delegates to Badge variant components
- `packages/frontend/src/components/league/ImpactBadge.tsx` - Uses positive/negative design tokens
- `packages/frontend/src/components/league/ImpactDetailCard.tsx` - Card wrapper, semantic colors, cn() throughout

## Decisions Made

- ScarcityBadge delegates entirely to Badge component variants — no custom badge styling needed since Badge already has positive/negative/default variants
- ImpactDetailCard uses `CardContent className="p-4"` override for compact sizing in the moves page context
- Standings tab active state uses `border-accent text-content` instead of blue-500/blue-600 to align with design tokens
- ESPN action links (external anchors) use direct color classes instead of Button component — avoids invalid anchor-inside-button DOM nesting
- Trades page AI suggestions "positions of need" notice uses `bg-info-light/border-info-border` — the info semantic token fits informational notices well

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — all 7 files compiled cleanly on first build attempt.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Trades, waivers, and standings pages fully migrated to design system
- PlayerRow, ScarcityBadge, ImpactBadge, ImpactDetailCard all use design tokens
- Remaining pages (draft/auction, draft/rankings, moves/streaming/etc.) ready for Phase 17-07 or later plans

---
*Phase: 17-site-redesign*
*Completed: 2026-03-02*
