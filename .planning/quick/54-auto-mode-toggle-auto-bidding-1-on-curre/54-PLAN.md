---
phase: "54"
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/draft-state.ts
  - packages/extension/lib/auto-bid-controller.ts
  - packages/extension/components/DraftSidebar.tsx
  - packages/extension/entrypoints/content.tsx
autonomous: true
requirements: [AUTO-BID-01]

must_haves:
  truths:
    - "User can toggle auto-bid mode on/off via a switch in the sidebar nominated player banner"
    - "When auto-bid is on and engine says shouldBid=true and currentBid < maxBid, the +1 bid button is clicked automatically"
    - "Auto-bid stops when price reaches or exceeds maxBid"
    - "Auto-bid stops immediately when user toggles it off"
    - "Auto-bid resets to OFF on page load (not persisted) for safety"
    - "Auto-bid only fires once per price change (not repeatedly at same price)"
  artifacts:
    - path: "packages/extension/lib/auto-bid-controller.ts"
      provides: "AutoBidController class that watches store and clicks ESPN DOM bid button"
      min_lines: 40
    - path: "packages/extension/lib/draft-state.ts"
      provides: "autoMode boolean in DraftState (not persisted)"
    - path: "packages/extension/components/DraftSidebar.tsx"
      provides: "Auto-bid toggle switch in nominated player banner"
  key_links:
    - from: "packages/extension/lib/auto-bid-controller.ts"
      to: "packages/extension/lib/draft-state.ts"
      via: "useDraftStore.subscribe for autoMode + currentAuctionPlayer changes"
      pattern: "useDraftStore\\.subscribe"
    - from: "packages/extension/lib/auto-bid-controller.ts"
      to: "ESPN DOM"
      via: "querySelector for bidding-form__default button and click()"
      pattern: "bidding-form__default.*button"
    - from: "packages/extension/entrypoints/content.tsx"
      to: "packages/extension/lib/auto-bid-controller.ts"
      via: "instantiate and cleanup AutoBidController"
      pattern: "AutoBidController"
---

<objective>
Add auto-bid mode to the Chrome extension draft sidebar. When enabled, the extension automatically clicks ESPN's "+1 bid" button whenever the deterministic engine's shouldBid signal is true and the current bid is below the engine's maxBid recommendation. Auto-mode is session-only (resets to OFF on reload) for safety.

Purpose: Hands-free bidding during fast-paced auction drafts — the engine already knows when to bid and what the max price should be, this just actuates it.
Output: AutoBidController module, store state, UI toggle, content script wiring.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/lib/draft-state.ts
@packages/extension/lib/use-draft-engine.ts
@packages/extension/lib/dom-observers.ts
@packages/extension/lib/engine/types.ts
@packages/extension/components/DraftSidebar.tsx
@packages/extension/components/AuctionBudgetTracker.tsx
@packages/extension/entrypoints/content.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add autoMode state and AutoBidController module</name>
  <files>
    packages/extension/lib/draft-state.ts
    packages/extension/lib/auto-bid-controller.ts
  </files>
  <action>
**draft-state.ts changes:**
1. Add `autoMode: boolean` to the `DraftState` interface (default: `false`)
2. Add `setAutoMode: (enabled: boolean) => void` action to the interface
3. Add `autoMode: false` to initial state in the store creator
4. Add `setAutoMode: (enabled) => set({ autoMode: enabled })` to actions
5. Do NOT add `autoMode` to the `partialize` function — it must NOT be persisted (session-only for safety)

**auto-bid-controller.ts — new file:**
Create an `AutoBidController` class with the following behavior:

```typescript
export class AutoBidController {
  private unsubscribe: (() => void) | null = null;
  private lastBidPrice: number | null = null; // Track last price we bid at to prevent repeat clicks

  start(): void {
    // Subscribe to Zustand store changes
    this.unsubscribe = useDraftStore.subscribe(
      (state) => ({
        autoMode: state.autoMode,
        currentBid: state.currentAuctionPlayer?.currentBid,
        playerName: state.currentAuctionPlayer?.playerName,
      }),
      (current, previous) => {
        // Only act when autoMode is ON
        if (!current.autoMode) {
          this.lastBidPrice = null; // Reset tracking when auto-mode is off
          return;
        }
        // Only act on price changes (new bid detected), not repeated checks at same price
        if (current.currentBid === previous.currentBid && current.playerName === previous.playerName) {
          return;
        }
        // Reset lastBidPrice when player changes (new nomination)
        if (current.playerName !== previous.playerName) {
          this.lastBidPrice = null;
        }
        this.evaluateAndBid();
      }
    );
  }
```

IMPORTANT: The Zustand `subscribe` with selector requires the `subscribeWithSelector` middleware OR manual comparison. Since the store does NOT use `subscribeWithSelector`, use a different pattern: subscribe to the full state and do manual diffing inside the callback. Compare `state.autoMode`, `state.currentAuctionPlayer?.currentBid`, and `state.currentAuctionPlayer?.playerName` against captured previous values.

The `evaluateAndBid()` method:
1. Read current store state: `autoMode`, `currentAuctionPlayer`
2. If `!autoMode` or `!currentAuctionPlayer` or `currentAuctionPlayer.currentBid === undefined`, return
3. If `this.lastBidPrice === currentAuctionPlayer.currentBid`, return (already bid at this price)
4. Get engine signals: Read the optimization signal from the store. Since `AutoBidController` runs outside React, it cannot use `useDraftEngineSignals()` hook. Instead, import `computeDraftEngine` directly from `./engine` and call it with the current store state to get `shouldBid` and `maxBid`. OR — simpler approach — expose a way to get the latest signals.

**SIMPLER APPROACH:** Store the latest engine signals in a module-level variable that the content script or a React effect updates. Create a `setLatestEngineSignals` function and a `getLatestEngineSignals` function exported from `auto-bid-controller.ts`. The DraftSidebar (or a new tiny component) calls `setLatestEngineSignals(engineSignals)` on each render when signals change.

Actually even simpler: add `lastEngineSignals: DraftEngineSignals | null` to the controller class and provide a `updateSignals(signals)` method. The content script or a useEffect in DraftSidebar calls it.

The `evaluateAndBid()` method (continued):
4. If `this.lastEngineSignals?.optimization == null`, return (no optimization data)
5. const `{ shouldBid, maxBid }` = `this.lastEngineSignals.optimization`
6. If `!shouldBid`, log "Auto-bid: engine says PASS" and return
7. If `currentAuctionPlayer.currentBid >= maxBid`, log "Auto-bid: price $X exceeds maxBid $Y, stopping" and return
8. Find the ESPN +1 bid button: `document.querySelector('form.bidding-form__default button.bid-player__button')` — this is the "Offer $X" button from the user-provided HTML
9. If button not found, log warning and return
10. If button is disabled, log and return
11. Set `this.lastBidPrice = currentAuctionPlayer.currentBid`
12. Log: `"Auto-bid: clicking +1 at $X (maxBid: $Y)"`
13. Call `button.click()`

The `stop()` method:
- Call `this.unsubscribe?.()` and set to null
- Reset `lastBidPrice` and `lastEngineSignals`

The `updateSignals(signals: DraftEngineSignals | null)` method:
- Set `this.lastEngineSignals = signals`
- After updating signals, also call `this.evaluateAndBid()` — this handles the case where signals arrive/change while at a stable price (e.g., engine just computed shouldBid=true for a player that was already nominated)

Export a singleton: `export const autoBidController = new AutoBidController();`
  </action>
  <verify>
    - `cd /Users/jay-work/Code/espn-agent && pnpm --filter extension exec tsc --noEmit` passes with no type errors
    - `autoMode` is in the DraftState interface but NOT in partialize
    - `AutoBidController` class is exported with `start`, `stop`, `evaluateAndBid`, `updateSignals` methods
  </verify>
  <done>
    - `autoMode` boolean exists in draft store, defaults to false, is NOT persisted
    - `AutoBidController` watches store for price changes, reads engine signals, and clicks the ESPN +1 button when conditions met (shouldBid=true, price < maxBid)
    - Safety guards: only fires once per price level, stops at maxBid, does nothing when autoMode=false
  </done>
</task>

<task type="auto">
  <name>Task 2: Add auto-bid toggle UI and wire controller into content script</name>
  <files>
    packages/extension/components/DraftSidebar.tsx
    packages/extension/entrypoints/content.tsx
  </files>
  <action>
**DraftSidebar.tsx changes:**

1. Import `autoBidController` from `../lib/auto-bid-controller`
2. Add `autoMode` and `setAutoMode` to the destructured `useDraftStore()` call
3. Add a `useEffect` that calls `autoBidController.updateSignals(engineSignals)` whenever `engineSignals` changes:
   ```tsx
   useEffect(() => {
     autoBidController.updateSignals(engineSignals);
   }, [engineSignals]);
   ```
4. In the "Now Nominated" banner (the `draftFormat === "auction" && currentAuctionPlayer` block around line 177), add an auto-bid toggle row BELOW the existing banner content but still inside the `border-b-2 border-accent` div. Place it as the last child:

```tsx
{/* Auto-bid toggle */}
<div className="flex items-center justify-between mt-2 pt-2 border-t border-accent/20">
  <div className="flex items-center gap-1.5">
    <span className="text-body-xs font-semibold text-content">Auto-Bid</span>
    {autoMode && engineSignals?.optimization && (
      <span className="text-body-xs text-content-secondary">
        (max ${engineSignals.optimization.maxBid})
      </span>
    )}
  </div>
  <button
    onClick={() => setAutoMode(!autoMode)}
    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
      autoMode ? "bg-accent" : "bg-surface-tertiary"
    }`}
    role="switch"
    aria-checked={autoMode}
    aria-label="Toggle auto-bid"
  >
    <span
      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
        autoMode ? "translate-x-4.5" : "translate-x-0.5"
      }`}
    />
  </button>
</div>
{autoMode && (
  <div className="mt-1 text-body-xs text-warning">
    Auto-bidding +1 up to engine max bid
  </div>
)}
```

Note on the toggle switch styling: use `translate-x-[18px]` instead of `translate-x-4.5` if Tailwind doesn't have the 4.5 class — check the tailwind config. Use the arbitrary value `translate-x-[18px]` for the "on" state and `translate-x-[2px]` for the "off" state to be safe.

**content.tsx changes:**

1. Import `autoBidController` from `../lib/auto-bid-controller`
2. After the `mountSidebar()` call (around line 521), add: `autoBidController.start();`
3. In the `beforeunload` cleanup handler, add: `autoBidController.stop();` alongside the other cleanup calls
  </action>
  <verify>
    - `cd /Users/jay-work/Code/espn-agent && pnpm --filter extension exec tsc --noEmit` passes
    - DraftSidebar renders auto-bid toggle inside the nominated player banner (only visible during auction with a nominated player)
    - content.tsx starts and stops the autoBidController
    - `pnpm --filter extension build` succeeds
  </verify>
  <done>
    - Auto-bid toggle switch appears in the nominated player banner during auction drafts
    - Toggle shows current maxBid limit when active
    - Warning text shown when auto-bid is on
    - AutoBidController is started when content script loads and cleaned up on unload
    - Engine signals are piped from DraftSidebar's useEffect into the controller
  </done>
</task>

</tasks>

<verification>
1. `pnpm --filter extension exec tsc --noEmit` — no type errors
2. `pnpm --filter extension build` — extension builds successfully
3. Manual verification in a live auction draft:
   - Toggle appears in nominated player banner
   - When ON: extension auto-clicks +1 bid when engine says shouldBid and price < maxBid
   - When ON: stops bidding when price >= maxBid
   - When OFF: no auto-bidding occurs
   - Refreshing page resets toggle to OFF
</verification>

<success_criteria>
- Auto-bid toggle visible in sidebar during auction nominations
- Auto-bid clicks ESPN's +1 button when shouldBid=true and currentBid < maxBid
- Auto-bid does NOT fire repeatedly at the same price level
- Auto-bid stops at maxBid ceiling
- Auto-bid state is session-only (not persisted)
- Extension builds and type-checks cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/54-auto-mode-toggle-auto-bidding-1-on-curre/54-01-SUMMARY.md`
</output>
