# Phase 63: Mobile Draft Companion — Research

**Researched:** 2026-03-21
**Domain:** Next.js frontend (packages/frontend), mobile companion page updates
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Layout**
1. Match the extension sidebar's DraftBoardView layout. Same cheatsheet-style table: position groups as headers, player rows with FG$/tier badges, drafted players in green, available targets below. Expandable/collapsible.
2. Include BidVerdict panel. Show the BID/PASS verdict with pass reason, EV pipeline debug (FG$, ASV, EV, priority score, player tags), and cap chain.
3. Show budget + surplus in header. Same "$X left · +$Y banked" format.

**Controls**
4. Manual bid button. Tap to place a bid at the current price + $1. Only enabled when a player is nominated and price is below our maxBid.
5. Manual nominate button. Tap to nominate a player from our board. Show a quick-pick list of available board players sorted by priority score. Tapping a player nominates them on ESPN.
6. Auto-bid toggle. Same toggle as extension sidebar — enable/disable auto-bidding from mobile.

**Connection**
7. WebSocket to extension. The mobile page already connects via WebSocket (phase 41). Reuse that channel — extension sends engine signals, mobile sends bid/nominate commands back.

**Design**
8. Dark mode matching grafana theme. Same bg-grafana-panel, border-grafana-border, text colors. Mobile-optimized touch targets (min 44px tap areas).
9. Single scrollable page. Top: nominated player + verdict. Middle: draft board. Bottom: controls.

### Claude's Discretion

- Whether to reuse existing mobile components or rebuild from scratch
- How to handle the nominate player picker (modal, dropdown, inline list)
- Whether bid/nominate commands go through the auto-bid controller or directly to ESPN DOM

### Deferred Ideas (OUT OF SCOPE)

- Category heatmap on mobile (too dense for phone screen)
- Opponent tracking on mobile
- Full roster view on mobile
</user_constraints>

---

## Summary

The mobile companion is a Next.js page at `packages/frontend/src/app/draft/live/` (route: `/draft/live`). It was built in Phase 41 and already has a working WebSocket relay, engine signal types, and `sendControl` mechanism. The work for Phase 63 is purely a UI update — no new infrastructure is needed.

The key gap is that `DraftBoardView` data (`draftBoardState`) is **not currently serialized to mobile**. It lives on `engineSignals.optimization.draftBoardState` in the extension but is stripped out when the sidebar writes to `chrome.storage.local` (DraftSidebar.tsx lines 84-92 only forward maxBid, expectedMarketPrice, valueSurplus, shouldBid, simulationEV). This is the single most important blocker: adding `draftBoardState` to the storage relay is a prerequisite for the board view on mobile.

Two new CONTROL actions need to be added: `MANUAL_BID` (triggers ESPN's bid button once at current price + $1) and `MANUAL_NOMINATE` (nominates a specific player by name/ID from the board). Both must be handled in `content.tsx` and forwarded to the auto-bid controller. The `sendControl` typing in `useDraftLiveSocket.ts` must be extended to include these actions.

**Primary recommendation:** Add `draftBoardState` to the engine signals relay in DraftSidebar.tsx, add two new CONTROL actions, then rebuild `LiveTab.tsx` to show the new layout — replacing the existing nomination/verdict/budget cards with DraftBoardView-style components.

---

## Architecture: Existing Mobile Stack

### File locations (all under `packages/frontend/src/app/draft/live/`)
```
page.tsx                     ← Main page: WS connection, tab routing, header
useDraftLiveSocket.ts        ← WS hook: state types, EngineSignals, sendControl
tabs/
  LiveTab.tsx                ← "Live" tab: nomination card, budget, verdict (TO REWRITE)
  QueueTab.tsx               ← Queue tab: force-nominate, skip, autopilot controls
  StrategyTab.tsx            ← Strategy tab: ideal roster, category progress
components/
  ConnectionBanner.tsx
  TabBar.tsx
  CategoryProgressBar.tsx
  IdealRosterList.tsx
useWakeLock.ts
```

### Extension side (relay chain)
```
DraftSidebar.tsx             ← Serializes state → chrome.storage.local (draft-mobile-state, draft-engine-signals)
background.ts                ← Listens for storage changes → sends STATE_SNAPSHOT over WS to hub
packages/backend/api/draft-live.ts  ← WS hub: relays STATE_SNAPSHOT to mobile, CONTROL to extension
content.tsx                  ← Listens for CONTROL messages → calls store setters / autoBidController
auto-bid-controller.ts       ← Bid/nominate logic (forceNominate, evaluateAndBid, etc.)
```

### Data flow
```
Extension store changes
  → DraftSidebar useEffect (150ms debounce)
  → chrome.storage.local.set({draft-engine-signals, draft-mobile-state})
  → background.ts onChanged
  → WebSocket send STATE_SNAPSHOT {payload, engineSignals}
  → backend hub → broadcasts to mobile clients
  → useDraftLiveSocket receives → setState + setEngineSignals
  → LiveTab/StrategyTab render
```

---

## Critical Finding: DraftBoardState Is Not In Mobile Relay

**Problem:** `DraftBoardView` reads from `engineSignals.optimization.draftBoardState` (attached dynamically in `use-draft-engine.ts` line 299). But DraftSidebar.tsx only serializes these fields from optimization:
- maxBid, expectedMarketPrice, valueSurplus, shouldBid, simulationEV

`draftBoardState` is excluded. The mobile `EngineSignals.optimization` type in `useDraftLiveSocket.ts` (`OptimizationSignal`) also lacks it.

**Fix required (extension side):**
In `DraftSidebar.tsx`, add `draftBoardState` to the serialized optimization payload:
```typescript
// In the engineSignals serialization block:
optimization: engineSignals.optimization
  ? {
      maxBid: engineSignals.optimization.maxBid,
      ...existing fields...
      // ADD THESE:
      capSource: engineSignals.optimization.capSource,
      sgpBreakeven: engineSignals.optimization.sgpBreakeven,
      priorityScore: (engineSignals.optimization as any).priorityScore,
      evBuffer: (engineSignals.optimization as any).evBuffer,
      categoryBonus: (engineSignals.optimization as any).categoryBonus,
      playerTags: (engineSignals.optimization as any).playerTags,
      draftBoardState: (engineSignals.optimization as any).draftBoardState,
    }
  : null,
```

Note: `cumulativeSurplus` is on `draftBoardState`, not on `optimization` directly. The whole `draftBoardState` object must be forwarded.

**Fix required (frontend side):**
Extend `OptimizationSignal` in `useDraftLiveSocket.ts` to include the new fields + `draftBoardState`.

---

## New CONTROL Actions Needed

### MANUAL_BID
- Mobile sends: `{ type: "CONTROL", action: "MANUAL_BID", payload: undefined }`
- Content script receives: clicks ESPN's bid button once (same button auto-bid uses)
- The auto-bid controller's `evaluateAndBid()` finds the bid button via `findActionButton(playerId)` or `findAllActionButtons()`. A new `placeSingleBid()` method on AutoBidController can encapsulate this.
- Enable condition: `currentAuctionPlayer != null && currentBid < maxBid`

### MANUAL_NOMINATE
- Mobile sends: `{ type: "CONTROL", action: "MANUAL_NOMINATE", payload: { playerName: string, playerId: number } }`
- Content script receives: calls `autoBidController.nominatePlayer(playerName, playerId)` — essentially the same DOM-interaction path as `forceNominate()` but for a specific player instead of the top-scored candidate
- The auto-bid controller already has the search + dropdown + queue button click flow in `evaluateAndNominate()`. A new `nominateSpecificPlayer(name, id)` method should reuse that DOM interaction code.

### sendControl type extension
In `useDraftLiveSocket.ts`:
```typescript
export type ControlActionMap = {
  // ... existing ...
  MANUAL_BID: undefined;
  MANUAL_NOMINATE: { playerName: string; playerId: number };
};
```

---

## Grafana Theme in Frontend

The extension sidebar uses Tailwind classes like `bg-grafana-panel`, `text-grafana-muted`, `border-grafana-border`, `text-grafana-positive`, etc. These are defined in the extension's Tailwind config.

**The frontend does NOT share the extension's Tailwind theme.** The existing mobile page uses `bg-neutral-900`, `bg-neutral-950`, `text-neutral-100`, etc.

**Options:**
1. Add grafana colors to the frontend's Tailwind config (`packages/frontend/tailwind.config.ts`) — cleanest
2. Use inline hex values directly — simpler, no config change

The extension's grafana palette (from `packages/extension/tailwind.config.js`, verified):
- `bg-grafana-panel` → `#22252b`
- `bg-grafana-bg` → `#181b1f`
- `border-grafana-border` → `#2d3139`
- `text-grafana-text` → `#d9dde6`
- `text-grafana-muted` → `#99a5bc`
- `text-grafana-positive` → `#37872d`
- `text-grafana-negative` → `#c4162a`
- `text-grafana-warning` → `#e0b400`

The frontend Tailwind config (`packages/frontend/tailwind.config.js`) does NOT have these grafana colors — it is a light theme config. They must be added before using `bg-grafana-panel` etc. in mobile components.

**Finding (HIGH confidence):** The extension's grafana palette is NOT in the frontend Tailwind config. The frontend must add it or use inline hex values.

---

## DraftBoardView Component — Mobile Adaptation

The extension's `DraftBoardView.tsx` uses `text-[10px]`, tight padding, and CSS that works well in a narrow sidebar. On mobile it needs:

- Larger text: `text-xs` (12px) minimum for readability
- Larger touch targets on the expand/collapse header: `min-h-[44px]`
- The component uses `engineSignals` prop directly (extension `DraftEngineSignals` type)

**Approach:** Create a new mobile-specific board component (e.g., `MobileDraftBoardView.tsx`) in the frontend that accepts the `EngineSignals` type from `useDraftLiveSocket.ts` (not the extension type). Copy the DraftBoardView logic but adapt prop types and touch targets.

Alternatively: the component accepts `boardState` directly (extracted from `engineSignals.optimization.draftBoardState`), making it easier to type without importing extension types.

---

## BidVerdict Component — Mobile Adaptation

The extension's `BidVerdict.tsx`:
- Reads from `useDraftStore()` (Zustand — extension only)
- Reads `engineSignals` prop
- Reads `remainingBudget` from the store

On mobile, `remainingBudget` and all state comes from the WS `state` and `engineSignals` objects. A mobile `MobileBidVerdict.tsx` should accept all data as props rather than reading from Zustand.

The debug toggle (click verdict → show EV pipeline) is a good UX pattern to preserve on mobile. The expanded fields (sgpBreakeven, priorityScore, evBuffer, categoryBonus, playerTags, capSource) all need to be forwarded in the engine signals relay (see Critical Finding above).

---

## Manual Bid Button Implementation

The bid button should:
- Be **disabled** when `currentAuctionPlayer == null` or `currentBid >= maxBid`
- Show: "BID +$1" with current price visible
- On tap: `sendControl("MANUAL_BID")`
- The extension content.tsx handles `MANUAL_BID` by calling a new `autoBidController.placeSingleBid()` method

The auto-bid controller already knows how to click the ESPN bid button — it's in `evaluateAndBid()`. The extraction to `placeSingleBid()` is low risk.

---

## Manual Nominate Button — Picker UX

The user taps "Nominate" → sees a list of available board players sorted by priority score → taps one → `sendControl("MANUAL_NOMINATE", { playerName, playerId })`.

**Available board players** come from `engineSignals.optimization.draftBoardState.availablePlayers` (after relay fix). These are `BoardPlayer` objects with `name`, `positions`, `fgDollars`, `tier`.

**Recommendation for picker:** Bottom sheet / modal overlay. On mobile, a full-screen modal or a slide-up sheet works best for a list of 20-40 players. React doesn't ship a bottom sheet component natively, but a simple fixed-position overlay with a scrollable list is sufficient — no extra library needed.

The list should show: player name, positions, FG$ value, tier badge (T/R). Sorted by `fgDollars` descending (highest value first for nominate-own-targets) or by priority score when available.

---

## Page Structure Decision

The CONTEXT.md specifies: "Single scrollable page. Top: nominated player + verdict. Middle: draft board. Bottom: controls."

The current page has a 3-tab structure (Live / Strategy / Queue). For Phase 63, the **Live tab** should be reworked to the new layout. The other tabs remain unchanged.

New `LiveTab` layout:
```
[Header] Budget: $X left · +$Y banked
[BidVerdictPanel] BID/PASS + debug toggle
[DraftBoardView] Position groups table (expandable)
[Controls bar - sticky bottom]
  - Auto-bid toggle
  - Manual BID button (context-enabled)
  - Nominate button → opens picker
```

---

## Common Pitfalls

### Pitfall 1: draftBoardState serialization size
**What goes wrong:** `draftBoardState.availablePlayers` can be 300+ board players. Sending the full object every 150ms over WS may be excessive.
**How to avoid:** Only include `availablePlayers` (name, positions, fgDollars, tier) — strip stats, normalizedName, etc. Cap at top 50 per position group or top 150 total. The current mobile relay is already doing similar trimming on idealRoster players.

### Pitfall 2: `OptimizationSignal` type mismatch
**What goes wrong:** The mobile `OptimizationSignal` type in `useDraftLiveSocket.ts` and the extension `RosterOptimizationSignal` in engine/types.ts are different. Adding fields to one without updating the other causes silent `undefined` access.
**How to avoid:** Audit all fields added to DraftSidebar.tsx serialization and ensure they appear in `useDraftLiveSocket.ts`'s `OptimizationSignal` type.

### Pitfall 3: MANUAL_NOMINATE when no player ID
**What goes wrong:** Mobile sends `MANUAL_NOMINATE` with a playerId that doesn't match the ESPN DOM's `data-player-id` attribute (FG player IDs ≠ ESPN player IDs).
**How to avoid:** The nomination flow in the auto-bid controller uses **name-based search** (types the name into ESPN's search box), not ID-based clicking. `MANUAL_NOMINATE` payload only needs `playerName`. The `playerId` can be omitted or used as a tiebreaker.

### Pitfall 4: Tailwind classes not available in frontend
**What goes wrong:** Using `bg-grafana-panel` in the frontend without adding the color to `packages/frontend/tailwind.config.ts`.
**How to avoid:** Add the `grafana` color block from the extension's `tailwind.config.js` to `packages/frontend/tailwind.config.js`. The configs are separate — the frontend does NOT have grafana colors today. The exact values are verified in the Architecture section.

### Pitfall 5: Manual bid timing race
**What goes wrong:** User taps MANUAL_BID at price $10; by the time the message reaches the extension (WS round-trip ~50-200ms), the price may have moved to $11.
**How to avoid:** `placeSingleBid()` should re-read the current bid price from the DOM at time of execution, not from the CONTROL payload. The bid button click is idempotent (clicks "+$1" once).

---

## Code Examples

### Adding MANUAL_BID to ControlActionMap (useDraftLiveSocket.ts)
```typescript
export type ControlActionMap = {
  SET_AUTO_MODE: boolean;
  SET_AUTO_NOMINATE: boolean;
  SET_POSITION_FILTER: string | null;
  SET_PITCHER_HITTER_SPLIT: number;
  SET_BUDGET_OVERRIDE: number;
  FORCE_NOMINATE: undefined;
  SKIP_PLAYER: { playerId: number; playerName: string };
  TOGGLE_SIDEBAR: undefined;
  REORDER_QUEUE: number[];
  MANUAL_BID: undefined;                                         // NEW
  MANUAL_NOMINATE: { playerName: string; playerId?: number };    // NEW
};
```

### Handling MANUAL_BID in content.tsx
```typescript
case "MANUAL_BID":
  autoBidController.placeSingleBid();
  break;
case "MANUAL_NOMINATE": {
  const { playerName } = message.payload as { playerName: string };
  autoBidController.nominateSpecificPlayer(playerName);
  break;
}
```

### Manual bid button in mobile LiveTab
```tsx
<button
  type="button"
  onClick={() => sendControl("MANUAL_BID")}
  disabled={!currentPlayer || !optimization?.shouldBid}
  className="min-h-[44px] px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white font-bold disabled:opacity-40 disabled:pointer-events-none"
>
  BID +$1 {currentPlayer?.currentBid != null ? `($${currentPlayer.currentBid + 1})` : ""}
</button>
```

### DraftBoardState type addition in useDraftLiveSocket.ts
```typescript
export interface BoardPlayer {
  name: string;
  positions: string[];
  fgDollars: number;
  tier: "target" | "reserve";
}

export interface DraftBoardStateSignal {
  availablePlayers: BoardPlayer[];
  draftedPlayers: Array<{ name: string; tier: string; cost: number }>;
  positionsNeeded: string[];
  totalBudgetRemaining: number;
  cumulativeSurplus: number;
  slots: Array<{ draftedName: string | null; filled: boolean; draftedCost: number | null }>;
}

// Extend OptimizationSignal:
export interface OptimizationSignal {
  maxBid: number;
  shouldBid: boolean;
  valueSurplus: number;
  expectedMarketPrice: number;
  // NEW fields:
  capSource?: string | null;
  sgpBreakeven?: number | null;
  priorityScore?: number | null;
  evBuffer?: number | null;
  categoryBonus?: number | null;
  playerTags?: string[] | null;
  draftBoardState?: DraftBoardStateSignal | null;
}
```

---

## Implementation Scope Summary

### Extension changes (packages/extension)
1. **DraftSidebar.tsx** — Add `draftBoardState` and BidVerdict fields (capSource, sgpBreakeven, priorityScore, evBuffer, categoryBonus, playerTags) to the engine signals serialization block
2. **content.tsx** — Add `MANUAL_BID` and `MANUAL_NOMINATE` case handlers in the CONTROL message listener
3. **auto-bid-controller.ts** — Add `placeSingleBid()` method (extract bid-click logic from `evaluateAndBid()`) and `nominateSpecificPlayer(name)` method (reuse nomination DOM flow from `evaluateAndNominate()`)

### Frontend changes (packages/frontend)
4. **useDraftLiveSocket.ts** — Add `MANUAL_BID` and `MANUAL_NOMINATE` to `ControlActionMap`; extend `OptimizationSignal` with new fields; add `DraftBoardStateSignal` type
5. **LiveTab.tsx** — Rewrite layout: BidVerdictPanel + MobileDraftBoardView + new control bar with manual bid + nominate buttons
6. **New: MobileDraftBoardView.tsx** — Mobile-adapted version of DraftBoardView (larger touch targets, mobile-friendly expand/collapse)
7. **New: MobileBidVerdict.tsx** — Mobile-adapted BidVerdict accepting all data as props (no Zustand dependency)
8. **New: NominatePickerModal.tsx** (or inline in LiveTab) — Scrollable player list for manual nomination
9. **tailwind.config.ts (frontend)** — Add grafana color palette entries (or use inline hex values)

---

## Sources

### Primary (HIGH confidence)
- Direct code read: `/packages/extension/components/DraftSidebar.tsx` — serialization to storage
- Direct code read: `/packages/extension/components/DraftBoardView.tsx` — board layout logic
- Direct code read: `/packages/extension/components/BidVerdict.tsx` — verdict component
- Direct code read: `/packages/extension/entrypoints/background.ts` — WS relay
- Direct code read: `/packages/backend/src/api/draft-live.ts` — WS hub
- Direct code read: `/packages/frontend/src/app/draft/live/useDraftLiveSocket.ts` — WS types + hook
- Direct code read: `/packages/frontend/src/app/draft/live/page.tsx` — main mobile page
- Direct code read: `/packages/frontend/src/app/draft/live/tabs/LiveTab.tsx` — current live tab
- Direct code read: `/packages/frontend/src/app/draft/live/tabs/QueueTab.tsx` — existing CONTROL actions
- Direct code read: `/packages/extension/lib/auto-bid-controller.ts` — bid/nominate controller
- Direct code read: `/packages/extension/lib/draft-state.ts` — Zustand store
- Direct code read: `/packages/extension/entrypoints/content.tsx` — CONTROL message handlers
- Direct code read: `/packages/extension/lib/engine/types.ts` — engine signal types

---

## Metadata

**Confidence breakdown:**
- Architecture (existing relay chain): HIGH — directly verified from code
- Gap identification (draftBoardState not in relay): HIGH — directly verified from serialization code
- New CONTROL actions: HIGH — pattern is clear from existing FORCE_NOMINATE/SKIP_PLAYER
- Grafana theme in frontend: HIGH — verified: frontend does NOT have grafana colors; must copy grafana block from extension's tailwind.config.js to frontend's tailwind.config.js

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (stable codebase, no external library dependencies)
