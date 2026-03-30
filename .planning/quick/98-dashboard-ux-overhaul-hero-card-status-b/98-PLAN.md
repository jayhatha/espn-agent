---
phase: 98-dashboard-ux-overhaul
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/frontend/src/app/leagues/[id]/_sections/IdentitySection.tsx
  - packages/frontend/src/app/leagues/[id]/_sections/ActionsSection.tsx
  - packages/frontend/src/app/leagues/[id]/_sections/StatsSection.tsx
  - packages/frontend/src/app/leagues/[id]/_sections/NavigationSection.tsx
  - packages/frontend/src/app/leagues/[id]/page.tsx
  - packages/frontend/src/components/shell/SignalsPanel.tsx
  - packages/frontend/src/components/shell/LeagueNav.tsx
  - packages/frontend/src/components/shell/TopBar.tsx
  - packages/frontend/src/components/league/ActionItemsList.tsx
autonomous: true
requirements: [UX-01, UX-02, UX-03, UX-04, UX-05, UX-06, UX-07, UX-08, UX-09, UX-10]

must_haves:
  truths:
    - "Hero card shows team name (large), rank, total points, and delta vs yesterday at top of dashboard"
    - "Status bar below hero card shows last updated timestamp, status pill (Stale/Live), and Refresh CTA"
    - "Recommended actions are grouped by impact tier (High/Medium/Speculative) directly under status bar"
    - "SignalsPanel has All/Trades/Waivers tab filtering"
    - "TopBar metrics strip shows Week/FAAB/GS/Projected with icons and is sticky"
    - "Semantic colors applied: green for gains, red for risks, yellow for warnings"
  artifacts:
    - path: "packages/frontend/src/app/leagues/[id]/_sections/IdentitySection.tsx"
      provides: "Hero card + status bar"
    - path: "packages/frontend/src/app/leagues/[id]/_sections/ActionsSection.tsx"
      provides: "Tiered recommended actions"
    - path: "packages/frontend/src/components/shell/SignalsPanel.tsx"
      provides: "Tabbed signal filtering"
  key_links:
    - from: "IdentitySection.tsx"
      to: "page.tsx"
      via: "props: teamOverview, latestSnapshot, createSnapshotMutation"
      pattern: "IdentitySection"
---

<objective>
Overhaul the league dashboard UX across 10 areas: hero card with KPIs, structured status bar, sticky metrics strip, tabbed signals panel, tiered recommended actions, nav badges, visual density/contrast improvements, better empty states, interaction improvements, and structural layout reordering.

Purpose: Transform the dashboard from an information dump into a decision-oriented command center where the most important information (rank, points, delta) is immediately visible and actions are prioritized by impact.

Output: Rewritten IdentitySection (hero card + status bar), ActionsSection (tiered actions), SignalsPanel (tabs), TopBar (sticky metrics with icons), LeagueNav (badges), and improved visual density across all dashboard sections.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/frontend/src/app/leagues/[id]/page.tsx
@packages/frontend/src/app/leagues/[id]/_sections/IdentitySection.tsx
@packages/frontend/src/app/leagues/[id]/_sections/ActionsSection.tsx
@packages/frontend/src/app/leagues/[id]/_sections/StatsSection.tsx
@packages/frontend/src/app/leagues/[id]/_sections/NavigationSection.tsx
@packages/frontend/src/app/leagues/[id]/_sections/RosterSection.tsx
@packages/frontend/src/app/leagues/[id]/_sections/CategoryTableSection.tsx
@packages/frontend/src/components/shell/TopBar.tsx
@packages/frontend/src/components/shell/SignalsPanel.tsx
@packages/frontend/src/components/shell/LeagueNav.tsx
@packages/frontend/src/app/leagues/[id]/layout.tsx
@packages/frontend/src/components/league/ActionItemsList.tsx
@packages/frontend/src/components/league/TeamHealthOverview.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Hero Card, Status Bar, and Identity Section Overhaul</name>
  <files>
    packages/frontend/src/app/leagues/[id]/_sections/IdentitySection.tsx
    packages/frontend/src/app/leagues/[id]/page.tsx
  </files>
  <action>
Rewrite IdentitySection.tsx to implement a consolidated hero card + status bar layout:

**Hero Card (~120-140px height):**
- Team name: large (`text-3xl` or `text-4xl`), high-contrast (`text-content` / `dark:text-shell-text`), font-display
- Primary KPIs side-by-side: Overall Rank (28-32px bold, e.g. `text-[28px] font-bold`) and Total Points (same size)
- Delta vs yesterday: compute from `miniChartData` or `overallTimeseries` if available. Show as "+2" / "-1" / "=" with semantic colors (green=gain, red=loss, neutral=unchanged). If no prior data, show "--".
- Remove the large faded background text pattern (the team name as watermark). Keep the hero compact.
- Background: `bg-white dark:bg-shell-panel`, with a subtle left accent border (`border-l-4 border-shell-accent`) for visual hierarchy
- Keep TeamSelector inline below the hero card when team is already selected (compact, not taking full width)

**Status Bar (below hero card):**
- Replace the vague "Snapshot Issues Detected" ErrorAlert with a structured horizontal bar
- Three elements in a row:
  1. Last updated: "Updated {relative time}" (e.g., "Updated 2 hours ago") using `latestSnapshot.snapshot_date`. Format with a simple relative time helper (inline, no library needed: compare Date.now() to snapshot date, return "X min/hours/days ago")
  2. Status pill: badge showing "Live" (green bg) when snapshot is fresh (<24h and not degraded), "Stale" (yellow bg) when >24h old, "Degraded" (red bg) when `is_degraded` is true. Pill uses rounded-full, px-2 py-0.5, text-xs font-medium
  3. Refresh CTA: the existing refresh button, but styled as a compact pill/link, not a full Button. Show spinner when isPending
- If degraded, show degraded reasons as small text below the status bar (not a big banner)
- Height: ~40px total

**Layout changes to page.tsx:**
- Add `previousOverall` data: pass a `deltaPts` prop to IdentitySection computed from the last two entries in `overallTimeseries` for the selected team. If timeseries has >=2 points, delta = last.rank - secondLast.rank (note: for rank, negative delta is good). Also compute deltaPoints similarly.
- Remove the separate NavigationSection render from page.tsx entirely (navigation is handled by LeagueNav in the shell layout already, the in-page NavigationSection is redundant)
- Reorder sections in JSX: IdentitySection (hero+status) -> ActionsSection -> StatsSection -> CategoryTableSection -> RosterSection

**Empty/passive state (spec item 8):**
- When no team is selected, show "Season Snapshot - {season}" instead of just the league name
- Remove any "Mariners in 2026?" style placeholder text if present
  </action>
  <verify>
Run `cd /Users/jay-work/Code/espn-agent && npx turbo build --filter=frontend` to confirm no TypeScript errors. Visually confirm in browser that hero card renders with team name large, rank + points as oversized numerals, and status bar shows below with timestamp + pill + refresh.
  </verify>
  <done>
Hero card shows team name (large), rank (28-32px), total points (28-32px), and delta indicator. Status bar shows relative timestamp, status pill (Live/Stale/Degraded), and compact refresh. NavigationSection removed from page (shell nav handles it). Sections reordered: Hero -> Actions -> Stats -> Categories -> Roster.
  </done>
</task>

<task type="auto">
  <name>Task 2: Tiered Actions, Tabbed Signals, Nav Badges, and Visual Polish</name>
  <files>
    packages/frontend/src/app/leagues/[id]/_sections/ActionsSection.tsx
    packages/frontend/src/components/league/ActionItemsList.tsx
    packages/frontend/src/components/shell/SignalsPanel.tsx
    packages/frontend/src/components/shell/LeagueNav.tsx
    packages/frontend/src/components/shell/TopBar.tsx
    packages/frontend/src/app/leagues/[id]/_sections/StatsSection.tsx
    packages/frontend/src/app/leagues/[id]/_sections/CategoryTableSection.tsx
    packages/frontend/src/app/leagues/[id]/_sections/RosterSection.tsx
  </files>
  <action>
**ActionsSection.tsx + ActionItemsList.tsx (spec items 5, 7):**
- Group action items into 3 tiers based on impact value:
  - High Impact (>=+10 pts): red-orange left border, prominent display
  - Medium (+5 to +10): yellow left border
  - Speculative (<+5): subtle/muted styling
  NOTE: Current data likely won't exceed +5, so adjust thresholds to be useful with real data: High >= +2, Medium +1 to +2, Speculative < +1. Keep the tier labels as "High Impact", "Medium", "Speculative".
- Each tier is a collapsible group with a header showing tier name + count
- Show max 3 items above the fold per tier. Items below +0.5 pts collapsed by default with "Show N more" toggle
- Add hover/expand on each item to show full `description` (currently truncated)
- Use semantic colors consistently: positive impact numbers in `text-positive` (green), risk indicators in `text-negative` (red)
- Update `divide-neutral-200` to `divide-neutral-200 dark:divide-shell-border` for dark mode compatibility

**SignalsPanel.tsx (spec item 4):**
- Add tab bar at top: "All" | "Trades" | "Waivers" using useState for activeTab
- Tab styling: horizontal row of buttons, active tab has `border-b-2 border-shell-accent text-shell-accent`, inactive has `text-shell-muted hover:text-shell-text`
- Filter displayed signals by activeTab. "All" shows everything (default), "Trades" shows type=trade, "Waivers" shows type=waiver
- Sort by impact (pts) descending (already done)
- Show count badge on each tab: "Trades (2)" / "Waivers (3)"
- Max 3 visible signals above fold. If more exist, show "View all" link at bottom pointing to appropriate page
- Collapse items with impact < +0.5 pts behind "Show low impact" toggle

**LeagueNav.tsx (spec item 6):**
- Add badge counts next to "Waivers" and "Trades" nav items
- Read signal counts from the same localStorage or use a lightweight query (reuse the signals-waivers/signals-trades query keys with staleTime)
- Badge: small circle/pill with count, e.g. `bg-shell-accent text-shell-bg text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center`
- Only show badge when count > 0

**TopBar.tsx (spec item 3):**
- Add Lucide icons to each stat item: Calendar for Week, DollarSign for FAAB, BarChart2 for GS, TrendingUp for Projected
- Stack icon + label vertically above the value (icon on top, label below, value right of pair) OR place icon inline before label. Choose inline for compactness: `[icon] LABEL value`
- Add `sticky top-0 z-20` to the header element (it's already at the top of the content area via layout, but ensure it stays fixed when scrolling)
- GS over cap detection: if `gsData` and `gsData.gsUsed > gsData.gsCap`, apply `text-negative` to the GS value and add a title tooltip: "Warning: GS usage exceeds cap"
- Make each metric clickable: wrap in Link components:
  - Week -> stays as-is (no deep link)
  - FAAB -> `/leagues/${id}/moves`
  - GS -> `/leagues/${id}/streaming`
  - Projected -> `/leagues/${id}/standings`

**Visual density improvements (spec item 7) across StatsSection, CategoryTableSection, RosterSection:**
- Increase contrast on KPI numbers: ensure all numeric values use `text-content dark:text-shell-text` (not secondary/tertiary)
- Section headers: `text-content dark:text-shell-text font-semibold` (not muted)
- Ensure all `divide-neutral-*` have dark mode counterparts with `dark:divide-shell-border`
- CategoryTableSection: rank values should use semantic colors (top 3 = green, bottom 3 = red, middle = neutral) - this may already exist via getRankColor, verify and enhance if needed
  </action>
  <verify>
Run `cd /Users/jay-work/Code/espn-agent && npx turbo build --filter=frontend` to confirm no TypeScript errors. Check in browser: (1) Actions section shows tiered grouping, (2) SignalsPanel has working tab filter, (3) LeagueNav shows badge counts, (4) TopBar has icons and clickable metrics, (5) dark mode still looks correct.
  </verify>
  <done>
Actions grouped into High/Medium/Speculative tiers with semantic coloring. SignalsPanel has All/Trades/Waivers tabs with filtering and count badges. LeagueNav shows recommendation count badges on Waivers and Trades items. TopBar has icons on metrics, GS over-cap warning, and clickable deep links. Visual density improved with higher contrast on KPIs and section headers across all sections.
  </done>
</task>

</tasks>

<verification>
- `npx turbo build --filter=frontend` completes without errors
- Dashboard loads with hero card showing team name, rank, points, delta
- Status bar shows relative timestamp, status pill, and refresh CTA
- Actions are tiered by impact
- SignalsPanel tabs filter correctly
- LeagueNav badges appear when recommendations exist
- TopBar metrics have icons and are clickable
- Dark mode renders correctly throughout
</verification>

<success_criteria>
1. Hero card is the first thing visible: team name large, rank + points 28-32px, delta indicator present
2. Status bar replaces the vague "Snapshot Issues Detected" with structured timestamp + pill + refresh
3. Recommended actions grouped by impact tier directly under hero + status
4. SignalsPanel has working All/Trades/Waivers tab filter
5. LeagueNav shows count badges on Waivers and Trades
6. TopBar metrics have icons, GS over-cap turns red, metrics are clickable links
7. NavigationSection removed (redundant with LeagueNav)
8. Semantic colors applied consistently (green=gain, red=risk)
9. No TypeScript build errors
</success_criteria>

<output>
After completion, create `.planning/quick/98-dashboard-ux-overhaul-hero-card-status-b/98-SUMMARY.md`
</output>
