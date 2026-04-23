# Phases 65-70 — UI Review

**Audited:** 2026-03-24
**Baseline:** Abstract 6-pillar standards (no UI-SPEC.md)
**Screenshots:** Captured (dev server at localhost:3000)
**Screenshot dir:** `.planning/ui-reviews/70-20260324-153322/`

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Specific, domain-rich labels throughout; one raw `alert()` and an unformatted ISO timestamp leak through |
| 2. Visuals | 3/4 | Dark shell is cohesive and well-structured; sidebar is not responsive on mobile (overlaps content at 375px) |
| 3. Color | 3/4 | Semantic tokens used consistently; `text-green-400 / text-red-400` bypass semantic palette in TrendBadge and streaming alerts |
| 4. Typography | 3/4 | Custom semantic scale (`text-body-sm`, `text-data`, `text-h4`) used 296 times; 177 raw `text-xs/sm/lg` instances mixed in, creating size drift |
| 5. Spacing | 3/4 | Standard Tailwind spacing scale used everywhere; small count of arbitrary values (`text-[11px]`, `text-[10px]`, `max-w-[150px]`) in repeated patterns |
| 6. Experience Design | 3/4 | Loading and error states are comprehensive; `TopBar "Projected"` stat permanently shows `--`, `waivers/page.tsx` uses `alert()` for error feedback |

**Overall: 18/24**

---

## Top 3 Priority Fixes

1. **Mobile layout is broken** — The sidebar (`w-60 fixed`) is not hidden on mobile viewports; `pl-60` is applied unconditionally, causing content to be pushed 240px right at 375px width, making the main content largely inaccessible. Fix: add `hidden md:flex` to `<LeagueNav>` and `md:pl-60` to the main wrapper in `layout.tsx`, and provide a mobile hamburger toggle or bottom tab bar.

2. **TopBar "Projected" stat is permanently `--`** — Phase 68 wired FAAB and GS stats into the TopBar but left the "Projected" stat with a hardcoded `"--"` value. This is visible in every page within the shell. Fix: query `api.getProjectedStandings()` in TopBar and display the selected team's `projected_overall_rank` (e.g. `#3`) with a link to `/standings`.

3. **Waiver evaluation errors use `window.alert()`** — `waivers/page.tsx:242` calls `alert("Failed to evaluate add/drop. Please try again.")` on evaluation errors. This is a jarring native browser dialog that breaks the dark-shell visual contract. Fix: replace with an `ErrorAlert` component rendered inline below the Evaluate button, or a toast notification consistent with how other pages handle errors.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

Overall the copy is purposeful and domain-aware. CTAs use specific verbs ("Evaluate Impact", "Compute Impacts", "View Category Breakdown", "Upload Projections"). Empty states include helpful context and action links ("No waiver recommendations available. Upload FanGraphs projections to generate personalized recommendations.").

**Issues found:**

- `waivers/page.tsx:242` — `alert("Failed to evaluate add/drop. Please try again.")` is a raw browser alert, not a UI-level error message. This breaks the visual contract and provides no detail on what failed.
- `standings/page.tsx:503` — `data.snapshotDate` is displayed raw without formatting: the screenshot shows `As of snapshot: 2026-03-23T00:00:00.000Z` (full ISO timestamp visible in the standings mobile screenshot). Other pages use `toLocaleDateString()` to format dates. This should display as `Mar 23, 2026`.
- `TopBar.tsx:153` — `value="--"` is a permanent placeholder for "Projected" stat. From a copy standpoint, a visible "--" that never resolves to data reads as broken, not loading.
- `SignalsPanel.tsx:249` — Empty state copy is "Loading signals..." even when `allSignals.length === 0` but data has already resolved. This can show after data loads if the team produces no signals. A conditional for this case would improve clarity: "No signals at the moment" vs. "Loading signals...".

**Positive examples:** "Cheapest Path to Next Roto Point", "Standings Points at Risk", "This move gets you +N roto point(s) in {category}" — all specific and action-oriented.

---

### Pillar 2: Visuals (3/4)

The dark shell is visually consistent and polished for desktop viewport. The three-column layout (nav + content + signals) works well at 1440px.

**Issues found:**

- **Mobile layout broken (critical):** At 375px the fixed `w-60` sidebar remains visible and `pl-60` on the main content wrapper pushes content 240px right. There is no responsive breakpoint on either element. The screenshot at 375px confirms the sidebar occupies the left 240px and content begins at ~240px, leaving only ~135px of usable width for the main content. There is no hamburger menu or bottom nav for mobile.
- **Signals panel hidden below xl:** `hidden xl:flex` on the `SignalsPanel` means the panel disappears below 1280px. Users on laptop-width screens (1280px–1440px) never see the signals sidebar. This is by design but worth noting — signals are only accessible via dedicated pages on 99% of screen widths.
- **TopBar "SIGNALS" header is uppercase-only text with no divider on scroll:** The signals panel header (`SIGNALS` label) uses `text-xs uppercase tracking-wide` which renders very small. At 280px panel width this is fine, but the label is not visually prominent enough to cue the panel's purpose for first-time users.
- **Tab active state on waivers page uses `bg-accent text-white` (light-mode style):** `waivers/page.tsx:413` applies `bg-accent text-white` to the active tab button. In dark mode, `accent` resolves to `#111827` (near-black), which means the active tab button appears as a near-black box on a near-black background — very low contrast. Should use `bg-shell-accent text-white` in dark mode context.

**Positive:** LoadingSpinner with message text, skeleton loaders on waiver and trade pages, consistent card chrome (rounded-card, border-shell-border), icon pairing in the navigation sidebar.

---

### Pillar 3: Color (3/4)

The shell token system (`shell-bg`, `shell-panel`, `shell-border`, `shell-muted`, `shell-accent`) is used consistently throughout the new phases. Semantic tokens (`text-positive`, `text-negative`, `text-warning`) are used correctly for financial/roto data. The accent indigo (`#6366F1`) appears 14 times via `text-shell-accent`, appropriately restricted to navigation highlights, links, and key interactive elements.

**Issues found:**

- `trends/page.tsx:116-125` — `TrendBadge` component uses `text-green-400`, `bg-green-500/10`, `border-green-500/20` for HOT and `text-red-400`, `bg-red-500/10`, `border-red-500/20` for COLD. These bypass the semantic palette (`text-positive`, `text-negative`) with direct Tailwind color classes, making them harder to update globally and slightly off-brand (green-400 vs emerald-500 used elsewhere).
- `streaming/page.tsx:223,284` — Pitching alert banners use `bg-red-500/10 border border-red-500/20 text-red-400` for burning_fast warnings instead of semantic tokens.
- `trends/page.tsx:673-681` — OPS ratio coloring uses raw `text-green-400` and `text-red-400` instead of `text-positive` / `text-negative`.
- `FaabGauge.tsx:16-28` and `GsTracker.tsx:24-29` — Progress bar fill colors use `bg-emerald-500`, `bg-amber-500`, `bg-red-500` (6 occurrences) rather than the positive/warning/negative semantic tokens. These would behave correctly but diverge from the token system.
- `waivers/page.tsx:337` — Legality warning uses `bg-warning-light border border-warning-border` which are light-mode-only tokens with no `dark:` override. In dark mode this renders a faded light-amber box that blends poorly with the dark panel background.
- `CategoryOpportunityMap.tsx:24-29` — Difficulty badges for `medium`, `hard`, and `elite` use raw `text-amber-400`, `text-orange-400`, `text-purple-400` classes. Only `easy` uses semantic `text-positive`.

**Positive:** The 60/30/10 color split is well-executed: `shell-bg` / `shell-panel` dominate, `shell-muted` / `shell-text` provide hierarchy, and `shell-accent` (indigo) appears only on actionable elements. Hardcoded hex colors in the leagues pages are zero (they only appear in the draft live tab which uses the separate grafana palette by design).

---

### Pillar 4: Typography (3/4)

The project has a well-defined custom type scale in `tailwind.config.js`: `text-display`, `text-h1` through `text-h4`, `text-body-lg`, `text-body`, `text-body-sm`, `text-caption`, and `text-data`. These are used 296 times across league pages, showing strong adoption. `font-mono` is consistently applied to numeric data in tables and stat cards per SHELL-05.

**Issues found:**

- **Raw Tailwind size classes still appear 177 times** in league pages (`text-xs`, `text-sm`, `text-lg`, `text-xl`, `text-2xl`, `text-3xl`). Examples:
  - `trends/page.tsx:116,124,132,138` — TrendBadge uses `text-xs` instead of `text-caption`
  - `waivers/page.tsx:363,381` — "Drop" / "Add" labels use `text-[11px]` (arbitrary)
  - `trades/page.tsx:780,803` — Same `text-[11px]` pattern for "Drop" / "Add" swap visualization
  - `IdentitySection.tsx:185,220` — `text-[28px]` arbitrary size for large stat values (should be `text-h2` or `text-h1`)
- **Arbitrary sizes:** `text-[11px]`, `text-[10px]`, `text-[28px]` appear in 8 places. These escape the type scale entirely.
- **8 distinct raw Tailwind size classes in use:** `text-xs` (190), `text-sm` (87), `text-lg` (15), `text-2xl` (15), `text-xl` (9), `text-base` (9), `text-3xl` (5), `text-5xl` (1) — alongside the 9-token custom scale. This is two parallel systems.
- **Font weight distribution:** `font-medium` (368), `font-semibold` (130), `font-bold` (58), `font-normal` (6), `font-extrabold` (3). The `font-extrabold` appears only in the draft tool. Four weights in production code is acceptable.

**Positive:** The semantic scale adoption rate (296 uses) significantly outweighs raw classes in frequency per file. `font-mono` is consistently applied to all numeric data. Heading component uses CVA with proper dark-mode text tokens.

---

### Pillar 5: Spacing (3/4)

Spacing follows standard Tailwind scale values throughout. The `py-2`, `px-3`, `py-3`, `px-6`, `py-4`, `gap-3`, `gap-6`, `space-y-4` patterns are the dominant usage, all on the 4px grid. The `p-6` main content padding in `layout.tsx:16` is consistent across all pages.

**Issues found:**

- **Arbitrary sizes in 10 locations:**
  - `standings/page.tsx:352` — `min-w-[80px]` for category column minimum width
  - `standings/page.tsx:397` — `max-w-[150px]` for team name truncation
  - `standings/page.tsx:643` — `text-[10px]` (typography, but also affects spacing feel)
  - `waivers/page.tsx:362,380` — `text-[11px]` in swap visualization labels
  - `trades/page.tsx:780,803` — same `text-[11px]` pattern
  - `IdentitySection.tsx:185,220` — `text-[28px]`
  - `CategoryOpportunityMap.tsx:104` — `text-[10px]` for Leading badge
- **`min-w-[80px]`** is the most impactful: it appears in the projected category breakdown table's column headers. With 10+ categories, this forces horizontal scroll at all viewport widths, which is the intended behavior (overflow-x-auto wrapper), but the hardcoded value is brittle.
- Mixed `px-2 sm:px-3` patterns in waivers category impact table suggest mobile-first spacing but it is inconsistently applied across pages.

**Positive:** No non-standard spacing values (`p-7`, `p-9`, `gap-7`) were found. The consistent use of `space-y-4`, `space-y-6`, `space-y-8` for vertical rhythm between cards gives the pages a predictable feel. The `py-6` / `py-8` page-level vertical padding is consistent.

---

### Pillar 6: Experience Design (3/4)

Loading states are thorough: `LoadingSpinner` with descriptive messages appears on standings, trends, and streaming pages. `LoadingSkeleton` is used on waiver and trade pages while data fetches. Error states use the `ErrorAlert` component with contextual `variant` (info/warning/error) and action links on most pages. Disabled states are applied to action buttons (16 instances of `disabled` prop in league pages).

**Issues found:**

- **TopBar "Projected" stat permanently shows `--`:** This is visible on every page within the shell and reads as a loading state that never resolves. It has been this way since Phase 65-02 (TODOs were noted in the summary). `ProjectedStat` was wired for FAAB and GS in Phase 68 but the Projected field was skipped.
- **`alert()` on waiver evaluation error (`waivers/page.tsx:242`):** Native browser dialog is jarring, blocks the UI thread, and provides no actionable recovery path. The `try/catch` handler should render an inline `ErrorAlert` instead.
- **No error boundary wrapping:** No `ErrorBoundary` component is used anywhere in the league pages. An unhandled exception in any data transform (e.g., `computeMarginalGains`) would crash the entire page with a blank screen.
- **Waivers legality warning (`waivers/page.tsx:337-352`) has no dark mode styles:** `bg-warning-light border-warning-border` are light-palette tokens with no `dark:` override, meaning in dark mode the legality warning box renders with incorrect surface color.
- **No confirmation on destructive waivers/trades actions:** Evaluating an add/drop or triggering a trade analysis is non-destructive, so this is acceptable. However the "Evaluate Impact" button does not provide any feedback between click and loading state other than disabling — there is no loading indicator on the button itself during `isEvaluating`. The button label does change to "Evaluating..." which partially addresses this.
- **Empty state UX for all gated pages:** Waivers, Trades, and Streaming pages show a warning card when no team is selected, which is correct. However the warning directs users to "Go to League Page" to select a team — a two-step flow that could instead be replaced by an inline `TeamSelector` component (already built: `components/league/TeamSelector.tsx`) to eliminate the redirect.

**Positive:** TanStack Query stale times are tuned appropriately (60s for league status, 5m for signals/FAAB/GS). All data-fetching queries use `enabled` guards to prevent requests before required data is available. Empty array guards are in place for Kysely IN queries per CLAUDE.md pattern. The "Select a team to see signals" placeholder in the signals panel is clear and contextually correct.

---

## Registry Safety

No `components.json` found. shadcn not initialized. Registry audit skipped.

---

## Files Audited

**Shell components:**
- `packages/frontend/src/components/shell/LeagueNav.tsx`
- `packages/frontend/src/components/shell/TopBar.tsx`
- `packages/frontend/src/components/shell/SignalsPanel.tsx`
- `packages/frontend/src/app/leagues/[id]/layout.tsx`

**UI components (sampled):**
- `packages/frontend/src/components/ui/Card.tsx`
- `packages/frontend/src/components/ui/Button.tsx`

**League components:**
- `packages/frontend/src/components/league/FaabGauge.tsx`
- `packages/frontend/src/components/league/GsTracker.tsx`
- `packages/frontend/src/components/league/CategoryOpportunityMap.tsx`

**Pages:**
- `packages/frontend/src/app/leagues/[id]/standings/page.tsx`
- `packages/frontend/src/app/leagues/[id]/waivers/page.tsx`
- `packages/frontend/src/app/leagues/[id]/trades/page.tsx` (sampled)
- `packages/frontend/src/app/leagues/[id]/trends/page.tsx` (sampled)
- `packages/frontend/src/app/leagues/[id]/moves/page.tsx` (sampled)
- `packages/frontend/src/app/leagues/[id]/streaming/page.tsx` (sampled)

**Config:**
- `packages/frontend/tailwind.config.js`
- `packages/frontend/src/app/globals.css`

**Screenshots captured:**
- `home-desktop.png` — home page (auth check loading)
- `leagues-desktop.png` — leagues list (1440px)
- `league-1-standings.png` — standings page with dark shell (1440px)
- `league-1-trends.png` — trends page with charts (1440px)
- `league-1-waivers.png` — waivers page no-team state (1440px)
- `league-1-trades.png` — trades page no-team state (1440px)
- `league-1-streaming.png` — pitching usage page (1440px)
- `league-1-moves.png` — move impact page (1440px)
- `league-1-standings-mobile.png` — standings page mobile (375px) — shows sidebar overlap bug
