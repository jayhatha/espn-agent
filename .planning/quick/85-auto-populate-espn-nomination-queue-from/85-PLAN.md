---
phase: "85"
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/auto-bid-controller.ts
  - packages/extension/entrypoints/content.tsx
autonomous: true
requirements: ["85-QUEUE-POP"]

must_haves:
  truths:
    - "Engine top candidates are automatically queued in ESPN when it is NOT the user's turn"
    - "Already-queued and already-drafted players are skipped (no duplicate clicks)"
    - "Queue population stops when a configurable max queue size is reached"
    - "Queue is refreshed when engine signals change (new picks shift rankings)"
  artifacts:
    - path: "packages/extension/lib/auto-bid-controller.ts"
      provides: "populateQueue() method on AutoBidController"
      contains: "populateQueue"
    - path: "packages/extension/entrypoints/content.tsx"
      provides: "Periodic queue population interval wired alongside existing scrape intervals"
  key_links:
    - from: "packages/extension/lib/auto-bid-controller.ts"
      to: "packages/extension/lib/dom-observers.ts"
      via: "scrapeESPNNominationQueue to detect already-queued players"
      pattern: "scrapeESPNNominationQueue"
    - from: "packages/extension/lib/auto-bid-controller.ts"
      to: "packages/extension/lib/engine/types.ts"
      via: "DraftEngineSignals.idealRoster and .simulation.nominationStrategy"
      pattern: "idealRoster|nominationStrategy"
---

<objective>
Auto-populate ESPN's nomination queue from engine signals so the user doesn't have to manually click "Queue" on top targets. When it is NOT the user's turn to nominate, programmatically click "Queue" buttons for top-ranked undrafted players based on nomination strategy (trap scores) and ideal roster signals.

Purpose: Eliminates tedious manual queue management. The engine already knows the best nomination candidates — this automates pre-loading them into ESPN's queue so when it IS the user's turn, evaluateAndNominate() picks from a pre-populated queue with direct playerIds.

Output: Updated auto-bid-controller.ts with queue population logic, content.tsx wiring.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/lib/auto-bid-controller.ts
@packages/extension/lib/dom-observers.ts (scrapeESPNNominationQueue, ESPNQueueEntry)
@packages/extension/lib/engine/types.ts (DraftEngineSignals, IdealRosterSignal, NominationRecommendation)
@packages/extension/lib/draft-state.ts (useDraftStore, normalizeName)
@packages/extension/entrypoints/content.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add populateQueue() method to AutoBidController</name>
  <files>packages/extension/lib/auto-bid-controller.ts</files>
  <action>
Add a `populateQueue()` public method to the `AutoBidController` class. This method auto-clicks "Queue" buttons for top engine candidates when conditions are right.

**Logic flow:**

1. Guard: `autoMode` must be ON (from `useDraftStore.getState()`)
2. Guard: must NOT be user's turn — check that buttons show "Queue" not "Select". Do this by sampling: `document.querySelectorAll('button[data-player-id]')` and checking if any have text "Select" (case-insensitive). If Select buttons exist, it IS the user's turn — skip queue population (evaluateAndNominate handles the actual nomination).
3. Scrape current queue state via `scrapeESPNNominationQueue()` to get already-queued playerIds.
4. Build candidate list from engine signals (same priority as evaluateAndNominate):
   - Primary: `this.lastEngineSignals?.simulation?.nominationStrategy` — sorted by trapScore desc (already sorted)
   - Fallback: `this.lastEngineSignals?.idealRoster?.players` — filter to `!isDrafted`, take top N
5. Filter candidates: remove already-drafted (from `state.allPicks`) and already-queued (from step 3).
6. Map candidate names to ESPN player IDs using `state.rankings` (same normalizeName lookup as evaluateAndNominate).
7. For each candidate (up to `MAX_QUEUE_SIZE - currentQueueSize`):
   - Find `button[data-player-id="${playerId}"]` in DOM
   - Check button text contains "queue" (case-insensitive) and is NOT disabled
   - Click it
   - Log: `[AutoQueue] Queued ${playerName} (ID: ${playerId}, source=${source})`
8. After clicking, do NOT call scrapeESPNNominationQueue again — the DOM will update the button text to "Dequeue" which will be picked up on next cycle.

**Constants:**
- `private static readonly MAX_QUEUE_SIZE = 10` — maximum players in queue at once
- `private static readonly QUEUE_POPULATE_COOLDOWN_MS = 15000` — minimum time between populate runs (prevent rapid re-clicking)

**Track state:**
- `private lastQueuePopulateTime: number | null = null` — for cooldown enforcement
- `private queuedPlayerIds: Set<number> = new Set()` — track what WE queued this session to avoid re-clicking on DOM parse failures

**Important: button text check.** ESPN buttons show:
- "Queue" — not user's turn, player not queued (CLICK THIS)
- "Dequeue" — not user's turn, player already queued (SKIP)
- "Select" — IS user's turn (SKIP ENTIRELY — this means we should not be populating queue)

Also add `populateQueue()` call at the end of `updateSignals()` — after the existing nomination check. Only call when `state.currentAuctionPlayer == null` (between auctions).

Add queue population stats to `getNominationDiagnostics()` return: add `queuePopulationCount: number` (size of queuedPlayerIds set) and `lastQueuePopulateTime: number | null` to the NominationDiagnostics interface.

Reset `queuedPlayerIds` and `lastQueuePopulateTime` in `clearNominationState()` and `stop()`.
  </action>
  <verify>
TypeScript compiles: `cd packages/extension && npx tsc --noEmit`
  </verify>
  <done>
AutoBidController has a populateQueue() method that clicks Queue buttons for top engine candidates when autoMode is on and it is NOT the user's turn. Cooldown prevents rapid re-clicking. Queue population is triggered on every updateSignals() call when no auction is active.
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire periodic queue population in content.tsx</name>
  <files>packages/extension/entrypoints/content.tsx</files>
  <action>
Add a periodic interval in content.tsx that calls `autoBidController.populateQueue()` alongside the existing queue scrape and auction table scrape intervals.

**Wiring:**

1. After the existing `runQueueScrape` interval setup (around line 688), add a new interval:
   ```
   const queuePopulateInterval = setInterval(() => {
     try {
       autoBidController.populateQueue();
     } catch (err) {
       console.error("[ESPN Draft Assistant] Failed to populate queue:", err);
     }
   }, 15000); // Every 15 seconds — matches QUEUE_POPULATE_COOLDOWN_MS
   ```

2. Clear this interval in the cleanup/beforeunload handler alongside the other intervals.

3. Also expose `autoBidController.populateQueue` in the DEV debug object (`window.espnDraftAssistant`) as `populateQueue` so it can be manually triggered from console for testing:
   ```
   populateQueue: () => autoBidController.populateQueue(),
   ```

**Why 15s interval in addition to updateSignals() trigger:**
- updateSignals() fires when engine recomputes (every few seconds during active draft)
- But between auctions with no state changes, engine may not recompute
- The 15s interval ensures queue stays populated even during quiet periods
- The cooldown in populateQueue() prevents actual DOM clicks more often than every 15s regardless

**Important:** The internal cooldown in populateQueue() (Task 1) is the real rate limiter. The interval just ensures periodic triggering. Even if both the interval and updateSignals() call populateQueue() simultaneously, the cooldown prevents duplicate work.
  </action>
  <verify>
TypeScript compiles: `cd packages/extension && npx tsc --noEmit`
  </verify>
  <done>
Queue population runs on a 15s interval in content.tsx, is cleaned up on page unload, and is exposed in the DEV debug object for manual testing.
  </done>
</task>

</tasks>

<verification>
1. `cd packages/extension && npx tsc --noEmit` — no type errors
2. Manual test during draft: enable autoMode, observe console logs showing `[AutoQueue] Queued ...` messages when between auctions
3. Verify ESPN "Queue" buttons change to "Dequeue" for top candidates
4. Verify queue population stops when it IS the user's turn (buttons show "Select")
5. Verify already-queued players are not re-clicked
</verification>

<success_criteria>
- AutoBidController.populateQueue() clicks Queue buttons for top 10 engine candidates
- Already-drafted and already-queued players are skipped
- Queue population only runs when autoMode=ON and NOT user's turn
- 15s cooldown prevents rapid re-clicking
- Wired into both updateSignals() and a periodic interval in content.tsx
- TypeScript compiles without errors
</success_criteria>

<output>
After completion, create `.planning/quick/85-auto-populate-espn-nomination-queue-from/85-SUMMARY.md`
</output>
