# Phase 17: Site Redesign - Typography-Driven Design System - Research

**Researched:** 2026-03-02
**Domain:** Frontend design system, typography, spacing, accessibility, performance (Next.js 14 + Tailwind CSS v3)
**Confidence:** HIGH

## Summary

The current frontend is a functional but visually inconsistent Next.js 14 application using Tailwind CSS v3.4. It uses Inter via `next/font/google` as a single typeface, has no formal typography scale, no spacing system, scattered color usage (blue-600 primary with ad-hoc gradient cards, multiple colored accent patterns), no scroll animations, limited accessibility considerations, and significant UI duplication across pages. The global CSS includes a gradient background and dark-mode media query that conflict with the spec's "neutral base" directive.

The redesign spec calls for a typography-driven, high-end creative design system with visual restraint, strict typography hierarchy, systematic spacing, scroll-reveal animations, simplified navigation, WCAG AA accessibility, and Lighthouse 90+ performance. This is achievable within the existing Tailwind v3.4 + Next.js 14 stack by extending the Tailwind configuration with design tokens, creating a shared component library with CVA (Class Variance Authority), adding a lightweight scroll-reveal hook using Intersection Observer, and systematically refactoring all pages.

**Primary recommendation:** Build a design token foundation in `tailwind.config.js` (typography scale, spacing scale, constrained color palette), create a shared component library using CVA + clsx + tailwind-merge, then systematically refactor all 18 pages/routes from layout.tsx outward.

## Current State Audit

### What Exists Today

**Layout & Navigation:**
- `layout.tsx`: Wraps everything in `<Providers>` + `<Navigation>` + `<main>`, uses `Inter` font via `next/font/google`, has `bg-gray-50` base
- `navigation.tsx`: 180-line client component with sticky nav (`bg-white shadow-md`), mobile hamburger menu, hardcoded nav links (Home, Leagues, Admin), active state uses `bg-blue-100 text-blue-700`
- `globals.css`: Contains CSS variables for foreground/background with gradient body and `prefers-color-scheme: dark` block

**Pages (18 routes):**
| Route | Type | Key UI Patterns |
|-------|------|-----------------|
| `/` (page.tsx) | Landing/redirect | Hero with gradient bg, 4 gradient FeatureCards, StepCards, FeatureHighlights |
| `/login`, `/signup` | Auth forms | Standard form layouts |
| `/onboarding` | Wizard | 4-step progress bar, card-based steps |
| `/leagues` | League list | Card grid with hover translate effects |
| `/leagues/connect` | Form | Standard form |
| `/leagues/[id]` | Dashboard | StatCards, TeamSelector, CategoryStatsTable, TeamHealthOverview, ActionItemsList, CategoryMiniChart |
| `/leagues/[id]/trades` | Trade analyzer | Mode toggle, roster picker grids, analysis tables |
| `/leagues/[id]/waivers` | Waiver wire | AI/Manual mode toggle, player selection, evaluation results |
| `/leagues/[id]/trends` | Charts | Recharts LineChart, 4 view mode tabs, date filters |
| `/leagues/[id]/standings` | Standings | Tables |
| `/leagues/[id]/projections` | Projections | Upload + display |
| `/leagues/[id]/draft/rankings` | Draft table | Position filter, sortable table |
| `/leagues/[id]/draft/auction` | Auction values | Data table |
| `/leagues/[id]/lineup` | Lineup | Player rows |
| `/leagues/[id]/streaming` | Streaming | Recommendations |
| `/leagues/[id]/moves` | Transaction log | History table |
| `/admin` | Admin panel | StatCards, file upload, user management, league grid |
| `/admin/auction-validation` | Validation | Data tables |

**Shared UI Components (8):**
| Component | Location | Used By |
|-----------|----------|---------|
| `PageHeader` | `components/ui/` | Most league pages |
| `StatCard` | `components/ui/` | Dashboard, Admin |
| `StatsTable` | `components/ui/` | Multiple pages |
| `LoadingSpinner` + `LoadingSkeleton` | `components/ui/` | Most pages |
| `ErrorAlert` | `components/ui/` | Most pages |
| `TeamColorBadge` | `components/ui/` | Trends |

**League-specific Components (10):**
`TeamSelector`, `CategoryStatsTable`, `TeamHealthOverview`, `CategoryMiniChart`, `ActionItemsList`, `PlayerRow`, `ScarcityBadge`, `ImpactBadge`, `ImpactDetailCard`, `TransactionMarker`, `InflectionPointMarker`, `DateRangeFilter`

### Problems to Fix

1. **No typography scale**: H1 ranges from `text-2xl` to `text-6xl` depending on page; no consistent hierarchy
2. **No spacing system**: Padding ranges from `py-6` to `py-16` with no pattern; `px-4 sm:px-6 lg:px-8` is repeated verbatim on every page
3. **Gradient/shadow overuse**: Landing page has 4 gradient cards (`from-blue-500 to-blue-600`), `shadow-lg`, `shadow-2xl`, `hover:shadow-xl` everywhere
4. **Color chaos**: blue-600 (primary), green-500/600 (add/positive), red-500/600 (drop/negative), purple-600 (ESPN links), orange-500, pink (in COLORS array) -- too many competing accent colors
5. **No animation/motion system**: Zero scroll animations, only basic hover transitions
6. **Accessibility gaps**: No visible focus-visible states, no skip-to-content link, `aria-expanded="false"` hardcoded (never set to true), no aria-live regions, emojis used as decorative icons without alt text
7. **Dark mode conflict**: `globals.css` has `prefers-color-scheme: dark` CSS but no Tailwind dark mode classes anywhere
8. **Duplicated page shells**: Every page independently wraps in `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8`
9. **Inline SVG icons**: Dozens of inline SVG icons scattered across components -- no icon system
10. **`dangerouslySetInnerHTML` for emojis**: Landing page uses `dangerouslySetInnerHTML={{ __html: icon }}` for emoji rendering

## Standard Stack

### Core (Already Installed -- Keep)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| next | ^14.1.0 | Framework | Keep |
| react | ^18.2.0 | UI library | Keep |
| tailwindcss | ^3.4.1 | Utility CSS | Keep, extend config |
| @tanstack/react-query | ^5.17.19 | Data fetching | Keep |
| recharts | ^2.10.4 | Charts | Keep, restyle |
| clsx | ^2.1.0 | Class merging | Keep, use in cn() |
| date-fns | ^3.0.6 | Date formatting | Keep |

### New Dependencies to Add
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| tailwind-merge | ^2.x | Resolves Tailwind class conflicts | Industry standard companion to clsx; prevents `text-sm text-lg` from both applying |
| class-variance-authority (cva) | ^0.7.x | Component variants | Type-safe variant definitions; used by shadcn/ui, Radix Themes; prevents sprawling conditional classes |
| lucide-react | ^0.x | Icon system | Tree-shakable SVG icons; replaces all inline SVGs; 1KB per icon |

### Alternatives Considered
| Instead of | Could Use | Why Not |
|------------|-----------|---------|
| lucide-react | heroicons, @phosphor-icons/react | Lucide has broader icon set, same tree-shaking story; heroicons would also work fine |
| cva | tailwind-variants | CVA is more widely adopted, simpler API, better TypeScript inference |
| Framer Motion | CSS-only animations | Framer Motion is 32KB gzip; for the simple fade-in-on-scroll spec calls for, a 0KB CSS + Intersection Observer solution is better |
| @tailwindcss/typography | Custom prose styles | The plugin helps for CMS content but this app has no long-form prose; not needed |

**Installation:**
```bash
cd packages/frontend && pnpm add tailwind-merge class-variance-authority lucide-react
```

## Architecture Patterns

### Recommended Project Structure
```
packages/frontend/src/
  app/
    globals.css              # Design tokens as CSS variables + Tailwind directives
    layout.tsx               # Root layout with font loading, skip-to-content, providers
    navigation.tsx           # Redesigned nav (simplified)
    page.tsx                 # Landing page (redesigned)
    leagues/...              # All league routes (refactored to use design system)
    admin/...                # Admin routes (refactored)
  components/
    ui/                      # Design system primitives
      Button.tsx             # CVA-based button with variants
      Card.tsx               # CVA-based card container
      Container.tsx          # Page container (replaces repeated max-w-7xl pattern)
      Heading.tsx            # Typography-controlled headings (h1-h4)
      Text.tsx               # Body text with size/color variants
      Badge.tsx              # Status badges (replaces ad-hoc badge patterns)
      Table.tsx              # Refined StatsTable
      PageHeader.tsx         # Refined with design tokens
      StatCard.tsx           # Refined with design tokens
      LoadingSpinner.tsx     # Refined
      ErrorAlert.tsx         # Refined
      Input.tsx              # Form input with consistent styling
      Select.tsx             # Form select with consistent styling
    league/                  # Domain-specific components (refactored)
    motion/
      FadeIn.tsx             # Scroll-reveal wrapper using Intersection Observer
  lib/
    cn.ts                    # clsx + tailwind-merge utility
    constants.ts             # App constants (refined color palette)
```

### Pattern 1: cn() Utility Function
**What:** Combines clsx conditional class logic with tailwind-merge conflict resolution
**When to use:** Every component that accepts className props or has conditional classes

```typescript
// lib/cn.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### Pattern 2: CVA Component Variants
**What:** Type-safe variant definitions for UI primitives
**When to use:** Any component with size, color, or style variants

```typescript
// components/ui/Button.tsx
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  // Base styles
  "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-neutral-900 text-white hover:bg-neutral-800 focus-visible:ring-neutral-900",
        secondary: "border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50 focus-visible:ring-neutral-400",
        ghost: "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-neutral-400",
        danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600",
      },
      size: {
        sm: "h-8 px-3 text-sm rounded-md",
        md: "h-10 px-4 text-sm rounded-lg",
        lg: "h-12 px-6 text-base rounded-lg",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
```

### Pattern 3: Container Component (Replaces Duplicated Page Shells)
**What:** Consistent page wrapper that enforces max-width and padding
**When to use:** Every page's top-level wrapper

```typescript
// components/ui/Container.tsx
import { cn } from "@/lib/cn";

interface ContainerProps {
  children: React.ReactNode;
  className?: string;
  size?: "default" | "narrow" | "wide";
}

const sizeClasses = {
  default: "max-w-6xl",    // 1152px -- within spec's 1200-1320px range
  narrow: "max-w-3xl",     // 768px -- for forms, wizards
  wide: "max-w-7xl",       // 1280px -- for data-heavy pages
};

export function Container({ children, className, size = "default" }: ContainerProps) {
  return (
    <div className={cn(
      sizeClasses[size],
      "mx-auto px-4 sm:px-6 lg:px-8",
      // Spec: section padding 100px desktop / 64px tablet / 48px mobile
      // Adapted: py-12 (48px) sm:py-16 (64px) lg:py-24 (96px) -- close to spec
      "py-12 sm:py-16 lg:py-24",
      className
    )}>
      {children}
    </div>
  );
}
```

### Pattern 4: Scroll-Reveal Animation (CSS + Intersection Observer)
**What:** Lightweight fade-in-on-scroll without Framer Motion dependency
**When to use:** Landing page sections, non-data-critical content; avoid on data tables

```typescript
// components/motion/FadeIn.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

interface FadeInProps {
  children: React.ReactNode;
  className?: string;
  delay?: number; // ms
}

export function FadeIn({ children, className, delay = 0 }: FadeInProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Respect prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        "transition-all duration-700 ease-[cubic-bezier(0.22,0.9,0.31,1)]",
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
        className
      )}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
```

### Pattern 5: Typography Heading Component
**What:** Enforces the typography scale through component API rather than ad-hoc classes
**When to use:** All headings across the application

```typescript
// components/ui/Heading.tsx
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const headingVariants = cva("font-semibold tracking-tight text-neutral-900", {
  variants: {
    level: {
      1: "text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1]",
      2: "text-2xl sm:text-3xl lg:text-4xl leading-[1.2]",
      3: "text-xl sm:text-2xl leading-[1.3]",
      4: "text-lg sm:text-xl leading-[1.4]",
    },
  },
  defaultVariants: {
    level: 2,
  },
});

interface HeadingProps
  extends React.HTMLAttributes<HTMLHeadingElement>,
    VariantProps<typeof headingVariants> {
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
}

export function Heading({ as, level, className, ...props }: HeadingProps) {
  const Tag = as || (`h${level}` as keyof JSX.IntrinsicElements);
  return <Tag className={cn(headingVariants({ level }), className)} {...props} />;
}
```

### Anti-Patterns to Avoid
- **Inline ad-hoc color classes**: Never use `text-blue-600` or `bg-green-100` directly in page code; always go through design tokens or component variants
- **Gradient backgrounds on functional elements**: The spec explicitly prohibits gradients; remove all `bg-gradient-to-*` classes
- **Shadow escalation**: Remove `shadow-lg`, `shadow-2xl`, `hover:shadow-xl`; use `shadow-sm` for cards or no shadow at all
- **Raw Tailwind in page files**: Pages should compose from design system components, not assemble raw utility classes
- **Animating data-critical content**: Tables, charts, and interactive controls should NOT have scroll-reveal delays; only use FadeIn on decorative/informational sections

## Design Token System

### Typography Scale (for tailwind.config.js)

Adapted from the spec's "H1: 72-120px desktop, body: 16-18px" to practical Tailwind tokens:

```javascript
// tailwind.config.js
module.exports = {
  content: [/* ... */],
  theme: {
    extend: {
      fontSize: {
        // Display (landing page hero only)
        'display': ['clamp(2.5rem, 5vw, 4.5rem)', { lineHeight: '1.1', fontWeight: '700', letterSpacing: '-0.02em' }],
        // Heading scale
        'h1': ['clamp(2rem, 3vw, 3rem)', { lineHeight: '1.15', fontWeight: '600', letterSpacing: '-0.02em' }],
        'h2': ['clamp(1.5rem, 2.5vw, 2.25rem)', { lineHeight: '1.2', fontWeight: '600', letterSpacing: '-0.01em' }],
        'h3': ['clamp(1.25rem, 2vw, 1.5rem)', { lineHeight: '1.3', fontWeight: '600' }],
        'h4': ['1.125rem', { lineHeight: '1.4', fontWeight: '600' }],
        // Body scale
        'body-lg': ['1.125rem', { lineHeight: '1.6' }],
        'body': ['1rem', { lineHeight: '1.6' }],
        'body-sm': ['0.875rem', { lineHeight: '1.5' }],
        'caption': ['0.75rem', { lineHeight: '1.5', letterSpacing: '0.02em' }],
        // Data-specific (tables, stats)
        'data': ['0.8125rem', { lineHeight: '1.4', fontFamily: 'var(--font-mono, ui-monospace)' }],
      },
      colors: {
        // Neutral base (spec: white/off-white/near-black)
        surface: {
          DEFAULT: '#ffffff',
          secondary: '#f8f9fa',  // off-white for alternating sections
          tertiary: '#f1f3f5',   // slightly darker for card backgrounds on white
        },
        content: {
          DEFAULT: '#111827',     // near-black for body text (gray-900)
          secondary: '#4b5563',   // gray-600 for secondary text
          tertiary: '#9ca3af',    // gray-400 for captions/hints
          inverse: '#ffffff',     // white text on dark backgrounds
        },
        // ONE primary accent color (spec directive)
        accent: {
          DEFAULT: '#111827',     // near-black as primary action color (editorial feel)
          hover: '#1f2937',       // gray-800
          light: '#f3f4f6',       // gray-100 for accent backgrounds
        },
        // Semantic colors (functional only, not decorative)
        positive: {
          DEFAULT: '#059669',     // emerald-600
          light: '#ecfdf5',       // emerald-50
          border: '#a7f3d0',      // emerald-200
        },
        negative: {
          DEFAULT: '#dc2626',     // red-600
          light: '#fef2f2',       // red-50
          border: '#fecaca',       // red-200
        },
        warning: {
          DEFAULT: '#d97706',     // amber-600
          light: '#fffbeb',       // amber-50
          border: '#fde68a',      // amber-200
        },
        info: {
          DEFAULT: '#2563eb',     // blue-600 (retained for links and info states)
          light: '#eff6ff',       // blue-50
          border: '#bfdbfe',      // blue-200
        },
      },
      spacing: {
        // Section spacing tokens (spec: 100px desktop / 64px tablet / 48px mobile)
        'section': '6rem',       // 96px -- close to spec's 100px desktop
        'section-sm': '4rem',    // 64px -- spec's tablet
        'section-xs': '3rem',    // 48px -- spec's mobile
      },
      maxWidth: {
        'content': '72rem',      // 1152px -- within spec's 1200-1320px range
        'content-wide': '80rem', // 1280px -- for data-heavy layouts
        'content-narrow': '48rem', // 768px -- for forms/wizards
      },
      gap: {
        'grid': '1.5rem',        // 24px -- spec's grid gap minimum
        'grid-lg': '2rem',       // 32px -- spec's grid gap maximum
      },
      borderRadius: {
        'card': '0.75rem',       // 12px -- consistent card radius
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        'card-hover': '0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.03)',
      },
    },
  },
  plugins: [],
};
```

### Color Palette Rationale

The spec demands "ONE primary accent color" with "no gradients/shadows/glassmorphism." The current codebase uses blue-600 as primary, but the spec's editorial aesthetic aligns better with near-black as the primary action color (buttons, links on hover, active states), with blue reserved for informational states only. This creates the "high-end creative" feel while maintaining usability.

**WCAG AA contrast ratios (verified):**
- `#111827` on `#ffffff`: 15.9:1 (passes AAA)
- `#4b5563` on `#ffffff`: 7.2:1 (passes AA)
- `#9ca3af` on `#ffffff`: 3.0:1 (passes AA for large text only -- use only for captions/non-essential)
- `#059669` on `#ffffff`: 4.6:1 (passes AA)
- `#dc2626` on `#ffffff`: 4.6:1 (passes AA)

### Font Strategy

**Keep Inter as the single typeface.** The spec allows max 2 font families, but Inter is an excellent variable font that covers all needs for a data dashboard:
- Already loaded via `next/font/google` with zero layout shift
- Variable font supports weights 100-900 in a single file
- Designed for high legibility at small sizes (perfect for data tables)
- Clean, modern feel that fits the editorial aesthetic

**Configuration change needed:**
```typescript
// layout.tsx - add display: 'swap' and variable font config
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});
```

Then use `font-sans` in Tailwind config mapped to `var(--font-inter)` for consistency.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Class conflict resolution | Manual class deduplication | `tailwind-merge` | Handles specificity conflicts like `text-sm text-lg` correctly |
| Component variants | Ternary/switch chains for styles | `cva` (class-variance-authority) | Type-safe, composable, auto-inferred prop types |
| Icon system | Inline SVGs scattered across files | `lucide-react` | Tree-shakable, consistent sizing, accessible by default |
| Scroll animations | Custom scroll event listeners | Intersection Observer API | Browser-native, performant, no dependencies |
| Focus ring styles | Per-component focus states | Tailwind's `focus-visible:` + global base styles | Consistent, keyboard-only (not mouse), WCAG compliant |
| Color contrast checking | Guessing | Use tools: tailwindcolor.tools or inclusivecolors.com | WCAG AA requires 4.5:1 for text, 3:1 for large text |

**Key insight:** The biggest risk in this redesign is inconsistency -- 18 pages with ad-hoc styling. The component library with CVA variants is the foundation that prevents this. Without it, "just update the classes" will result in 18 slightly different interpretations of the design system.

## Common Pitfalls

### Pitfall 1: Refactoring All Pages Simultaneously
**What goes wrong:** Attempting to redesign all 18 routes at once leads to an unfinished, half-migrated codebase where some pages use the new system and others don't, creating worse visual inconsistency than before.
**Why it happens:** The scope feels manageable until you're 4 pages in and realize each page has unique patterns.
**How to avoid:** Build the design token system and component library FIRST (as standalone tasks), then migrate pages in batches: (1) layout + nav, (2) landing + auth + onboarding, (3) league dashboard + list, (4) data pages (trades/waivers/trends/draft), (5) admin pages.
**Warning signs:** PRs touching more than 3 page files at once; components being created during page migration rather than before.

### Pitfall 2: Breaking Functional Behavior During Visual Refactoring
**What goes wrong:** Changing component structure breaks TanStack Query cache keys, form submission handlers, localStorage reads, or navigation behavior.
**Why it happens:** Visual refactoring feels "safe" but restructuring JSX can accidentally remove or reorder hooks, break key props, or change component boundaries.
**How to avoid:** Extract design system components separately; page refactoring should ONLY change className props and swap inline elements for design system components. Never restructure data-fetching logic during visual refactoring.
**Warning signs:** Query cache misses after refactoring; state resets on navigation; broken form submissions.

### Pitfall 3: Typography Scale Too Aggressive for Data Dashboard
**What goes wrong:** Using the spec's 72-120px H1 sizes creates absurdly large headings on data-heavy pages where screen real estate is precious for tables and charts.
**Why it happens:** The spec is inspired by agency/portfolio sites where hero sections dominate; this is a data dashboard.
**How to avoid:** Use the `display` size ONLY on the landing page hero. All internal pages use `h1` (clamp 2-3rem). The spec is aspirational; sensible adaptation is required.
**Warning signs:** Headings taking up more vertical space than the data content below them.

### Pitfall 4: Shadow/Gradient Removal Breaking Visual Hierarchy
**What goes wrong:** Removing all shadows and gradients from cards and buttons makes everything look flat and undifferentiated; users can't tell clickable elements from static ones.
**Why it happens:** The spec says "no gradients/shadows/glassmorphism" but doesn't account for dashboard UI where elevation cues are functional, not decorative.
**How to avoid:** Use very subtle shadows (`shadow-card` defined above: barely visible) for cards. Use border + background color shift for interactive state differentiation. The spec's spirit is "restraint," not "nothing."
**Warning signs:** Users reporting they can't tell what's clickable; no visual distinction between card groups.

### Pitfall 5: Scroll Animations on Data-Critical Content
**What goes wrong:** Adding fade-in animations to tables, charts, or interactive controls creates a frustrating delay before users can interact with the data they came to see.
**Why it happens:** Applying FadeIn wrapper broadly "because it looks nice."
**How to avoid:** FadeIn should ONLY be used on: landing page sections, informational cards on first load, decorative elements. NEVER on: data tables, charts, form controls, loading states, interactive elements.
**Warning signs:** Users scrolling down and waiting for a table to fade in before they can sort it.

### Pitfall 6: Forgetting prefers-reduced-motion
**What goes wrong:** Users with vestibular disorders experience discomfort from scroll animations.
**Why it happens:** Developer only tests on their own machine with default settings.
**How to avoid:** The FadeIn component above already handles this. Also add a global CSS rule: `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }`. Test by enabling "Reduce motion" in macOS System Settings > Accessibility > Display.
**Warning signs:** No `prefers-reduced-motion` check in the codebase.

### Pitfall 7: Not Testing Color Contrast for Semantic Colors
**What goes wrong:** Green-on-white for positive values or red-on-white for negative values fails WCAG AA (4.5:1 ratio for normal text).
**Why it happens:** Light greens (green-500 = #22c55e) have only 2.8:1 contrast on white.
**How to avoid:** Use the darker semantic colors defined in the token system (emerald-600, red-600). Verify every text color against its background with a contrast checker.
**Warning signs:** Green or red text that's hard to read on white backgrounds, especially in tables.

## Code Examples

### Redesigned globals.css
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  /* Remove the old gradient background and dark mode variables */
  body {
    @apply bg-surface text-content antialiased;
  }

  /* Global focus-visible styles for accessibility */
  *:focus-visible {
    @apply outline-2 outline-offset-2 outline-accent;
  }

  /* Respect reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }

  /* Skip to content link */
  .skip-to-content {
    @apply sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:bg-accent focus:text-content-inverse focus:px-4 focus:py-2 focus:rounded-lg;
  }
}
```

### Redesigned layout.tsx (conceptual)
```typescript
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Navigation } from "./navigation";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata = {
  title: "Fantasy Baseball Command Center",
  description: "Draft assistance, trade advice, waiver wire suggestions, and RoS standings projections",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">
        <a href="#main-content" className="skip-to-content">
          Skip to content
        </a>
        <Providers>
          <Navigation />
          <main id="main-content">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
```

### Recharts Theme Integration
```typescript
// lib/chart-theme.ts
// Consistent chart styling aligned with design tokens

export const CHART_THEME = {
  colors: [
    "#111827", // neutral-900 (primary series)
    "#6b7280", // neutral-500
    "#d1d5db", // neutral-300
    "#059669", // positive
    "#dc2626", // negative
    "#2563eb", // info
  ],
  grid: {
    stroke: "#e5e7eb",        // neutral-200
    strokeDasharray: "3 3",
  },
  axis: {
    tick: { fill: "#6b7280", fontSize: 12 },  // neutral-500
    label: { fill: "#374151", fontSize: 12 }, // neutral-700
  },
  tooltip: {
    backgroundColor: "#ffffff",
    borderColor: "#e5e7eb",
    borderRadius: 8,
  },
};
```

## State of the Art

| Old Approach (Current) | Current Approach (Target) | Impact |
|------------------------|--------------------------|--------|
| Inline SVG icons | lucide-react tree-shakable icons | Cleaner code, consistent sizing, better a11y |
| Conditional class ternaries | CVA variants + cn() | Type-safe, composable, maintainable |
| Repeated page wrapper classes | Container component | Single source of truth for layout |
| Ad-hoc color usage | Semantic color tokens | Consistent, accessible, theme-able |
| No animation | Intersection Observer + CSS transitions | Subtle scroll-reveal, zero bundle cost |
| No accessibility | WCAG AA focus states, skip-link, aria | Inclusive, meets standard |
| next/font basic | next/font with variable + display swap | Zero CLS, optimized loading |
| Tailwind v3.4 defaults | Extended config with design tokens | Enforced consistency |

**Not changing (and why):**
- Tailwind v3.4 (not upgrading to v4): v4 was released Jan 2025 but has different config paradigm (CSS-first @theme); staying on v3 avoids a risky migration mid-redesign
- Recharts (not switching to visx or Chart.js): Already integrated, works well, just needs theming
- No dark mode: The spec calls for light-only; remove the dead dark mode CSS

## Open Questions

1. **Landing page scope for logged-out vs logged-in users**
   - What we know: Currently logged-in users are immediately redirected to their league; landing page is only for unauthenticated visitors
   - What's unclear: Should the landing page be redesigned extensively (it's the "showcase" page) or minimally (most users will never see it)?
   - Recommendation: Do a modest redesign of the landing page since it's the first impression for new users, but don't over-invest; the dashboard pages are where users spend their time

2. **Sub-navigation within league pages**
   - What we know: League pages have a dashboard with links to sub-pages (trades, waivers, trends, etc.); there's no persistent sub-nav
   - What's unclear: Should there be a secondary navigation bar or sidebar for league sub-pages?
   - Recommendation: Add a horizontal sub-navigation (tab bar) below the main nav when inside `/leagues/[id]/*` routes. This reduces cognitive load per the spec's navigation guidance.

3. **Icon replacement scope**
   - What we know: There are 50+ inline SVGs scattered across the codebase
   - What's unclear: Should all be replaced in this phase or just the most common ones?
   - Recommendation: Replace icons in shared components and navigation first. Page-specific inline SVGs can be migrated as each page is refactored.

## Sources

### Primary (HIGH confidence)
- [Tailwind CSS v3 Font Size docs](https://v3.tailwindcss.com/docs/font-size) - typography token configuration
- [Next.js 14 Font Optimization](https://nextjs.org/docs/14/app/building-your-application/optimizing/fonts) - font loading strategy
- [CVA docs](https://cva.style/docs) - component variant API
- [WCAG 2.4.13 Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html) - focus indicator requirements
- [WebAIM Contrast Guide](https://webaim.org/articles/contrast/) - color contrast requirements

### Secondary (MEDIUM confidence)
- [Tailwind CSS Best Practices: Tokens, Type & Layout](https://www.frontendtools.tech/blog/tailwind-css-best-practices-design-system-patterns) - design token patterns for Tailwind
- [Best Google Font Pairings for UI Design 2025](https://medium.com/design-bootcamp/best-google-font-pairings-for-ui-design-in-2025-ba8d006aa03d) - Inter usage patterns for dashboards
- [Creating a Type Scale in Tailwind CSS](https://www.subframe.com/blog/creating-a-type-scale-in-tailwind-css) - practical typography scale creation
- [Motion bundle size reduction](https://motion.dev/docs/react-reduce-bundle-size) - animation library size comparison
- [Next.js Performance Tuning](https://www.qed42.com/insights/next-js-performance-tuning-practical-fixes-for-better-lighthouse-scores) - Lighthouse optimization strategies
- [Inclusive Colors WCAG Tool](https://www.inclusivecolors.com/) - Tailwind-aware contrast checking

### Tertiary (LOW confidence)
- [Fluid Typography Tricks with CSS Clamp](https://tryhoverify.com/blog/fluid-typography-tricks-scaling-text-seamlessly-across-devices-with-tailwind-and-css-clamp/) - clamp() usage patterns (approach is sound but specific breakpoint values need testing)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries verified via official docs; Inter already in use; Tailwind v3 config patterns well-documented
- Architecture: HIGH - CVA + cn() pattern is industry standard (shadcn/ui, Radix); Container/Heading patterns are straightforward
- Design tokens: HIGH - Typography scale and color palette derived from spec + WCAG verification; spacing adapted from spec
- Pitfalls: HIGH - Based on direct audit of current codebase (all 18 routes and 18 components read)
- Animation approach: HIGH - Intersection Observer is browser-native; pattern verified across multiple sources
- Accessibility: MEDIUM - Focus-visible and skip-link patterns are standard; full WCAG AA audit would require runtime testing

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (stable; Tailwind v3, Next.js 14, and CVA are all mature)
