# Phase 53: UI Polish — Professional Dashboard Typography & Colors - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Polish all auction sidebar components to use consistent typography, legible dark-mode colors, and professional operations dashboard styling. No layout changes, no new features — purely visual consistency and quality.

</domain>

<decisions>
## Implementation Decisions

### Typography System
- Primary font: Inter (already configured as `font-sans` in Tailwind config)
- Drop DM Serif Display (`font-display`) — use Inter for everything including the bid verdict. A professional ops dashboard uses one sans-serif font, not a mix of serif and sans.
- Monospace: keep `font-mono` for numeric data values only (stat totals, dollar amounts in data-dense contexts)
- Replace ALL `text-[10px]` arbitrary values with proper Tailwind tokens — either `text-caption` (0.75rem/12px) or a new `text-label` token if 10px is truly needed
- If 10px is needed: add `text-label` token at 0.625rem (10px) with appropriate line-height and letter-spacing for labels/badges

### Typography Scale for Dashboard Context
- Section headers: `text-body-xs` uppercase tracking-wide (already used in some places, make consistent)
- Data values (big numbers): `text-h3` or `text-h4` with `font-semibold`
- Body text: `text-body-sm`
- Labels/badges: `text-caption` or `text-label`
- Player names: `text-body-sm font-medium`
- Dollar amounts: `text-body-sm font-mono` or `text-data`

### Color Legibility
- Migrate NominationDiagnostics.tsx completely to grafana-* tokens (it's the only component still using light-mode tokens)
- Replace hardcoded hex colors in CategoryHeatmap rankToColor() with grafana token references or CSS custom properties
- Ensure minimum 4.5:1 contrast ratio for all text on dark backgrounds
- `text-grafana-text` (#d9dde6) on `bg-grafana-bg` (#181b1f) = ~11:1 contrast — good
- `text-grafana-muted` (#8e9ab0) on `bg-grafana-bg` (#181b1f) = ~5.2:1 — passes AA
- `text-grafana-muted` (#8e9ab0) on `bg-grafana-panel` (#22252b) = ~4.1:1 — borderline, may need slight brightening to #99a5bc for reliable AA compliance
- All badge text on colored backgrounds must be white or very light

### Consistency Audit Checklist
- Every section header: same pattern (uppercase, tracking-wide, grafana-muted, same size token)
- Every player name: same weight and size
- Every dollar amount: same formatting approach
- Every badge/pill: same border-radius, padding, font-size token
- Every panel: same border, background, padding pattern
- No `text-content-*`, `bg-surface-*`, `text-accent`, `text-positive`, `text-negative`, `text-warning` in auction-rendered components — only `grafana-*` equivalents

### Claude's Discretion
- Whether to brighten `grafana-muted` slightly for better contrast on panel backgrounds
- Exact `text-label` token parameters if 10px size is truly needed
- Whether to add Inter via @font-face in content.css or rely on system fallback
- Badge padding/radius standardization values
- Whether CategoryHeatmap colors should become CSS custom properties or stay as a JS function

</decisions>

<specifics>
## Specific Ideas

- Professional ops dashboard = clean, consistent, everything aligned. Think Grafana, Datadog, or Linear's information density.
- Inter is the gold standard for dashboard UIs — excellent number legibility, clear at small sizes
- Monospace numbers for data alignment in tables/lists where values need to be scannable

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 53-ui-polish*
*Context gathered: 2026-03-16*
