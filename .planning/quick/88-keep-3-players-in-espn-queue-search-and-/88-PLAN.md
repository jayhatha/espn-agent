---
phase: "88"
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/auto-bid-controller.ts
autonomous: true
requirements: ["QUEUE-SEARCH"]

must_haves:
  truths:
    - "When ESPN queue has fewer than 3 players, populateQueue searches for top engine candidates and queues them"
    - "Players not visible in the ESPN table are found via the search bar and queued after clicking the dropdown match"
    - "Search-and-queue operations happen sequentially (one at a time) with proper cleanup between each"
    - "Queue population still runs on the existing 15s interval and respects existing guards (autoMode, cooldown, not user's turn)"
  artifacts:
    - path: "packages/extension/lib/auto-bid-controller.ts"
      provides: "searchAndQueue method + updated populateQueue with search fallback"
      contains: "searchAndQueue"
  key_links:
    - from: "populateQueue()"
      to: "searchAndQueue()"
      via: "fallback when button not found for candidate"
      pattern: "searchAndQueue"
    - from: "searchAndQueue()"
      to: ".player--search--matches"
      via: "ESPN search dropdown DOM interaction"
      pattern: "player--search--match"
---

<objective>
Add search-based queue population to `populateQueue()` so that when the ESPN queue has fewer than 3 players, the extension uses the search bar to find top engine candidates not visible in the table and queues them.

Purpose: Currently `populateQueue()` can only queue players whose rows are visible in the ESPN table. Most top engine candidates are NOT visible, so the queue stays empty. Using the search bar (same pattern as `searchAndNominate()`) lets us find and queue any player.

Output: Updated `auto-bid-controller.ts` with search-based queue fallback
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/lib/auto-bid-controller.ts
@packages/extension/lib/dom-observers.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add searchAndQueue method and wire it into populateQueue</name>
  <files>packages/extension/lib/auto-bid-controller.ts</files>
  <action>
Three changes to `auto-bid-controller.ts`:

**A. Change TARGET_QUEUE_SIZE to 3:**

Change `MAX_QUEUE_SIZE` from 10 to 3. This is the threshold — when queue count drops below 3, we search and queue more. Rename to `TARGET_QUEUE_SIZE` for clarity (update all references — there's only one in `populateQueue`).

**B. Make populateQueue async and add search fallback:**

Change `populateQueue()` from `void` to `async` (callers don't await it, so this is safe). In the candidate loop (around line 511-565), when a candidate's Queue button is NOT found in the DOM (the `if (!button)` block at line 543), instead of just logging and `continue`-ing, call `await this.searchAndQueue(candidate.name, playerId)`. If `searchAndQueue` returns true (successfully queued), increment `queued` and add `playerId` to `this.queuedPlayerIds`. Then continue to the next candidate.

Keep the existing direct-button-click path as the fast path (no search needed if already visible). Only fall through to search when the button is not found.

Important: Since `searchAndQueue` involves async waits (polling for dropdown), we MUST process candidates sequentially (the existing `for` loop is fine — just `await` each search). Do NOT try to parallelize multiple searches.

**C. Create private searchAndQueue method:**

Create `private searchAndQueue(candidateName: string, playerId: number): Promise<boolean>` that:

1. Finds the search input (same selector as `searchAndNominate`: `.playersSearch input.form__control, input[placeholder="Player Name"]`). If not found, return `false`.

2. Uses last name for search term (same as `searchAndNominate`: split on whitespace, take last element).

3. Types into the search input using the React-compatible pattern (same `nativeInputValueSetter` + `InputEvent` + `change` + `keyup` dispatch as `searchAndNominate` lines 836-851).

4. Returns a Promise that resolves after polling for the dropdown match:
   - After a 300ms initial delay, poll every 200ms for up to 2000ms total (same timing as `searchAndNominate`).
   - Look for `.player--search--matches` container and `button.player--search--match` buttons within it.
   - Match by `data-player-search-playerid="${playerId}"` first, then by normalized name fallback (same as `searchAndNominate` lines 869-885).
   - When match found: click the match button. Then wait 500ms for ESPN to process. Then look for the Queue button (`button[data-player-id="${playerId}"]`) and check its text includes "queue" (case-insensitive). If found, click it. Then clear the search (call `this.clearPlayerSearch()`). Wait 500ms after clearing. Return `true`.
   - If no match found after timeout: log warning, clear search, return `false`.
   - If match found but Queue button not found after clicking: clear search, return `false`.

5. Console log prefix: `[AutoQueue]` (to match existing queue population logs).

**Important implementation notes:**
- Do NOT call `clickNominateButton` — this is queueing, not nominating. We just click "Queue", not "Select"/"Nominate".
- Do NOT modify `searchAndNominate` — it handles the nomination flow and has different post-click behavior (calls `clickNominateButton`). The new `searchAndQueue` is a separate, simpler method.
- The Promise wrapping the setTimeout polling can use `new Promise<boolean>((resolve) => { ... })` with recursive `setTimeout` calls inside (same pattern as `searchAndNominate` lines 861-921 but with resolve instead of return).
- After each successful search-and-queue, add a 500ms gap before the next iteration to let ESPN settle. Use `await new Promise(r => setTimeout(r, 500))` after `searchAndQueue` returns true.
  </action>
  <verify>
Run TypeScript compilation to confirm no type errors:
```bash
cd packages/extension && npx tsc --noEmit
```

Manually verify:
1. `populateQueue` is now `async` and calls `searchAndQueue` when button not found
2. `searchAndQueue` returns `Promise<boolean>` and handles full search-click-queue-clear cycle
3. `TARGET_QUEUE_SIZE` (renamed from `MAX_QUEUE_SIZE`) is set to 3
4. No calls to `clickNominateButton` from `searchAndQueue`
5. `clearPlayerSearch()` is called after every search attempt (success or failure)
  </verify>
  <done>
When ESPN queue has fewer than 3 players, `populateQueue()` uses the search bar to find top engine candidates not visible in the table, clicks the dropdown match, waits for the Queue button to appear, clicks it, clears the search, and moves on to the next candidate. All existing guards (autoMode, cooldown, not user's turn, already-drafted, already-queued) still apply.
  </done>
</task>

</tasks>

<verification>
- TypeScript compiles without errors
- `populateQueue()` falls through from direct-button path to search path when player not visible
- `searchAndQueue()` handles the full flow: type search term -> poll for dropdown -> click match -> wait -> click Queue -> clear search
- Queue target is 3 (not 10)
- No interference with existing `searchAndNominate` nomination flow
</verification>

<success_criteria>
- `populateQueue()` can queue players that aren't visible in the ESPN table by using the search bar
- Queue is kept at ~3 players via periodic 15s population runs
- Each search-and-queue operation is sequential and cleans up after itself
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/88-keep-3-players-in-espn-queue-search-and-/88-SUMMARY.md`
</output>
