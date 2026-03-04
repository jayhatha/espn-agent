---
phase: quick-31
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/styles/content.css
  - packages/extension/entrypoints/content.tsx
  - packages/extension/lib/value-detection.ts
  - packages/extension/components/AuctionBudgetTracker.tsx
  - packages/extension/components/AuctionRecommendations.tsx
  - packages/extension/components/RosterSummary.tsx
  - packages/extension/components/SnakeTurnPairs.tsx
  - packages/extension/components/PickValueTracker.tsx
  - packages/extension/components/ProjectedStandingsPanel.tsx
  - packages/extension/components/PreDraftRankingEditor.tsx
autonomous: true
requirements: [QUICK-31]

must_haves:
  truths:
    - "All extension components use design tokens (bg-surface-*, text-content-*, etc.) instead of hardcoded Tailwind colors (bg-gray-50, text-gray-600, etc.)"
    - "DM Serif Display and Inter fonts load correctly in the extension sidebar via Google Fonts import"
    - "Value detection badges use semantic color tokens (positive/negative/warning) instead of raw green/red/yellow"
    - "The extension sidebar wrapper uses Tailwind font classes instead of inline fontFamily style"
  artifacts:
    - path: "packages/extension/styles/content.css"
      provides: "Google Fonts import for DM Serif Display and Inter"
      contains: "@import url.*fonts.googleapis.com.*DM+Serif+Display.*Inter"
    - path: "packages/extension/lib/value-detection.ts"
      provides: "Semantic color tokens for value badges"
      contains: "bg-positive-light"
  key_links:
    - from: "packages/extension/styles/content.css"
      to: "Google Fonts CDN"
      via: "@import url"
      pattern: "@import url.*fonts.googleapis"
    - from: "packages/extension/entrypoints/content.tsx"
      to: "Tailwind font classes"
      via: "className instead of inline style"
      pattern: "font-sans"
---

<objective>
Replace all hardcoded Tailwind color classes and inline styles across extension components with the design tokens already defined in the extension's tailwind.config.js. Add Google Fonts import so DM Serif Display and Inter render correctly.

Purpose: Visual consistency between the main app and the Chrome extension sidebar.
Output: All 10 extension component files updated to use design tokens; content.css updated with font import; content.tsx updated to use Tailwind classes.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/tailwind.config.js
@packages/extension/styles/content.css
@packages/extension/entrypoints/content.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add Google Fonts import and fix sidebar wrapper inline styles</name>
  <files>
    packages/extension/styles/content.css
    packages/extension/entrypoints/content.tsx
  </files>
  <action>
    **content.css**: Add Google Fonts @import at the very top of the file (BEFORE @tailwind directives):
    ```
    @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Inter:wght@400;500;600;700&display=swap');
    ```

    **content.tsx**: In both `mountSidebar()` and `openPopout()`, the React root wrapper `<div>` uses inline `style={{ fontFamily: ... }}`. Replace with Tailwind classes:
    - Change `style={{ height: "100%", background: "#ffffff", color: "#111827", fontFamily: '...' }}` to `className="h-full bg-surface text-content font-sans"`
    - Remove the entire `style` prop from both locations
    - The `font-sans` class maps to Inter via tailwind.config.js fontFamily.sans

    Also in `openPopout()`: the line `popupDocument.body.style.background = "#ffffff"` should remain (it's outside React's scope), but add a Google Fonts link to the popup head:
    ```tsx
    const fontLink = popupDocument.createElement("link");
    fontLink.rel = "stylesheet";
    fontLink.href = "https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Inter:wght@400;500;600;700&display=swap";
    popupDocument.head.appendChild(fontLink);
    ```
    Add this BEFORE the styleSheet append in `openPopout()`.
  </action>
  <verify>
    Run `cd /Users/jay-work/Code/espn-agent && grep -n "@import.*googleapis" packages/extension/styles/content.css` confirms font import exists.
    Run `grep -n "font-sans" packages/extension/entrypoints/content.tsx` confirms Tailwind class usage.
    Run `grep -c "fontFamily" packages/extension/entrypoints/content.tsx` returns 0 (no inline fontFamily).
  </verify>
  <done>Google Fonts imported in content.css. Both sidebar mount and popout window use Tailwind font-sans class instead of inline fontFamily. Popout window loads Google Fonts via link element.</done>
</task>

<task type="auto">
  <name>Task 2: Replace all hardcoded Tailwind colors with design tokens across all components</name>
  <files>
    packages/extension/lib/value-detection.ts
    packages/extension/components/AuctionBudgetTracker.tsx
    packages/extension/components/AuctionRecommendations.tsx
    packages/extension/components/RosterSummary.tsx
    packages/extension/components/SnakeTurnPairs.tsx
    packages/extension/components/PickValueTracker.tsx
    packages/extension/components/ProjectedStandingsPanel.tsx
    packages/extension/components/PreDraftRankingEditor.tsx
  </files>
  <action>
    Apply the following color token mappings consistently across ALL listed files. The design tokens are already in tailwind.config.js.

    **Color mapping reference:**
    | Hardcoded | Design Token |
    |-----------|-------------|
    | bg-gray-50 | bg-surface-secondary |
    | bg-gray-100 | bg-surface-tertiary |
    | bg-white | bg-surface |
    | text-gray-900 | text-content |
    | text-gray-700 | text-content |
    | text-gray-600 | text-content-secondary |
    | text-gray-500 | text-content-tertiary |
    | border (bare) | border border-surface-tertiary |
    | bg-blue-600 | bg-accent |
    | bg-blue-50 | bg-info-light |
    | bg-blue-100 | bg-info-light |
    | text-blue-900 | text-info |
    | text-blue-700 | text-info |
    | text-blue-600 | text-info |
    | border-blue-200 | border-info-border |
    | border-blue-300 | border-info-border |
    | bg-green-50 | bg-positive-light |
    | bg-green-100 | bg-positive-light |
    | text-green-900 | text-positive |
    | text-green-700 | text-positive |
    | text-green-600 | text-positive |
    | border-green-200 | border-positive-border |
    | border-green-300 | border-positive-border |
    | bg-red-50 | bg-negative-light |
    | bg-red-100 | bg-negative-light |
    | text-red-900 | text-negative |
    | text-red-800 | text-negative |
    | text-red-700 | text-negative |
    | text-red-600 | text-negative |
    | border-red-200 | border-negative-border |
    | border-red-300 | border-negative-border |
    | bg-yellow-50 | bg-warning-light |
    | bg-yellow-100 | bg-warning-light |
    | text-yellow-900 | text-warning |
    | text-yellow-700 | text-warning |
    | text-yellow-800 | text-warning |
    | border-yellow-200 | border-warning-border |
    | border-yellow-300 | border-warning-border |
    | bg-indigo-50 | bg-info-light |
    | text-indigo-900 | text-info |
    | text-indigo-700 | text-info |
    | border-indigo-100 | border-info-border |

    **Per-file specifics:**

    **value-detection.ts** `getValueColorClasses()`:
    - green: `bg-positive-light`, `text-positive`, `border-positive-border`
    - yellow: `bg-warning-light`, `text-warning`, `border-warning-border`
    - red: `bg-negative-light`, `text-negative`, `border-negative-border`

    **AuctionBudgetTracker.tsx**:
    - `pacingColors.ahead`: `bg-positive-light border-positive-border text-positive`
    - `pacingColors["on-track"]`: `bg-info-light border-info-border text-info`
    - `pacingColors.behind`: `bg-negative-light border-negative-border text-negative`
    - Line 32 `bg-gray-50` -> `bg-surface-secondary`; add `border-b border-surface-tertiary`
    - Line 36 `bg-white` -> `bg-surface`; `border` -> `border border-surface-tertiary`
    - All `text-gray-600` -> `text-content-secondary`
    - All `text-gray-900` -> `text-content`
    - Line 67 `bg-blue-50` -> `bg-info-light`; `border-blue-200` -> `border-info-border`
    - Line 68 `text-blue-700` -> `text-info`
    - Line 69-70 `text-blue-900` -> `text-info`; `text-blue-600` -> `text-info`

    **AuctionRecommendations.tsx**:
    - Line 216 `bg-gray-50` -> `bg-surface-secondary`
    - Line 222 `bg-blue-600 text-white` -> `bg-accent text-content-inverse`
    - Line 222 `bg-white text-gray-700 border` -> `bg-surface text-content-secondary border border-surface-tertiary`
    - Same for line 232-233 (position buttons)
    - Line 241 `text-gray-600` -> `text-content-secondary`
    - Line 249 `text-gray-500` -> `text-content-tertiary`

    **RosterSummary.tsx**:
    - Line 40 `bg-gray-50` -> `bg-surface-secondary`; add `border-surface-tertiary` to border-b
    - Line 49 `bg-white` -> `bg-surface`; `border` -> `border border-surface-tertiary`
    - Line 50 `text-gray-900` -> `text-content`
    - Line 51 `text-gray-600` -> `text-content-secondary`
    - Line 59 `bg-white` -> `bg-surface`; `border` -> `border border-surface-tertiary`
    - Line 60 `text-gray-700` -> `text-content`
    - Line 66 `text-gray-600` -> `text-content-secondary`
    - Line 75 `bg-blue-50` -> `bg-info-light`; `border-blue-200` -> `border-info-border`
    - Line 76-79 `text-blue-900` -> `text-info`; `text-blue-700` -> `text-info`
    - Line 84 `text-gray-500` -> `text-content-tertiary`

    **SnakeTurnPairs.tsx**:
    - Line 66 `bg-yellow-50` -> `bg-warning-light`; `border-yellow-200` -> `border-warning-border`
    - Line 67 `text-yellow-900` -> `text-warning`
    - Line 72 `text-yellow-700` -> `text-warning`
    - Line 78 `border-yellow-300` -> `border-warning-border`
    - Line 81 `text-gray-900` -> `text-content`
    - Line 84-85 `text-gray-500` -> `text-content-tertiary`
    - Line 88 `text-gray-600` -> `text-content-secondary`

    **PickValueTracker.tsx**:
    - Line 46 `text-gray-500` -> `text-content-tertiary`
    - Line 53 `bg-gray-50` -> `bg-surface-secondary`
    - Line 61 `bg-blue-100 border border-blue-300` -> `bg-info-light border border-info-border`
    - Line 63 `bg-white border` -> `bg-surface border border-surface-tertiary`
    - Line 70 `text-green-600` -> `text-positive`
    - Line 72 `text-red-600` -> `text-negative`
    - Line 73 `text-gray-600` -> `text-content-secondary`
    - Line 96-98: `bg-blue-50 border-blue-200` -> `bg-info-light border-info-border`
    - Line 99 `bg-white` -> `bg-surface`
    - Line 109 `bg-green-100 text-green-700` -> `bg-positive-light text-positive`
    - Line 111 `bg-red-100 text-red-700` -> `bg-negative-light text-negative`
    - Line 112 `bg-gray-100 text-gray-600` -> `bg-surface-tertiary text-content-secondary`
    - Line 118 `text-gray-500` -> `text-content-tertiary`

    **ProjectedStandingsPanel.tsx**:
    - Line 35 `bg-indigo-50` -> `bg-info-light`
    - Line 36 `text-indigo-900` -> `text-info`
    - Line 41 `text-indigo-700` -> `text-info`
    - Line 46 `text-indigo-700` -> `text-info`
    - Line 53 `border-indigo-100` -> `border-info-border`
    - Line 56 `text-gray-900` -> `text-content`
    - Line 59 `text-gray-700` -> `text-content`
    - Line 63 `text-gray-500` -> `text-content-tertiary`

    **PreDraftRankingEditor.tsx**:
    - Line 67 `bg-gray-50` -> `bg-surface-secondary`
    - Line 69 `text-gray-600` -> `text-content-secondary`
    - Line 86 `text-gray-600` -> `text-content-secondary`
    - Line 91 `text-red-600 hover:text-red-700` -> `text-negative hover:text-negative`
    - Line 102 `text-gray-500` -> `text-content-tertiary`
    - Line 111 `bg-yellow-50 border-yellow-200` -> `bg-warning-light border-warning-border`
    - Line 112 `hover:bg-gray-50` -> `hover:bg-surface-secondary`
    - Line 121 `text-gray-500` -> `text-content-tertiary`
    - Line 127 `text-gray-500` -> `text-content-tertiary`
    - Line 141 `text-red-600 hover:text-red-700` -> `text-negative hover:text-negative`

    **IMPORTANT**: Do NOT change DraftSidebar.tsx, PlayerCard.tsx, or AuctionPlayerCard.tsx — these already use design tokens correctly.
  </action>
  <verify>
    Run `cd /Users/jay-work/Code/espn-agent && grep -rn 'bg-gray-\|text-gray-\|bg-blue-\|text-blue-\|bg-green-\|text-green-\|bg-red-\|text-red-\|bg-yellow-\|text-yellow-\|bg-indigo-\|text-indigo-\|border-blue-\|border-green-\|border-red-\|border-yellow-\|border-indigo-' packages/extension/components/ packages/extension/lib/value-detection.ts` returns zero matches.
    Run `pnpm --filter extension build` compiles without errors.
  </verify>
  <done>All 8 files use design tokens exclusively. Zero hardcoded Tailwind color classes remain in extension components or value-detection utility. Extension builds successfully.</done>
</task>

</tasks>

<verification>
Run full grep across extension package for any remaining hardcoded colors:
```bash
grep -rn 'bg-gray-\|text-gray-\|bg-blue-\|text-blue-\|bg-green-\|text-green-\|bg-red-\|text-red-\|bg-yellow-\|text-yellow-\|bg-indigo-\|text-indigo-' packages/extension/
```
Should return zero results (excluding node_modules, .output).

Verify extension builds:
```bash
pnpm --filter extension build
```
</verification>

<success_criteria>
- Google Fonts @import loads DM Serif Display and Inter in extension
- All extension components use design tokens from tailwind.config.js
- No hardcoded Tailwind color classes (gray-*, blue-*, green-*, red-*, yellow-*, indigo-*) in any extension component or utility
- Inline fontFamily styles in content.tsx replaced with Tailwind font-sans class
- Extension builds without errors
</success_criteria>

<output>
After completion, create `.planning/quick/31-redesign-extension-to-match-fonts-colors/31-SUMMARY.md`
</output>
