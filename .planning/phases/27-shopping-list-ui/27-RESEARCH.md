# Phase 27: Shopping List UI - Research

**Researched:** 2026-03-05
**Domain:** React component UI — Chrome extension sidebar, Tailwind CSS, collapsible section patterns
**Confidence:** HIGH

## Summary

Phase 27 replaces the "Top Targets" section in `EngineInsights.tsx` with a new "Shopping List" section backed by the `ShoppingListSignal` already computed and attached to `engineSignals.optimization.shoppingList` by the Phase 26 engine. The data model is complete and verified. This phase is purely a UI composition task: no new engine logic, no new types, no new state.

The shopping list signal (`ShoppingListSignal`) contains `positionGroups: PositionGroup[]` sorted by `priorityScore` descending. Each `PositionGroup` has `position`, `priorityScore`, `unfilledSlots`, `scarcityIndex`, `budgetFit`, and `targets: PositionTarget[]`. Each `PositionTarget` has `playerName`, `maxBid`, `expectedMarketPrice`, and `valueSurplus`. These are exactly the fields required by SHOP-02 and SHOP-03.

The implementation strategy is: (1) remove the existing Top Targets `<details>` block from `EngineInsights.tsx`, (2) add a new Shopping List `<details>` block that maps over `positionGroups`, (3) each group renders as a collapsible sub-section with a priority badge, (4) each player row shows name/maxBid/expectedMarketPrice/valueSurplus, (5) when `positionGroups.length === 0`, render a compact "Roster Complete" state. A standalone `ShoppingList.tsx` component is preferable over inlining everything into `EngineInsights.tsx`, keeping file sizes manageable.

**Primary recommendation:** Extract a `ShoppingList.tsx` component. Accept `shoppingList: ShoppingListSignal | null` and `myBudget: number` as props. Use native `<details>/<summary>` for outer section (matching existing EngineInsights pattern) and inner position groups. Pass `engineSignals.optimization.shoppingList` from `EngineInsights.tsx`. No new dependencies needed.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SHOP-01 | Shopping list replaces the current Top Targets section in the EngineInsights sidebar | `EngineInsights.tsx` lines 63-104: the Top Targets `<details>` block is the exact target for replacement. The existing `topTargets` variable and MC summary render block are removed and replaced with a Shopping List section. |
| SHOP-02 | Each position shown as a collapsible group with position label and priority indicator | `PositionGroup` has `position` (string label) and `priorityScore` (0-1 number). Priority indicator can be a colored badge (e.g., urgency level: HIGH/MED/LOW derived from score thresholds, matching existing badge pattern in `EngineInsights.tsx`). Use native `<details>/<summary>` for collapsibility — consistent with all existing sidebar sections. |
| SHOP-03 | Each player row shows name, max bid, expected market price, and value surplus | `PositionTarget` has `playerName`, `maxBid`, `expectedMarketPrice`, `valueSurplus`. All four fields are numbers (integers for bid/price, can be negative for surplus) already computed by engine. |
| SHOP-04 | Position groups are ordered by combined priority score (most urgent first) | `ShoppingListSignal.positionGroups` is already sorted by `priorityScore` descending by `computeShoppingList()`. UI simply renders `positionGroups` in array order — no re-sort needed. |
| SHOP-05 | Shopping list collapses gracefully when no unfilled positions remain | When `positionGroups.length === 0` (engine returns no groups because all positions filled or player pool empty), render a compact "Roster Complete" or "No Open Positions" banner instead of an empty list. The `totalTargets` field is `0` in this case. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 18 | ^18.2.0 | Component rendering | Already in extension package |
| Tailwind CSS | ^3.4.1 | Styling via utility classes | Already configured in extension |
| TypeScript | ^5.3.3 | Type safety | Already in extension |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest | ^1.6.1 | Unit testing | If component logic needs unit tests (pure transform helpers) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `<details>/<summary>` | Radix UI Collapsible | Native is consistent with existing EngineInsights pattern; no new dependency needed |
| Inline in EngineInsights | Separate ShoppingList.tsx | Separate file keeps EngineInsights.tsx manageable; matches pattern for EngineAlerts.tsx, AuctionBudgetTracker.tsx |

**Installation:** No new packages needed.

## Architecture Patterns

### Recommended Project Structure
```
packages/extension/components/
├── ShoppingList.tsx        # NEW — position-grouped shopping list component
├── EngineInsights.tsx      # MODIFIED — remove Top Targets block, add <ShoppingList>
└── (existing components unchanged)
```

### Pattern 1: Existing `<details>/<summary>` collapsible section
**What:** All sections in EngineInsights.tsx use native HTML `<details>` with `open` attribute for default-expanded and no attribute for default-collapsed. The `summary` element uses a consistent header pattern with a chevron indicator.
**When to use:** Outer Shopping List section follows this exactly. Inner position groups can also use this pattern for per-position collapse.

**Example (from EngineInsights.tsx lines 37-61 and 65-103):**
```tsx
// Outer section — open by default
<details open className="group">
  <summary className="px-3 py-2 cursor-pointer flex items-center justify-between bg-surface-secondary hover:bg-surface-tertiary/50 select-none">
    <span className="text-body-sm font-semibold text-content">Shopping List</span>
    <span className="text-body-xs text-content-secondary group-open:rotate-180 transition-transform">▾</span>
  </summary>
  <div className="px-3 pb-3 pt-2 bg-surface space-y-1.5">
    {/* content */}
  </div>
</details>

// Inner position group — collapsed by default
<details className="group border-t border-surface-tertiary">
  <summary className="py-1.5 cursor-pointer flex items-center justify-between select-none">
    <div className="flex items-center gap-1.5">
      <span className="font-semibold text-body-xs text-content">{group.position}</span>
      <span className={`text-body-xs font-semibold px-1.5 py-0.5 rounded ${urgencyBg} ${urgencyText}`}>
        {urgencyLabel}
      </span>
    </div>
    <span className="text-body-xs text-content-secondary group-open:rotate-180 transition-transform">▾</span>
  </summary>
  <div className="space-y-1 pt-1">
    {/* player rows */}
  </div>
</details>
```

### Pattern 2: Priority indicator badge
**What:** `EngineInsights.tsx` already uses colored badge pattern: `bg-positive-light text-positive`, `bg-warning-light text-warning`, `bg-negative-light text-negative`. Priority score thresholds for the badge:
- `priorityScore >= 0.7` → HIGH → `bg-negative-light text-negative`
- `priorityScore >= 0.45` → MED → `bg-warning-light text-warning`
- `priorityScore < 0.45` → LOW → `bg-info-light text-info`

**Example (matching EngineInsights.tsx line 50-55):**
```tsx
const urgencyLabel = group.priorityScore >= 0.7 ? "HIGH" : group.priorityScore >= 0.45 ? "MED" : "LOW";
const urgencyClasses = group.priorityScore >= 0.7
  ? "bg-negative-light text-negative"
  : group.priorityScore >= 0.45
  ? "bg-warning-light text-warning"
  : "bg-info-light text-info";

<span className={`text-body-xs font-semibold px-1.5 py-0.5 rounded ${urgencyClasses}`}>
  {urgencyLabel}
</span>
```

### Pattern 3: Player row layout
**What:** Player rows in EngineInsights.tsx (Top Targets, lines 71-90) use a two-column flex layout: name/position on left, values on right. The Shopping List player row shows `playerName` + `maxBid`, `expectedMarketPrice`, and `valueSurplus`.

**Example (adapted from existing Top Targets pattern):**
```tsx
<div
  key={target.playerName}
  className="flex items-center justify-between text-body-xs"
>
  <span className="font-semibold text-content truncate max-w-[100px]">
    {target.playerName}
  </span>
  <div className="flex items-center gap-2 text-right shrink-0">
    <span className="font-semibold text-content">${target.maxBid}</span>
    <span className="text-content-secondary">~${target.expectedMarketPrice}</span>
    <span className={target.valueSurplus >= 0 ? "text-positive" : "text-negative"}>
      {target.valueSurplus >= 0 ? "+" : ""}{Math.round(target.valueSurplus)}
    </span>
  </div>
</div>
```

### Pattern 4: Graceful empty state (SHOP-05)
**What:** When `positionGroups.length === 0`, show a compact "complete" state rather than empty list. This is a new pattern but consistent with how the overall section handles missing data (returning null or a minimal placeholder). Consistent with the `text-positive` / checkmark styling used for positive states.

**Example:**
```tsx
{positionGroups.length === 0 ? (
  <div className="text-body-xs text-content-secondary text-center py-2">
    Roster positions filled
  </div>
) : (
  positionGroups.map(group => /* ... */)
)}
```

### Pattern 5: EngineInsights prop threading
**What:** `EngineInsights.tsx` currently destructures `optimization` from `engineSignals`. The shopping list lives at `engineSignals.optimization?.shoppingList`. Since `optimization` can be null, the ShoppingList component must handle `shoppingList: ShoppingListSignal | null`.

**Access path:**
```tsx
// In EngineInsights.tsx
const { optimization } = engineSignals;
const shoppingList = optimization?.shoppingList ?? null;

// Pass to new component
<ShoppingList shoppingList={shoppingList} myBudget={inflation.totalRemainingBudget} />
```

Note: `myBudget` for budget display in player rows should come from `engineSignals.inflation.totalRemainingBudget` (already available in EngineInsights destructuring at line 13).

### Anti-Patterns to Avoid
- **Inline everything in EngineInsights**: EngineInsights is already 374 lines; adding 60+ more lines of Shopping List markup makes it unmaintainable. Extract to `ShoppingList.tsx`.
- **Copying Top Targets data path**: Top Targets uses `optimization.topTargets[]` (a flat array). Shopping List uses `optimization.shoppingList.positionGroups[]` (a nested structure). These are different data paths.
- **Re-sorting positionGroups in the UI**: The engine already sorts groups by `priorityScore` descending. Do not re-sort in the component.
- **Rendering `positionGroups` when `shoppingList` is null**: `shoppingList` is null when optimization is null (no FG data), or when `allPlayers.length === 0`. Guard with `shoppingList != null` before rendering.
- **Using `valueSurplus` as-is for display**: `valueSurplus = maxBid - expectedMarketPrice`, which can be negative. Display with sign (`+` prefix for positive) and color coding.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Collapsible sections | Custom accordion with useState | Native `<details>/<summary>` | Already used throughout EngineInsights; no JS state needed; browser-native |
| Priority color thresholds | Complex color logic | Simple ternary with 3 levels | Priority score is 0-1; three levels (HIGH/MED/LOW) map cleanly to existing badge classes |
| Player name truncation | Custom overflow handling | Tailwind `truncate max-w-[...]` | Simple overflow ellipsis; inline Tailwind utility is sufficient |

## Common Pitfalls

### Pitfall 1: Null/undefined guard on `optimization.shoppingList`
**What goes wrong:** `engineSignals.optimization` is null when `leagueCategories.length === 0` (no FG data). `optimization.shoppingList` is null in the empty-pool early-return path. Accessing `.positionGroups` on null throws.
**Why it happens:** The optimization signal is conditionally computed in `computeDraftEngine` (line 545: `if (input.leagueCategories.length > 0)`).
**How to avoid:** In `EngineInsights.tsx`, gate on `optimization != null && optimization.shoppingList != null` before rendering `ShoppingList`. Pass `shoppingList: ShoppingListSignal | null` to the component and return null at the top when it's null.
**Warning signs:** `TypeError: Cannot read properties of null` in the browser console during draft.

### Pitfall 2: Removing MC simulation summary from Top Targets
**What goes wrong:** The existing Top Targets block (lines 93-101) includes a "MC Simulation" footer with `simulationEV` and `simulationStdDev`. When removing Top Targets, this footer is also removed. If the narrator or other consumers expect it to be visible, they'll be confused.
**Why it happens:** The MC summary is inside the Top Targets `<details>` block.
**How to avoid:** Confirm that the MC simulation summary is not needed elsewhere. The Shopping List does not include an MC summary — that data is still available in `engineSignals.optimization.simulationEV` for future use.

### Pitfall 3: `totalRemainingBudget` vs `remainingBudget`
**What goes wrong:** Using the wrong budget field for display. `engineSignals.inflation.totalRemainingBudget` is the league-wide remaining budget sum. The user's personal remaining budget is available via `useDraftStore().remainingBudget`. The shopping list player rows show `maxBid` (already capped to user budget by the engine) and `expectedMarketPrice` — no additional budget formatting needed.
**How to avoid:** The `maxBid` and `expectedMarketPrice` on `PositionTarget` are already computed against `myBudget`. No additional budget math needed in the UI.

### Pitfall 4: Integer rounding for dollar values
**What goes wrong:** `maxBid` and `expectedMarketPrice` are integers (computed with `Math.ceil`/`Math.max(1,...)`). `valueSurplus` is also effectively an integer. `sgpValue` and `adjustedSgp` are floats rounded to 2 decimal places. Displaying raw floats looks wrong in a dollar context.
**How to avoid:** Use `Math.round()` for all dollar/surplus display. Do not display raw `sgpValue` in player rows (it's internal engine data, not shown per SHOP-03).

### Pitfall 5: Group count and `totalTargets` mismatch
**What goes wrong:** Showing group count in the section header (e.g., "Shopping List (5)") using `positionGroups.length` when `totalTargets` is the total player count.
**How to avoid:** If a count badge is desired in the header, use `positionGroups.length` for position count or `totalTargets` for total players — pick one and be consistent.

### Pitfall 6: `group-open:rotate-180` CSS class on inner details
**What goes wrong:** Tailwind's `group-open:` variant requires the parent element to have `class="group"` applied to the `<details>` element itself. If nested `<details>` elements both use `group`, the Tailwind `group-open:` variant on the inner element's chevron may respond to the outer `<details>` being open, not the inner one.
**Why it happens:** Tailwind `group-open:` finds the nearest ancestor with `.group` class that is in an open state. Nested groups can interfere.
**How to avoid:** Use named groups (Tailwind v3.2+ supports `group/inner`) or use `open:rotate-180` directly on the `<summary>` child element, or apply `group` only to the outer `<details>` and use `details[open] >` CSS selectors for inner chevrons. The simplest fix: use `open:rotate-180` on the inner chevron span within the inner `<summary>`, without `group-open:`.

## Code Examples

### ShoppingList.tsx skeleton

```tsx
// packages/extension/components/ShoppingList.tsx
import React from "react";
import type { ShoppingListSignal, PositionGroup, PositionTarget } from "../lib/engine";

interface ShoppingListProps {
  shoppingList: ShoppingListSignal | null;
}

function priorityBadge(score: number): { label: string; classes: string } {
  if (score >= 0.7) return { label: "HIGH", classes: "bg-negative-light text-negative" };
  if (score >= 0.45) return { label: "MED", classes: "bg-warning-light text-warning" };
  return { label: "LOW", classes: "bg-info-light text-info" };
}

function PlayerRow({ target }: { target: PositionTarget }) {
  const surplus = Math.round(target.valueSurplus);
  return (
    <div className="flex items-center justify-between text-body-xs py-0.5">
      <span className="font-semibold text-content truncate max-w-[100px]">
        {target.playerName}
      </span>
      <div className="flex items-center gap-2 text-right shrink-0">
        <span className="font-semibold text-content">${Math.round(target.maxBid)}</span>
        <span className="text-content-secondary">~${Math.round(target.expectedMarketPrice)}</span>
        <span className={surplus >= 0 ? "text-positive" : "text-negative"}>
          {surplus >= 0 ? "+" : ""}{surplus}
        </span>
      </div>
    </div>
  );
}

function PositionGroupSection({ group }: { group: PositionGroup }) {
  const badge = priorityBadge(group.priorityScore);
  return (
    <details className="border-t border-surface-tertiary">
      <summary className="py-1.5 cursor-pointer flex items-center justify-between select-none list-none">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-body-xs text-content">{group.position}</span>
          <span className={`text-body-xs font-semibold px-1.5 py-0.5 rounded ${badge.classes}`}>
            {badge.label}
          </span>
          <span className="text-body-xs text-content-tertiary">
            {group.unfilledSlots} slot{group.unfilledSlots !== 1 ? "s" : ""}
          </span>
        </div>
        <span className="text-body-xs text-content-secondary">▾</span>
      </summary>
      <div className="space-y-0.5 pt-1 pb-1">
        {group.targets.map((target) => (
          <PlayerRow key={target.playerName} target={target} />
        ))}
      </div>
    </details>
  );
}

export default function ShoppingList({ shoppingList }: ShoppingListProps) {
  if (shoppingList === null) return null;

  const { positionGroups } = shoppingList;

  return (
    <details open className="group">
      <summary className="px-3 py-2 cursor-pointer flex items-center justify-between bg-surface-secondary hover:bg-surface-tertiary/50 select-none border-t border-surface-tertiary">
        <div className="flex items-center gap-2">
          <span className="text-body-sm font-semibold text-content">Shopping List</span>
          {positionGroups.length > 0 && (
            <span className="text-body-xs text-content-tertiary">
              {positionGroups.length} pos
            </span>
          )}
        </div>
        <span className="text-body-xs text-content-secondary group-open:rotate-180 transition-transform">▾</span>
      </summary>
      <div className="px-3 pb-3 pt-1 bg-surface">
        {positionGroups.length === 0 ? (
          <div className="text-body-xs text-content-secondary text-center py-2">
            Roster positions filled
          </div>
        ) : (
          positionGroups.map((group) => (
            <PositionGroupSection key={group.position} group={group} />
          ))
        )}
      </div>
    </details>
  );
}
```

### EngineInsights.tsx modification

```tsx
// Replace the Top Targets section (lines 63-104) with:
import ShoppingList from "./ShoppingList";

// Inside the render:
<ShoppingList shoppingList={optimization?.shoppingList ?? null} />
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Top Targets (flat list of 3 cross-position players) | Shopping List (per-position groups, ordered by priority) | Phase 27 | More actionable: user knows exactly which positions to target and why |
| MC Simulation summary block | Removed (MC data still in engine signals) | Phase 27 | Reduces clutter; MC data exposed through narrator instead |

**Deprecated/outdated:**
- Top Targets section (`optimization.topTargets[]`): Still computed in engine (for narrator and other consumers) but no longer rendered in EngineInsights. Do not remove from engine — only remove the render block from EngineInsights.tsx.

## Open Questions

1. **Should inner position groups be open or collapsed by default?**
   - What we know: Outer section is `open` by default (matches Inflation section). Inner groups: user could have 6-8 position groups open at once, which is a lot of vertical space.
   - What's unclear: Preferred interaction — auto-collapse all inner groups, or auto-expand the top 1-2 priority groups?
   - Recommendation: Default to collapsed for all inner position groups. The priority badge is visible in the collapsed summary; user can expand positions of interest. This keeps the section compact.

2. **Where does `myBudget` come from for display context?**
   - What we know: The `maxBid` field on each `PositionTarget` is already capped to `myBudget` by the engine. No additional budget context is needed for the player row display.
   - What's unclear: Whether to show a "max affordable" indicator based on current budget.
   - Recommendation: Not needed for SHOP-03. The `maxBid` IS the budget-aware bid. Display as-is.

3. **Header badge: position count or player count?**
   - What we know: `positionGroups.length` gives number of unfilled position groups. `totalTargets` gives total player count across all groups.
   - Recommendation: Show `positionGroups.length` with "pos" label. This maps 1:1 to the visual groups and is more actionable ("3 positions to fill" vs "9 players to review").

## Sources

### Primary (HIGH confidence)
- Direct code inspection of `packages/extension/lib/engine/shopping-list.ts` (313 lines) — verified Phase 26 output structure
- Direct code inspection of `packages/extension/lib/engine/types.ts` — `ShoppingListSignal`, `PositionGroup`, `PositionTarget` interfaces
- Direct code inspection of `packages/extension/lib/engine/index.ts` — confirmed `shoppingList` field populated on `RosterOptimizationSignal`
- Direct code inspection of `packages/extension/components/EngineInsights.tsx` (374 lines) — existing Top Targets block identified for replacement
- Direct code inspection of `packages/extension/tailwind.config.js` — design tokens confirmed
- Phase 26 VERIFICATION.md — 9/9 truths verified, shopping list engine fully operational

### Secondary (MEDIUM confidence)
- Pattern analysis from `EngineAlerts.tsx`, `PositionScarcityAlerts.tsx` — sidebar section composition patterns
- `AuctionRecommendations.tsx` — position filter + player list patterns
- `DraftSidebar.tsx` — confirmed Shopping List renders only in auction draft path via EngineInsights

### Tertiary (LOW confidence)
- Tailwind `group/named-group` pitfall (nested details/summary) — training data, unverified against Tailwind v3.4 docs but low-risk to mitigate defensively

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — React 18, Tailwind 3.4, Vitest already in use; no new dependencies
- Architecture: HIGH — Data path fully traced from engine output to existing prop interface; component extraction pattern matches EngineAlerts.tsx
- Pitfalls: HIGH for null-guard and integer rounding (verified from type definitions); MEDIUM for Tailwind nested group (training-data only, easy to mitigate)

**Research date:** 2026-03-05
**Valid until:** 2026-04-04 (stable stack)
