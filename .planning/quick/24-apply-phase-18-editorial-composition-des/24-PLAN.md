---
phase: quick-24
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/tailwind.config.js
  - packages/extension/entrypoints/styles/popup.css
  - packages/extension/styles/content.css
  - packages/extension/components/DraftSidebar.tsx
  - packages/extension/components/PlayerCard.tsx
  - packages/extension/components/AuctionPlayerCard.tsx
  - packages/extension/components/DraftRecommendations.tsx
autonomous: false
requirements: []

must_haves:
  truths:
    - "Extension popup header uses surface-secondary background instead of purple gradient"
    - "Extension popup buttons use accent token (near-black) instead of blue-gradient"
    - "Draft sidebar header uses surface-secondary with near-black text instead of blue-600"
    - "Player card rows use divider-list (divide-y) instead of border-b border-gray-200"
    - "Stat values in player cards use font-mono text-data sizing"
    - "Position filter buttons in DraftRecommendations use accent token for active state"
  artifacts:
    - path: "packages/extension/tailwind.config.js"
      provides: "Design tokens: surface, content, accent, positive, negative, warning, info, font-display, font-data, text-data, text-body-sm, text-caption"
    - path: "packages/extension/entrypoints/styles/popup.css"
      provides: "Popup with editorial header (no gradient), Inter font, near-black accent buttons"
    - path: "packages/extension/styles/content.css"
      provides: "Sidebar font set to Inter with CSS var fallback"
    - path: "packages/extension/components/DraftSidebar.tsx"
      provides: "Header using surface-secondary + near-black, draft status using surface-tertiary"
    - path: "packages/extension/components/PlayerCard.tsx"
      provides: "Divider-list rows, text-content colors, text-data stat values"
    - path: "packages/extension/components/AuctionPlayerCard.tsx"
      provides: "Dollar value in text-content (not green-600), divider-list rows"
    - path: "packages/extension/components/DraftRecommendations.tsx"
      provides: "Accent active filter buttons, surface-secondary filter bar"
  key_links:
    - from: "packages/extension/tailwind.config.js"
      to: "packages/extension/components/*.tsx"
      via: "Tailwind class compilation"
      pattern: "bg-surface|text-content|bg-accent|text-data"
---

<objective>
Apply Phase 18 editorial composition design tokens and patterns to the Chrome extension's popup and draft sidebar, replacing blue/gradient SaaS chrome with the neutral, typography-driven editorial aesthetic from the main frontend.

Purpose: Visual consistency between the main app and the extension. Users who move from the frontend to the extension should see a coherent design language — same surface colors, same font hierarchy, same interaction patterns.
Output: Updated tailwind.config.js with full design token set, reworked popup.css, updated DraftSidebar + PlayerCard + AuctionPlayerCard + DraftRecommendations using the Phase 18 token vocabulary.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@packages/frontend/tailwind.config.js
@packages/extension/tailwind.config.js
@packages/extension/entrypoints/styles/popup.css
@packages/extension/styles/content.css
@packages/extension/components/DraftSidebar.tsx
@packages/extension/components/PlayerCard.tsx
@packages/extension/components/AuctionPlayerCard.tsx
@packages/extension/components/DraftRecommendations.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Sync design tokens into extension tailwind.config.js and update CSS baselines</name>
  <files>
    packages/extension/tailwind.config.js
    packages/extension/entrypoints/styles/popup.css
    packages/extension/styles/content.css
  </files>
  <action>
    **packages/extension/tailwind.config.js** — Replace the empty `extend: {}` with the full token set copied from packages/frontend/tailwind.config.js. Add:
    - `fontFamily.display: ['DM Serif Display', 'Georgia', 'serif']` (no CSS var — the extension doesn't use Next.js font loader; hardcode the font name directly)
    - `fontFamily.sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif']`
    - `fontFamily.mono: ['ui-monospace', 'SFMono-Regular', 'monospace']`
    - All `fontSize` tokens: display, h1, h2, h3, h4, body-lg, body, body-sm, caption, data
    - All `colors` tokens: surface (DEFAULT/#ffffff, secondary/#f8f9fa, tertiary/#f1f3f5), content (DEFAULT/#111827, secondary/#4b5563, tertiary/#9ca3af, inverse/#ffffff), accent (DEFAULT/#111827, hover/#1f2937, light/#f3f4f6), positive, negative, warning, info (same values as frontend)
    - spacing, maxWidth, gap, borderRadius, boxShadow tokens from frontend config
    Keep `export default` syntax (extension config uses ESM, frontend uses CJS module.exports — maintain the existing export default).

    **packages/extension/entrypoints/styles/popup.css** — Replace the existing styles with editorial design:
    - `html, body`: font-family set to `Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`. Keep width: 400px, min-height: 520px, background: #ffffff, color: #111827.
    - `.popup-header`: Remove the purple gradient. Replace with `background: #f8f9fa; color: #111827; padding: 20px; border-bottom: 1px solid #f1f3f5;`
    - `.popup-header h1`: `font-size: 18px; font-weight: 600; margin: 0 0 4px 0; letter-spacing: -0.01em;`
    - `.popup-subtitle`: `font-size: 12px; color: #4b5563; margin: 0;`
    - `.btn-primary`: Remove the purple gradient. Replace with `background: #111827; color: #ffffff;` Hover: `background: #1f2937;` Remove the translateY transform (no hover lift).
    - `.btn-secondary`: Keep `background: #f3f4f6; color: #111827;` Hover: `background: #e5e7eb;`
    - `.status-indicator`: `background: #f8f9fa;` (was #f7fafc — align to surface-secondary)
    - `.instructions`: Replace blue left-border style with `background: #f8f9fa; border-left: 3px solid #111827; padding: 12px; border-radius: 4px;` Text colors: `color: #111827;` (was blue)
    - `.form-group input:focus`: Replace `border-color: #667eea` with `border-color: #111827;` and `box-shadow: 0 0 0 3px rgba(17, 24, 39, 0.1);`
    - `.popup-footer`: `background: #f8f9fa; border-top: 1px solid #f1f3f5;`
    - Keep all other rules unchanged (layout, sizing, gap values).

    **packages/extension/styles/content.css** — Update `.draft-sidebar` font-family to `Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`. Update `.draft-sidebar-toggle` border color from `#e2e8f0` to `#f1f3f5` and hover from `#f7fafc` to `#f8f9fa` to align with surface tokens.
  </action>
  <verify>Run `pnpm --filter @espn-fantasy/extension build` and confirm it exits 0. No TypeScript or Tailwind compilation errors.</verify>
  <done>extension/tailwind.config.js has full design token set matching frontend. popup.css uses surface-secondary header with near-black text and no gradients. content.css uses Inter font stack.</done>
</task>

<task type="auto">
  <name>Task 2: Update sidebar and player card components to use editorial tokens</name>
  <files>
    packages/extension/components/DraftSidebar.tsx
    packages/extension/components/PlayerCard.tsx
    packages/extension/components/AuctionPlayerCard.tsx
    packages/extension/components/DraftRecommendations.tsx
  </files>
  <action>
    **DraftSidebar.tsx** — Replace the SaaS chrome with editorial tokens:
    - Hidden sidebar button: Replace `bg-blue-600 text-white ... hover:bg-blue-700` with `bg-accent text-white ... hover:bg-accent-hover`
    - Sidebar header div: Replace `bg-blue-600 text-white` with `bg-surface-secondary text-content border-b border-surface-tertiary`
    - Header h1: Replace `text-lg font-bold` with `text-base font-semibold text-content`
    - Header subtitle p: Replace `text-sm opacity-90` with `text-body-sm text-content-secondary`
    - Header control buttons (Refresh/Left/Right/Pop Out): Replace `text-white text-xs hover:bg-blue-700 px-2 py-1 rounded border border-blue-300` with `text-content-secondary text-xs hover:bg-surface-tertiary px-2 py-1 rounded border border-surface-tertiary`
    - Close button: Replace `text-white hover:bg-blue-700` with `text-content-secondary hover:bg-surface-tertiary`
    - Config warning banner: Replace `bg-yellow-100 border-l-4 border-yellow-500` with `bg-warning-light border-l-4 border-warning`. Text: `text-yellow-700` to `text-warning`, `text-yellow-600` to `text-warning`
    - Draft Status section: Replace `bg-gray-100 p-4 border-b` with `bg-surface-secondary p-4 border-b border-surface-tertiary`. Text `text-gray-600` to `text-content-secondary`

    **PlayerCard.tsx** — Apply divider-list and token colors:
    - Outer div: Replace `p-3 border-b hover:bg-blue-50 cursor-pointer transition-colors` with `p-3 hover:bg-accent-light cursor-pointer transition-colors`. When `isAtTurn`: keep `bg-warning-light` (was `bg-yellow-50`) and add `border-l-2 border-warning`. Remove `border-b` from outer div — the list parent will use `divide-y divide-surface-tertiary`.
    - Player name div: Replace `font-semibold text-gray-900` with `font-semibold text-content`
    - Position/tier line: Replace `text-xs text-gray-500` with `text-caption text-content-tertiary`
    - ADP span: Replace `text-blue-600` with `text-content-secondary`
    - Rank number: Replace `text-sm font-bold text-blue-600` with `text-sm font-semibold text-content`
    - VBD label: Replace `text-xs text-gray-500` with `text-caption text-content-tertiary`
    - Stats row: Replace `text-xs text-gray-600 mt-2 flex gap-3` with `text-data text-content-secondary mt-2 flex gap-3`
    - "Picks until turn" badge: Replace `bg-orange-100 text-orange-700` with `bg-warning-light text-warning`

    **AuctionPlayerCard.tsx** — Same patterns:
    - Outer div: Replace `p-3 border-b hover:bg-blue-50 cursor-pointer transition-colors border-gray-200` with `p-3 hover:bg-accent-light cursor-pointer transition-colors`
    - Player name: `font-semibold text-gray-900` to `font-semibold text-content`
    - Position line: `text-xs text-gray-500` to `text-caption text-content-tertiary`
    - ADP span: `text-blue-600` to `text-content-secondary`
    - Dollar value: Replace `text-lg font-bold text-green-600` with `text-h3 font-semibold text-content` (dollar value is data, not a semantic positive — use neutral content token)
    - VBD label: `text-xs text-gray-500` to `text-caption text-content-tertiary`
    - Budget badges: "Value" badge: `bg-green-100 text-green-700` to `bg-positive-light text-positive`. "Over budget" badge: `bg-red-100 text-red-700` to `bg-negative-light text-negative`
    - Stats row: `text-xs text-gray-600 mt-2 flex gap-3` to `text-data text-content-secondary mt-2 flex gap-3`

    **DraftRecommendations.tsx** — Update filter bar and list container:
    - Filter bar div: Replace `p-3 bg-gray-50 border-b space-y-2` with `p-3 bg-surface-secondary border-b border-surface-tertiary space-y-2`
    - "All" button active: Replace `bg-blue-600 text-white` with `bg-accent text-white`
    - "All" button inactive: Replace `bg-white text-gray-700 border` with `bg-surface text-content-secondary border border-surface-tertiary`
    - Position buttons active: Replace `bg-blue-600 text-white` with `bg-accent text-white`
    - Position buttons inactive: Replace `bg-white text-gray-700 border` with `bg-surface text-content-secondary border border-surface-tertiary`
    - Filter label: Replace `text-sm text-gray-700` with `text-body-sm text-content-secondary`
    - Empty state: Replace `text-gray-500` with `text-content-tertiary`
    - Player list container div: Add `divide-y divide-surface-tertiary` to the `flex-1 overflow-y-auto` div so PlayerCard rows get divider-list treatment instead of individual border-b.
  </action>
  <verify>Run `pnpm --filter @espn-fantasy/extension build` and confirm it exits 0. Open extension popup in Chrome (chrome://extensions -> load unpacked) and visually confirm: header is light gray not purple, buttons are near-black not purple gradient, sidebar header is light gray not blue.</verify>
  <done>All four components use surface/content/accent/positive/negative/warning tokens with no hardcoded blue-600, gray-500, or gradient references. Player list rows use divide-y from DraftRecommendations container. Dollar values and stats use text-data monospace sizing. Build passes.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Verify extension editorial redesign visually</name>
  <what-built>
    Applied Phase 18 design tokens and editorial composition patterns to the Chrome extension:
    - tailwind.config.js now has full design token set (surface, content, accent, positive, negative, warning, info colors + font hierarchy)
    - popup.css uses surface-secondary header with near-black text, no purple gradients, near-black primary buttons
    - DraftSidebar header is light gray (surface-secondary) with near-black text, not blue-600
    - Player cards use divider-list rows (divide-y on parent, no individual border-b)
    - Stat values use text-data (monospace, 0.8125rem) instead of text-xs text-gray-600
    - Filter buttons use bg-accent for active state instead of bg-blue-600
    - Budget badges (Value/Over budget) use positive/negative semantic tokens
  </what-built>
  <how-to-verify>
    1. Load the extension in Chrome: go to chrome://extensions, enable Developer mode, click "Load unpacked", select packages/extension/dist (or run `pnpm --filter @espn-fantasy/extension build` first)
    2. Click the extension icon to open the popup — confirm the header is light gray (#f8f9fa) with "ESPN Draft Assistant" in dark text, NOT purple gradient
    3. Confirm the "Save Settings" / primary action button is near-black, NOT purple gradient
    4. If you have access to a draft page (or can simulate), open the sidebar and confirm:
       - Sidebar header bar is light gray, NOT blue
       - "Refresh / Left / Right / Pop Out" buttons are gray-outlined, NOT blue-outlined
       - Player card rows have thin gray dividers, NOT individual blue hover states
       - Stat values (HR, RBI, AVG, etc.) appear in monospace font
       - Active position filter button is near-black, NOT bright blue
  </how-to-verify>
  <resume-signal>Type "approved" if the extension looks visually consistent with the main frontend's editorial design, or describe any issues.</resume-signal>
</task>

</tasks>

<verification>
- `pnpm --filter @espn-fantasy/extension build` exits 0
- No references to bg-blue-600, bg-blue-700, or purple gradients remain in the four updated component files
- tailwind.config.js export default object contains surface, content, accent, positive, negative, warning, info color objects
- popup.css .popup-header uses background: #f8f9fa (not gradient)
- popup.css .btn-primary uses background: #111827 (not gradient)
</verification>

<success_criteria>
Extension popup and draft sidebar visually match the Phase 18 editorial aesthetic: neutral surface backgrounds, near-black accent buttons, Inter font, divider-list player rows, monospace stat values. Zero blue-600 or purple gradient references in updated files. Build passes.
</success_criteria>

<output>
After completion, create `.planning/quick/24-apply-phase-18-editorial-composition-des/24-SUMMARY.md`
</output>
