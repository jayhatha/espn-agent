---
phase: 103-fix-standings-page-readability-redesign
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/frontend/src/app/layout.tsx
  - packages/frontend/tailwind.config.js
  - packages/frontend/src/components/ui/Heading.tsx
  - packages/frontend/src/app/leagues/[id]/_sections/IdentitySection.tsx
  - packages/frontend/src/app/leagues/[id]/standings/page.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "No DM Serif Display font is loaded or referenced anywhere in the frontend"
    - "All headings render in Inter with appropriate font-weight (bold/extrabold)"
    - "Standings page text is readable on dark backgrounds with proper contrast"
    - "All numeric values on standings page use font-mono"
    - "Standings page header styling matches the shell design system"
  artifacts:
    - path: "packages/frontend/src/app/layout.tsx"
      provides: "Root layout without DM_Serif_Display import"
      contains: "inter.variable"
    - path: "packages/frontend/tailwind.config.js"
      provides: "Tailwind config without display font family"
    - path: "packages/frontend/src/components/ui/Heading.tsx"
      provides: "Heading component using font-bold/font-extrabold instead of font-display"
    - path: "packages/frontend/src/app/leagues/[id]/standings/page.tsx"
      provides: "Standings page with dark mode contrast fixes"
  key_links:
    - from: "Heading.tsx"
      to: "tailwind.config.js"
      via: "font-bold/font-extrabold classes (no font-display)"
      pattern: "font-(bold|extrabold)"
    - from: "layout.tsx"
      to: "tailwind.config.js"
      via: "Only Inter and JetBrains Mono font variables"
      pattern: "inter\\.variable.*jetbrainsMono\\.variable"
---

<objective>
Remove DM Serif Display font globally and fix standings page readability/contrast issues.

Purpose: Unify all typography to Inter with weight variations, fix dark mode contrast problems on standings page.
Output: Clean Inter-only typography, readable standings page in dark mode.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/frontend/src/app/layout.tsx
@packages/frontend/tailwind.config.js
@packages/frontend/src/components/ui/Heading.tsx
@packages/frontend/src/app/leagues/[id]/_sections/IdentitySection.tsx
@packages/frontend/src/app/leagues/[id]/standings/page.tsx
@packages/frontend/src/components/ui/PageHeader.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove DM Serif Display font, replace with Inter weights</name>
  <files>
    packages/frontend/src/app/layout.tsx
    packages/frontend/tailwind.config.js
    packages/frontend/src/components/ui/Heading.tsx
    packages/frontend/src/app/leagues/[id]/_sections/IdentitySection.tsx
  </files>
  <action>
    1. In `layout.tsx`:
       - Remove the `DM_Serif_Display` import from `next/font/google`
       - Remove the `dmSerifDisplay` const declaration (lines 9-14)
       - Remove `${dmSerifDisplay.variable}` from the `<html>` className string (line 34)
       - Keep Inter and JetBrains Mono as-is

    2. In `tailwind.config.js`:
       - Remove the `display` entry from `fontFamily` (line 13: `display: ['var(--font-display)', 'Georgia', 'serif']`)
       - Keep `mono` font family as-is

    3. In `Heading.tsx`:
       - Change level 1 from `"text-h1 font-display"` to `"text-h1 font-extrabold"`
       - Change level 2 from `"text-h2 font-display"` to `"text-h2 font-bold"`
       - Levels 3 and 4 already use `font-semibold`, leave them

    4. In `IdentitySection.tsx`:
       - Line 173: Change `font-display` to `font-extrabold` on the team name h1
       - Line 308: Change `font-display` to `font-extrabold` on the "Season Snapshot" h1
  </action>
  <verify>
    Run: `cd /Users/jay-work/Code/espn-agent && grep -r "font-display" packages/frontend/src/ --include="*.tsx" --include="*.ts" --include="*.js" | grep -v node_modules`
    Expected: No results (zero occurrences of font-display in frontend source).
    Run: `grep -r "DM_Serif_Display\|dmSerifDisplay\|font-display" packages/frontend/src/app/layout.tsx`
    Expected: No results.
    Run: `cd /Users/jay-work/Code/espn-agent && pnpm --filter frontend build 2>&1 | tail -5`
    Expected: Build succeeds without errors.
  </verify>
  <done>
    DM Serif Display font is completely removed from the project. All headings use Inter with font-extrabold (h1), font-bold (h2), or font-semibold (h3/h4). No references to font-display remain in any frontend source file. Build passes.
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix standings page dark mode readability and contrast</name>
  <files>
    packages/frontend/src/app/leagues/[id]/standings/page.tsx
  </files>
  <action>
    Read the standings page file fully before editing. Fix these specific dark mode contrast issues:

    1. **Overall standings table columns (lines 231-308)** - The `format` functions use `text-content` which maps to `#111827` (near-black). On dark backgrounds this is invisible. Add dark mode variants:
       - All `text-content` in column formatters: add `dark:text-shell-text`
       - Example: `"font-medium text-content"` becomes `"font-medium text-content dark:text-shell-text"`
       - Apply to: rank column (lines 236, 269), team name column (lines 248, 282), points column (lines 257, 290), total points in category table (line 450)

    2. **Category breakdown table cells** - In the `renderCategoryBreakdown` function:
       - Line 345 (Team header th): `text-content-secondary` needs `dark:text-shell-muted`
       - Line 352 (Category header th): `text-content-secondary` needs `dark:text-shell-muted`
       - Line 373 (Total header th): `text-content-secondary` needs `dark:text-shell-muted`
       - Line 392 (Team name td): `text-content` needs `dark:text-shell-text`
       - Line 425 (stat value span): `text-content` needs `dark:text-shell-text`
       - Line 450 (total points td): `text-content` needs `dark:text-shell-text`

    3. **Tab navigation (lines 519-546)** - The view mode tabs:
       - Active tab `text-content` needs `dark:text-shell-text`
       - Inactive tab `text-content-secondary` needs `dark:text-shell-muted`
       - Inactive hover `hover:text-content` needs `dark:hover:text-shell-text`

    4. **Marginal gains section (lines 627-670)**:
       - Line 652: `text-content` needs `dark:text-shell-text`
       - Ensure font-mono is on all numeric gap values (line 657 already has it)

    5. **Snapshot date text (line 502)**: `text-content-secondary` needs `dark:text-shell-muted`

    6. **Ensure all numeric stat values use font-mono**: Check that `text-data` class (which includes font-family mono) is on all stat value cells. The `text-data` fontSize definition in tailwind.config.js already sets `fontFamily: 'var(--font-mono, ui-monospace)'` so any cell using `text-data` is correct. Verify no numeric values are missing the `text-data` or `font-mono` class.

    7. **Selected team row highlight**: Line 389 uses `bg-accent-light` which may not have a dark variant. Change to `bg-accent-light dark:bg-shell-accent/10` for a subtle indigo highlight in dark mode.
  </action>
  <verify>
    Run: `grep -n "text-content[^-]" packages/frontend/src/app/leagues/[id]/standings/page.tsx | grep -v "dark:" | head -20`
    Expected: Very few or zero lines with bare `text-content` without a dark: variant (some may be inside conditional classes which is acceptable).
    Run: `cd /Users/jay-work/Code/espn-agent && pnpm --filter frontend build 2>&1 | tail -5`
    Expected: Build succeeds.
  </verify>
  <done>
    All text elements on the standings page have appropriate dark mode contrast using shell design tokens. Numbers use font-mono via text-data class. Tab navigation has dark mode variants. Selected team row has visible dark mode highlight. Build passes.
  </done>
</task>

</tasks>

<verification>
1. `grep -r "font-display\|DM_Serif_Display\|dmSerifDisplay" packages/frontend/src/` returns no results
2. `pnpm --filter frontend build` succeeds
3. Visual: Standings page in dark mode shows readable text with proper contrast
4. Visual: All headings render in Inter (sans-serif), not serif
</verification>

<success_criteria>
- Zero references to DM Serif Display or font-display in frontend source
- All headings use Inter with weight-based differentiation (extrabold, bold, semibold)
- Standings page dark mode: all text readable against dark backgrounds using shell tokens
- All numeric values on standings page use monospace font
- Frontend builds without errors
</success_criteria>

<output>
After completion, create `.planning/quick/103-fix-standings-page-readability-redesign-/103-SUMMARY.md`
</output>
