---
phase: 100-ui-audit
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/frontend/src/components/league/ActionItemsList.tsx
  - packages/frontend/src/components/league/AtRiskSummary.tsx
  - packages/frontend/src/components/league/CategoryMiniChart.tsx
  - packages/frontend/src/components/league/CategoryOpportunityMap.tsx
  - packages/frontend/src/components/league/CategoryPaceBar.tsx
  - packages/frontend/src/components/league/CategoryStatsTable.tsx
  - packages/frontend/src/components/league/DateRangeFilter.tsx
  - packages/frontend/src/components/league/FaabGauge.tsx
  - packages/frontend/src/components/league/GapDetailRow.tsx
  - packages/frontend/src/components/league/GsTracker.tsx
  - packages/frontend/src/components/league/ImpactBadge.tsx
  - packages/frontend/src/components/league/ImpactDetailCard.tsx
  - packages/frontend/src/components/league/InflectionPointMarker.tsx
  - packages/frontend/src/components/league/PlayerRow.tsx
  - packages/frontend/src/components/league/ScarcityBadge.tsx
  - packages/frontend/src/components/league/TeamHealthOverview.tsx
  - packages/frontend/src/components/league/TeamSelector.tsx
  - packages/frontend/src/components/league/TransactionMarker.tsx
  - packages/frontend/src/components/shell/LeagueNav.tsx
  - packages/frontend/src/components/shell/SignalsPanel.tsx
  - packages/frontend/src/components/shell/TopBar.tsx
  - packages/frontend/src/components/ui/Badge.tsx
  - packages/frontend/src/components/ui/Button.tsx
  - packages/frontend/src/components/ui/Card.tsx
  - packages/frontend/src/components/ui/Container.tsx
  - packages/frontend/src/components/ui/ErrorAlert.tsx
  - packages/frontend/src/components/ui/Heading.tsx
  - packages/frontend/src/components/ui/Input.tsx
  - packages/frontend/src/components/ui/LoadingSpinner.tsx
  - packages/frontend/src/components/ui/PageHeader.tsx
  - packages/frontend/src/components/ui/Select.tsx
  - packages/frontend/src/components/ui/StatCard.tsx
  - packages/frontend/src/components/ui/StatsTable.tsx
  - packages/frontend/src/components/ui/TeamColorBadge.tsx
  - packages/frontend/src/components/ui/Term.tsx
  - packages/frontend/src/components/ui/Text.tsx
  - packages/frontend/src/components/ui/Tooltip.tsx
  - packages/frontend/src/components/motion/FadeIn.tsx
  - packages/frontend/src/components/ProtectedRoute.tsx
  - packages/frontend/src/app/leagues/[id]/page.tsx
  - packages/frontend/src/app/leagues/[id]/layout.tsx
  - packages/frontend/src/app/leagues/[id]/_sections/ActionsSection.tsx
  - packages/frontend/src/app/leagues/[id]/_sections/CategoryTableSection.tsx
  - packages/frontend/src/app/leagues/[id]/_sections/IdentitySection.tsx
  - packages/frontend/src/app/leagues/[id]/_sections/NavigationSection.tsx
  - packages/frontend/src/app/leagues/[id]/_sections/RosterSection.tsx
  - packages/frontend/src/app/leagues/[id]/_sections/StatsSection.tsx
  - packages/frontend/src/app/leagues/[id]/draft/auction/page.tsx
  - packages/frontend/src/app/leagues/[id]/draft/auction/validate/page.tsx
  - packages/frontend/src/app/leagues/[id]/draft/rankings/page.tsx
  - packages/frontend/src/app/leagues/[id]/lineup/page.tsx
  - packages/frontend/src/app/leagues/[id]/moves/page.tsx
  - packages/frontend/src/app/leagues/[id]/projections/page.tsx
  - packages/frontend/src/app/leagues/[id]/settings/page.tsx
  - packages/frontend/src/app/leagues/[id]/standings/page.tsx
  - packages/frontend/src/app/leagues/[id]/streaming/page.tsx
  - packages/frontend/src/app/leagues/[id]/trades/page.tsx
  - packages/frontend/src/app/leagues/[id]/trends/page.tsx
  - packages/frontend/src/app/leagues/[id]/waivers/page.tsx
  - packages/frontend/src/app/leagues/connect/page.tsx
  - packages/frontend/src/app/leagues/page.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "All labels, headings, and body text use font-sans (Inter)"
    - "All numeric data, stats, ranks, and scores use font-mono (JetBrains Mono)"
    - "All text is visible in dark mode — no black-on-black or near-invisible text"
    - "Positive values consistently use text-positive or text-green-400/500"
    - "Negative values consistently use text-negative or text-red-400/500"
  artifacts:
    - path: "packages/frontend/src/components/"
      provides: "Consistent typography and contrast across all components"
    - path: "packages/frontend/src/app/leagues/"
      provides: "Consistent typography and contrast across all pages"
  key_links:
    - from: "tailwind.config.js"
      to: "all components and pages"
      via: "font-sans, font-mono, shell-* color tokens"
      pattern: "font-(sans|mono)|shell-(bg|panel|border|text|muted)"
---

<objective>
Audit and fix all frontend UI files for typography, contrast, and color consistency.

Purpose: Phase 65 established Inter for text and JetBrains Mono for numbers, plus dark mode shell tokens. Subsequent phases (66-70) and quick tasks (97-99) may have introduced inconsistencies. This audit ensures every file follows the established patterns.

Output: All components and pages consistently using font-sans for text, font-mono for numbers, proper dark:text-* classes, and semantic colors for positive/negative values.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/frontend/tailwind.config.js
</context>

<tasks>

<task type="auto">
  <name>Task 1: Audit and fix all components (shell, league, ui, motion)</name>
  <files>
    packages/frontend/src/components/league/ActionItemsList.tsx
    packages/frontend/src/components/league/AtRiskSummary.tsx
    packages/frontend/src/components/league/CategoryMiniChart.tsx
    packages/frontend/src/components/league/CategoryOpportunityMap.tsx
    packages/frontend/src/components/league/CategoryPaceBar.tsx
    packages/frontend/src/components/league/CategoryStatsTable.tsx
    packages/frontend/src/components/league/DateRangeFilter.tsx
    packages/frontend/src/components/league/FaabGauge.tsx
    packages/frontend/src/components/league/GapDetailRow.tsx
    packages/frontend/src/components/league/GsTracker.tsx
    packages/frontend/src/components/league/ImpactBadge.tsx
    packages/frontend/src/components/league/ImpactDetailCard.tsx
    packages/frontend/src/components/league/InflectionPointMarker.tsx
    packages/frontend/src/components/league/PlayerRow.tsx
    packages/frontend/src/components/league/ScarcityBadge.tsx
    packages/frontend/src/components/league/TeamHealthOverview.tsx
    packages/frontend/src/components/league/TeamSelector.tsx
    packages/frontend/src/components/league/TransactionMarker.tsx
    packages/frontend/src/components/shell/LeagueNav.tsx
    packages/frontend/src/components/shell/SignalsPanel.tsx
    packages/frontend/src/components/shell/TopBar.tsx
    packages/frontend/src/components/ui/Badge.tsx
    packages/frontend/src/components/ui/Button.tsx
    packages/frontend/src/components/ui/Card.tsx
    packages/frontend/src/components/ui/Container.tsx
    packages/frontend/src/components/ui/ErrorAlert.tsx
    packages/frontend/src/components/ui/Heading.tsx
    packages/frontend/src/components/ui/Input.tsx
    packages/frontend/src/components/ui/LoadingSpinner.tsx
    packages/frontend/src/components/ui/PageHeader.tsx
    packages/frontend/src/components/ui/Select.tsx
    packages/frontend/src/components/ui/StatCard.tsx
    packages/frontend/src/components/ui/StatsTable.tsx
    packages/frontend/src/components/ui/TeamColorBadge.tsx
    packages/frontend/src/components/ui/Term.tsx
    packages/frontend/src/components/ui/Text.tsx
    packages/frontend/src/components/ui/Tooltip.tsx
    packages/frontend/src/components/motion/FadeIn.tsx
    packages/frontend/src/components/ProtectedRoute.tsx
  </files>
  <action>
    Read EVERY component file listed above. For each file, check and fix:

    **Typography (font-sans vs font-mono):**
    - Labels, headings, descriptions, button text, nav items -> must use font-sans (Inter). If no font class is specified on a text element and the parent/body already sets font-sans, it inherits — that is fine, no change needed.
    - Numeric values, stats, ranks, scores, percentages, dollar amounts, counts -> must have font-mono class. Look for patterns like: {value}, {score}, {rank}, .toFixed(), numeric literals rendered in JSX, stat abbreviations paired with numbers.
    - The text-data fontSize token in tailwind already includes fontFamily mono — if a component uses text-data, it already gets mono. No need to add font-mono on top of text-data.

    **Dark mode contrast:**
    - Any text-black, text-gray-900, text-gray-800 WITHOUT a corresponding dark:text-* variant -> add dark:text-shell-text or dark:text-gray-100.
    - Any text-gray-500, text-gray-600 WITHOUT dark variant -> add dark:text-shell-muted or dark:text-gray-400.
    - Any bg-white or bg-gray-50 WITHOUT dark variant -> add dark:bg-shell-panel.
    - Any border-gray-200 or border-gray-300 WITHOUT dark variant -> add dark:border-shell-border.
    - Check for hardcoded hex colors in className strings that might be invisible on dark backgrounds.

    **Semantic color consistency:**
    - Positive/gain indicators: should use text-positive, text-green-400, or text-green-500 (not random greens like text-green-700 without dark variant).
    - Negative/loss indicators: should use text-negative, text-red-400, or text-red-500 (not random reds).
    - Warning indicators: should use text-warning or text-amber-*/text-yellow-*.
    - If a component uses conditional coloring (e.g., value > 0 ? green : red), ensure both branches use the semantic tokens.

    **Do NOT change:**
    - Functional styling unrelated to typography/contrast (layout, spacing, sizing).
    - Components that already correctly follow all three rules.
    - SVG fill/stroke colors (these are decorative, not text contrast issues).
  </action>
  <verify>
    Run: cd /Users/jay-work/Code/espn-agent && npx turbo run build --filter=frontend 2>&1 | tail -20
    Build must succeed with no errors.
    Then grep for remaining issues:
    - grep -r "text-black" packages/frontend/src/components/ (should return 0 results without dark: variant)
    - grep -rn "text-gray-900" packages/frontend/src/components/ (each match must have a dark: variant on same element or parent)
  </verify>
  <done>
    All 39 component files reviewed. Typography uses font-sans for text and font-mono for numeric data. All text has adequate dark mode contrast. Semantic colors are consistent for positive/negative values.
  </done>
</task>

<task type="auto">
  <name>Task 2: Audit and fix all pages and sections</name>
  <files>
    packages/frontend/src/app/leagues/[id]/page.tsx
    packages/frontend/src/app/leagues/[id]/layout.tsx
    packages/frontend/src/app/leagues/[id]/_sections/ActionsSection.tsx
    packages/frontend/src/app/leagues/[id]/_sections/CategoryTableSection.tsx
    packages/frontend/src/app/leagues/[id]/_sections/IdentitySection.tsx
    packages/frontend/src/app/leagues/[id]/_sections/NavigationSection.tsx
    packages/frontend/src/app/leagues/[id]/_sections/RosterSection.tsx
    packages/frontend/src/app/leagues/[id]/_sections/StatsSection.tsx
    packages/frontend/src/app/leagues/[id]/draft/auction/page.tsx
    packages/frontend/src/app/leagues/[id]/draft/auction/validate/page.tsx
    packages/frontend/src/app/leagues/[id]/draft/rankings/page.tsx
    packages/frontend/src/app/leagues/[id]/lineup/page.tsx
    packages/frontend/src/app/leagues/[id]/moves/page.tsx
    packages/frontend/src/app/leagues/[id]/projections/page.tsx
    packages/frontend/src/app/leagues/[id]/settings/page.tsx
    packages/frontend/src/app/leagues/[id]/standings/page.tsx
    packages/frontend/src/app/leagues/[id]/streaming/page.tsx
    packages/frontend/src/app/leagues/[id]/trades/page.tsx
    packages/frontend/src/app/leagues/[id]/trends/page.tsx
    packages/frontend/src/app/leagues/[id]/waivers/page.tsx
    packages/frontend/src/app/leagues/connect/page.tsx
    packages/frontend/src/app/leagues/page.tsx
  </files>
  <action>
    Read EVERY page and section file listed above. Apply the exact same rules as Task 1:

    **Typography (font-sans vs font-mono):**
    - Labels, headings, descriptions -> font-sans (or inherited). No change if already correct.
    - Numeric values, stats, ranks, percentages, dollar amounts -> font-mono. Pages often render inline stats in table cells or card bodies — these are the primary targets.
    - If using text-data token, mono is already included — skip.

    **Dark mode contrast:**
    - text-black, text-gray-900, text-gray-800 without dark: variant -> add dark:text-shell-text or dark:text-gray-100.
    - text-gray-500, text-gray-600 without dark: variant -> add dark:text-shell-muted or dark:text-gray-400.
    - bg-white, bg-gray-50 without dark: variant -> add dark:bg-shell-panel.
    - border-gray-200, border-gray-300 without dark: variant -> add dark:border-shell-border.

    **Semantic color consistency:**
    - Same rules as Task 1: positive = text-positive/text-green-400, negative = text-negative/text-red-400, warning = text-warning/text-amber-*.
    - Pages like standings, projections, trades, and waivers are most likely to have conditional coloring — pay extra attention.

    **Special attention for pages added post-Phase 65:**
    - draft/auction/page.tsx, draft/rankings/page.tsx, draft/auction/validate/page.tsx — these are newer draft pages, likely have the most inconsistencies.
    - streaming/page.tsx, lineup/page.tsx — also newer additions.

    **Do NOT change:**
    - Layout, routing, data fetching logic.
    - Pages that already correctly follow all three rules.
  </action>
  <verify>
    Run: cd /Users/jay-work/Code/espn-agent && npx turbo run build --filter=frontend 2>&1 | tail -20
    Build must succeed with no errors.
    Then grep for remaining issues across pages:
    - grep -rn "text-black" packages/frontend/src/app/leagues/ (should return 0 unprotected results)
    - grep -rn "text-gray-900" packages/frontend/src/app/leagues/ (each must have dark: variant)
  </verify>
  <done>
    All 22 page and section files reviewed. Typography uses font-sans for text and font-mono for numeric data. All text has adequate dark mode contrast. Semantic colors are consistent. Build passes cleanly.
  </done>
</task>

</tasks>

<verification>
After both tasks complete:
1. `npx turbo run build --filter=frontend` passes with zero errors.
2. No remaining `text-black` without `dark:text-*` in any frontend source file.
3. No remaining `text-gray-900` or `text-gray-800` without `dark:text-*` companion.
4. Numeric data elements have `font-mono` (or use `text-data` which includes mono).
5. Positive/negative conditional coloring uses semantic tokens consistently.
</verification>

<success_criteria>
- All 61 frontend files audited and fixed where needed
- Zero dark mode contrast violations (no invisible text on dark backgrounds)
- Consistent font-sans for text, font-mono for numbers across all components and pages
- Semantic color tokens used consistently for positive/negative/warning states
- Frontend builds successfully
</success_criteria>

<output>
After completion, create `.planning/quick/100-ui-audit-inter-jetbrains-mono-consistenc/100-SUMMARY.md`
</output>
