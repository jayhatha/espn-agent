# Phase 72: UI Audit Fixes - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning
**Source:** UI Audit Review (65-70-UI-REVIEW.md)

<domain>
## Phase Boundary

Fix all issues identified in the Phases 65-70 UI audit (18/24 score). Three priority fixes plus secondary findings across 6 pillars: copywriting, visuals, color, typography, spacing, and experience design.

</domain>

<decisions>
## Implementation Decisions

### Priority 1: Mobile Responsive Layout (Critical)
- LeagueNav sidebar (`w-60 fixed`) must be hidden on mobile with `hidden md:flex`
- Main content wrapper must use `md:pl-60` instead of unconditional `pl-60`
- Add mobile hamburger toggle or bottom tab bar for navigation on small screens
- File: `packages/frontend/src/app/leagues/[id]/layout.tsx`
- File: `packages/frontend/src/components/shell/LeagueNav.tsx`

### Priority 2: TopBar Projected Stat
- Replace hardcoded `value="--"` with actual projected overall rank
- Query `api.getProjectedStandings()` in TopBar component
- Display selected team's `projected_overall_rank` (e.g. `#3`)
- File: `packages/frontend/src/components/shell/TopBar.tsx`

### Priority 3: Replace alert() with ErrorAlert
- `waivers/page.tsx:242` uses `alert("Failed to evaluate add/drop...")` — replace with inline `ErrorAlert` component
- File: `packages/frontend/src/app/leagues/[id]/waivers/page.tsx`

### Color Token Migration
- `trends/page.tsx:116-125` TrendBadge: replace `text-green-400`/`text-red-400` with `text-positive`/`text-negative`
- `streaming/page.tsx:223,284` pitching alerts: replace `bg-red-500/10 border-red-500/20 text-red-400` with semantic tokens
- `trends/page.tsx:673-681` OPS ratio: replace raw green/red with semantic tokens
- `FaabGauge.tsx:16-28` and `GsTracker.tsx:24-29`: replace `bg-emerald-500`/`bg-amber-500`/`bg-red-500` with semantic tokens
- `CategoryOpportunityMap.tsx:24-29`: replace raw `text-amber-400`/`text-orange-400`/`text-purple-400` with semantic tokens
- `waivers/page.tsx:337` legality warning: add dark mode styles (currently uses light-only `bg-warning-light border-warning-border`)

### Typography Cleanup
- Replace `text-[11px]` in `waivers/page.tsx:362,381` and `trades/page.tsx:780,803` with `text-caption`
- Replace `text-[28px]` in `IdentitySection.tsx:185,220` with `text-h2`
- Replace `text-[10px]` in `standings/page.tsx:643` and `CategoryOpportunityMap.tsx:104` with `text-caption`

### Copywriting Fixes
- `standings/page.tsx:503`: format `snapshotDate` with `toLocaleDateString()` instead of raw ISO timestamp
- `SignalsPanel.tsx:249`: differentiate "Loading signals..." vs "No signals at the moment" based on data resolution state

### Experience Design Fixes
- `waivers/page.tsx:413` tab active state: replace `bg-accent text-white` with `bg-shell-accent text-white` for proper dark mode contrast

### Claude's Discretion
- Implementation order of fixes (can be parallelized or sequenced as makes sense)
- Exact mobile navigation pattern (hamburger vs bottom tab bar)
- Whether to add ErrorBoundary wrapping (noted in audit but not a priority fix)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### UI Audit Source
- `.planning/phases/70-trends-and-efficiency/65-70-UI-REVIEW.md` — Full 6-pillar audit with all findings and file locations

### Design System
- `packages/frontend/tailwind.config.js` — Token definitions (shell-bg, shell-panel, text-positive, etc.)
- `packages/frontend/src/app/globals.css` — CSS custom properties and semantic token mapping

### Shell Components
- `packages/frontend/src/app/leagues/[id]/layout.tsx` — Main shell layout (mobile fix target)
- `packages/frontend/src/components/shell/LeagueNav.tsx` — Sidebar navigation
- `packages/frontend/src/components/shell/TopBar.tsx` — Top summary bar (projected stat fix)
- `packages/frontend/src/components/shell/SignalsPanel.tsx` — Right signals panel

</canonical_refs>

<specifics>
## Specific Ideas

- The mobile layout fix is the highest-impact change — it makes the entire app usable on phones
- Token migration should be mechanical: find raw Tailwind color → replace with semantic equivalent
- TopBar projected stat should reuse the same API endpoint already called by the standings page

</specifics>

<deferred>
## Deferred Ideas

- ErrorBoundary wrapping for all league pages (noted in audit, low urgency)
- Inline TeamSelector on gated pages (currently redirects to league page to select team)
- Reducing raw `text-xs`/`text-sm` usage (177 instances — too large for this phase, track separately)

</deferred>

---

*Phase: 72-ui-audit-fixes*
*Context gathered: 2026-03-24 from UI Audit Review*
