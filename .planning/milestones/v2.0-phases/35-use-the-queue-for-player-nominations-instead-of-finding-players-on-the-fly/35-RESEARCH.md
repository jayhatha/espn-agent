# Phase 35: Use the Queue for Player Nominations - Research

**Researched:** 2026-03-08
**Domain:** Chrome Extension DOM automation — ESPN auction draft queue scraping and nomination control
**Confidence:** HIGH (codebase is source of truth; ESPN DOM patterns verified from existing code)

---

## Summary

Phase 35 replaces the current "find player on the fly" auto-nomination approach with one that reads and uses ESPN's built-in nomination queue. The current system (`evaluateAndNominate()` in `AutoBidController`) picks a candidate from trap-score simulation or ideal roster, looks up their ESPN player ID from `rankings`, then searches for a `button[data-player-id]` in the player table — falling back to typing into a search box if the player is not visible. This is fragile: the player may not be visible, the search scrubs the table filter, and the whole flow depends on an uncertain DOM sequence with 800ms timeouts.

The ESPN queue is a feature already present on the draft page: users can pre-add players they want to nominate by clicking "Queue" buttons (when not their turn) or "Select" buttons (when it is their turn). When a player is in the ESPN queue, a "Dequeue" button replaces the "Queue" button on the player's row. More importantly, the queue area at the top of the pick zone is observable in the DOM. When it is the user's turn to nominate, the top player from the ESPN queue should auto-populate into the nomination slot — or the extension should click the top queued player's nomination button directly.

The implementation strategy for Phase 35 is twofold:
1. **Read the ESPN queue from the DOM** — observe which players are currently in the queue and expose the ordered list as a new store field (`espnNominationQueue`).
2. **Nominate from the queue first** — in `evaluateAndNominate()`, check whether the first queued player is already being nominated by ESPN (or whether we need to click their selection), rather than computing a candidate ourselves and searching the table.

This requires: a queue scraper function in `dom-observers.ts`, a new store field in `draft-state.ts`, wiring the scraper to poll in `content.tsx`, and updating `AutoBidController.evaluateAndNominate()` to prefer the queue over its own candidate selection.

**Primary recommendation:** Implement a `scrapeESPNNominationQueue()` function that reads the queue section of the ESPN draft page DOM, expose the result in Zustand store, and let `evaluateAndNominate()` click the top queued player's select button instead of computing candidates independently.

---

## Standard Stack

No new libraries are needed. This is pure DOM scraping + Zustand state, matching the existing extension patterns.

### Core (unchanged)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| WXT (Chrome Extension framework) | existing | Content script lifecycle | Already used |
| Zustand (with persist) | existing | Extension state management | Already used |
| TypeScript | existing | Type safety | Already used |

### Supporting
| Tool | Purpose | When to Use |
|------|---------|-------------|
| MutationObserver | Watch for queue changes in ESPN DOM | Queue content changes when users add/remove players |
| setInterval | Periodic queue scrape fallback | MutationObserver may miss non-DOM-mutation queue state changes |

---

## Architecture Patterns

### Recommended Project Structure

The change touches exactly these files:

```
packages/extension/
├── lib/
│   ├── dom-observers.ts           # Add scrapeESPNNominationQueue()
│   ├── auto-bid-controller.ts     # Update evaluateAndNominate() to prefer queue
│   └── draft-state.ts             # Add espnNominationQueue field + setter
└── entrypoints/
    └── content.tsx                # Wire queue scraper (interval + initial scrape)
```

### Pattern 1: ESPN Queue DOM Structure (known from existing codebase)

**What:** The existing code in `dom-observers.ts` and `auto-bid-controller.ts` reveals ESPN's auction DOM patterns clearly.

From the existing code we know:
- Queue buttons on player rows: `button[data-player-id]` — contains the player's ESPN ID as `data-player-id` attribute
- When NOT user's turn: button text is "Queue"; class does not include `Button--select`
- When IS user's turn: button text is "Select"; class includes `Button--select`
- After queueing (player added to queue): button text changes to "Dequeue"
- The `scrapeESPNAuctionTable()` function already reads `button[data-player-id]` to extract player IDs from the fixedDataTable rows
- Player ID is in `button.getAttribute("data-player-id")`

**What we do NOT yet know about the queue DOM structure:**
- The exact container element class/selector for the queue panel itself
- Whether there is a dedicated queue section (separate from the player table) that shows queued players in order
- Whether "Dequeue" buttons appear in the player table row only, or also in a separate queue list area

**Inference from existing code:**
- `parsePickElement()` explicitly skips buttons with `if (pickElement.tagName === "BUTTON") return null` and mentions "Dequeue" as a button ESPN uses
- The `detectDraftFormat()` function searches for `[class*="queue"]` and `[class*="Queue"]` as auction format indicators
- `isMyTurnToNominate()` Strategy 4 checks for `button.Button--select[data-player-id]` — this is the "Select" button that appears when it IS the user's turn (the same button that was "Queue" before)

**The ESPN Queue workflow (from code evidence):**
1. When NOT user's turn: player table shows "Queue" buttons (`button[data-player-id]` without `Button--select`)
2. User clicks "Queue" to add a player to their queue — button becomes "Dequeue"
3. When IS user's turn: "Queue" buttons change to "Select" buttons (`button.Button--select[data-player-id]`)
4. "Dequeue" buttons may persist (player was queued, now user can dequeue or select)
5. Clicking "Select" (or the queued "Dequeue"-adjacent action) puts player into the nomination form
6. Clicking `button.bid-player__button` confirms the nomination

### Pattern 2: Queue State Scraping

**What:** Read the current state of ESPN's queue by finding rows in the player table where the button text is "Dequeue" (indicating the player has been added to the queue).

```typescript
// Source: inferred from dom-observers.ts scrapeESPNAuctionTable() + auto-bid-controller.ts patterns

export interface ESPNQueueEntry {
  playerId: number;
  playerName: string;
  position: string;
  /**
   * Position in the queue (0-based order in the DOM).
   * ESPN may render queued players at the top of the table.
   */
  queuePosition: number;
}

export function scrapeESPNNominationQueue(): ESPNQueueEntry[] {
  const result: ESPNQueueEntry[] = [];

  // Strategy 1: Find "Dequeue" buttons in the player table rows
  // When a player is queued, ESPN replaces "Queue" with "Dequeue"
  const allButtons = document.querySelectorAll<HTMLButtonElement>(
    'button[data-player-id]'
  );

  let queuePosition = 0;
  for (const btn of Array.from(allButtons)) {
    const text = btn.textContent?.trim().toLowerCase() || '';
    if (text === 'dequeue') {
      const playerIdStr = btn.getAttribute('data-player-id');
      if (!playerIdStr) continue;
      const playerId = parseInt(playerIdStr, 10);
      if (!playerId) continue;

      // Walk up to row container to find player name
      const row = btn.closest('.fixedDataTableRowLayout_main, [role="row"], tr');
      const playerName = row?.querySelector('a.player-news[title]')
        ?.getAttribute('title')?.trim() || '';
      const position = row?.querySelector('.positionPill')
        ?.textContent?.trim() || '';

      result.push({ playerId, playerName, position, queuePosition });
      queuePosition++;
    }
  }

  // Strategy 2: Check for a dedicated queue panel/section (unknown DOM; needs validation)
  // ESPN may have a separate queue display area — look for common patterns
  const queuePanel = document.querySelector(
    '[class*="nominationQueue"], [class*="queue-panel"], [class*="myQueue"], [data-testid*="queue"]'
  );
  // If found, parse player entries from it (fallback for when table is not loaded)
  // This is speculative — validate against live ESPN DOM

  return result;
}
```

**Confidence:** MEDIUM — "Dequeue" button detection is logically sound based on existing code knowledge of how ESPN's queue works. The exact row container selector needs validation against live ESPN DOM.

### Pattern 3: Queue-First Nomination in AutoBidController

**What:** Replace the candidate selection logic in `evaluateAndNominate()` with a queue-first approach.

```typescript
// Current flow (fragile):
// 1. Pick candidate from nominationStrategy or idealRoster signals
// 2. Map candidateName -> playerId via rankings lookup
// 3. Find button[data-player-id="${playerId}"] in DOM
// 4. If not visible: use searchAndNominate() (types in search box)

// New flow (queue-first):
// 1. Check espnNominationQueue store state (populated by scraper)
// 2. If queue has entries: use queue[0].playerId directly
// 3. Find button[data-player-id="${playerId}"] — this should be visible (queued players appear near top)
// 4. If queue is empty: fall back to current candidate selection flow
```

**Key integration point:** `evaluateAndNominate()` already has the full nomination pipeline after the candidate selection step. Only the "who do we nominate" decision changes — the actual button-clicking machinery stays the same.

### Pattern 4: Store Field for Queue State

```typescript
// In draft-state.ts DraftState interface:
espnNominationQueue: Array<{ playerId: number; playerName: string; position: string; queuePosition: number }>;

// New action:
setEspnNominationQueue: (queue: Array<{ playerId: number; playerName: string; position: string; queuePosition: number }>) => void;
```

The queue should NOT be persisted (it changes every draft) — add to `partialize` exclusion list.

### Anti-Patterns to Avoid

- **Don't replace the fallback:** The current candidate-selection logic (trap score + ideal roster) remains valuable when the queue is empty. Keep it as the fallback, not the primary.
- **Don't over-poll the queue:** The queue changes only when the user manually adds/removes players. A 2-3 second interval scrape (matching the existing `auctionTableScrapeInterval` pattern at 10s) is sufficient.
- **Don't assume the queue panel has a stable container:** ESPN's queue DOM is unverified. The "Dequeue" button detection approach is more resilient than relying on a specific container class.
- **Don't remove searchAndNominate():** It is still needed as a fallback when the player is not visible in the table (e.g., user queue has a player who has scrolled off).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Debouncing queue DOM changes | Custom debounce logic | Reuse existing pattern from `observeCurrentAuctionPlayer()` | Consistent 200ms debounce already established |
| Persistent queue state | Chrome storage for queue | Session-only Zustand state | Queue is transient draft state; loses value on reload anyway |
| Queue-to-rankingsId mapping | Additional name-matching | `button[data-player-id]` already has the ESPN ID | Direct DOM ID extraction avoids all name-matching issues |

**Key insight:** The ESPN queue's `button[data-player-id]` attribute gives us the player ID directly — this bypasses the current fragile name-to-ID mapping via `rankings` lookup. This is the core reliability improvement of Phase 35.

---

## Common Pitfalls

### Pitfall 1: The Queue DOM Container is Unknown
**What goes wrong:** The research cannot confirm what the ESPN queue panel container looks like beyond the `button[data-player-id]` with "Dequeue" text heuristic.
**Why it happens:** The extension was built without specific queue DOM investigation; existing code uses queue buttons only for ID extraction in `scrapeESPNAuctionTable()`.
**How to avoid:** Use the "Dequeue" button text detection as the primary strategy — it's self-contained and doesn't depend on a container. Add Strategy 2 (panel detection) as progressive enhancement.
**Warning signs:** If the scraper returns empty queue when the user has queued players, the Dequeue button text may differ (e.g., "Remove" or icon-only) — add console logging to diagnose.

### Pitfall 2: "Dequeue" vs "Deselect" Text Variants
**What goes wrong:** ESPN may use different button text depending on state (e.g., "Dequeue" when not your turn, "Deselect" when it IS your turn and the player is selected).
**Why it happens:** The button text changes when ESPN switches from queue mode to select mode — the same queue entry might change label.
**How to avoid:** Match on multiple text variants: `["dequeue", "deselect", "remove from queue"]` — or better, match on any button with `data-player-id` that does NOT have text "Queue" or "Select" (i.e., it's in a special state).
**Warning signs:** Queue shows as empty right when it should fire the nomination.

### Pitfall 3: Queue Order vs Nomination Order
**What goes wrong:** ESPN may not guarantee that queued players appear in table order matching the queue insertion order.
**Why it happens:** The fixedDataTable may sort players differently (by position, value, name) rather than by queue insertion time.
**How to avoid:** For Phase 35, it is acceptable to use the first queue entry found — this is better than the current "find on the fly" approach even if queue order is not perfectly preserved.
**Warning signs:** The extension nominates a different player than expected from the queue.

### Pitfall 4: Polling Race with Turn Detection
**What goes wrong:** Queue scrape and turn detection run at different frequencies; the queue might read stale data when it's our turn.
**Why it happens:** Queue polling at 3s, `evaluateAndNominate()` fires at nomination time. If the queue state hasn't been refreshed yet, `espnNominationQueue` is empty even though ESPN has queued players.
**How to avoid:** In `evaluateAndNominate()`, do a fresh `scrapeESPNNominationQueue()` call in addition to reading store state — this avoids the polling lag for the critical nomination moment. Cache freshness matters here.
**Warning signs:** Nomination fires with no queue entry but user's ESPN queue is populated.

### Pitfall 5: Same "Dequeue" button appears for already-drafed players
**What goes wrong:** If a player was drafted and ESPN still shows their row with a "Dequeue"-like state, the scraper may include them.
**Why it happens:** ESPN may not immediately remove rows for drafted players.
**How to avoid:** Cross-check `playerId` against `allPicks` in the store — if a player is already in `allPicks`, skip them from the queue result.

---

## Code Examples

### Full scrapeESPNNominationQueue() Implementation

```typescript
// In packages/extension/lib/dom-observers.ts

export interface ESPNQueueEntry {
  playerId: number;
  playerName: string;
  position: string;
  queuePosition: number;
}

/**
 * Scrape ESPN's nomination queue — players the user has queued for nomination.
 *
 * ESPN DOM evidence:
 * - When a player is queued: their row's button[data-player-id] shows "Dequeue" text
 * - When not queued: shows "Queue" (not user's turn) or "Select" (user's turn)
 *
 * Returns ordered list of queued players (order matches DOM order, which may
 * match queue insertion order).
 */
export function scrapeESPNNominationQueue(): ESPNQueueEntry[] {
  const result: ESPNQueueEntry[] = [];
  const dequeueVariants = ["dequeue", "deselect", "remove"];

  const allPlayerButtons = document.querySelectorAll<HTMLButtonElement>(
    'button[data-player-id]'
  );

  let queuePosition = 0;
  for (const btn of Array.from(allPlayerButtons)) {
    const text = btn.textContent?.trim().toLowerCase() || '';
    const isDequeued = dequeueVariants.some(v => text.includes(v));
    if (!isDequeued) continue;

    const playerIdStr = btn.getAttribute('data-player-id');
    if (!playerIdStr) continue;
    const playerId = parseInt(playerIdStr, 10);
    if (!playerId || isNaN(playerId)) continue;

    // Get player name and position from the row
    const row = btn.closest('.fixedDataTableRowLayout_main, [role="row"]');
    const playerName = row?.querySelector('a.player-news[title]')
      ?.getAttribute('title')?.trim() || '';
    const position = row?.querySelector('.positionPill')
      ?.textContent?.trim() || '';

    result.push({ playerId, playerName, position, queuePosition });
    queuePosition++;
  }

  return result;
}
```

### Store Field Addition

```typescript
// In packages/extension/lib/draft-state.ts

// Add to DraftState interface:
espnNominationQueue: Array<{ playerId: number; playerName: string; position: string; queuePosition: number }>;

// Add to initial state:
espnNominationQueue: [],

// Add action:
setEspnNominationQueue: (queue) => set({ espnNominationQueue: queue }),

// DO NOT add to partialize() — queue is session-only state
```

### Queue-First evaluateAndNominate()

```typescript
// In AutoBidController.evaluateAndNominate() — replace the candidate selection block:

// ── Select nomination candidate (queue-first) ──

const state = useDraftStore.getState();

// Primary: ESPN nomination queue (user pre-built list)
// Do a fresh scrape for the nomination moment (avoid polling lag)
const freshQueue = scrapeESPNNominationQueue();
const draftedPlayerIds = new Set(state.allPicks.map(p => p.playerId));
const validQueueEntries = freshQueue.filter(q => !draftedPlayerIds.has(q.playerId));

let candidateName: string | null = null;
let candidateReason: string | null = null;
let playerId: number | null = null;

if (validQueueEntries.length > 0) {
  const top = validQueueEntries[0];
  candidateName = top.playerName;
  playerId = top.playerId;
  candidateReason = 'espn-queue';
  this.lastCandidateName = candidateName;
  this.lastCandidateSource = 'queue'; // new source type
}

// Secondary: nomination strategy trap scores (existing logic)
if (!candidateName) {
  const nominationStrategy = this.lastEngineSignals?.simulation?.nominationStrategy;
  // ... existing strategy selection code ...
}

// Tertiary: ideal roster (existing fallback)
// ... existing fallback code ...

// ── Click the button ── (same as before but skip name->ID mapping if playerId already known)
if (playerId) {
  const playerButton = document.querySelector<HTMLButtonElement>(
    `button[data-player-id="${playerId}"]`
  );
  // ... existing click logic ...
} else if (candidateName) {
  // name->ID mapping still needed for non-queue candidates
  // ... existing rankings lookup ...
}
```

### Wiring in content.tsx

```typescript
// In packages/extension/entrypoints/content.tsx
// Add queue scraping alongside the existing auctionTableScrapeInterval:

import { scrapeESPNNominationQueue } from "../lib/dom-observers";

const runQueueScrape = () => {
  const queue = scrapeESPNNominationQueue();
  useDraftStore.getState().setEspnNominationQueue(queue);
};

// In the auction format block (alongside startAuctionTableScraping):
if (resolvedDraftFormat === "auction") {
  // ... existing setup ...
  runQueueScrape(); // initial scrape
  const queueScrapeInterval = setInterval(runQueueScrape, 3000);
  // Add cleanup in beforeunload handler
}
```

---

## State of the Art

| Old Approach | Current Approach (Phase 35) | Impact |
|--------------|------------------------------|--------|
| Compute candidate from engine signals | Read from ESPN queue (user-curated) | Queue is user's intent; no engine computation needed |
| Map name → ID via rankings lookup | ID directly from `data-player-id` attribute | Eliminates name-matching failures |
| Search box fallback (800ms timeout) | Queued players visible in table | Queue moves player to top of list (ESPN behavior) |
| Turn detection runs 5 strategies | Queue detection is simpler precondition | Still need turn detection; queue just replaces candidate selection |

---

## Open Questions

1. **Does ESPN move queued players to the top of the fixedDataTable?**
   - What we know: Queued players show a "Dequeue" button — they are present in the table
   - What's unclear: Whether ESPN re-orders them to the top when it is the user's turn
   - Recommendation: Assume no reordering — the "Dequeue" button detection works regardless of table order. If the player is not visible (scrolled off), `searchAndNominate()` fallback still applies.

2. **What does ESPN's queue look like as a dedicated panel (separate from the player table)?**
   - What we know: The `detectDraftFormat()` function searches for `[class*="queue"]` elements, implying something queue-related exists in the DOM
   - What's unclear: Whether there is a dedicated queue list panel (e.g., above the player table) showing just queued players in order
   - Recommendation: Investigate during a live draft using `document.querySelectorAll('[class*="queue"]')` in the console. If a panel exists, add it as Strategy 1 in `scrapeESPNNominationQueue()`.

3. **Should the extension also manage the ESPN queue (add players to it pre-draft)?**
   - What we know: Phase 35 description says "use the queue" not "build a queue manager UI"
   - What's unclear: Whether the intent is purely to *read and use* the existing user-managed queue, or also to *programmatically add players* to the ESPN queue based on engine signals
   - Recommendation: Phase 35 should focus on reading the existing queue and using it for nominations. Auto-populating the ESPN queue from engine signals would be a separate, larger feature.

4. **What is the `NominationDiagnostics.lastCandidateSource` type union?**
   - Current type: `'simulation' | 'idealRoster' | null`
   - Phase 35 adds: `'queue'` as a new source
   - Action: Expand the union type in both `auto-bid-controller.ts` (interface `NominationDiagnostics`) and update the UI in `NominationDiagnostics.tsx`

---

## Sources

### Primary (HIGH confidence)
- `packages/extension/lib/auto-bid-controller.ts` — Complete nomination flow, turn detection strategies, button selectors (`button[data-player-id]`, `Button--select`, `bid-player__button`)
- `packages/extension/lib/dom-observers.ts` — ESPN DOM patterns: `scrapeESPNAuctionTable()` with `button[data-player-id]`, `parsePickElement()` noting "Dequeue" buttons, `detectDraftFormat()` queue class detection
- `packages/extension/lib/draft-state.ts` — Zustand store pattern, `espnDomAuctionValues` as parallel for what `espnNominationQueue` would look like
- `packages/extension/entrypoints/content.tsx` — Wiring pattern: `startAuctionTableScraping()` interval (exact same pattern for queue scraping)
- `packages/extension/components/NominationDiagnostics.tsx` — Diagnostic panel pattern for nomination source display

### Secondary (MEDIUM confidence)
- Quick Task 60 PLAN + SUMMARY — Documents original queue button nomination intent, established `[AutoNominate]` log prefix pattern
- Quick Task 79 PLAN — Documents "Dequeue" button mention in `parsePickElement`, "Select" vs "Queue" button distinction
- Quick Task 80 PLAN — Documents `button.bid-player__button` and `Button--select` verified as actual ESPN class names

### Tertiary (LOW confidence — ESPN DOM, unverified)
- ESPN queue panel container selector (`[class*="nominationQueue"]`, `[class*="myQueue"]`) — inferred, not verified
- Queue player ordering behavior in ESPN's table — unknown without live testing
- "Dequeue" button text exact string — inferred from `parsePickElement()` comment; may differ ("Remove", icon-only)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, pure extension pattern reuse
- Architecture: HIGH — files, integration points, and data flow are all clear from existing code
- ESPN DOM patterns: MEDIUM — "Dequeue" button heuristic is sound but unverified against live ESPN
- Queue panel container: LOW — speculative selectors, needs live validation

**Research date:** 2026-03-08
**Valid until:** 2026-04-08 (ESPN DOM selectors can change with site updates)
