# Phase 18: Dashboard Composition Redesign - Research

**Researched:** 2026-03-03
**Domain:** Frontend layout composition, editorial typography, Tailwind CSS section-based design
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (from Phase 18 Design Brief)
1. Remove equal-weight feature cards
2. Introduce asymmetry in layout
3. Make Recommended Actions the dominant focal section
4. Increase typography scale for rank and point deltas
5. Reduce visible card borders and rely on spacing for hierarchy
6. Use background section changes instead of floating cards
7. Create strong vertical rhythm with fewer, larger blocks
8. Maintain functionality but elevate composition and visual confidence

### Identity Section
Remove marketing-style hero content and replace it with an editorial-style identity section that emphasizes team name, rank, and total points through typography and spacing rather than containers.

### Recommended Actions
Elevate Recommended Actions into a dominant full-width section with oversized point deltas and strong typographic hierarchy.

### Layout
Replace equal-weight card grids with asymmetrical layout sections.

### Hierarchy
Reduce visible card borders and rounded corners. Use spacing and alignment to create hierarchy instead of boxed containers.

### Data Tables
Rework data tables to feel structured and intentional, with stronger typographic contrast and reduced padding.

### Prior Phase Decisions (Phase 17 — locked)
- Accent token: near-black (#111827) as primary action color for editorial aesthetic
- Inter variable font with --font-inter CSS variable
- Container size='wide' used for league dashboard
- lucide-react icons replace all inline SVGs
- CHART_THEME.colors for Recharts
- Component library: Container, Heading, Text, Button, Card, Badge, Input, Select, FadeIn

### Claude's Discretion
No explicit discretion areas defined. All 8 specific requirements above are locked directives.

### Deferred Ideas (OUT OF SCOPE)
None specified. The brief is tightly scoped to the league dashboard page (`/leagues/[id]/page.tsx`).
</user_constraints>

---

## Summary

This phase refactors the league dashboard page (`packages/frontend/src/app/leagues/[id]/page.tsx`) from a card-grid SaaS layout into a composition-driven editorial layout. The work is entirely frontend-only — no API, backend, or data model changes. All functionality must be preserved: team selector, overall standing display, KPI stats, health overview, recommended actions, category stats table, quick actions grid, and roster table.

The current dashboard wraps nearly every content block in `<Card><CardContent>` with uniform `border border-neutral-200 rounded-card shadow-card` styling, creating flat visual weight. The redesign uses background-section alternation, aggressive typography scaling (the existing `text-display` and `text-h1` tokens are already defined for this), and an asymmetric grid layout. The team's design system already has all the tokens needed — this is a layout and composition refactor, not a new design system build.

The most important output is a sectional page structure where content flows in distinct full-width or container-width background-striped sections rather than a vertical stack of identical bordered boxes. The `Recommended Actions` block becomes the dominant visual section with oversized impact numbers.

**Primary recommendation:** Decompose the single-file dashboard into named section components, use `bg-surface-secondary` and `bg-white` alternating section wrappers, and reserve Card component usage only for the mini trend chart and modal. Remove Card from all other locations.

---

## Standard Stack

### Core (already in project — no new installs needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 14 (App Router) | Page and component rendering | Locked from project setup |
| Tailwind CSS | 3.x | Utility-first styling, section backgrounds | Locked; all design tokens already defined |
| class-variance-authority (cva) | existing | Variant-based component styling | Already used in Heading, Button, Badge, Text |
| lucide-react | existing | Icons | Locked from Phase 17 |
| Recharts | existing | CategoryMiniChart | Already integrated |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| cn() utility | existing | Conditional className merging | All component className composition |
| FadeIn component | existing | Scroll-reveal animation | Section entry animations (prefers-reduced-motion handled) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual section wrappers | Framer Motion layout | Framer Motion adds bundle weight; FadeIn already handles scroll reveal |
| Tailwind grid | CSS Grid custom properties | Tailwind grid utilities sufficient; no new tokens needed |
| New display size tokens | Inline style override | Tailwind config already has `text-display` (clamp 2.5rem–4.5rem) — use it |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Page Structure

The current `page.tsx` is a single 965-line "use client" component. The refactor should break it into named section components co-located in the same directory or a `_sections/` subfolder.

```
packages/frontend/src/app/leagues/[id]/
├── page.tsx                      # Orchestrator: data fetching + section assembly
├── _sections/
│   ├── IdentitySection.tsx       # Team name, rank, total points — editorial hero
│   ├── ActionsSection.tsx        # Dominant recommended actions block
│   ├── StatsSection.tsx          # Asymmetric: health overview + mini chart
│   ├── CategoryTableSection.tsx  # Category stats table — structured, reduced padding
│   ├── NavigationSection.tsx     # Quick actions — horizontal list not card grid
│   └── RosterSection.tsx         # Roster table — tighter typography
```

Alternatively (simpler), keep everything in one file but clearly delineated by section boundary comments and wrapper `<section>` elements. Given the file is already 965 lines, extraction is recommended.

### Pattern 1: Section-Based Background Alternation

**What:** Instead of floating cards (white box on white background), use full-width section wrappers with alternating `bg-white` / `bg-surface-secondary` backgrounds.

**When to use:** Every logical content group. The visual break between sections replaces card borders.

**Example:**
```tsx
// Identity section — white background, open layout
<section className="bg-white py-12">
  <Container size="wide">
    {/* editorial content */}
  </Container>
</section>

// Actions section — secondary background, dominant block
<section className="bg-surface-secondary py-10">
  <Container size="wide">
    {/* recommended actions */}
  </Container>
</section>

// Stats section — back to white
<section className="bg-white py-10">
  <Container size="wide">
    {/* asymmetric grid */}
  </Container>
</section>
```

**Tailwind tokens to use:** `bg-white`, `bg-surface-secondary` (#f8f9fa), `bg-surface-tertiary` (#f1f3f5). All already defined in `tailwind.config.js`.

### Pattern 2: Editorial Identity Section

**What:** Replace the current `<PageHeader>` + `<Card>` overall standing banner with an open, typographically-driven identity block. No card border. Team name as `text-display` (clamp 2.5rem–4.5rem), rank and points as giant numerals.

**Current state:** Team name is `Heading level={2}` inside a `<Card>`, rank is `text-3xl font-bold`.

**Target state:**
```tsx
// No card wrapper — just spacing and typography
<section className="bg-white pt-10 pb-8">
  <Container size="wide">
    {/* Back link + utility controls in a tight top row */}
    <div className="flex items-center justify-between mb-6">
      <Link href="/leagues" className="text-body-sm text-content-secondary ...">
        ← {league.name}
      </Link>
      <div className="flex gap-3">
        <Button variant="secondary" size="sm" onClick={() => setShowAuthModal(true)}>
          Update Auth
        </Button>
        <Button variant="secondary" size="sm" onClick={...}>
          Refresh
        </Button>
      </div>
    </div>

    {/* Team name — editorial scale */}
    <h1 className="text-display font-semibold tracking-tight text-content mb-2">
      {teamOverview.team.name}
    </h1>
    <p className="text-body-sm text-content-tertiary mb-10">
      {league.name} · Season {league.season} · {teamOverview.snapshotDate.split('T')[0]}
    </p>

    {/* Rank + Points — oversized numerals, no box */}
    <div className="flex items-end gap-12">
      <div>
        <p className="text-caption uppercase tracking-widest text-content-tertiary mb-1">
          Overall Rank
        </p>
        <p className="text-display font-bold text-content leading-none">
          {teamOverview.overall.overall_rank}
          <span className="text-h3 font-normal text-content-tertiary ml-2">
            / {teamOverview.overall.total_teams}
          </span>
        </p>
      </div>
      <div>
        <p className="text-caption uppercase tracking-widest text-content-tertiary mb-1">
          Total Points
        </p>
        <p className="text-display font-bold text-content leading-none">
          {Number(teamOverview.overall.overall_points)}
        </p>
      </div>
    </div>
  </Container>
</section>
```

**Key tokens:**
- `text-display`: `clamp(2.5rem, 5vw, 4.5rem)` with `fontWeight: 700` — already in tailwind.config.js
- `text-caption`: `0.75rem` with `letterSpacing: 0.02em` — already defined
- No `border`, no `rounded-card`, no `shadow-card`

### Pattern 3: Dominant Actions Section

**What:** Recommended Actions becomes the most visually dominant section: full secondary-background band, oversized `+X.X pts` impact numbers, clear call-to-action hierarchy.

**Current state:** `<Card>` with `<ActionItemsList>` rendering `border-l-4` items in a uniform `space-y-3` list.

**Target state:**
```tsx
<section className="bg-surface-secondary py-12">
  <Container size="wide">
    <div className="flex items-baseline justify-between mb-8">
      <h2 className="text-h1 font-semibold text-content">Recommended Actions</h2>
      <div className="flex gap-6">
        <Link href={`/leagues/${leagueId}/waivers`} className="text-body-sm text-content-secondary hover:text-content">
          All Waivers →
        </Link>
        <Link href={`/leagues/${leagueId}/trades`} className="text-body-sm text-content-secondary hover:text-content">
          All Trades →
        </Link>
      </div>
    </div>

    {/* Each action item: horizontal divider row, not card */}
    <div className="divide-y divide-neutral-200">
      {actionItems.map(item => (
        <div key={item.id} className="py-5 flex items-center gap-6">
          {/* Impact: oversized, leftmost */}
          <div className="w-20 text-right flex-shrink-0">
            <span className="text-h2 font-bold text-positive">{item.impact}</span>
          </div>
          {/* Badge + Title + Description */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant={item.type === 'waiver' ? 'info' : 'default'}>
                {item.type}
              </Badge>
              <span className="text-caption uppercase tracking-wide text-content-tertiary">
                {item.priority} priority
              </span>
            </div>
            <p className="text-body font-semibold text-content">{item.title}</p>
            <p className="text-body-sm text-content-secondary">{item.description}</p>
          </div>
          {/* CTAs */}
          <div className="flex gap-2 flex-shrink-0">
            {item.internalLink && (
              <Link href={item.internalLink}>
                <Button variant="secondary" size="sm">Analyze</Button>
              </Link>
            )}
            {item.espnLink && (
              <a href={item.espnLink} target="_blank" rel="noopener noreferrer">
                <Button size="sm">ESPN ↗</Button>
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  </Container>
</section>
```

### Pattern 4: Asymmetric Stats Grid

**What:** Replace the current `grid-cols-1 lg:grid-cols-3` health + chart grid with an intentionally unbalanced `8/4` split. The health overview dominates; the chart is secondary.

**Current state:** `<div className="grid grid-cols-1 lg:grid-cols-3 gap-grid mb-6">` with `lg:col-span-2` for health.

**Target state:**
```tsx
<section className="bg-white py-10">
  <Container size="wide">
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Dominant left: health overview — 8 of 12 columns */}
      <div className="lg:col-span-8">
        <h2 className="text-h2 font-semibold text-content mb-6">Team Health</h2>
        {/* TeamHealthOverview — remove card wrappers within it */}
        <TeamHealthOverview ... />
      </div>
      {/* Secondary right: trend chart — 4 of 12 columns */}
      <div className="lg:col-span-4">
        <h3 className="text-body font-medium text-content-secondary uppercase tracking-wider mb-4">
          Standings Trend
        </h3>
        {/* Keep Card here — one exception: chart needs a contained surface */}
        <Card>
          <CardContent>
            <CategoryMiniChart data={miniChartData} />
          </CardContent>
        </Card>
      </div>
    </div>
  </Container>
</section>
```

### Pattern 5: KPI Stats Without Stat Cards

**What:** Remove the 3-column `<StatCard>` grid (Total Snapshots, Latest Snapshot, Status). This is SaaS boilerplate. Fold the "status" signal into the identity section as a small inline indicator. Total Snapshots is not useful for the user's daily workflow.

**Recommendation:** Eliminate the KPI cards section entirely. Move the degraded warning inline below the identity section. Move snapshot date into the identity section metadata line.

### Pattern 6: Quick Actions as Horizontal Navigation List

**What:** The current "Quick Actions" is 9 equal-weight cards in a `grid-cols-4`. Replace with a compact horizontal scroll strip or a structured two-column list with no card borders.

**Target state (compact list):**
```tsx
<section className="bg-surface-tertiary py-8">
  <Container size="wide">
    <h2 className="text-body font-medium text-content-secondary uppercase tracking-wider mb-4">
      Quick Access
    </h2>
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
      {quickLinks.map(link => (
        <Link
          key={link.href}
          href={link.href}
          className="flex items-center gap-2 px-3 py-2.5 text-body-sm font-medium text-content
                     hover:text-accent hover:bg-accent-light rounded-md transition-colors"
        >
          {link.icon}
          {link.label}
        </Link>
      ))}
    </div>
  </Container>
</section>
```

### Pattern 7: Tighter Roster Table

**What:** The existing roster tables use `px-4 py-2` with `bg-surface-secondary` headers. Increase typographic contrast, reduce padding, add a left-column slot indicator as a monospace datum.

**Target table changes:**
```tsx
// Header row: stronger contrast, tighter
<th className="pb-2 pt-1 text-caption font-semibold text-content-secondary uppercase tracking-widest text-left border-b border-neutral-300">
  Slot
</th>
// Data rows: tighter, data font
<td className="py-2 text-data font-medium text-content-secondary w-12">
  {p.roster_slot}
</td>
<td className="py-2 text-body-sm font-medium text-content">
  {p.player_name}
</td>
```

Note: `text-data` is defined in tailwind.config.js as `0.8125rem` with `fontFamily: 'var(--font-mono)'` — use it for slot identifiers and stat values.

### Anti-Patterns to Avoid

- **Wrapping every section in `<Card>`:** The Card component now has one job — isolated floating surfaces (the mini chart, the auth modal). Using Card as a page-layout container is the SaaS anti-pattern this phase removes.
- **Equal-weight grid sections:** All grid columns the same size. Prefer 8/4, 7/5, or 2/3 splits over 6/6.
- **Text that is a label for a label:** "Overall Rank" as a card title, then "Rank" as a sub-label inside. Collapse to single-level labeling.
- **Icon + text quick-action cards:** The existing quick-action cards each have a large icon + text in a bordered box. This is visual weight without information weight. Remove the boxes, keep icon + text.
- **Removing the team selector:** The `<TeamSelector>` is functional — it must stay. But it should live inline in the identity section (pre-team-selected state), not in a prominent Card.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Responsive fluid type | Custom viewport-unit font-size | Existing `text-display`, `text-h1` Tailwind tokens | Already use `clamp()` correctly |
| Section background alternation | Complex CSS classes or plugins | `bg-white` / `bg-surface-secondary` / `bg-surface-tertiary` | Three neutral tiers already in token system |
| Divider-based list | Custom component | `divide-y divide-neutral-200` Tailwind utility | One class, zero custom CSS |
| Animation on section entry | Custom IntersectionObserver | Existing `<FadeIn>` component | Already handles prefers-reduced-motion |
| Monospace stat digits | Custom font loading | `text-data` token (already `var(--font-mono)`) | Already in tailwind.config.js |

**Key insight:** Phase 17 established a token system that perfectly supports this editorial direction. The `text-display` token exists specifically for "landing page hero only" — this identity section is that use case. No new CSS or Tailwind extensions needed.

---

## Common Pitfalls

### Pitfall 1: Removing Card from the CategoryStatsTable
**What goes wrong:** CategoryStatsTable relies on a containing surface for its `overflow-x-auto` scroll. Without a background context, the table merges visually with adjacent sections.
**Why it happens:** The Card was providing both visual grouping AND layout containment.
**How to avoid:** Replace Card with a section wrapper that still provides overflow handling. The `<section className="bg-white py-10">` wrapper handles the background; add `overflow-x-auto` directly to the table's container div.
**Warning signs:** Table rows bleed into adjacent background sections on mobile.

### Pitfall 2: Breaking the TeamSelector localStorage behavior
**What goes wrong:** TeamSelector manages `localStorage.getItem/setItem` to persist team selection. If the component is moved to a different section structure, the `useEffect` dependencies may re-run incorrectly.
**Why it happens:** The effect depends on `leagueId` and `autoDetectedTeamId`. Component relocation doesn't affect this, but prop drilling changes might.
**How to avoid:** Keep TeamSelector as-is, just relocate it visually into the identity section's pre-state (no team selected) vs. collapsing it inline once selected.
**Warning signs:** Team selection resets on page re-render.

### Pitfall 3: The "no team selected" empty state still needs structure
**What goes wrong:** When no team is selected, large portions of the new layout (identity section stats, actions section, stats grid) are empty. The current code uses conditional rendering via `{selectedTeamId && ...}` blocks.
**Why it happens:** The identity section redesign can't show rank/points if no team is selected.
**How to avoid:** The identity section has two visual states: (a) no team selected — show team selector prominently as the CTA; (b) team selected — show editorial identity content. Design both states.
**Warning signs:** Blank page with large empty whitespace when visiting the dashboard before selecting a team.

### Pitfall 4: `text-display` is very large on mobile
**What goes wrong:** The `text-display` token is `clamp(2.5rem, 5vw, 4.5rem)`. On a 320px mobile viewport, 5vw = 16px which is below the minimum, so it clamps to 2.5rem (40px). This is fine for a team name but enormous for rank numbers stacked vertically.
**Why it happens:** The CONTEXT says "Increase typography scale for rank and point deltas" without specifying target size.
**How to avoid:** Use `text-display` for team name. Use `text-h1` (clamp 2rem–3rem) for rank/points numbers. This maintains hierarchy without overwhelming mobile layouts.
**Warning signs:** Rank and points numbers wrapping to two lines on mobile viewports.

### Pitfall 5: Removing all Card borders breaks the mini trend chart
**What goes wrong:** The CategoryMiniChart is a Recharts component rendered inside a Card. If removed from Card, the chart has no containing surface and no natural boundary — it can appear to float on a white background with no visual anchoring.
**Why it happens:** The chart is a data visualization, not a content section. It needs a subtle container.
**How to avoid:** Keep `<Card>` for the mini chart specifically. This is explicitly one of the allowed Card use cases post-refactor.
**Warning signs:** Chart appears unanchored, especially in the asymmetric 4-column sidebar position.

### Pitfall 6: Auth modal currently uses inline `bg-white rounded-card max-w-lg`
**What goes wrong:** The auth modal currently does NOT use the Card component — it renders raw `<div className="bg-white rounded-card...">`. This is fine and should stay.
**Why it happens:** It was built before Phase 17 Card component.
**How to avoid:** Leave the modal as-is. This is a deferred improvement.
**Warning signs:** Attempting to refactor the modal into the new section structure when it should remain floating/fixed.

---

## Code Examples

Verified patterns from the existing codebase and Tailwind config:

### Section-based alternating backgrounds
```tsx
// Source: tailwind.config.js — surface tokens
// bg-white (#ffffff), bg-surface-secondary (#f8f9fa), bg-surface-tertiary (#f1f3f5)

<section className="bg-surface-secondary py-12">
  <Container size="wide">
    {/* content */}
  </Container>
</section>
```

### Display-scale identity numerals
```tsx
// Source: tailwind.config.js — text-display, text-h1
// text-display: clamp(2.5rem, 5vw, 4.5rem), fontWeight: 700
// text-h1: clamp(2rem, 3vw, 3rem), fontWeight: 600

<p className="text-display font-bold text-content leading-none">
  {teamOverview.overall.overall_rank}
  <span className="text-h2 font-normal text-content-tertiary ml-3">
    / {teamOverview.overall.total_teams}
  </span>
</p>
```

### Divider-list action items (replaces Card-wrapped ActionItemsList)
```tsx
// Source: Tailwind docs — divide-y utility
<div className="divide-y divide-neutral-200">
  {actionItems.map(item => (
    <div key={item.id} className="py-5 flex items-start gap-6">
      <span className="text-h2 font-bold text-positive w-20 text-right flex-shrink-0">
        {item.impact}
      </span>
      <div className="flex-1">
        {/* ... */}
      </div>
    </div>
  ))}
</div>
```

### Asymmetric 12-column grid
```tsx
// Source: Tailwind docs — grid-template-columns, col-span
<div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
  <div className="lg:col-span-8">
    {/* dominant section */}
  </div>
  <div className="lg:col-span-4">
    {/* secondary section */}
  </div>
</div>
```

### Caption label above data pattern
```tsx
// Source: tailwind.config.js — text-caption token
// text-caption: 0.75rem, letterSpacing: 0.02em
<p className="text-caption uppercase tracking-widest text-content-tertiary mb-1">
  Overall Rank
</p>
```

### Compact quick-action link (no card)
```tsx
// No Card, no border, no shadow — just spacing and hover state
<Link
  href={`/leagues/${leagueId}/standings`}
  className="flex items-center gap-2.5 px-3 py-2.5 rounded-md
             text-body-sm font-medium text-content
             hover:bg-accent-light hover:text-content
             transition-colors"
>
  <TableIcon className="h-4 w-4 text-content-tertiary" />
  Standings
</Link>
```

### Tighter table header (typographic contrast)
```tsx
// Stronger label contrast, tighter padding, border-b instead of bg-surface-secondary row
<thead>
  <tr className="border-b-2 border-neutral-200">
    <th className="pb-3 pt-1 text-caption font-semibold uppercase tracking-widest text-content-secondary text-left">
      Slot
    </th>
    <th className="pb-3 pt-1 text-caption font-semibold uppercase tracking-widest text-content-secondary text-left">
      Player
    </th>
  </tr>
</thead>
<tbody className="divide-y divide-neutral-100">
  <tr>
    <td className="py-2.5 text-data font-medium text-content-secondary">
      {p.roster_slot}
    </td>
    <td className="py-2.5 text-body-sm font-medium text-content">
      {p.player_name}
    </td>
  </tr>
</tbody>
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Card-based SaaS dashboard | Section-based editorial composition | Primary goal of this phase |
| Equal-weight grid (3-col KPI cards) | Eliminate KPI card section entirely | Removes SaaS boilerplate |
| `<Card>` wrapping every content block | Card used only for chart + modal | Card as exception, not default |
| `text-3xl font-bold` for rank | `text-display` or `text-h1` with `leading-none` | Uses existing design tokens properly |
| Uniform `border-l-4` action items | Divider-list with oversized impact numbers | Compositional hierarchy without decorative color |
| 4-col equal icon-card quick actions | Compact text-link navigation strip | Information-dense without visual weight |
| `bg-surface-secondary` thead in tables | `border-b-2` separator, tighter padding | Typography drives hierarchy, not fill |

---

## Open Questions

1. **Team selector pre-selected state**
   - What we know: The TeamSelector handles auto-detection via `autoDetectedTeamId`. When auto-detected, the dropdown is still shown (with a "Team Auto-Detected" badge above it).
   - What's unclear: Should the team selector be hidden/collapsed when a team is already selected (common in real product dashboards) to reduce visual overhead in the identity section?
   - Recommendation: When `selectedTeamId` is set, show only the team name (already the `text-display` headline) with a small "change team" ghost link. When not set, show the full TeamSelector component prominently.

2. **Where the degraded warning goes**
   - What we know: It currently renders between the team selector card and the team overview content.
   - What's unclear: In the new section layout, this inline warning floats between named sections.
   - Recommendation: Pin the degraded banner immediately below the identity section header bar (within the identity section, above rank/points). It reads as a status signal relevant to the identity context.

3. **Snapshot trigger button placement**
   - What we know: It currently lives in the metadata row as `ml-auto`. In the new layout there's no metadata row.
   - Recommendation: Move to the top-right utility row alongside "Update Auth". Both are infrequent utility actions and belong together.

4. **Whether to extract sections into separate files**
   - What we know: The page is 965 lines. Extraction improves maintainability but increases planning task count.
   - What's unclear: Whether the planner should create tasks per extracted file or treat the whole page as one task.
   - Recommendation: Extract into `_sections/` subfolder. This makes the composition-driven structure explicit in the file system and allows each section to be planned and reviewed independently.

5. **CategoryStatsTable padding reduction**
   - What we know: Current padding is `px-4 py-3`. The brief says "reduced padding."
   - Recommendation: Change to `px-0 py-2.5` for data rows (remove horizontal padding in section context — the section container handles horizontal spacing), `py-2` for dense data display.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase audit of `packages/frontend/src/app/leagues/[id]/page.tsx` — full 965-line dashboard
- `packages/frontend/tailwind.config.js` — verified all design tokens (text-display, text-h1, text-caption, text-data, bg-surface-*, content-*)
- `packages/frontend/src/components/ui/*.tsx` — Card, Container, Heading, Text, Button, Badge, StatCard, PageHeader
- `packages/frontend/src/components/league/*.tsx` — ActionItemsList, CategoryStatsTable, TeamHealthOverview, CategoryMiniChart, TeamSelector
- `packages/frontend/src/components/motion/FadeIn.tsx` — animation component
- `packages/frontend/src/app/layout.tsx` — Inter font variable confirmed as `--font-inter`

### Secondary (MEDIUM confidence)
- [Modern CSS Section Layout - Ahmad Shadeed](https://ishadeed.com/article/modern-css-section-layout/) — verified section composition patterns
- [Tailwind CSS grid-column docs](https://tailwindcss.com/docs/grid-column) — col-span asymmetric grid patterns

### Tertiary (LOW confidence)
- [Editorial Design Trends 2025 - Medium](https://medium.com/@allclonescript/20-best-dashboard-ui-ux-design-principles-you-need-in-2025-30b661f2f795) — editorial dashboard principles
- [CSS Techniques 2025 - DEV Community](https://dev.to/dimeloper/css-techniques-every-developer-should-know-in-2025-30p9) — modern CSS layout patterns

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all tokens verified in codebase
- Architecture patterns: HIGH — verified against current page.tsx structure
- Component reuse: HIGH — all components inspected directly
- Design pattern recommendations: MEDIUM — based on established editorial conventions, verified token support
- Pitfalls: HIGH — all identified from direct code reading

**Research date:** 2026-03-03
**Valid until:** 2026-04-03 (stable tech; design direction is locked by CONTEXT.md)
