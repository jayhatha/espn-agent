---
phase: 17-site-redesign
plan: "04"
subsystem: ui
tags: [next.js, tailwind, lucide-react, design-system, landing-page, auth, onboarding]

# Dependency graph
requires:
  - phase: 17-02
    provides: Container, Heading, Text, Button, Card, Input, FadeIn design system primitives

provides:
  - Redesigned landing page with editorial aesthetic and scroll animations
  - Redesigned login page using Card + Input + Button design system
  - Redesigned signup page using Card + Input + Button design system
  - Redesigned onboarding wizard using Card + Heading + Text + Button + Input design system

affects: [17-05, 17-06, 17-07, 17-08, 17-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - lucide-react icons replace dangerouslySetInnerHTML emoji HTML entities
    - FadeIn with staggered delays for scroll-reveal sections (0/100/200/300ms)
    - Container(narrow) + Card + CardContent pattern for auth forms
    - Design token colors (bg-accent, text-content-inverse, text-content-secondary) replace hardcoded blue-600

key-files:
  created: []
  modified:
    - packages/frontend/src/app/page.tsx
    - packages/frontend/src/app/login/page.tsx
    - packages/frontend/src/app/signup/page.tsx
    - packages/frontend/src/app/onboarding/page.tsx

key-decisions:
  - "buttonVariants helper used for Link elements to get Button styling without wrapping in a Button element"
  - "FadeIn wraps each grid item individually (not the grid) for per-card staggered reveal"
  - "Auth OAuth buttons (Google/GitHub) kept as plain button elements with custom classes since they need their own visual styling (brand colors) outside the Button component variants"

patterns-established:
  - "Auth form pattern: min-h-screen flex items-center justify-center py-12 > Container(narrow) > Card > CardContent(p-8)"
  - "Onboarding progress: bg-accent for active/completed steps, bg-neutral-200 for pending"
  - "Loading spinner in onboarding: animate-spin border-b-2 border-accent (replaces inline SVG spinner)"

requirements-completed: [DS-06]

# Metrics
duration: 4min
completed: 2026-03-02
---

# Phase 17 Plan 04: Entry Pages Summary

**Landing page, login, signup, and onboarding redesigned using design system components with editorial aesthetic, scroll-reveal FadeIn animations, and lucide-react icons replacing dangerouslySetInnerHTML emoji entities**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-02T22:06:43Z
- **Completed:** 2026-03-02T22:11:05Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Landing page redesigned with Container, Heading, Text, Button, Card, FadeIn - no gradients, no shadow escalation, no dangerouslySetInnerHTML
- Scroll-reveal animations added via FadeIn with staggered delays (0/100/200/300ms) on feature cards and highlights
- Lucide-react icons (Trophy, BarChart3, RefreshCw, TrendingUp, Zap, Target, Smartphone, ArrowRight) replace all emoji HTML entities
- Login, signup, and onboarding pages use Container, Card, Input, Button components with consistent styling
- All form logic, state management, API calls, and auth redirect logic preserved exactly

## Task Commits

Each task was committed atomically:

1. **Task 1: Redesign landing page with editorial aesthetic and scroll animations** - `465169d` (feat)
2. **Task 2: Redesign auth and onboarding pages** - `702e092` (feat)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified
- `packages/frontend/src/app/page.tsx` - Landing page: Container/Heading/Text/Button/Card/FadeIn, lucide icons, LoadingSpinner
- `packages/frontend/src/app/login/page.tsx` - Login: Container(narrow) + Card + Input + Button + ErrorAlert
- `packages/frontend/src/app/signup/page.tsx` - Signup: Container(narrow) + Card + Input + Button + ErrorAlert
- `packages/frontend/src/app/onboarding/page.tsx` - Onboarding: Card + Heading + Text + Button + Input, accent-colored progress steps

## Decisions Made
- buttonVariants helper used for Link element (Get Started CTA) to get Button styling without wrapping Link in Button
- FadeIn wraps each grid item individually (not the entire grid container) to enable per-card staggered reveal
- OAuth buttons (Google/GitHub) kept as plain button elements with custom classes - brand-colored buttons don't fit into primary/secondary/ghost/danger variants
- Onboarding loading spinner uses CSS border animation with border-accent color instead of inline SVG spinner

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Entry pages use design system components consistently
- Pattern established for auth form layout (Container narrow + Card) ready for other form pages
- No blockers for subsequent plans (17-05 through 17-09)

## Self-Check: PASSED

- packages/frontend/src/app/page.tsx: FOUND
- packages/frontend/src/app/login/page.tsx: FOUND
- packages/frontend/src/app/signup/page.tsx: FOUND
- packages/frontend/src/app/onboarding/page.tsx: FOUND
- Commit 465169d (Task 1): FOUND
- Commit 702e092 (Task 2): FOUND

---
*Phase: 17-site-redesign*
*Completed: 2026-03-02*
