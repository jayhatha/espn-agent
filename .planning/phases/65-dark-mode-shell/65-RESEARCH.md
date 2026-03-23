# Phase 65: Dark Mode Shell - Research

**Researched:** 2026-03-23
**Domain:** Next.js 14 App Router layout architecture, Tailwind CSS dark mode, next-themes, typography
**Confidence:** HIGH

---

## Summary

Phase 65 replaces the current light-mode horizontal-nav layout with a Linear-style dark command center: fixed left sidebar, top summary bar, right signals panel, and consistent dark typography. The work is purely frontend — no backend changes. Every page under `/leagues/[id]/` is wrapped by a new nested `layout.tsx` that provides the shell. All existing UI components need `dark:` variant classes added.

The stack is Next.js 14 App Router (already in use), Tailwind CSS v3 `darkMode: 'class'` (needs enabling), and next-themes for SSR-safe theme injection (needs installing). The shell is implemented as a single `layout.tsx` placed at `app/leagues/[id]/layout.tsx`. Existing UI components (`Card`, `Button`, `Badge`, `StatsTable`, etc.) need dark variants; the `Navigation` component in the root layout becomes obsolete for logged-in league views but should remain for auth/onboarding routes.

**Primary recommendation:** Install next-themes, set `darkMode: 'class'` in tailwind.config.js, create `app/leagues/[id]/layout.tsx` as the dark shell, then systematically add `dark:` prefixes to every shared UI component. Force `dark` as the only theme for the league shell — no toggle needed in v1.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SHELL-01 | Dashboard uses Linear-style dark palette (#0B0D10 background, #111318 panels, #1D2128 borders) | Add `shell-bg`, `shell-panel`, `shell-border` tokens to tailwind.config.js; apply as Tailwind classes in layout.tsx |
| SHELL-02 | Left nav with icon + label navigation (Dashboard, Standings, Categories, Roster, Waivers, FAAB Market, Pitching Usage, Trades, Settings) | New `LeagueNav` client component with `usePathname` active-link detection, replaces `NavigationSection` |
| SHELL-03 | Top bar shows league name, week, FAAB remaining, GS pace, projected total points | New `TopBar` client component; data comes from existing `getLeagueStatus` + `getTeamOverview` queries already loaded in dashboard; FAAB and GS pace are not yet in those APIs — flag as stub |
| SHELL-04 | Right signals panel with contextual daily action items | Extract from existing `ActionsSection` into a persistent right-column `SignalsPanel` component |
| SHELL-05 | Typography uses Inter for text, JetBrains Mono for numbers | Inter already loaded; add `JetBrains_Mono` via `next/font/google` with `variable: '--font-mono'` |
| SHELL-06 | All existing dashboard pages restyled to dark theme (no light mode remnants) | Add `dark:` variants to 13 UI components and 10+ page files; update `globals.css` base layer |
| SHELL-07 | 8px base spacing, 16px panel padding, 24px section spacing | Tailwind spacing scale already supports this; verify usage is `p-4` (16px), `gap-6` (24px), `gap-2` (8px) |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next-themes | ^0.4.6 | SSR-safe dark mode without flash | Injects script before React hydration; zero dependencies; official Next.js recommendation |
| Tailwind CSS | ^3.4.1 (already installed) | `dark:` variant class strategy | `darkMode: 'class'` pairs with next-themes `attribute="class"` |
| next/font/google | built-in to next@14 | JetBrains Mono variable font | Self-hosted, zero layout shift, no external request |
| lucide-react | ^0.576.0 (already installed) | Sidebar nav icons | Already in use; covers all required nav icons |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| class-variance-authority | ^0.7.1 (already installed) | Dark variant management in UI components | Use when a component has multiple color variants (Button, Badge) |
| clsx + tailwind-merge via `cn()` | already installed | Conditional class merging | All dark: class additions go through `cn()` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| next-themes | CSS `prefers-color-scheme` only | No user toggle, no localStorage persistence, flash risk |
| next-themes | Manual `localStorage` + `useEffect` | Reinvents next-themes, SSR flash guaranteed |
| `dark:` Tailwind variants | CSS custom properties + class swap | More indirection; Tailwind dark: is simpler given existing codebase |

**Installation:**
```bash
cd packages/frontend && pnpm add next-themes
```

---

## Architecture Patterns

### Recommended Project Structure

```
packages/frontend/src/app/
├── layout.tsx                      # Root shell — keeps Navigation for /login, /signup, /onboarding
├── globals.css                     # Add dark base layer vars
├── providers.tsx                   # Add ThemeProvider here
└── leagues/
    └── [id]/
        ├── layout.tsx              # NEW: dark shell (left nav + top bar + right panel)
        ├── page.tsx                # Dashboard — becomes main content slot
        ├── standings/page.tsx      # Already exists, restyled
        ├── waivers/page.tsx        # Already exists, restyled
        └── ...other pages/

packages/frontend/src/components/
├── shell/
│   ├── LeagueNav.tsx               # NEW: left sidebar with icon + label links
│   ├── TopBar.tsx                  # NEW: league name, week, FAAB, GS, projected pts
│   └── SignalsPanel.tsx            # NEW: right column action items (extracted from ActionsSection)
└── ui/
    ├── Card.tsx                    # UPDATE: add dark: variants
    ├── Button.tsx                  # UPDATE: add dark: variants to all CVA variants
    ├── Badge.tsx                   # UPDATE: add dark: variants
    ├── StatsTable.tsx              # UPDATE: add dark: variants (bg-white → dark:bg-shell-panel etc.)
    ├── Input.tsx                   # UPDATE: add dark: variants
    ├── Select.tsx                  # UPDATE: add dark: variants
    └── ...remaining 7 UI files     # UPDATE: dark: variants
```

### Pattern 1: next-themes ThemeProvider Integration

**What:** Wrap app in `ThemeProvider` with `attribute="class"` so Tailwind `dark:` variants activate when `<html class="dark">` is set.
**When to use:** Single setup in `providers.tsx`; forced to `dark` for the league shell via `forcedTheme`.

```tsx
// packages/frontend/src/app/providers.tsx
// Source: https://github.com/pacocoursey/next-themes#readme
import { ThemeProvider } from 'next-themes';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      {/* existing QueryClient + AuthProvider wrappers */}
      {children}
    </ThemeProvider>
  );
}
```

```tsx
// packages/frontend/src/app/layout.tsx — add suppressHydrationWarning
// Source: https://github.com/pacocoursey/next-themes#readme
<html lang="en" suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable} ${dmSerifDisplay.variable}`}>
```

### Pattern 2: Nested League Shell Layout

**What:** `app/leagues/[id]/layout.tsx` provides the three-column dark shell: left sidebar (fixed 240px), main content (flex-1), optional right panel (280px). All child `page.tsx` files become the center slot.
**When to use:** All routes under `/leagues/[id]/` get the shell automatically via Next.js nested layouts.

```tsx
// packages/frontend/src/app/leagues/[id]/layout.tsx
// Source: Next.js App Router nested layout pattern
// https://nextjs.org/docs/app/getting-started/layouts-and-pages
export default function LeagueShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-shell-bg text-shell-text overflow-hidden">
      {/* Left nav — fixed width, full height */}
      <LeagueNav />

      {/* Center: top bar + scrollable content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-4">
          {children}
        </main>
      </div>

      {/* Right signals panel — optional, collapses on narrow viewports */}
      <SignalsPanel />
    </div>
  );
}
```

Key: this layout is a **Server Component** by default. `LeagueNav`, `TopBar`, `SignalsPanel` need `"use client"` only if they use hooks.

### Pattern 3: JetBrains Mono Font Variable

**What:** Load JetBrains Mono via `next/font/google` as a CSS variable, then reference it in Tailwind config as `font-mono`.
**When to use:** Any numeric stat display — apply `font-mono` class to `<td>` cells, stat values, badge numbers.

```tsx
// packages/frontend/src/app/layout.tsx
// Source: https://nextjs.org/docs/app/building-your-application/optimizing/fonts
import { Inter, JetBrains_Mono, DM_Serif_Display } from 'next/font/google';

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
});
```

```js
// tailwind.config.js — extend fontFamily
fontFamily: {
  mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
  // existing: display, sans (via Inter)
}
```

### Pattern 4: Dark Color Token Extension in Tailwind

**What:** Add Linear-spec dark palette as named Tailwind tokens so components can use `bg-shell-bg`, `bg-shell-panel`, `border-shell-border` rather than raw hex in className.
**When to use:** All dark shell components and updated UI components.

```js
// tailwind.config.js — extend colors
colors: {
  // existing tokens remain...
  shell: {
    bg:      '#0B0D10',   // SHELL-01: page background
    panel:   '#111318',   // SHELL-01: card/panel background
    border:  '#1D2128',   // SHELL-01: borders
    nav:     '#0E1014',   // slightly deeper for sidebar contrast
    text:    '#E2E8F0',   // primary text on dark
    muted:   '#64748B',   // secondary/muted text
    accent:  '#6366F1',   // interactive highlight (indigo — Linear-style)
  },
}
```

Note: The existing `grafana` tokens in tailwind.config.js are similar but were added for the Chrome extension. The `shell` tokens are the canonical app-level dark palette.

### Pattern 5: Left Sidebar Active Link Detection

**What:** `LeagueNav` uses `usePathname()` to highlight the active route. Dynamic `leagueId` comes from `useParams()`.
**When to use:** Every render of the sidebar.

```tsx
// packages/frontend/src/components/shell/LeagueNav.tsx
'use client';
import { usePathname, useParams } from 'next/navigation';

const navItems = [
  { label: 'Dashboard',      href: '',           icon: LayoutDashboard },
  { label: 'Standings',      href: '/standings', icon: Trophy },
  { label: 'Categories',     href: '/trends',    icon: BarChart3 },
  { label: 'Roster',         href: '/lineup',    icon: Users },
  { label: 'Waivers',        href: '/waivers',   icon: RefreshCw },
  { label: 'FAAB Market',    href: '/moves',     icon: DollarSign },
  { label: 'Pitching Usage', href: '/streaming', icon: Activity },
  { label: 'Trades',         href: '/trades',    icon: ArrowLeftRight },
  { label: 'Settings',       href: '/settings',  icon: Settings },
];

// active: pathname === `/leagues/${id}${item.href}` or startsWith for non-root
```

### Anti-Patterns to Avoid

- **Mixing `data-theme` and `class` attributes:** next-themes defaults to `data-theme`; always pass `attribute="class"` to use Tailwind dark: variants.
- **Rendering theme UI before mounted:** `useTheme()` returns undefined until client hydration. Any conditional UI based on theme must check `mounted` state first.
- **Adding `dark:` only to pages, not shared components:** Cards, Buttons, Badges used across pages will still render light if their component files don't have dark variants.
- **Creating a separate dark layout component tree:** Use one nested layout; don't fork page files into `page-dark.tsx` variants.
- **Removing the root Navigation for all routes:** Login/signup/onboarding routes rely on the root `Navigation` component. The new shell only wraps `/leagues/[id]/` routes.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSR flash prevention | Custom `__html` script injection | next-themes | next-themes handles the inline script, hydration warnings, localStorage, and system preference detection |
| Font self-hosting | Manual woff2 download + static serve | `next/font/google` | Automatic subset optimization, no CLS, no external requests |
| Active nav link detection | URL string matching utilities | `usePathname()` from next/navigation | Already in codebase (see navigation.tsx); exact same pattern works in left sidebar |

---

## Common Pitfalls

### Pitfall 1: Hydration Mismatch Without suppressHydrationWarning

**What goes wrong:** React logs hydration mismatch warnings because next-themes modifies the `<html>` element's class before hydration. The server renders `class=""` but client sees `class="dark"`.
**Why it happens:** next-themes reads localStorage client-side and applies the class before React hydrates.
**How to avoid:** Add `suppressHydrationWarning` to the `<html>` tag in root `layout.tsx`.
**Warning signs:** Console warning "Warning: Expected server HTML to contain a matching `<html>` tag."

### Pitfall 2: `useTheme()` Returns Undefined on SSR

**What goes wrong:** Components that call `useTheme()` to conditionally render color-aware UI crash or flash on first render.
**Why it happens:** Theme is resolved client-side only.
**How to avoid:** Track `mounted` state: `const [mounted, setMounted] = useState(false); useEffect(() => setMounted(true), [])`. Only render theme-dependent UI after mounted. For this phase, since we force `dark` and never show a toggle, this pitfall is mostly avoided.
**Warning signs:** Hydration errors mentioning theme-related class names.

### Pitfall 3: `darkMode` Not Set in tailwind.config.js

**What goes wrong:** All `dark:` prefixed classes are stripped from the output CSS as unused — no dark styles apply even when `<html class="dark">` is present.
**Why it happens:** Tailwind v3 defaults to `darkMode: 'media'` (system preference via CSS media query). Class-based switching requires explicit `darkMode: 'class'`.
**How to avoid:** Add `darkMode: 'class'` to `tailwind.config.js` before adding any `dark:` classes.
**Warning signs:** Dark mode classes exist in source but nothing changes when `class="dark"` is applied.

### Pitfall 4: Nested Layout Breaks Existing Page Data Fetching

**What goes wrong:** Adding a `layout.tsx` to `leagues/[id]/` may cause existing pages to re-fetch data they previously fetched in the parent page.
**Why it happens:** The layout renders once and persists; pages render independently. If `TopBar` needs league data that the dashboard page also fetches, there could be duplicate queries.
**How to avoid:** Accept the duplication initially — TanStack Query's `staleTime: 5min` deduplications identical query keys. The layout and page will both call `getLeagueStatus` but TanStack Query returns cached data for the second call. No extra API hits.
**Warning signs:** Network tab showing doubled requests with identical URLs.

### Pitfall 5: Left Nav Needs LeagueId from URL

**What goes wrong:** `LeagueNav` is in a layout that doesn't receive `params` as a prop (layouts receive `params` only as a prop in RSC, not client components).
**Why it happens:** In Next.js App Router, `params` are available to Server Components as props. Client components must use `useParams()`.
**How to avoid:** Mark `LeagueNav` as `"use client"` and use `useParams()` to get `{ id }`.
**Warning signs:** TypeScript error that `params` prop doesn't exist on `LeagueNav`.

### Pitfall 6: Top Bar Data (FAAB, GS Pace) Not in Current API

**What goes wrong:** SHELL-03 requires FAAB remaining and GS pace — neither is currently exposed by the backend API.
**Why it happens:** The ESPN adapter and league status endpoint don't fetch or return acquisition budget data.
**How to avoid:** Stub these fields in `TopBar` with placeholder values (e.g., "N/A") and add a TODO comment. Do not block the shell on backend work.
**Warning signs:** Would attempt to fetch from non-existent endpoint, causing API errors.

---

## Code Examples

### Setting Up next-themes in Providers

```tsx
// Source: https://github.com/pacocoursey/next-themes#readme
// packages/frontend/src/app/providers.tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { AuthProvider } from "@/contexts/AuthContext";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 5 * 60_000,
          gcTime: 10 * 60_000,
          refetchOnWindowFocus: false,
        },
      },
    })
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
```

### Dark Token Tailwind Config

```js
// tailwind.config.js — merge into existing extend.colors
shell: {
  bg:     '#0B0D10',  // SHELL-01
  panel:  '#111318',  // SHELL-01
  border: '#1D2128',  // SHELL-01
  nav:    '#0E1014',
  text:   '#E2E8F0',
  muted:  '#8B97AB',
  accent: '#6366F1',
},
// Also add:
darkMode: 'class',  // top-level key (not inside extend)
```

### Card Component with Dark Variants

```tsx
// packages/frontend/src/components/ui/Card.tsx — updated
export function Card({ children, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-card border shadow-card",
        // Light
        "border-neutral-200 bg-white",
        // Dark
        "dark:border-shell-border dark:bg-shell-panel",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
```

### StatsTable with Dark Variants

```tsx
// Key updates to StatsTable.tsx
// thead: bg-surface-secondary → dark:bg-shell-bg
// tbody: bg-white → dark:bg-shell-panel
// divide: divide-neutral-200 → dark:divide-shell-border
// text: text-content-secondary → dark:text-shell-muted
// hover: hover:bg-surface-secondary → dark:hover:bg-shell-bg
```

### JetBrains Mono Loading

```tsx
// packages/frontend/src/app/layout.tsx
import { Inter, JetBrains_Mono, DM_Serif_Display } from "next/font/google";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
  // JetBrains Mono is a variable font — no weight array needed
});

const dmSerifDisplay = DM_Serif_Display({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
});

// In JSX:
<html lang="en" suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable} ${dmSerifDisplay.variable}`}>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Top-level horizontal nav (`navigation.tsx`) | Nested league shell with left sidebar | Phase 65 | `Navigation` persists for auth routes; league routes get the dark shell layout |
| Light-only UI components | `dark:` Tailwind variants on all components | Phase 65 | Enables future light/dark toggle without component rewrites |
| `DM_Serif_Display` for headings | Inter for UI text, JetBrains Mono for numbers | Phase 65 | JetBrains Mono added; DM Serif Display can remain for landing page only |
| Inline `grafana.*` tokens for extension | `shell.*` tokens as canonical dark palette | Phase 65 | Grafana tokens remain for extension; shell tokens are the app palette |

**What doesn't change:**
- Auth pages (`/login`, `/signup`, `/onboarding`) remain light-themed using the existing root `Navigation`.
- Admin pages remain light-themed (out of scope).
- The root `layout.tsx` structure persists — `ThemeProvider` wraps everything, league shell layout is nested below it.

---

## Open Questions

1. **FAAB remaining and GS pace data for TopBar (SHELL-03)**
   - What we know: These fields don't exist in current API responses. `getLeagueStatus` returns league metadata and snapshot status. `getTeamOverview` returns categories/roster/overall but not acquisition budget.
   - What's unclear: Is FAAB stored in the ESPN adapter's normalized data somewhere? Is GS pace computed elsewhere (e.g., `streaming/page.tsx` fetches something)?
   - Recommendation: Stub both fields with "—" in TopBar. Add a `// TODO SHELL-03: wire FAAB from API` comment. Backend work is Phase 66+.

2. **Settings page route (`/leagues/[id]/settings`)**
   - What we know: SHELL-02 lists "Settings" in the left nav but no `settings/` directory exists under `leagues/[id]/`.
   - What's unclear: Should a stub settings page be created in this phase, or is the nav link just disabled?
   - Recommendation: Create a minimal `settings/page.tsx` stub that renders a dark panel with "Settings — coming soon" to avoid a 404 when clicking the nav link.

3. **Right signals panel (SHELL-04) — is it persistent across all routes?**
   - What we know: `ActionsSection` currently only renders on the main dashboard page when a team is selected. The shell layout puts `SignalsPanel` in the right column of every route.
   - What's unclear: Should it show action items on all routes, or only on the dashboard?
   - Recommendation: Render `SignalsPanel` in the layout (always visible) but make it lazy — it reuses the same `waiverRecs` and `tradeCandidates` queries that dashboard already fires. No new data fetching needed.

---

## Sources

### Primary (HIGH confidence)
- `next/font/google` official docs — https://nextjs.org/docs/app/building-your-application/optimizing/fonts (verified 2026-03-20 via WebFetch, shows current Next.js 16.2.1 docs)
- next-themes README — https://github.com/pacocoursey/next-themes#readme (verified via WebFetch)
- Next.js App Router nested layouts — https://nextjs.org/docs/app/getting-started/layouts-and-pages (verified via WebSearch)
- Existing codebase: `packages/frontend/tailwind.config.js`, `packages/frontend/src/app/layout.tsx`, all UI components (read directly)

### Secondary (MEDIUM confidence)
- Tailwind CSS v3 `darkMode: 'class'` — https://v3.tailwindcss.com/docs/dark-mode (referenced in multiple verified sources)
- Linear design refresh colors (spec-provided: #0B0D10, #111318, #1D2128) — from phase brief; verified as consistent with Linear's documented "calmer" 2025 redesign direction

### Tertiary (LOW confidence)
- linear.style dark CSS tokens — fetched via WebFetch but the page's tokens (#121212, #1b1c1d) are the site itself, not Linear's app. The spec-provided hex values should be treated as authoritative.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are either already installed or verified via official docs
- Architecture: HIGH — Next.js nested layout pattern is well-documented; existing codebase structure is confirmed by direct file reads
- Pitfalls: HIGH — all pitfalls are verified from official next-themes docs and direct codebase inspection (e.g., `darkMode` not set confirmed by reading current tailwind.config.js)
- Top bar data gaps: HIGH — confirmed by reading API source files; FAAB genuinely doesn't exist

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable libraries; Tailwind v3 / Next.js 14 / next-themes are not fast-moving for this use case)
