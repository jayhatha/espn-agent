---
phase: 91-fix-nominated-player-detection
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/dom-observers.ts
  - packages/extension/entrypoints/content.tsx
autonomous: true
requirements: [FIX-91]

must_haves:
  truths:
    - "After page reload during an active auction, the sidebar shows the currently nominated player within 3 seconds"
    - "When a new player is nominated, the sidebar updates from null to showing the player name and bid"
    - "The auction player observer survives ESPN DOM re-renders (node replacement)"
  artifacts:
    - path: "packages/extension/lib/dom-observers.ts"
      provides: "Resilient auction player observer with polling fallback"
      contains: "setInterval"
    - path: "packages/extension/entrypoints/content.tsx"
      provides: "Content script with robust observer lifecycle"
  key_links:
    - from: "packages/extension/lib/dom-observers.ts"
      to: "packages/extension/lib/draft-state.ts"
      via: "onPlayerChange callback -> setCurrentAuctionPlayer"
      pattern: "onPlayerChange"
---

<objective>
Fix the extension sidebar failing to detect the currently nominated auction player after page reload.

Purpose: During a live auction draft, the nominated player banner is critical for auto-bid and manual bidding decisions. After reload, the MutationObserver silently stops firing because it targets a DOM node that ESPN replaces during re-render.

Output: Resilient auction player detection that survives reloads and ESPN DOM re-renders.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/lib/dom-observers.ts
@packages/extension/entrypoints/content.tsx
@packages/extension/lib/draft-state.ts
@packages/extension/components/DraftSidebar.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add polling fallback and re-anchoring to observeCurrentAuctionPlayer</name>
  <files>packages/extension/lib/dom-observers.ts</files>
  <action>
The root cause is that `observeCurrentAuctionPlayer` sets up a MutationObserver on a container element found at setup time. After reload, this element either:
(a) doesn't exist yet (falls back to document.body with a narrow attributeFilter that misses mutations), or
(b) gets replaced by ESPN's React re-render, leaving the observer watching a detached node.

Fix the `observeCurrentAuctionPlayer` function with these changes:

1. **Add a polling fallback interval**: Add a `setInterval` (every 2 seconds) that calls `checkCurrentPlayer()` directly. This ensures detection even when MutationObserver misses mutations. The debounce inside `checkCurrentPlayer` already prevents duplicate emissions.

2. **Re-anchor the MutationObserver periodically**: Every 5 seconds, check if the current observed container is still in the DOM (`document.contains(observedNode)`). If not, find the new auction container and re-attach the observer. Store the current `observedNode` in a variable so it can be checked.

3. **Remove the restrictive `attributeFilter`**: Change the MutationObserver options to NOT use `attributeFilter` — instead use `attributes: false` since we have the polling fallback and `childList: true, subtree: true` is sufficient for DOM structure changes. The attributeFilter `["class", "data-player-id", "data-bid"]` is too narrow and misses many ESPN mutations.

4. **Add `characterData: true`** to the observer options so text content changes (bid amount updates) trigger the observer.

5. **Clean up the interval in the returned cleanup function**: The cleanup function must clear both the polling interval and the re-anchor interval, in addition to disconnecting the observer.

Do NOT change `CURRENT_AUCTION_PLAYER_SELECTORS`, `parseCurrentAuctionPlayer`, or any other function — only modify `observeCurrentAuctionPlayer`.
  </action>
  <verify>Run `cd /Users/jay-work/Code/espn-agent && pnpm --filter extension build` to confirm TypeScript compiles without errors.</verify>
  <done>
    - `observeCurrentAuctionPlayer` has a 2-second polling interval calling `checkCurrentPlayer`
    - Observer re-anchors when its target node is detached from DOM
    - `attributeFilter` removed, `characterData: true` added
    - Cleanup function clears all intervals and disconnects observer
    - Extension builds successfully
  </done>
</task>

<task type="auto">
  <name>Task 2: Add immediate auction player check after hydration in content script</name>
  <files>packages/extension/entrypoints/content.tsx</files>
  <action>
The content script calls `observeCurrentAuctionPlayer` at line 818, but this happens in a code path that may execute before the ESPN auction UI has rendered. The initial `checkCurrentPlayer()` inside the observer fires once (with a 200ms debounce), but if ESPN hasn't rendered the auction area yet, it returns null and then relies solely on the MutationObserver (which may be attached to the wrong node, as fixed in Task 1).

Add a retry-on-initial-null pattern to the content script auction player setup:

1. After the `observeCurrentAuctionPlayer` call on line 818, add a `setTimeout` at 3 seconds that performs a one-shot check: if `useDraftStore.getState().currentAuctionPlayer` is still null, manually query the DOM for `CURRENT_AUCTION_PLAYER_SELECTORS` and if found, call `parseCurrentAuctionPlayer` and `setCurrentAuctionPlayer`. Import `parseCurrentAuctionPlayer` (already exported) and reference `CURRENT_AUCTION_PLAYER_SELECTORS` by importing it or inlining the selector string.

Wait — `CURRENT_AUCTION_PLAYER_SELECTORS` is a module-level const (not exported). Instead, just use the same selector list inline: `'[data-testid="player-selected"], .player-selected, .pickArea'`.

Actually, Task 1 already adds a polling fallback, so this retry is redundant. Instead, make a simpler change:

Move the auction observer setup to happen AFTER the initial `refreshAssistantData()` call (line 874) rather than before it. Currently the observer starts at line 818 (in the `if (resolvedDraftFormat === "auction")` block) and `refreshAssistantData()` is at line 874. The refresh call triggers DOM scraping which can cause ESPN to re-render, invalidating the observer's target. By moving the observer start to after the refresh, the DOM is more stable.

Specifically:
- Move lines 818-825 (the `if (resolvedDraftFormat === "auction")` block that starts observers) to AFTER line 874 (`refreshAssistantData()`). Keep the same conditional structure.
- This ensures the MutationObserver attaches after the initial DOM scraping/refresh is complete, giving ESPN's React more time to stabilize.

Do NOT change any other logic in content.tsx.
  </action>
  <verify>Run `cd /Users/jay-work/Code/espn-agent && pnpm --filter extension build` to confirm the extension builds.</verify>
  <done>
    - Auction observer setup moved to after `refreshAssistantData()` call
    - Observer attaches to a more stable DOM state
    - Extension builds successfully
  </done>
</task>

</tasks>

<verification>
1. `pnpm --filter extension build` passes
2. No TypeScript errors in dom-observers.ts or content.tsx
3. The `observeCurrentAuctionPlayer` function now has:
   - A 2-second polling interval
   - Observer re-anchoring when target is detached
   - No restrictive attributeFilter
   - characterData observation enabled
   - Proper cleanup of all intervals
</verification>

<success_criteria>
- Extension compiles without errors
- `observeCurrentAuctionPlayer` is resilient to DOM node replacement (re-anchoring)
- Polling fallback ensures detection even when MutationObserver misses events
- Observer setup timing improved (after initial refresh stabilizes DOM)
</success_criteria>

<output>
After completion, create `.planning/quick/91-fix-nominated-player-detection-after-rel/91-SUMMARY.md`
</output>
