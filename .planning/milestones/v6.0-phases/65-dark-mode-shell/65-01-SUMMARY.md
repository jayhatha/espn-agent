---
phase: 65-dark-mode-shell
plan: 01
subsystem: ui
tags: [next-themes, tailwindcss, dark-mode, jetbrains-mono, fonts, theming]

# Dependency graph
requires: []
provides:
  - darkMode:'class' config in Tailwind — all dark: prefix classes now compile and apply when html has class='dark'
  - Shell color token palette (shell-bg, shell-panel, shell-border, shell-nav, shell-text, shell-muted, shell-accent)
  - JetBrains Mono loaded as --font-mono CSS variable, available via font-mono Tailwind class
  - ThemeProvider wrapping app with attribute="class" and defaultTheme="dark" via next-themes
  - Dark base body styles applied via globals.css
affects: [66-roto-math, 67-category-map, 68-faab-gs, 69-trade-finder, 70-trends]

# Tech tracking
tech-stack:
  added: [next-themes ^0.4.6]
  patterns:
    - darkMode via class attribute (next-themes manages html.dark toggle)
    - ThemeProvider as outermost wrapper in providers.tsx (outside QueryClientProvider)
    - suppressHydrationWarning on html element to prevent next-themes SSR mismatch

key-files:
  created: []
  modified:
    - packages/frontend/tailwind.config.js
    - packages/frontend/src/app/layout.tsx
    - packages/frontend/src/app/providers.tsx
    - packages/frontend/src/app/globals.css
    - packages/frontend/package.json
    - pnpm-lock.yaml

key-decisions:
  - "ThemeProvider placed outside QueryClientProvider (outermost wrapper) so theme state is available to all children"
  - "defaultTheme=dark with enableSystem=false — forces dark mode, no light/system toggle in v6.0"
  - "Shell tokens are separate from grafana tokens — grafana palette kept for mobile draft companion, shell palette for Command Center"

patterns-established:
  - "Shell token pattern: bg-shell-bg, bg-shell-panel, border-shell-border, text-shell-text, text-shell-muted — use these in all dark mode UI"
  - "Font mono: font-mono class maps to JetBrains Mono via --font-mono CSS variable — use for stats/data tables"

requirements-completed: [SHELL-01, SHELL-05, SHELL-07]

# Metrics
duration: 8min
completed: 2026-03-23
---

# Phase 65 Plan 01: Dark Mode Shell Foundation Summary

**next-themes ThemeProvider + Tailwind darkMode:'class' + shell color tokens + JetBrains Mono font variable wired into Next.js 14 App Router**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-23T00:00:00Z
- **Completed:** 2026-03-23T00:08:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Installed next-themes and wrapped app with ThemeProvider (defaultTheme=dark, attribute=class)
- Added darkMode:'class' to Tailwind, enabling all dark: prefix classes across the codebase
- Added 7 shell color tokens (bg, panel, border, nav, text, muted, accent) to Tailwind theme
- Added JetBrains Mono as --font-mono CSS variable on the html element, mapped to font-mono class
- Added suppressHydrationWarning on html element to prevent next-themes SSR mismatch
- Applied dark body styles (dark:bg-shell-bg, dark:text-shell-text) in globals.css base layer

## Task Commits

Each task was committed atomically:

1. **Task 1: Install next-themes and configure Tailwind dark mode + shell tokens** - `00bca7c` (feat)
2. **Task 2: Add JetBrains Mono font, ThemeProvider, and dark base styles** - `75e5861` (feat)

## Files Created/Modified

- `packages/frontend/tailwind.config.js` - Added darkMode:'class', shell color tokens, fontFamily.mono
- `packages/frontend/src/app/layout.tsx` - Added JetBrains_Mono font, --font-mono variable, suppressHydrationWarning
- `packages/frontend/src/app/providers.tsx` - Added ThemeProvider as outermost wrapper
- `packages/frontend/src/app/globals.css` - Added dark:bg-shell-bg, dark:text-shell-text, dark:outline-shell-accent
- `packages/frontend/package.json` - Added next-themes ^0.4.6
- `pnpm-lock.yaml` - Updated lockfile

## Decisions Made

- ThemeProvider is outermost wrapper (outside QueryClientProvider) so all children can access theme state
- enableSystem=false ensures app always defaults to dark — no system preference override in v6.0
- Shell palette (7 tokens) is distinct from the existing grafana palette — grafana stays for mobile draft companion

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Dark mode foundation complete — all subsequent phases can use dark: prefix classes immediately
- Shell token classes (bg-shell-bg, bg-shell-panel, etc.) available for layout/navigation work in remaining 65-xx plans
- JetBrains Mono available as font-mono for stats tables in Phase 66+

---
*Phase: 65-dark-mode-shell*
*Completed: 2026-03-23*
