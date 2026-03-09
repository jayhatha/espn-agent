---
phase: "87"
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/auto-bid-controller.ts
autonomous: true
requirements: [SEARCH-NOM-01]

must_haves:
  truths:
    - "After typing in ESPN search, the extension clicks the matching player from the search dropdown instead of looking for a table button"
    - "Player is matched by data-player-search-playerid (ESPN ID) when available, with name fallback"
    - "After clicking the dropdown match, the extension waits for and clicks the Nominate/Select confirmation button"
    - "Search input is cleared after the nomination flow completes"
  artifacts:
    - path: "packages/extension/lib/auto-bid-controller.ts"
      provides: "Updated searchAndNominate using dropdown click strategy"
      contains: "player--search--match"
  key_links:
    - from: "searchAndNominate"
      to: "clickNominateButton"
      via: "setTimeout after dropdown click"
      pattern: "player--search--match.*click"
---

<objective>
Fix the searchAndNominate method to click matching players from the ESPN search dropdown instead of looking for table buttons.

Purpose: The current implementation types a player name into ESPN's search box, then looks for a `button[data-player-id]` in the player table. But ESPN renders search results as a dropdown (`.player--search--matches`) with `button.player--search--match` elements containing `data-player-search-playerid` attributes. The fix clicks the correct dropdown match button, which ESPN then uses to populate the nomination/selection UI.

Output: Updated `searchAndNominate` in `auto-bid-controller.ts`
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/lib/auto-bid-controller.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rewrite searchAndNominate to click dropdown match button</name>
  <files>packages/extension/lib/auto-bid-controller.ts</files>
  <action>
Rewrite the `searchAndNominate` method (starting at line ~813) to use the search dropdown instead of looking for table buttons. Keep the existing search input typing logic (lines 818-853 — the React-compatible value setting, InputEvent dispatch, etc.) as-is.

Replace the post-typing logic (the `findButton` helper and setTimeout block, lines 856-883) with:

1. **Wait for dropdown to appear** (poll every 200ms, up to 2000ms total):
   - Look for `.player--search--matches` container
   - Once found, look for `button.player--search--match` elements inside it

2. **Find the correct match button** using this priority:
   - **By ESPN player ID (preferred):** Find `button.player--search--match[data-player-search-playerid="${playerId}"]`
   - **By name fallback:** If no ID match, iterate `button.player--search--match` elements and compare `data-player-search-playername` attribute against `candidateName` using case-insensitive comparison (use `normalizeName` from the existing import for both sides)

3. **Click the matched dropdown button:**
   - Log: `[AutoNominate] Clicking search match for ${candidateName} (ID: ${playerId})`
   - Call `.click()` on the matched button
   - Increment `this.nominationAttempts` and set `this.lastNominationTime = Date.now()`
   - Update `this.lastAttemptResult` with success message

4. **After clicking dropdown match, wait 500ms then call `this.clickNominateButton(candidateName)`** — same pattern as `clickPlayerButton` uses. Then after another 1000ms, call `this.clearPlayerSearch()`.

5. **If no match found after polling timeout:**
   - Log warning: `[AutoNominate] No matching player in search dropdown for ${candidateName} (ID: ${playerId})`
   - Increment `this.nominationAttempts`, set `this.lastNominationTime`
   - Update `this.lastAttemptResult` with failure message
   - Call `this.clearPlayerSearch()` to reset state

Use a small helper function inside `searchAndNominate` for the polling (e.g., `const pollForDropdown = (elapsed: number) => { ... }` with `setTimeout(pollForDropdown, 200)` pattern). Do NOT use setInterval — use recursive setTimeout so we can cleanly stop after finding the match.

Do NOT change `clickPlayerButton`, `clickNominateButton`, `clearPlayerSearch`, or `evaluateAndNominate`. Only the body of `searchAndNominate` after the search input typing is changed.
  </action>
  <verify>
Run: `cd /Users/jay-work/Code/espn-agent && npx tsc --noEmit -p packages/extension/tsconfig.json 2>&1 | head -30`

Verify the method references `.player--search--matches`, `.player--search--match`, `data-player-search-playerid`, and `data-player-search-playername` selectors.

Grep: `grep -n "player--search--match" packages/extension/lib/auto-bid-controller.ts`
  </verify>
  <done>
searchAndNominate types the player name, polls for the `.player--search--matches` dropdown, clicks the correct `button.player--search--match` by ESPN player ID (or name fallback), then triggers the Nominate/Select confirmation button. TypeScript compiles without errors.
  </done>
</task>

</tasks>

<verification>
- TypeScript compiles: `npx tsc --noEmit -p packages/extension/tsconfig.json`
- New selectors present: `grep "player--search--match" packages/extension/lib/auto-bid-controller.ts`
- Old table-button approach removed: `grep "data-player-id" packages/extension/lib/auto-bid-controller.ts` should NOT appear inside `searchAndNominate` (it will still appear in `evaluateAndNominate` and queue logic, which is correct)
</verification>

<success_criteria>
- searchAndNominate clicks dropdown match buttons instead of table buttons
- Player matched by ESPN ID first, name fallback second
- Nomination confirmation button clicked after dropdown selection
- Search cleared after flow completes (success or failure)
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/87-fix-search-nomination-click-matching-pla/87-SUMMARY.md`
</output>
