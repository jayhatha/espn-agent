# Technology Stack — In-Season Command Center (v6.0)

**Project:** ESPN Fantasy Baseball Assistant — In-Season Command Center
**Researched:** 2026-03-23
**Confidence:** HIGH (all critical choices verified via npm registry, official docs, or multiple sources)

## Executive Summary

The v6.0 milestone is a **frontend-heavy overhaul** of the in-season experience. The backend already has all the computation primitives needed (snapshot pipeline, projections engine, roto ranking, waiver/trade agents). New backend work is pure logic changes to existing agents — no new backend libraries required. The frontend needs:

1. **Dark mode theming** — `next-themes` + Tailwind `darkMode: 'class'` + a new dark design token layer in `tailwind.config.js`
2. **JetBrains Mono for numerics** — loaded via `next/font/google` alongside existing Inter
3. **Recharts upgrade 2.x → 3.x** — v3 rewrote state management, fixes long-standing bugs, and the project is already on `^2.10.4` (not yet 3.x); a controlled upgrade is needed
4. **Dense table rendering** — `@tanstack/react-table` v8 for sortable/filterable data tables; `@tanstack/react-virtual` v3 for virtualized rows in the trade scanner (potentially hundreds of candidates)
5. **Sparklines in table rows** — Recharts `ComposedChart` with width/height clamped to table cell dimensions works; no new charting library needed
6. **Backend concurrency** — `p-limit` is already installed; the trade scanner will use it for controlled parallel team comparisons. No additions.

**Net new production packages:** 3 (`next-themes`, `@tanstack/react-table`, `@tanstack/react-virtual`)
**Upgrades:** 1 (`recharts` 2.x → 3.x)
**Font additions:** 1 (`JetBrains_Mono` from `next/font/google` — zero npm packages, built into Next.js)
**Backend changes:** Zero new packages

---

## Complete Dependency Delta

### `packages/frontend`

| Action | Package | Version | Reason |
|--------|---------|---------|--------|
| ADD | `next-themes` | `^0.4.6` | Dark mode toggle + SSR-safe theme persistence. Flicker-free via `suppressHydrationWarning`. |
| ADD | `@tanstack/react-table` | `^8.21.3` | Headless sortable/filterable tables for roto tracker, trade scanner, FAAB history |
| ADD | `@tanstack/react-virtual` | `^3.13.23` | Virtualized row rendering for trade scanner (all-team permutations) |
| UPGRADE | `recharts` | `^2.10.4` → `^3.8.0` | v3 rewrote state management, fixed long-standing tooltip/axis bugs, adds `responsive` prop |

### `packages/backend`

| Action | Package | Version | Reason |
|--------|---------|---------|--------|
| NONE | — | — | All needed libraries (`p-limit`, `date-fns`, `kysely`) already installed |

### Configuration Changes (No npm packages)

| Change | Location | What |
|--------|----------|------|
| Add `JetBrains_Mono` font | `packages/frontend/src/app/layout.tsx` | Load via `next/font/google` alongside existing Inter |
| Add `--font-mono` CSS var | `packages/frontend/src/app/layout.tsx` | Exposes font as Tailwind-compatible CSS variable |
| Add `darkMode: 'class'` | `packages/frontend/tailwind.config.js` | Enables `dark:` prefix on all utility classes |
| Add dark token layer | `packages/frontend/tailwind.config.js` | New `dark` color palette mirroring existing tokens |
| Update `CHART_THEME` | `packages/frontend/src/lib/chart-theme.ts` | Add `dark` variant tokens for Recharts components |

---

## Feature-by-Feature Breakdown

### 1. Dark Mode Theming (Linear-Style)

**Strategy:** Tailwind `darkMode: 'class'` + `next-themes` for SSR-safe toggle.

The existing frontend is light-mode-only with hardcoded surface/content tokens. The dark command center needs a parallel token set on the `dark` class. The Grafana dark tokens already exist in `tailwind.config.js` under `grafana.*` — promote them to `dark:surface-*` / `dark:content-*` counterparts.

**`next-themes` — why it's needed:**
- `localStorage` persistence: user preference survives page reload
- SSR-safe: prevents the flash of light mode on dark preference by injecting an inline script before React hydrates
- System preference sync: `media` strategy reads `prefers-color-scheme` as default
- Requires `suppressHydrationWarning` on `<html>` — one-line change to `layout.tsx`
- Version `^0.4.6` — last published ~1 year ago but actively maintained; no breaking changes expected

**Tailwind config addition:**

```js
// tailwind.config.js
darkMode: 'class',
theme: {
  extend: {
    colors: {
      // Existing light tokens stay unchanged.
      // Dark command center palette (Linear-inspired):
      dark: {
        bg:      '#0d0d0f',   // near-black body
        surface: '#141417',   // card/panel background
        raised:  '#1c1c21',   // elevated surface (dropdowns, modals)
        border:  '#2a2a32',   // subtle border
        text:    '#e2e2e8',   // primary text
        muted:   '#8888a0',   // secondary/muted text
        positive:'#34d399',   // green (gain)
        negative:'#f87171',   // red (loss)
        warning: '#fbbf24',   // amber (caution)
        accent:  '#6366f1',   // indigo accent (interactive elements)
      }
    }
  }
}
```

**`globals.css` addition:**

```css
.dark body {
  @apply bg-dark-bg text-dark-text;
}
```

**`layout.tsx` changes:**

```tsx
import { JetBrains_Mono } from 'next/font/google';

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
});

// On <html>:
<html
  lang="en"
  suppressHydrationWarning
  className={`${inter.variable} ${dmSerifDisplay.variable} ${jetbrainsMono.variable}`}
>
```

The existing `tailwind.config.js` already has `'data': { fontFamily: 'var(--font-mono, ui-monospace)' }` — wiring JetBrains Mono to `--font-mono` means all `text-data` class usages automatically get JetBrains Mono. No component changes needed for numeric data already styled with `text-data`.

**`next-themes` provider setup (in `packages/frontend/src/app/providers.tsx`):**

```tsx
'use client';
import { ThemeProvider } from 'next-themes';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      {/* existing TanStack Query provider wraps here */}
      {children}
    </ThemeProvider>
  );
}
```

`defaultTheme="dark"` makes the command center dark by default (suitable for a trading terminal aesthetic). `enableSystem` allows falling back to OS preference when user hasn't chosen explicitly.

---

### 2. JetBrains Mono for Numerics

JetBrains Mono is available on Google Fonts and loads via `next/font/google` — zero npm packages. The font pairs well with Inter (both are clean, geometric, designed for screen readability). The combination scores 88/100 for text/code pairing (MEDIUM confidence — marketing source).

The existing `tailwind.config.js` already has a `data` font size token that references `var(--font-mono)`. Wire JetBrains Mono to `--font-mono` in layout.tsx and all stat cells, standings numbers, and budget figures styled with `text-data` (or `font-mono` utility class) will automatically use it.

**Usage pattern in command center components:**

```tsx
// Dense stat table cell
<td className="font-mono text-xs tabular-nums text-dark-text">
  {formatStat(value)}
</td>
```

`tabular-nums` (Tailwind utility) is critical for aligned number columns — activates OpenType `tnum` feature so digits are all the same width.

---

### 3. Recharts Upgrade: 2.x → 3.x

The project is on `recharts@^2.10.4`. Version 3 (current: `3.8.0`, last published 16 days ago) is a major rewrite of internal state management with ~3,500 new unit tests. It fixes the infinite re-render loop bug (common in multi-series charts) and the tooltip flicker bug (visible in the current trends page).

**Breaking changes relevant to this codebase:**

| Change | Impact | Fix |
|--------|--------|-----|
| `CategoricalChartState` removed from event handlers | LOW — not used in this codebase | None |
| `activeIndex` prop removed | LOW — not used | None |
| `accessibilityLayer` defaults to `true` (was `false`) | LOW — adds a11y attributes | None needed; it's beneficial |
| `ResponsiveContainer` accepts `responsive` prop on charts directly | LOW — old pattern still works | Optional cleanup |
| `activeShape`/`inactiveShape` deprecated on Pie | NONE — no Pie charts used | None |

The existing `CHART_THEME` in `chart-theme.ts` uses hardcoded hex colors. For dark mode, the theme needs a variant. The cleanest approach: export `CHART_THEME_DARK` alongside `CHART_THEME_LIGHT` and select based on `useTheme()` from `next-themes`.

**Dark chart theme:**

```ts
export const CHART_THEME_DARK = {
  colors: [
    '#818cf8', // indigo-400 (primary series — readable on dark bg)
    '#94a3b8', // slate-400
    '#475569', // slate-600
    '#34d399', // emerald-400 (positive)
    '#f87171', // red-400 (negative)
    '#60a5fa', // blue-400 (info)
  ],
  grid: {
    stroke: '#2a2a32',
    strokeDasharray: '3 3',
  },
  axis: {
    tick: { fill: '#8888a0', fontSize: 12 },
    label: { fill: '#e2e2e8', fontSize: 12 },
  },
  tooltip: {
    backgroundColor: '#1c1c21',
    borderColor: '#2a2a32',
    borderRadius: 8,
  },
};
```

---

### 4. Dense Tables: @tanstack/react-table

**Version:** `^8.21.3` (latest as of March 2026, 5.3M weekly downloads)
**Install:** `packages/frontend`

The command center features require sortable, filterable, dense data tables:
- On-pace roto tracker: 10–12 teams × 13 categories = 130+ cells, sortable by category
- Trade scanner: potentially 200+ trade candidates, sortable by roto delta
- FAAB history: transactions over a season, filterable by team/player/date

TanStack Table v8 is headless — it provides the data model (sorting, filtering, pagination, column visibility) and you supply the JSX. This integrates with the existing Tailwind token system and dark mode classes without imposing component library opinions.

**Why not alternatives:**
- `react-table` v7: old API, use v8 (same team, clean break)
- AG Grid Community: brings its own CSS framework — conflicts with Tailwind dark mode strategy
- Shadcn data table: it's TanStack Table v8 underneath with opinionated styling — use TanStack directly for full control over the trading terminal aesthetic

**Usage pattern:**

```tsx
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
} from '@tanstack/react-table';

// Minimal dense table for roto tracker
const table = useReactTable({
  data: standings,
  columns,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
});
```

---

### 5. Virtualized Rows: @tanstack/react-virtual

**Version:** `^3.13.23` (latest as of March 2026, last published 7 days ago)
**Install:** `packages/frontend`
**Use case:** Trade scanner output

The automatic trade finder scans all possible 1-for-1 (and potentially N-for-M) trades across all teams. For a 12-team league with 25-man rosters, a 1-for-1 scan produces ~7,200 candidate pairs. Rendering 7,200 DOM rows causes layout thrashing. `@tanstack/react-virtual` renders only the rows in the viewport.

TanStack Virtual integrates directly with TanStack Table's `getRowModel()` output — the two are designed to work together.

**Why not `react-window`:** TanStack Virtual is the maintained successor and integrates cleanly with TanStack Table. `react-window` requires wrapping the entire table structure, which conflicts with sticky column headers.

**Usage pattern:**

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

const rowVirtualizer = useVirtualizer({
  count: table.getRowModel().rows.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 36, // 36px dense row height
});
```

---

### 6. Sparklines in Table Rows

**Decision: Use Recharts directly, no additional library.**

The hot/cold trends table and roto tracker need small trend lines in table cells (last 7-day or last 30-day sparklines). Options:

- `react-sparklines` (`npm install react-sparklines`): 3.4KB, very simple API. Last commit 2019 — unmaintained.
- `recharts` miniature chart (already installed): `<LineChart width={80} height={32}>` with `CartesianGrid` and axes suppressed. Slightly more verbose but zero new dependency.
- SVG path manually: raw `<polyline>` over normalized data. Smallest, no dependency. Manageable for this use case.

**Recommendation: SVG polyline for sparklines.** It's 10 lines of code, has zero bundle cost, and is trivially styled with dark mode Tailwind classes. Reserve Recharts for full-height charts where axis labels and tooltips matter. A 80×32px cell sparkline does not need Recharts overhead.

```tsx
function Sparkline({ values, width = 80, height = 24 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}
```

---

### 7. Backend: No New Libraries

The backend already has everything needed for the new computation:

| Feature | Existing Tool | Notes |
|---------|--------------|-------|
| On-pace interpolation | `date-fns` v2 (backend), `date-fns` v3 (frontend) | Day-of-year math for pace calculation |
| Roto delta computation | `StandingsProjectionAgent` | Extend with marginal gain output |
| Trade scan concurrency | `p-limit@^7.3.0` (already installed) | Already used for ESPN API batching |
| FAAB history queries | `Kysely` + PostgreSQL | Add query to existing `league_transaction_event` table |
| GS counting | `date-fns` + ESPN roster data | Count starts in current week window |
| Hot/cold trends | Snapshot data in `team_daily_category_totals` | 7-day rolling delta query |

**Note on `date-fns` version mismatch:** Backend uses `date-fns@^2.30.0`, frontend uses `date-fns@^3.0.6`. These are separate package installs in the monorepo — no conflict. Do not upgrade the backend `date-fns` in this milestone; v2 has a stable API and upgrading would require ESM import changes across backend files.

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `tremor` or `shadcn/ui` chart components | Both wrap Recharts — adding a wrapper library on top of an already-installed library adds bundle weight and theming friction. Dark mode requires overriding their token system. | Use Recharts directly with `CHART_THEME_DARK` |
| `visx` or `d3` | Full D3 binding layers are appropriate for bespoke visualizations. The command center needs standard chart types (line, bar, area). Recharts handles this with far less boilerplate. | Recharts `^3.8.0` |
| `react-sparklines` | Last commit 2019. Unmaintained. | SVG `<polyline>` (10 lines) |
| AG Grid | Brings its own CSS framework and opinionated dark mode. Conflicts with Tailwind dark class strategy. | `@tanstack/react-table` v8 |
| `numeral.js` or `accounting.js` | Unmaintained or overkill for stat formatting. | Native `Intl.NumberFormat` or `toFixed()` for the narrow formatting needs here |
| `react-window` | Older virtual scrolling library. Doesn't integrate cleanly with TanStack Table headers. | `@tanstack/react-virtual` v3 |
| `tailwindcss-animate` | Not needed. `motion` (already installed) handles all animations in the command center. | Existing `motion@^12.36.0` |
| Any new state management library | TanStack Query v5 handles server state; React `useState`/`useReducer` handles UI state. No global client state needed for in-season views. | Existing `@tanstack/react-query@^5` |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Dark mode management | `next-themes@^0.4.6` | CSS `@media (prefers-color-scheme: dark)` only | Media query alone can't be overridden by user preference. `next-themes` adds the `dark` class on `<html>` from localStorage, avoiding both FOUC and media-query lock-in. |
| Dark mode management | `next-themes@^0.4.6` | `use-dark-mode` npm package | `use-dark-mode` is not SSR-aware and causes hydration mismatches in Next.js App Router. `next-themes` is built for this exact stack. |
| Recharts upgrade | 3.x | Stay on 2.x | The infinite re-render and tooltip flicker bugs visible in the current trends page are fixed in 3.x. Multi-series charts in the on-pace tracker will hit these bugs at higher data density. The breaking changes list has zero impact on this codebase. |
| Table library | `@tanstack/react-table` v8 | Native `<table>` with manual sort | Manual sort is fine for 20 rows. The trade scanner can produce 200+ rows with multi-column sort needed. TanStack Table eliminates sorting/filtering boilerplate. |
| Virtualization | `@tanstack/react-virtual` v3 | Pagination | Pagination hides data. Trading terminal users want to scroll through all candidates ranked by impact. Virtualization gives infinite-scroll feel with DOM efficiency. |
| Sparklines | SVG polyline | `react-sparklines` | Zero dependency wins over an unmaintained 7-year-old library for a 10-line implementation. |
| Font (numerics) | JetBrains Mono via `next/font/google` | `@fontsource/jetbrains-mono` | `next/font/google` self-hosts automatically with zero network requests to Google at runtime. `@fontsource` requires a manual npm package. Both work; `next/font` is the Next.js-native approach. |

---

## Installation

```bash
# From repo root
cd packages/frontend
pnpm add next-themes @tanstack/react-table @tanstack/react-virtual
pnpm add recharts@^3.8.0  # upgrade from 2.x
```

Verify the upgrade did not introduce Pie chart regressions (none used here, but review `CHART_THEME` usage across all page files after upgrade).

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `next-themes@^0.4.6` | `next@^14.1.0`, `react@^18.2.0` | Requires `suppressHydrationWarning` on `<html>`. ThemeProvider must be in a `"use client"` file. |
| `next-themes@^0.4.6` | Tailwind `darkMode: 'class'` | The `attribute="class"` prop on ThemeProvider tells next-themes to apply the `dark` class to `<html>`. |
| `recharts@^3.8.0` | `react@^18.2.0` | React 18 supported. No Next.js App Router special config needed. |
| `recharts@^3.8.0` | `recharts@^2.10.4` migration | `CategoricalChartState`, `activeIndex`, `alwaysShow` props removed. Not used in this codebase. |
| `@tanstack/react-table@^8.21.3` | `react@^18.2.0` | React 16.8+ minimum. No SSR concerns — all tables are client-rendered in this app. |
| `@tanstack/react-virtual@^3.13.23` | `@tanstack/react-table@^8.x` | Designed to work together. Use `getRowModel().rows` as the virtualizer `count` source. |
| `JetBrains_Mono` via `next/font/google` | `next@^14.1.0` | `next/font/google` is stable in Next.js 14. Variable font (100–900 weights) loads as a single file. |

---

## Sources

- [next-themes npm registry](https://www.npmjs.com/package/next-themes) — Version 0.4.6 confirmed; last published ~1 year ago
- [next-themes GitHub (pacocoursey)](https://github.com/pacocoursey/next-themes) — App Router `suppressHydrationWarning` pattern
- [shadcn/ui Dark Mode — Next.js guide](https://ui.shadcn.com/docs/dark-mode/next) — ThemeProvider `"use client"` wrapper pattern
- [Tailwind CSS Dark Mode docs](https://tailwindcss.com/docs/dark-mode) — `class` strategy configuration
- [recharts npm registry](https://www.npmjs.com/package/recharts) — Version 3.8.0 confirmed, last published 16 days ago
- [recharts 3.0 migration guide (GitHub Wiki)](https://github.com/recharts/recharts/wiki/3.0-migration-guide) — Breaking changes list verified
- [@tanstack/react-table npm registry](https://www.npmjs.com/package/@tanstack/react-table) — Version 8.21.3, last published April 2025
- [TanStack Table v8 docs](https://tanstack.com/table/v8) — Sorting, filtering, headless API
- [@tanstack/react-virtual npm registry](https://www.npmjs.com/package/@tanstack/react-virtual) — Version 3.13.23, last published 7 days ago
- [TanStack Virtual docs](https://tanstack.com/virtual/latest/docs/framework/react/react-virtual) — React integration, `useVirtualizer` API
- [JetBrains Mono — Google Fonts](https://fonts.google.com/specimen/JetBrains+Mono) — Available in `next/font/google` as `JetBrains_Mono`
- [Next.js Font Optimization docs](https://nextjs.org/docs/14/app/building-your-application/optimizing/fonts) — `next/font/google` variable font usage
- [Inter + JetBrains Mono pairing](https://fontalternatives.com/pairings/inter-and-jetbrains-mono/) — Pairing score 88/100 (LOW confidence — marketing source, subjective)

---

*Stack research for: In-Season Command Center (v6.0) — dark mode theming, dense data tables, font additions, charting upgrades*
*Researched: 2026-03-23*
