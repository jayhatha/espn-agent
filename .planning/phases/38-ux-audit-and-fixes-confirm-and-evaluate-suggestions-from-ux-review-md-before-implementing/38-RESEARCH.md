# Phase 38: UX Audit and Fixes — Research

**Researched:** 2026-03-09
**Domain:** Frontend UX / Chrome Extension UX / Design System
**Confidence:** HIGH (all findings verified against actual codebase)

---

## Summary

This research verifies each suggestion in UX_REVIEW.md against the actual current state of the codebase. Many suggestions from the review are either already partially addressed by phases 17-37, or need significant qualification before implementing. The goal of this research is to build an accurate, prioritized picture of what is a real problem, what is already solved, and what is out of scope for a focused UX fix phase.

The web app has undergone a significant design system overhaul (phases 17-18) resulting in a consistent token set across both the frontend and extension Tailwind configs. The home page redirect (QW-2) is already implemented. The onboarding wizard (V2-WEB-5) already exists. The design token sync (DS-1) is already done. These must not be re-implemented.

The extension lacks: BidVerdict card (QW-1), dark mode (QW-8), mode-aware sidebar (V2-EXT-1), compact cards (QW-6), and keyboard shortcuts (V2-EXT-4). These are all genuine gaps. The web app's most impactful unfixed issues are: flat navigation with no hierarchy (QW-3), flat waiver list with no category grouping (QW-4), weak empty states (QW-5), and no actionable tooltips for analytical terms (QW-7).

**Primary recommendation:** Focus Phase 38 on the Quick Win items (QW-1 through QW-8) that are genuinely unimplemented, and deprioritize all v2 proposals (V2-WEB-*, V2-EXT-*) as out of scope for a UX fix phase. The v2 items are multi-week features requiring new backend endpoints, drag-and-drop libraries, and new pages.

---

## Verification Results by Item

### Items Already Implemented (DO NOT RE-IMPLEMENT)

#### QW-2: Home Page → League Redirect — ALREADY DONE
**Status:** FULLY IMPLEMENTED
**Evidence:** `/packages/frontend/src/app/page.tsx` lines 22-50 already implement exactly the described behavior:
- If user is authenticated and has leagues: redirects to `leagues[0].id`
- If user has no leagues: redirects to `/onboarding`
- If unauthenticated: renders LandingPage marketing content
No action needed.

#### V2-WEB-5: Onboarding Wizard — ALREADY DONE
**Status:** FULLY IMPLEMENTED
**Evidence:** `/packages/frontend/src/app/onboarding/page.tsx` exists with a 4-step wizard (Welcome, Connect League, Select Team, Complete) with progress bar, team card picker, and ESPN cookie auth. Missing the FanGraphs CSV upload step the review mentions, but the core structure is there.

#### DS-1: Shared Design Tokens — ALREADY DONE
**Status:** FULLY IMPLEMENTED
**Evidence:** Both Tailwind configs (`/packages/frontend/tailwind.config.js` and `/packages/extension/tailwind.config.js`) have identical token sets: same `surface.*`, `content.*`, `accent.*`, `positive.*`, `negative.*`, `warning.*`, `info.*` colors; identical fontSize scale (display, h1-h4, body-lg, body, body-sm, caption, data); same spacing, borderRadius, boxShadow tokens. The values are manually duplicated (not imported from a shared file), but they are currently in sync. A shared import file would be a nice cleanup but is not urgent.

**Gap found:** The extension tailwind config does NOT include `body-xs` (used 64 times in extension components) or `neutral-*` (used 248 times in frontend). The extension config also defines `fontFamily.sans` and `fontFamily.mono` which the frontend does not (frontend relies on CSS variables). These are minor inconsistencies but not breaking.

#### DS-2: Secondary Accent Color — ALREADY EXISTS PARTIALLY
**Status:** PARTIALLY IMPLEMENTED
**Evidence:** Both configs define `info.DEFAULT: '#2563eb'` which is the blue the review recommends as `accent-action`. The review's suggestion to add a separate `accent-action` token is valid but the color already exists as `info`.

---

### Quick Wins — Genuine Gaps (IMPLEMENT IN PHASE 38)

#### QW-1: BidVerdict Card — NOT IMPLEMENTED
**Status:** CONFIRMED GAP
**Evidence:** No `BidVerdict.tsx` file exists in `/packages/extension/components/`. The current `DraftSidebar.tsx` renders sections sequentially: Nominated Player Banner → Auto-Pilot Toggle → NominationDiagnostics → AI Narrator → AuctionBudgetTracker → EngineInsights → PositionScarcityAlerts → AuctionRecommendations. There is no consolidated decision card.

**Data availability assessment:** All required data is available:
- `engineSignals.optimization.maxBid` (max bid recommendation)
- `engineSignals.optimization.shouldBid` (bid/pass signal)
- `engineSignals.optimization.expectedMarketPrice` (market price)
- `engineSignals.simulation.winProbability.winProbability` (current win prob)
- `engineSignals.simulation.currentDecision` (bid vs pass comparison)
- `narratorText` from `useNarratorStore` (one-sentence rationale)
- `remainingBudget` from `useDraftStore`

**Implementation notes:** New component `components/BidVerdict.tsx`. Renders when `currentAuctionPlayer !== null`. Color-codes border: green = shouldBid, red = !shouldBid, amber = risky. Insert between NominationDiagnostics and the scrollable section.

#### QW-3: Hierarchical Navigation — NOT IMPLEMENTED
**Status:** CONFIRMED GAP
**Evidence:** `/packages/frontend/src/app/leagues/[id]/_sections/NavigationSection.tsx` renders a flat grid of 7 equal-weight links (Standings, Trends, Waivers, Trade Analyzer, Move Impact, Lineup Optimizer, Streaming Pitchers) with identical styling. No primary/secondary hierarchy exists.

**Implementation notes:** Refactor to two tiers. Primary (horizontal tabs): Overview, Standings, Moves. Secondary (smaller text links): Waivers, Trades, Trends, Projections, Draft Prep. Use active state detection with `usePathname()` from Next.js to highlight current route.

**Feasibility:** High. Pure frontend change, no backend needed. Existing `Container` and semantic HTML sufficient.

#### QW-4: Waiver Recommendations Grouped by Roster Need — NOT IMPLEMENTED
**Status:** CONFIRMED GAP
**Evidence:** `/packages/frontend/src/app/leagues/[id]/waivers/page.tsx` renders a flat paginated list (10 per page) of recommendations. No grouping by category weakness exists.

**Backend data availability:** The `WaiverRecommendation` interface already includes `categoryImpacts: Array<{categoryId, categoryName, deltaRank, deltaPoints}>`. Grouping by `topImpactCategory` is a frontend-only change — sort `categoryImpacts` by `deltaPoints` descending, take the first entry as the "group key".

**Gap:** The `WaiverRecommendation` type does NOT include a `topImpactCategory` field. The frontend would need to compute it from `categoryImpacts` (take the category with highest absolute `deltaPoints`). This is computable in the frontend without backend changes.

**Implementation notes:** Add a `groupBy` function in the page component. Group recs by their highest-impact category. Add "Best Overall" bucket for recommendations where the top category delta is below a threshold (e.g., < 0.5 pts). Each group header shows category name + current team rank colored by `CategoryStatsTable` conventions.

#### QW-5: Actionable Empty States — NOT IMPLEMENTED
**Status:** CONFIRMED GAP
**Evidence:** Current empty states are generic. Waivers page empty state (line 509-537 of waivers/page.tsx) shows "No Waiver Recommendations Available" with a bulleted list of possible reasons, but no direct action button to the relevant fix. The `ErrorAlert` component supports `backLink` prop but not a primary action button with arbitrary `onClick`.

**ErrorAlert current capability:** The `ErrorAlert` component (`/packages/frontend/src/components/ui/ErrorAlert.tsx`) accepts `onRetry` (single retry button) and `backLink` (navigation link). It does NOT support passing arbitrary action buttons or CTAs.

**Required work:**
1. Extend `ErrorAlert` to accept an `action?: { label: string; href?: string; onClick?: () => void }` prop
2. Update specific empty states with meaningful actions:
   - Waivers empty: "Upload Projections" → href to projections page
   - Trades empty: "Upload Projections" → href to projections page
   - Projected standings unavailable: "Refresh Data" → trigger snapshot mutation
   - No recommendations: same as waivers

#### QW-6: Reduce Extension Card Density — NOT IMPLEMENTED
**Status:** CONFIRMED GAP
**Evidence:** `/packages/extension/components/AuctionPlayerCard.tsx` renders all data unconditionally: rank badge + name + positions + ADP + tier badge + rank source + dollar value + FG indicator + FG vs Market badge + over-budget warning + projected stats. No expand/collapse state exists.

**Implementation notes:** Add `const [isExpanded, setIsExpanded] = useState(false)`. Compact state: single row with name + positions + dollar value + one key stat. Click toggles to full detail. Same pattern needed for `PlayerCard.tsx` (snake draft).

**Caution:** The nominated player in the sidebar header (inside `DraftSidebar.tsx`) has a similar density problem but should NOT be collapsed — it is the primary focus element.

#### QW-7: Analytical Tooltips — NOT IMPLEMENTED
**Status:** CONFIRMED GAP
**Evidence:** No `Tooltip.tsx` UI component exists in `/packages/frontend/src/components/ui/`. The only "tooltip" usage in the codebase is Recharts chart tooltips (different concept entirely).

**Implementation approach:** CSS-only tooltip using `group/tooltip` Tailwind pattern or `title` attribute is not sufficient for accessibility — needs a proper ARIA tooltip with `role="tooltip"`. However, a simple `<span>` with hover `::after` pseudo-element works for most cases. The review correctly identifies this costs almost nothing.

**Glossary terms needed:** SGP, VBD, Roto Points, Shapley Impact, Inflation Factor, Surplus Value.

**Implementation notes:**
- Create `packages/frontend/src/components/ui/Tooltip.tsx` — wrapper that renders children with a hover popover
- Create `packages/shared/src/glossary.ts` — map of term → definition
- Create `<Term id="sgp" />` component that renders `<Tooltip content={GLOSSARY.sgp}>SGP</Tooltip>`

#### QW-8: Extension Dark Mode — NOT IMPLEMENTED
**Status:** CONFIRMED GAP
**Evidence:** Extension `tailwind.config.js` has no `darkMode` setting (defaults to `'media'` in Tailwind v3). No `.dark` class toggling exists in the sidebar. The current sidebar uses `bg-white` and light surface colors throughout `DraftSidebar.tsx`.

**Implementation complexity:** MEDIUM. Steps:
1. Add `darkMode: 'class'` to extension `tailwind.config.js`
2. Define dark palette tokens (the review provides specific values matching ESPN's dark UI)
3. Add `dark:` variants to every `bg-*`, `text-*`, `border-*` class in the sidebar components
4. Add toggle button in sidebar header
5. Persist preference to `chrome.storage.local`
6. Auto-detect: check `document.body` background color on mount

**Risk:** This touches almost every extension component's className strings. Scope must be bounded carefully. Can be done component by component.

---

### V2 Features — Out of Scope for Phase 38

The following are confirmed NOT implemented but are multi-week features requiring new backend endpoints, new dependencies, or significant new pages. They should NOT be included in a UX fix phase:

| Item | Reason Out of Scope |
|------|---------------------|
| V2-WEB-1: Weekly Brief | Requires new `GET /api/leagues/:id/teams/:teamId/brief` backend endpoint, new page route, significant data synthesis |
| V2-WEB-2: Category Radar Chart | Recharts `RadarChart` is available (package installed) but no data endpoint returns all-category radar data in one call; also needs new page placement |
| V2-WEB-3: Trade Builder with DnD | Requires `@dnd-kit/core` (not installed), new multi-player trade backend extension |
| V2-WEB-4: Pre-Draft War Room | Requires new route, new backend tier grouping, target list persistence |
| V2-WEB-6: Notification Center | Requires new `user_notification` table, new backend endpoint |
| V2-WEB-7: Mobile Responsive Overhaul | Requires new `ResponsiveTable.tsx`, `MobileNav.tsx`, testing across devices |
| V2-EXT-1: Mode-Aware Sidebar | Large refactor of DraftSidebar render logic; high value but requires careful state design |
| V2-EXT-2: Compact Dashboard Header | New component, manageable effort |
| V2-EXT-3: Snake Draft Board | New CSS Grid component, significant |
| V2-EXT-4: Keyboard Shortcuts | Global keydown listener, manageable effort |
| V2-EXT-5: Draft Recap | New component + post-draft state handling |
| V2-EXT-6: Improved Popup | Redesign of popup.tsx |
| DS-3: Component Library Parity | Port 6 frontend components to extension; medium effort |
| DS-4: Shared Formatters | Create `packages/shared/src/format.ts` |

**V2-EXT-1 (Mode-Aware Sidebar) and V2-EXT-4 (Keyboard Shortcuts) are the highest-ROI v2 items** if the user wants to go beyond quick wins. V2-EXT-1 directly addresses the core extension usability problem (cognitive overload during auction decisions).

---

## Current State Findings: What UX_REVIEW.md Got Wrong or Outdated

### 1. QW-2 Already Done
The review proposes redirecting the home page for authenticated users. This is already implemented. The `page.tsx` checks auth, fetches leagues, and redirects immediately. The review's description of "returning users land on feature cards" is no longer accurate.

### 2. Onboarding Already Exists
V2-WEB-5 describes a multi-step onboarding wizard. The `/onboarding/page.tsx` already implements steps 1-4 (Welcome, Connect League, Select Team, Complete). Missing: FanGraphs CSV upload step and auto-triggered first snapshot. These gaps are worth noting but the wizard itself exists.

### 3. Design Tokens Already Synced
DS-1 describes extracting shared tokens to a `packages/shared/design-tokens.js` file. Both Tailwind configs already have identical values (verified line-by-line). The sync is manual, not automated, but currently accurate. A shared import is a nice cleanup but not a UX fix.

### 4. Navigation Already Improved (Partially)
The review describes the NavigationSection as "7 equal-weight icon-link cards." The current implementation is actually a compact grid of text links with small icons (not large icon cards). The visual treatment has improved from what the review describes. However, the flat hierarchy problem remains real.

### 5. Trends Page Has More Than Just a Line Chart
The review says "a single time-series chart without category breakdown." The actual trends page has 4 view modes: overall, category, projected, and values. It uses Recharts with transaction annotations and inflection point markers. The page is more developed than the review suggests.

### 6. The Sidebar Toggle Is Not Just "a 40px Tab"
The review says the sidebar toggle is "a small, unstyled tab at the left edge." Current implementation shows a "Show Assistant" button rendered when sidebar is hidden:
```tsx
<button className="fixed top-4 right-4 bg-accent text-white px-3 py-2 rounded-lg shadow-lg hover:bg-accent-hover">
  Show Assistant
</button>
```
This is more visible than described, but the basic concern about discoverability is still valid.

---

## Architecture Patterns

### Frontend (Next.js 14 App Router)
- Components use CVA (class-variance-authority) for variants
- State in URL/localStorage, no global state management
- TanStack Query v5 for server state
- Tailwind with semantic tokens (no `neutral-*` in design system — `neutral-*` usages in waivers page are technical debt using Tailwind's default palette)

### Extension (WXT + React + Zustand)
- Zustand v5 with `persist` middleware for persisted state
- `useDraftStore` is the single state atom
- `useDraftEngineSignals` derives complex engine computation
- ErrorBoundary wrapping all major sections
- No `ui/` component directory — components use inline Tailwind classes with tokens from the synced config

### Key Design System Gaps Found
1. **`body-xs` token missing from both configs** — used 64 times in extension via class but not defined. Must be Tailwind default or this would break builds. (Actually `text-body-xs` would resolve to nothing in Tailwind — this is a silent failure, classes generate no CSS. These elements have no font-size applied.)
2. **`neutral-*` colors** — 248 usages in frontend from Tailwind's built-in neutral palette. Not defined in the custom design system. Works because Tailwind's default colors include neutral. However, creates inconsistency with semantic token intent.
3. **`text-muted-foreground`** — 1 usage in waivers/page.tsx (line 492). This is a shadcn/ui class, not defined anywhere. The text has no color applied.

---

## Standard Stack (for Quick Win Implementation)

No new dependencies needed for QW-1 through QW-7. All components use the existing stack:

| Tool | Version | Purpose |
|------|---------|---------|
| Tailwind CSS | ^3.4.1 | Styling (dark mode via `darkMode: 'class'`) |
| React | ^18.2.0 | Components |
| Zustand | ^5.0.11 | Extension state (for BidVerdict data access) |
| class-variance-authority | ^0.7.1 | Component variants |
| lucide-react | ^0.576.0 | Icons |
| recharts | ^2.10.4 | Already installed (for V2-WEB-2 radar chart if pursued) |

For QW-3 (hierarchical nav), `usePathname()` from `next/navigation` is available and already used in the codebase.

For drag-and-drop (V2-WEB-3 only), `@dnd-kit/core` is NOT installed. Would need `pnpm add @dnd-kit/core @dnd-kit/sortable` in frontend package.

---

## Recommended Phase 38 Scope

Based on verified codebase state, recommend scoping Phase 38 to these 6 items (excluding already-done items):

| Priority | Item | Effort | Where |
|----------|------|--------|-------|
| 1 | QW-1: BidVerdict Card | Medium (new component, data exists) | Extension |
| 2 | QW-3: Hierarchical Navigation | Small (refactor single component) | Frontend |
| 3 | QW-5: Actionable Empty States | Small (extend ErrorAlert + update copy) | Frontend |
| 4 | QW-6: Compact Extension Cards | Small (add expand state) | Extension |
| 5 | QW-4: Waiver Grouped by Need | Medium (frontend grouping logic) | Frontend |
| 6 | QW-7: Analytical Tooltips | Medium (new component + glossary) | Both |
| 7 | QW-8: Extension Dark Mode | Large (touch all components) | Extension |

QW-8 (dark mode) should be planned last or deferred to a separate phase — it touches every extension component and has high risk of visual regressions.

DS-1 (fix the `body-xs` gap and `muted-foreground` bug) should be included as a small cleanup task regardless.

---

## Common Pitfalls

### Pitfall 1: Scope Creep from v2 Features
**What goes wrong:** Planning starts with QW items and expands to V2 items mid-phase.
**How to avoid:** V2 items all require new backend endpoints or new dependencies. Create a clear rule: Phase 38 = only frontend changes with no new npm packages and no new API endpoints.

### Pitfall 2: Breaking Existing Dark-Token Usage
**What goes wrong:** Adding `darkMode: 'class'` to extension Tailwind config causes unexpected dark: overrides that didn't exist before.
**How to avoid:** Add dark mode to extension LAST. Test each component independently.

### Pitfall 3: Waiver Grouping with Sparse Data
**What goes wrong:** Many waiver recommendations have `categoryImpacts` arrays where `deltaPoints === 0` for most categories. The grouping logic produces many "Best Overall" items.
**How to avoid:** The grouping algorithm needs a minimum threshold for category assignment. Only group by a specific category if `deltaPoints > 0.3` for that category.

### Pitfall 4: BidVerdict Showing Stale Data
**What goes wrong:** `currentAuctionPlayer` changes but engineSignals take 200-500ms to recompute. The verdict shows stale max bid for a moment.
**How to avoid:** Show a loading state in BidVerdict when `currentAuctionPlayer` changed but `engineSignals.optimization?.playerId !== currentAuctionPlayer.playerId`. Or add a timestamp check.

### Pitfall 5: `muted-foreground` and `body-xs` Silent Failures
**What goes wrong:** These class names produce no CSS. Their presence suggests features that visually degrade silently.
**How to avoid:** Fix as part of Phase 38 cleanup: replace `text-muted-foreground` → `text-content-secondary`, add `body-xs` token to both Tailwind configs.

---

## Code Examples

### BidVerdict Component Pattern
```tsx
// packages/extension/components/BidVerdict.tsx
import { useDraftStore } from "../lib/draft-state";
import { useNarratorStore } from "../lib/narrator-state";
import type { DraftEngineSignals } from "../lib/engine";

interface BidVerdictProps {
  engineSignals: DraftEngineSignals | null;
}

export default function BidVerdict({ engineSignals }: BidVerdictProps) {
  const { currentAuctionPlayer, remainingBudget } = useDraftStore();
  const narratorText = useNarratorStore((s) => s.currentNarration);

  if (!currentAuctionPlayer || !engineSignals?.optimization) return null;

  const { maxBid, shouldBid, expectedMarketPrice } = engineSignals.optimization;
  const winProbBefore = engineSignals.simulation?.winProbability?.winProbability;
  const decision = engineSignals.simulation?.currentDecision;
  const bidDecision = decision?.decisions.find(d => d.label.toLowerCase().includes('bid'));
  const winProbAfter = bidDecision?.outcome.winProbability;

  const verdictColor = shouldBid ? 'border-positive' : 'border-negative';
  const verdictText = shouldBid ? `BID up to $${maxBid}` : 'PASS';

  return (
    <div className={`mx-4 my-2 border-2 rounded-card p-3 ${verdictColor}`}>
      <div className="text-h3 font-display font-bold text-content">
        VERDICT: {verdictText}
      </div>
      {/* ... */}
    </div>
  );
}
```

### Hierarchical Navigation Pattern
```tsx
// Refactored NavigationSection.tsx
"use client";
import { usePathname } from "next/navigation";

const PRIMARY_LINKS = [
  { href: `/leagues/${leagueId}`, label: "Overview" },
  { href: `/leagues/${leagueId}/standings`, label: "Standings" },
  { href: `/leagues/${leagueId}/moves`, label: "Moves" },
];

const SECONDARY_LINKS = [
  { href: `/leagues/${leagueId}/waivers`, label: "Waivers" },
  { href: `/leagues/${leagueId}/trades`, label: "Trades" },
  { href: `/leagues/${leagueId}/trends`, label: "Trends" },
  { href: `/leagues/${leagueId}/projections`, label: "Projections" },
];
```

### Tooltip Component Pattern
```tsx
// packages/frontend/src/components/ui/Tooltip.tsx
// CSS-only, no JS library needed
interface TooltipProps {
  content: string;
  children: React.ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  return (
    <span className="relative group/tooltip inline">
      <span className="underline decoration-dotted cursor-help">{children}</span>
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1
        hidden group-hover/tooltip:block
        bg-content text-content-inverse text-caption px-2 py-1 rounded
        whitespace-nowrap z-50 pointer-events-none shadow-card"
        role="tooltip"
      >
        {content}
      </span>
    </span>
  );
}
```

---

## Open Questions

1. **Dark mode scope: extension only or also frontend?**
   - What we know: Extension sidebar is displayed on ESPN's dark page, making the contrast jarring. Frontend is standalone and typically used on desktop.
   - What's unclear: Does the user want frontend dark mode in Phase 38 or only extension?
   - Recommendation: Extension dark mode only in Phase 38. Frontend dark mode is V2-WEB scope.

2. **QW-1 BidVerdict: what triggers "risky" vs "pass"?**
   - What we know: `shouldBid` is boolean. No "risky" tier exists currently in engineSignals.
   - What's unclear: Should risky = "shouldBid but budget would be under pressure"?
   - Recommendation: Define risky as `shouldBid && (remainingBudget - maxBid < remainingBudget * 0.15)` — bidding would leave you budget-tight.

3. **QW-4 Grouping UX: how to handle a recommendation that fits two categories?**
   - What we know: Waiver recommendations often improve multiple categories simultaneously.
   - What's unclear: Should a rec appear in multiple groups or only the top one?
   - Recommendation: Only the top group (highest `deltaPoints`). Avoids duplication and keeps the list size manageable.

4. **Tooltip approach: CSS-only vs JS positioning library?**
   - What we know: CSS-only tooltips can be clipped by overflow-hidden containers.
   - What's unclear: Whether the specific locations where tooltips will be used have overflow constraints.
   - Recommendation: Start with CSS-only. The extension sidebar is scrollable with visible overflow so the tooltip may clip. If clipping is an issue, a simple JS `getBoundingClientRect` fallback is sufficient; no library needed.

---

## Sources

### Primary (HIGH confidence — directly inspected files)

- `/packages/frontend/src/app/page.tsx` — QW-2 already implemented (lines 22-57)
- `/packages/frontend/src/app/onboarding/page.tsx` — V2-WEB-5 already implemented
- `/packages/frontend/tailwind.config.js` — design token source of truth
- `/packages/extension/tailwind.config.js` — verified token parity with frontend
- `/packages/extension/components/DraftSidebar.tsx` — current sidebar structure
- `/packages/extension/components/AuctionPlayerCard.tsx` — confirmed no expand/collapse
- `/packages/extension/components/EngineInsights.tsx` — nested accordion structure confirmed
- `/packages/frontend/src/app/leagues/[id]/_sections/NavigationSection.tsx` — flat 7-item nav confirmed
- `/packages/frontend/src/app/leagues/[id]/waivers/page.tsx` — flat list confirmed, `muted-foreground` bug found
- `/packages/frontend/src/components/ui/ErrorAlert.tsx` — no arbitrary action prop
- `/packages/shared/src/` — contains only `formulas.ts`, `types.ts`, `index.ts` (no `glossary.ts`, no `format.ts`)
- `/packages/extension/components/` — no `ui/` subdirectory, no `BidVerdict.tsx`
- `packages/frontend/package.json` — no `@dnd-kit/*`, recharts installed at ^2.10.4
- `packages/extension/package.json` — no keyboard shortcut library, no dark mode configuration

---

## Metadata

**Confidence breakdown:**
- Item status (implemented/not): HIGH — directly verified in source files
- Implementation approach: HIGH — patterns verified against existing codebase architecture
- Effort estimates: MEDIUM — based on code inspection, no build/test run performed

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable frontend; extension changes more frequently)
