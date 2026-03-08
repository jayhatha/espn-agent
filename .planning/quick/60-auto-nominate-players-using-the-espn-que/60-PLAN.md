---
phase: 60
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/auto-bid-controller.ts
  - packages/extension/components/DraftSidebar.tsx
autonomous: true
requirements: [QUICK-60]

must_haves:
  truths:
    - "When autoMode is ON and no player is currently nominated, the controller auto-clicks the ESPN queue button for the top nomination strategy player"
    - "Auto-nomination only fires when it is the user's turn to nominate (detected via pick train DOM)"
    - "After clicking queue, the controller waits for ESPN to process the nomination before trying again"
    - "Auto-nomination uses nomination strategy (trap scores) as primary source, ideal roster targets as fallback"
  artifacts:
    - path: "packages/extension/lib/auto-bid-controller.ts"
      provides: "Auto-nomination logic integrated into existing AutoBidController"
      contains: "evaluateAndNominate"
    - path: "packages/extension/components/DraftSidebar.tsx"
      provides: "Updated auto-mode label to indicate bid+nominate"
  key_links:
    - from: "packages/extension/lib/auto-bid-controller.ts"
      to: "DraftEngineSignals.simulation.nominationStrategy"
      via: "lastEngineSignals access"
      pattern: "nominationStrategy"
    - from: "packages/extension/lib/auto-bid-controller.ts"
      to: "ESPN DOM queue button"
      via: "querySelector for button[data-player-id]"
      pattern: "data-player-id"
---

<objective>
Auto-nominate players using the ESPN queue button when it is the user's turn to nominate during an auction draft.

Purpose: When autoMode is enabled, the extension should not only auto-bid on nominated players but also auto-nominate the next player when no auction is active and it is the user's turn. This uses the existing nomination strategy engine (trap scores) to pick optimal nominations that drain opponent budgets.

Output: Extended AutoBidController with nomination capability, minor sidebar label update.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/lib/auto-bid-controller.ts
@packages/extension/lib/draft-state.ts
@packages/extension/lib/engine/types.ts
@packages/extension/lib/engine/nomination-strategy.ts
@packages/extension/lib/dom-observers.ts
@packages/extension/components/DraftSidebar.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add auto-nomination logic to AutoBidController</name>
  <files>packages/extension/lib/auto-bid-controller.ts</files>
  <action>
Extend the existing AutoBidController class with an `evaluateAndNominate()` method that fires when:
1. `autoMode` is true
2. `currentAuctionPlayer` is null (no active nomination — auction is idle)
3. It is the user's turn to nominate (detected from ESPN DOM)

**Turn detection strategy:**
ESPN's auction draft page has a "pick train" showing the nomination order. When it is the user's turn, the pick train highlights their team. Detect this by:
- Looking for the pick train container: `.pick-train` or `[class*="pickTrain"]` or `[class*="pick-train"]`
- Finding the active/highlighted team card: `.pick-train .active`, `[class*="active"]`, or `[class*="current"]` within the pick train
- Comparing the highlighted team's text content against the user's team name from the store (or checking for a "your turn" indicator class)
- As a simpler fallback: check if ESPN shows a "Nominate a Player" prompt or if the bidding form area shows a nomination state (e.g., `.pickArea` is empty or shows "Select a player")
- Create a helper method `isMyTurnToNominate(): boolean` that returns true when the DOM indicates it is our turn. Be defensive — return false if unsure.

**Nomination player selection:**
1. Primary: Use `lastEngineSignals.simulation.nominationStrategy` — take the top recommendation by trapScore
2. Fallback: Use `lastEngineSignals.idealRoster.players` — find the first non-drafted player
3. If neither has candidates, log and skip

**ESPN queue button click:**
- The player table has queue buttons: `button[data-player-id="${playerId}"]`
- Map the nomination candidate's name to an ESPN player ID using `rankings` from the store (each ranking has `playerName` and `playerId`)
- Find the queue button by that player ID and click it
- If the button is not visible in the current scroll position of the table, the click may not work — log a warning but attempt anyway (ESPN may process it regardless)

**Cooldown and safety:**
- Add a `lastNominationTime: number | null` field to the controller
- After clicking a queue button, set lastNominationTime to Date.now()
- Do not attempt another nomination within 5 seconds (ESPN needs time to process)
- Reset lastNominationTime when a new `currentAuctionPlayer` appears (nomination was successful)
- Add a `nominationAttempts: number` counter that resets when currentAuctionPlayer changes; if > 3 attempts without success, stop trying until state changes (prevents infinite clicking)

**Integration into existing subscription:**
- In the existing `subscribe` callback, add a check: if `currentAuctionPlayer` is null and `autoMode` is true and player just became null (transition from non-null), call `evaluateAndNominate()` after a 1-second delay (give ESPN time to settle between auctions)
- Also call `evaluateAndNominate()` from `updateSignals()` when currentAuctionPlayer is null (engine signals arrived with nomination strategy data)
- Track `prevCurrentAuctionPlayer` similar to existing prev fields for diffing

**Logging:**
- Log `[AutoNominate]` prefix for all nomination-related logs (distinct from `[AutoBidController]`)
- Log the chosen player name, trapScore/reason, and player ID
- Log when skipping (not my turn, cooldown, no candidates)
  </action>
  <verify>
Run `cd packages/extension && npx tsc --noEmit` to verify no type errors. Visually inspect the code for:
- `evaluateAndNominate` method exists
- `isMyTurnToNominate` helper exists
- Cooldown logic with 5-second window
- Nomination strategy -> queue button click pipeline
- Proper cleanup of new fields in `stop()`
  </verify>
  <done>AutoBidController has auto-nomination capability: detects user's turn via DOM, selects best nomination candidate from engine signals, clicks ESPN queue button with cooldown protection. TypeScript compiles cleanly.</done>
</task>

<task type="auto">
  <name>Task 2: Update sidebar auto-mode label to reflect bid + nominate</name>
  <files>packages/extension/components/DraftSidebar.tsx</files>
  <action>
Update the auto-mode UI in DraftSidebar.tsx:

1. Change the label from "Auto-Bid" to "Auto-Pilot" (reflects both bid and nominate functionality)
2. Change the aria-label from "Toggle auto-bid" to "Toggle auto-pilot"
3. Update the warning text when autoMode is on from "Auto-bidding +1 up to engine max bid" to "Auto-pilot: bidding + nominating based on engine strategy"
4. When autoMode is on and there is NO currentAuctionPlayer (waiting for nomination), show a status indicator:
   ```
   <div className="mt-1 text-body-xs text-accent">
     Waiting to nominate...
   </div>
   ```
   This replaces the "Auto-bidding +1..." message contextually — show the bidding message when a player is nominated, show the nominating message when no player is nominated.
5. Keep the auto-mode toggle in its current position (inside the nominated player banner). However, since the toggle needs to be visible even when no player is nominated (for the auto-nominate case), move the toggle out of the `currentAuctionPlayer && (...)` conditional block. Place it in a new small section right after the nominated player banner (or in its place when no player is nominated). The toggle should always be visible in auction drafts when autoMode could be useful.

Specifically:
- Extract the auto-mode toggle into its own block that renders when `draftFormat === "auction"`
- Place it after the nominated player banner div (line ~309), before the main content area
- Keep it styled compactly: a thin bar with the toggle, label, and contextual status text
- When currentAuctionPlayer exists, show bid status; when null, show nomination status
  </action>
  <verify>
Run `cd packages/extension && npx tsc --noEmit` to verify no type errors. Visually inspect the JSX to confirm:
- Auto-pilot toggle is visible regardless of whether a player is nominated
- Contextual status text changes between bidding and nominating states
- No duplicate toggle rendering
  </verify>
  <done>Sidebar shows "Auto-Pilot" toggle at all times during auction drafts. Status text contextually shows "bidding" when a player is nominated and "waiting to nominate" when idle. TypeScript compiles cleanly.</done>
</task>

</tasks>

<verification>
1. `cd packages/extension && npx tsc --noEmit` — no type errors
2. Code review: AutoBidController.evaluateAndNominate() has complete nomination pipeline
3. Code review: isMyTurnToNominate() defensively checks DOM with fallback to false
4. Code review: Cooldown prevents rapid-fire clicks (5s window, 3-attempt max)
5. Code review: Sidebar toggle visible without active nomination
</verification>

<success_criteria>
- AutoBidController auto-nominates when autoMode ON, no active auction, and it is user's turn
- Nomination uses trap score strategy as primary, ideal roster as fallback
- 5-second cooldown and 3-attempt max prevent runaway clicking
- Sidebar auto-pilot toggle always visible during auction drafts
- TypeScript compiles with no errors
</success_criteria>

<output>
After completion, create `.planning/quick/60-auto-nominate-players-using-the-espn-que/60-SUMMARY.md`
</output>
