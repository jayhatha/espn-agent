# Phase 33: Debug Autopilot Nomination Flow - Research

**Researched:** 2026-03-08
**Domain:** Chrome Extension DOM automation / ESPN auction draft UI
**Confidence:** HIGH

## Summary

The autopilot nomination flow has been patched three times (quick-60, quick-79, quick-80) and the current implementation is sophisticated but has several identifiable gaps. The core logic lives in `AutoBidController.evaluateAndNominate()` which chains five detection strategies for turn detection, a two-source candidate selection strategy, and a three-step click sequence (find button → click → confirm). The flow is driven reactively from two trigger paths: the Zustand store subscription (when `currentAuctionPlayer` goes null) and `updateSignals()` (called from DraftSidebar's useEffect when engine signals change).

The most likely remaining failure modes are: (1) nomination strategy data (`simulation.nominationStrategy`) arrives asynchronously from a Web Worker and may not be available at the moment `evaluateAndNominate()` first fires, causing the fallback path to be used even when simulation data would have been better; (2) the `isMyTurnToNominate()` detection has multiple strategies but Strategy 5 (queue buttons present + no bidding form) may fire false-positives or false-negatives in ESPN's React-heavy UI; (3) the `searchAndNominate()` fallback uses `Object.getOwnPropertyDescriptor` to simulate React input events, which may not reliably trigger ESPN's search if ESPN uses synthetic events or controlled components with different internal event handling.

**Primary recommendation:** Add structured console logging to each decision point in the nomination flow, then use the browser devtools to observe exactly where the flow breaks during a live draft. The code is already correct in its logic structure — the issue is empirical validation of DOM selectors against live ESPN state.

## Standard Stack

### Core Components Involved

| File | Purpose | Key Function |
|------|---------|-------------|
| `lib/auto-bid-controller.ts` | Main controller class | `evaluateAndNominate()`, `isMyTurnToNominate()`, `clickPlayerButton()`, `searchAndNominate()`, `clickNominateButton()` |
| `lib/draft-state.ts` | Zustand store | `currentAuctionPlayer`, `autoMode`, `rankings` — nomination reads all three |
| `lib/dom-observers.ts` | DOM parsing utilities | `observeCurrentAuctionPlayer()` — fires `setCurrentAuctionPlayer(null)` when auction ends |
| `lib/engine/index.ts` | Engine orchestrator | Returns `simulation.nominationStrategy` and `idealRoster.players` |
| `lib/engine/simulation-worker.ts` | Async Web Worker | Computes `nominationStrategy` via `recommendNomination()` |
| `lib/engine/nomination-strategy.ts` | Trap score algorithm | `recommendNomination()` — heuristic trap scoring |
| `components/DraftSidebar.tsx` | React bridge | Calls `autoBidController.updateSignals(engineSignals)` in useEffect |
| `entrypoints/content.tsx` | Content script entry | Starts `autoBidController`, sets up `observeCurrentAuctionPlayer` |

### Trigger Flow (Confidence: HIGH — verified from source)

```
[Auction ends] → observeCurrentAuctionPlayer fires null → setCurrentAuctionPlayer(null)
    → Zustand store subscription sees playerWentAway → scheduleNomination(1000ms delay)
    → evaluateAndNominate() called after 1000ms

[Engine signals update] → DraftSidebar useEffect → autoBidController.updateSignals(signals)
    → if (autoMode && currentAuctionPlayer == null) → evaluateAndNominate()
```

Both paths call `evaluateAndNominate()`. The Zustand path has a fixed 1s delay; the signal update path fires immediately but may have stale nomination data.

## Architecture Patterns

### Nomination Flow Decision Tree

```
evaluateAndNominate()
├── Guard: autoMode=true? (else skip)
├── Guard: currentAuctionPlayer==null? (else skip — bidding active)
├── Guard: nominationAttempts < 3? (else back off)
├── Guard: cooldown elapsed (5s)? (else schedule retry)
├── isMyTurnToNominate()? (else skip)
│   ├── Strategy 1: body text has "nominate a player" or "select a player"
│   ├── Strategy 2: pick train has active/highlighted team
│   ├── Strategy 3: pickArea has nomination text or nominate button visible
│   ├── Strategy 4: button.Button--select[data-player-id] present (added quick-80)
│   └── Strategy 5: queue buttons present + no bidding form active
├── Pick candidate
│   ├── Primary: simulation.nominationStrategy[0].playerName (async worker result)
│   └── Fallback: idealRoster.players.find(p => !p.isDrafted).name
├── Map name → ESPN playerId via state.rankings lookup (exact match, lowercase)
├── Find button[data-player-id="${playerId}"] in DOM
│   ├── Found + enabled → clickPlayerButton() → setTimeout(clickNominateButton, 500ms)
│   ├── Found + disabled → increment attempts, bail
│   └── Not found → searchAndNominate() (type in search, wait 800ms, retry)
└── clickNominateButton()
    ├── Specific selectors: button.bid-player__button, button.nominate-button, etc.
    ├── Action area selectors: .pickArea button, form.bidding-form__default button
    └── Fallback: scan all buttons for text "nominate player", "nominate", "submit"
```

### Known ESPN DOM Patterns (verified from source + quick-80 fixes)

| ESPN Element | Selector | Notes |
|-------------|----------|-------|
| Nominated player container | `[data-testid="player-selected"]`, `.player-selected`, `.pickArea` | Verified 2026 |
| Player name in nomination | `.playerinfo__playername` | Verified 2026 |
| Current bid text | `.current-amount` (contains "Current offer: $1") | Verified 2026 |
| Player headshot URL | `img[src*="/players/full/"]` — ID embedded in URL | Verified 2026 |
| Submit/confirm bid button | `button.bid-player__button` | Added quick-80 — actual ESPN class |
| Queue button (not your turn) | `button[data-player-id]` | ESPN-stable, has class changes |
| Select button (your turn) | `button.Button--select[data-player-id]` | Added quick-80 — turn detection |
| Player search input | `.playersSearch input.form__control`, `input[placeholder="Player Name"]` | Used in search fallback |
| Auction value table | `.fixedDataTableLayout_rowsContainer` | Used for ASV scraping |
| Pick train | `.pick-train`, `[class*="pickTrain"]` | Turn detection Strategy 2 |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| React synthetic event simulation | Custom event firing | Use `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set` + `dispatchEvent(new Event('input', {bubbles:true}))` | Already in `searchAndNominate()` — proven pattern for React-controlled inputs |
| Turn detection from scratch | New heuristics | `isMyTurnToNominate()` already has 5 strategies | Iterative fixes, don't rewrite |
| DOM selector discovery | Guessing new selectors | Browser devtools inspection on live ESPN draft page | Only verified source |
| Async worker timing | Extra polling | Trust Zustand subscription + updateSignals() dual trigger | Controller already handles both paths |

## Common Pitfalls

### Pitfall 1: Async Nomination Data Not Ready at First Fire

**What goes wrong:** `evaluateAndNominate()` fires after the 1000ms delay when auction ends. At that moment, `this.lastEngineSignals?.simulation?.nominationStrategy` is `null` because the simulation Web Worker hasn't returned yet (typically takes 500ms-2s). The code falls through to the `idealRoster` fallback correctly, but if `idealRoster` is also null/empty, no nomination is attempted and attempts counter is NOT incremented (no player found early return). The cooldown doesn't apply so a retry via `updateSignals()` should happen — but only if `engineSignals` changes before the 5s cooldown expires.

**Why it happens:** `nominationStrategy` comes from `asyncSimulation` in `use-draft-engine.ts`. The simulation worker completes asynchronously and updates `engineSignals` via `setAsyncSimulation`. `autoBidController.updateSignals()` is called in a `useEffect` keyed to `engineSignals` — so when the worker completes, a new `updateSignals()` call fires and `evaluateAndNominate()` will be called again.

**How to avoid:** The retry path via `updateSignals()` IS wired correctly — this is not a bug if `currentAuctionPlayer` is still null when worker completes. The risk is if ESPN shows the next nomination before the worker delivers results.

**Warning signs:** Console shows "[AutoNominate] No nomination candidates available" followed by "[AutoNominate] Primary pick: ..." a few seconds later (means both paths worked, just sequenced differently than expected).

### Pitfall 2: `isMyTurnToNominate()` False Negative

**What goes wrong:** `isMyTurnToNominate()` returns false even when it IS our turn. The function must return true via at least one of 5 strategies. If ESPN renders the page in a state where none of the 5 strategies fire, `evaluateAndNominate()` logs "Not our turn" and bails — all 3 attempts are wasted on false negatives, controller backs off.

**Why it happens:** Strategy 5 (queue buttons present + no bidding form) is the most permissive fallback but checks for the ABSENCE of `form.bidding-form__default` and `.current-amount`. If ESPN keeps these elements in the DOM but hidden, the check fails. Strategy 4 (`button.Button--select[data-player-id]`) is the most reliable signal of our turn — added in quick-80.

**How to avoid:** In the browser console, when it's your turn, run:
```javascript
document.querySelectorAll('button.Button--select[data-player-id]').length
document.body.innerText.match(/nominate\s+a\s+player/i)
document.querySelector('.pickArea')?.textContent?.toLowerCase()
```
If all return falsy/empty, the detection logic needs a new strategy.

**Warning signs:** Console repeatedly shows "[AutoNominate] Not our turn to nominate" when the UI clearly shows it's your turn.

### Pitfall 3: Player Name Mismatch Between Nomination Strategy and Rankings

**What goes wrong:** `evaluateAndNominate()` picks a `candidateName` from `nominationStrategy[0].playerName` (which comes from FanGraphs pool player names), then does an exact lowercase match against `state.rankings` (which come from the ESPN rankings API). ESPN may use "Shohei Ohtani" while FanGraphs uses "Shohei Ohtani" — usually fine — but names with Jr./Sr., accents, or ESPN abbreviations may not match. If no ranking is found for the candidate, the controller logs a warning and bails without incrementing `nominationAttempts` (early return at line ~398).

**Why it happens:** Player name normalization is applied in `draft-state.ts` (`normalizeName`) for pick dedup, but `evaluateAndNominate()` does a plain `toLowerCase()` comparison against `r.playerName`. There's no suffix stripping or accent normalization at the nomination candidate lookup step.

**How to avoid:** If "[AutoNominate] Cannot find X in rankings" appears, the candidate name format differs. The fix is to apply the same `normalizeName()` normalization from `draft-state.ts` in the rankings lookup in `evaluateAndNominate()`.

**Warning signs:** Console shows `[AutoNominate] Cannot find "PlayerName" in rankings — cannot map to ESPN player ID`.

### Pitfall 4: `clickNominateButton()` Fires on the Wrong Button

**What goes wrong:** The fallback scan of all buttons for "nominate" or "select" text could match unintended UI elements in the ESPN sidebar, header, or queue area. Clicking the wrong button may dismiss the nomination or trigger a different action.

**Why it happens:** Strategy using `.pickArea button` restricts scope, but the broadest fallback (`document.querySelectorAll("button")` + text match) has no scope restriction.

**How to avoid:** Prefer `.pickArea`-scoped selectors. The most specific selector `button.bid-player__button` (added quick-80) should match first before reaching the broad fallback.

**Warning signs:** Console shows clicking a button but the auction state doesn't change (no player appears for bidding).

### Pitfall 5: `searchAndNominate()` Search Input Not Responding

**What goes wrong:** The search fallback types a player name into ESPN's search input using the React-compatible value setter pattern. ESPN's table may not filter if the input event doesn't trigger the correct React synthetic event.

**Why it happens:** ESPN uses React's SyntheticEvent system internally. The `Object.getOwnPropertyDescriptor` + `new Event('input', {bubbles: true})` pattern works for most React apps but some versions require firing both `input` and `change` events (which the code does), or may need a `React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED` approach.

**How to avoid:** Test in browser console manually: find the input, run the value setter + dispatch events, observe if the table filters. If it doesn't, the event key names or bubbling configuration may need adjustment.

**Warning signs:** Console shows "Typed '...' into search" but 800ms later "Player button still not found after search".

### Pitfall 6: Shadow DOM Isolation — Sidebar vs ESPN DOM

**What goes wrong:** The DraftSidebar renders inside a Shadow DOM (`attachShadow({mode: "open"})`). All `document.querySelector()` calls in `auto-bid-controller.ts` operate on the main ESPN document — NOT the shadow root. This is intentional and correct. Do not confuse the two.

**Why it happens:** This is architecture design. The controller deliberately accesses `document` (ESPN's DOM) while React renders in shadow DOM.

**How to avoid:** This is not a bug. Worth documenting to avoid wasting time investigating shadow DOM isolation as a cause.

## Code Examples

### How Nomination Triggers Are Wired

```typescript
// content.tsx — starts controller
autoBidController.start();

// observeCurrentAuctionPlayer fires null → Zustand store updated
observeCurrentAuctionPlayer((player) => {
  useDraftStore.getState().setCurrentAuctionPlayer(player); // null = auction ended
});

// Zustand subscription in AutoBidController.start():
const playerWentAway = currentAuctionPlayer == null && this.prevCurrentAuctionPlayer != null;
if (playerWentAway) {
  this.scheduleNomination(1000); // 1 second delay after auction ends
}

// DraftSidebar.tsx — signals update path
useEffect(() => {
  autoBidController.updateSignals(engineSignals); // fires on every signals change
}, [engineSignals]);

// updateSignals() in controller:
if (state.autoMode && state.currentAuctionPlayer == null) {
  this.evaluateAndNominate(); // fires when signals arrive during nomination window
}
```

### How to Debug Turn Detection Manually

```javascript
// Run in browser console while on ESPN auction draft page when it's your turn:

// Check Strategy 1:
document.body?.innerText?.match(/nominate\s+a\s+player/i)

// Check Strategy 4 (most reliable):
document.querySelectorAll('button.Button--select[data-player-id]:not([disabled])').length

// Check Strategy 5:
document.querySelectorAll('button[data-player-id]:not([disabled])').length
!!document.querySelector('form.bidding-form__default')
!!document.querySelector('.current-amount')

// Check what bid-player__button says:
document.querySelector('button.bid-player__button')?.textContent
```

### How to Debug Player Lookup

```javascript
// In browser console — check if player name resolves in rankings:
const state = window.__ZUSTAND_DRAFT_STORE__?.getState?.() // won't work directly
// Better: check from console:
// After triggering nomination attempt, watch for:
// "[AutoNominate] Cannot find 'X' in rankings"
// "[AutoNominate] Primary pick: X (trapScore=...)"
// "[AutoNominate] Fallback pick: X"
```

### React-Compatible Input Event Pattern (already in code)

```typescript
// searchAndNominate() — how search input is triggered:
const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype, 'value'
)?.set;
if (nativeInputValueSetter) {
  nativeInputValueSetter.call(searchInput, candidateName);
} else {
  searchInput.value = candidateName;
}
searchInput.dispatchEvent(new Event('input', { bubbles: true }));
searchInput.dispatchEvent(new Event('change', { bubbles: true }));
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-----------------|--------------|--------|
| No nomination | Auto-nomination with queue button | quick-60 | Foundation |
| "Queue" only | Handle "Select" button variant + search fallback | quick-79 | Handles ESPN turn-change |
| Generic selectors | `button.bid-player__button` + `button.Button--select` + "nominate player" text | quick-80 | Matches actual ESPN DOM |
| Simulation-first | Simulation primary + idealRoster fallback | quick-60 onwards | Handles async worker timing |

**Deprecated/outdated:**
- Old selector `form.bidding-form__default button.bid-player__button` used to check for bidding form — now `button.bid-player__button` is the CONFIRM button during nomination too, so it's used as both the bid button AND the nomination confirm button.

## Open Questions

1. **Does `button.bid-player__button` serve as BOTH the bidding +1 button AND the nomination confirm button?**
   - What we know: `evaluateAndBid()` uses `form.bidding-form__default button.bid-player__button`. `clickNominateButton()` tries `button.bid-player__button` first.
   - What's unclear: Is this the same DOM element in different states, or two different elements with the same class? If it's the same class in both states, the selectors may be correct but ESPN's context (bidding form vs pick area) determines its behavior.
   - Recommendation: Inspect the button in both states during a draft.

2. **Does the nomination attempt counter reset correctly after a successful nomination?**
   - What we know: `nominationAttempts` resets to 0 when `playerAppeared` (i.e., `currentAuctionPlayer` becomes non-null). This is the correct reset trigger.
   - What's unclear: What if the nomination succeeds but ESPN takes >5 seconds to update the DOM, causing the controller to think it failed and increment attempts?
   - Recommendation: Check timing — the `lastNominationTime` check uses wall clock. If ESPN processes in 4.9s, the controller might think it's still within cooldown and not retry even though nomination succeeded.

3. **Is `simulation.nominationStrategy` populated when `isMyTurnToNominate()` returns true?**
   - What we know: `nominationStrategy` comes from the async simulation Web Worker, which runs when `allPicks.length` or `currentPlayerId` changes. When auction ends and `currentAuctionPlayer` becomes null, `currentPlayerId` becomes undefined, which may or may not trigger a worker re-run.
   - What's unclear: Does `asyncSimulation` get reset to `null` when `currentPlayerId` goes to `undefined`? Yes — `use-draft-engine.ts` has `setAsyncSimulation(null)` in a `useEffect` keyed on `[allPicks.length, currentPlayerId]`. So nomination strategy WILL be null when the auction ends, and will only be populated after the next worker run completes.
   - Recommendation: The idealRoster fallback is critical for the nomination to work at all, since simulation data is unavailable at nomination time.

4. **Is `state.rankings` populated and does it include ESPN player IDs?**
   - What we know: Rankings are loaded via `getRankings()` in `refreshAssistantData()`. The `DraftRanking` type includes `playerId` (ESPN player ID).
   - What's unclear: If the backend doesn't return ESPN player IDs, the `button[data-player-id="${playerId}"]` lookup fails silently.
   - Recommendation: Log `matchedRanking?.playerId` to verify IDs are present.

## Sources

### Primary (HIGH confidence)
- `packages/extension/lib/auto-bid-controller.ts` — full nomination implementation, all 5 detection strategies, search fallback
- `packages/extension/entrypoints/content.tsx` — controller lifecycle, trigger wiring, Zustand integration
- `packages/extension/lib/dom-observers.ts` — ESPN DOM selectors verified 2026, `observeCurrentAuctionPlayer`
- `packages/extension/components/DraftSidebar.tsx` — `updateSignals()` bridge between React and controller
- `packages/extension/lib/use-draft-engine.ts` — async simulation reset on `currentPlayerId` change
- `packages/extension/lib/engine/nomination-strategy.ts` — trap score algorithm

### Secondary (MEDIUM confidence)
- Git log for quick-79, quick-80 — provides "what was wrong before" context, confirms which selectors were verified empirically against live ESPN DOM

### Tertiary (LOW confidence)
- Comments in code marked "as of 2026" — ESPN DOM selectors may change without notice during draft season

## Metadata

**Confidence breakdown:**
- Code structure: HIGH — read full source
- ESPN DOM selectors: MEDIUM — selectors marked 2026 but only verified against live UI at time of quick-80 fix
- Async timing behavior: HIGH — verified by reading `use-draft-engine.ts` useEffect deps
- Specific failure modes in production: LOW — no runtime logs available, all inference from code

**Research date:** 2026-03-08
**Valid until:** 2026-04-15 (ESPN may change DOM before/during draft season)

---

## Planner Notes

### What a Debugging Plan Should Cover

The most effective approach for this phase is **instrumentation-first debugging**:

1. **Add structured logging** to every decision point in `evaluateAndNominate()` and `isMyTurnToNominate()` — emit the exact state at each guard check so the failure point is visible in the console.

2. **Export diagnostic function** on `window.espnDraftAssistant` in DEV mode so the user can call it from console during a live draft to see what `isMyTurnToNominate()` returns and why.

3. **Fix the name normalization gap** in `evaluateAndNominate()` — apply `normalizeName()` (strip Jr./Sr., diacritics, lowercase) to both `candidateName` and `r.playerName` in the rankings lookup.

4. **Add a status panel** to the DraftSidebar showing current nomination state: candidate name, attempt count, last attempt result, why turn was/wasn't detected — so the user can see the controller's reasoning in real time without a browser console.

5. **Add a "Force Nominate" button** in the sidebar for manual override when auto-nomination fails.

### Key Files to Modify

- `packages/extension/lib/auto-bid-controller.ts` — all nomination logic lives here
- `packages/extension/entrypoints/content.tsx` — add diagnostic exports to `window.espnDraftAssistant`
- `packages/extension/components/DraftSidebar.tsx` — add nomination status display (optional)
