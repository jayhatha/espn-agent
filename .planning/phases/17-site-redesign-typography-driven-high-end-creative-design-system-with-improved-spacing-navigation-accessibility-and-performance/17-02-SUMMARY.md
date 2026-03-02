---
phase: 17-site-redesign
plan: 02
subsystem: ui
tags: [tailwind, design-system, cva, components, button, card, badge, input, select, animation, intersection-observer]

# Dependency graph
requires:
  - phase: 17-01
    provides: "Design token system in tailwind.config.js, cn() utility from @/lib/cn"
provides:
  - Container component with 3 size variants (default/narrow/wide) enforcing max-width and horizontal padding
  - Heading component with 4 level variants using CVA; exports headingVariants
  - Text component with 5 size and 3 color variants using CVA; Omit<color> to avoid DOM conflict
  - Button component with 4 variants and 3 sizes via CVA; exports buttonVariants for Link usage
  - Card compound component: Card, CardHeader, CardContent, CardFooter
  - Badge with 5 semantic variants (default/positive/negative/warning/info) via CVA
  - Input with React.forwardRef for form library compatibility
  - Select with React.forwardRef matching Input pattern with appearance-none
  - FadeIn scroll-reveal with IntersectionObserver and prefers-reduced-motion support
affects: [17-03, 17-04, 17-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - CVA (class-variance-authority) for type-safe variant management in Button, Badge, Heading, Text
    - React.forwardRef for form library compatibility in Input and Select
    - IntersectionObserver one-time reveal pattern in FadeIn
    - Compound component pattern for Card (Card + CardHeader + CardContent + CardFooter)
    - Omit<React.HTMLAttributes<T>, "color"> to avoid DOM attribute conflicts with CVA color variants

key-files:
  created:
    - packages/frontend/src/components/ui/Container.tsx
    - packages/frontend/src/components/ui/Heading.tsx
    - packages/frontend/src/components/ui/Text.tsx
    - packages/frontend/src/components/ui/Button.tsx
    - packages/frontend/src/components/ui/Card.tsx
    - packages/frontend/src/components/ui/Badge.tsx
    - packages/frontend/src/components/ui/Input.tsx
    - packages/frontend/src/components/ui/Select.tsx
    - packages/frontend/src/components/motion/FadeIn.tsx
  modified: []

key-decisions:
  - "Omit<React.HTMLAttributes<T>, 'color'> used in Text to avoid TypeScript conflict between HTML color attribute and CVA color variant"
  - "forwardRef used in Input and Select for compatibility with React Hook Form and other controlled form libraries"
  - "FadeIn disconnects observer after first intersection for one-time reveal (not repeated on scroll)"
  - "Container has no vertical padding (py-*) — pages control their own vertical rhythm"

patterns-established:
  - "Container for all page layouts: mx-auto + px-4 sm:px-6 lg:px-8 + max-w-content variants"
  - "Heading/Text for all text: never use raw h1-h6 or p tags in migrated pages"
  - "Button/buttonVariants for all interactive elements including Next.js Link components"
  - "Card compound components for all card-like containers"
  - "FadeIn wrapper for scroll-reveal animations respecting reduced motion"

requirements-completed: [DS-03]

# Metrics
duration: 27min
completed: 2026-03-02
---

# Phase 17 Plan 02: Component Library Summary

**9 design system primitives (Container, Heading, Text, Button, Card, Badge, Input, Select, FadeIn) with CVA variants, forwardRef form support, and IntersectionObserver scroll-reveal**

## Performance

- **Duration:** 27 min
- **Started:** 2026-03-02T21:35:39Z
- **Completed:** 2026-03-02T22:03:26Z
- **Tasks:** 2
- **Files modified:** 9 (all created)

## Accomplishments
- Created Container enforcing consistent max-width and horizontal padding across all pages (3 size variants)
- Created Heading and Text using CVA with full typography scale from 17-01 token system
- Created Button with 4 variants (primary/secondary/ghost/danger) and 3 sizes; buttonVariants exported for Link usage
- Created Card compound component (Card + CardHeader + CardContent + CardFooter) for all card containers
- Created Badge with 5 semantic variants aligned with positive/negative/warning/info tokens
- Created Input and Select with React.forwardRef for form library compatibility
- Created FadeIn using IntersectionObserver with prefers-reduced-motion respect and one-time reveal

## Task Commits

Each task was committed atomically:

1. **Task 1: Create layout and typography primitives (Container, Heading, Text)** - `65d8ec9` (feat)
2. **Task 2: Create interactive primitives (Button, Card, Badge, Input, Select, FadeIn)** - `f026376` (feat)

## Files Created/Modified
- `packages/frontend/src/components/ui/Container.tsx` - Page container with size variants (default/narrow/wide)
- `packages/frontend/src/components/ui/Heading.tsx` - CVA-based heading with level 1-4 variants
- `packages/frontend/src/components/ui/Text.tsx` - CVA-based text with size and color variants
- `packages/frontend/src/components/ui/Button.tsx` - CVA button with 4 variants + 3 sizes; exports buttonVariants
- `packages/frontend/src/components/ui/Card.tsx` - Compound card: Card, CardHeader, CardContent, CardFooter
- `packages/frontend/src/components/ui/Badge.tsx` - CVA badge with 5 semantic variants
- `packages/frontend/src/components/ui/Input.tsx` - forwardRef input with consistent focus/disabled styling
- `packages/frontend/src/components/ui/Select.tsx` - forwardRef select matching Input pattern
- `packages/frontend/src/components/motion/FadeIn.tsx` - IntersectionObserver scroll-reveal with reduced-motion support

## Decisions Made
- Used `Omit<React.HTMLAttributes<HTMLElement>, "color">` in Text to avoid a TypeScript interface conflict between the HTML `color` DOM attribute and the CVA `color` variant — this is the standard pattern for CVA components with color variants
- Used `React.forwardRef` for Input and Select to ensure compatibility with React Hook Form, Formik, and other controlled form libraries
- FadeIn observer is disconnected after first intersection (one-time reveal) to prevent re-animating on scroll-back
- Container intentionally has no py-* padding so each page controls its own vertical rhythm

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript interface conflict in Text.tsx**
- **Found during:** Task 1 (Text component creation)
- **Issue:** Extending both `React.HTMLAttributes<HTMLElement>` and `VariantProps<typeof textVariants>` caused TS2320 error — the HTML `color` attribute type conflicted with the CVA `color` variant string union
- **Fix:** Changed to `Omit<React.HTMLAttributes<HTMLElement>, "color">` and defined `size`/`color` props directly from `VariantProps`
- **Files modified:** packages/frontend/src/components/ui/Text.tsx
- **Verification:** `npx tsc --noEmit` returned no errors for Text.tsx
- **Committed in:** `65d8ec9` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Required fix to pass TypeScript strict mode. No scope creep.

## Issues Encountered
- TypeScript TS2320 interface conflict in Text.tsx due to `color` prop collision between HTML attributes and CVA variants — resolved inline with `Omit<>` pattern

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 9 component primitives are built and build-verified
- Plan 03 (page migrations) can begin immediately using these components
- Container replaces raw `<div className="max-w-*...">` patterns
- Heading/Text replace raw `<h1>`, `<p>` tags in migrated pages
- Button/buttonVariants available for both `<button>` elements and Next.js `<Link>` wrappers
- FadeIn ready for scroll-reveal on landing/overview sections

---
*Phase: 17-site-redesign*
*Completed: 2026-03-02*

## Self-Check: PASSED
- FOUND: packages/frontend/src/components/ui/Container.tsx
- FOUND: packages/frontend/src/components/ui/Heading.tsx
- FOUND: packages/frontend/src/components/ui/Text.tsx
- FOUND: packages/frontend/src/components/ui/Button.tsx
- FOUND: packages/frontend/src/components/ui/Card.tsx
- FOUND: packages/frontend/src/components/ui/Badge.tsx
- FOUND: packages/frontend/src/components/ui/Input.tsx
- FOUND: packages/frontend/src/components/ui/Select.tsx
- FOUND: packages/frontend/src/components/motion/FadeIn.tsx
- FOUND commit: 65d8ec9 (Task 1)
- FOUND commit: f026376 (Task 2)
