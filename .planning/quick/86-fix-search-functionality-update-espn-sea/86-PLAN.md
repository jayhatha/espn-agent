---
phase: quick-86
plan: "01"
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/auto-bid-controller.ts
autonomous: true
requirements: [SEARCH-FIX]

must_haves:
  truths:
    - "searchAndNominate types a player name into ESPN search input and ESPN filters the table"
    - "clearPlayerSearch resets the search input back to empty and restores the full player list"
    - "After search filters the table, the player's Select/Queue button is found and clicked"
  artifacts:
    - path: "packages/extension/lib/auto-bid-controller.ts"
      provides: "Fixed searchAndNominate, clearPlayerSearch methods"
      contains: "searchAndNominate"
  key_links:
    - from: "searchAndNominate"
      to: "ESPN search input"
      via: "querySelector + nativeInputValueSetter + React-compatible events"
      pattern: "playersSearch.*form__control"
---

<objective>
Fix the ESPN player search interaction in AutoBidController so that when a nomination candidate is not visible in the scrollable player table, the extension can type the player's name into ESPN's search bar, wait for results, and click the Select/Queue button.

Purpose: The search-and-nominate fallback is the critical path when a player isn't visible in the table viewport. If search doesn't work, auto-nomination fails for any player not currently scrolled into view.

Output: Updated `searchAndNominate()` and `clearPlayerSearch()` methods with robust ESPN DOM interaction.
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
  <name>Task 1: Harden ESPN search input interaction in searchAndNominate and clearPlayerSearch</name>
  <files>packages/extension/lib/auto-bid-controller.ts</files>
  <action>
Update the `searchAndNominate()` method (around line 813) and `clearPlayerSearch()` method (around line 873) in AutoBidController with the following changes:

**searchAndNominate() fixes:**

1. **Selectors are correct, keep them as-is:** `'.playersSearch input.form__control, input[placeholder="Player Name"]'` matches the actual ESPN DOM. Do NOT change these selectors.

2. **Add focus() before typing:** Before setting the value, call `searchInput.focus()` to ensure the input is active. ESPN's React app may ignore value changes on unfocused inputs.

3. **Improve React event compatibility:** After setting the value via `nativeInputValueSetter`, dispatch events that React's synthetic event system recognizes:
   - Keep the existing `nativeInputValueSetter` approach (it works for React controlled inputs)
   - Replace `new Event('input', { bubbles: true })` with `new InputEvent('input', { bubbles: true, data: searchTerm, inputType: 'insertText' })` — the `InputEvent` class carries the `data` property that React uses
   - Keep the `change` event dispatch as a fallback
   - Additionally dispatch a `keyup` event after `input`/`change` as some ESPN handlers listen for keyboard events: `new KeyboardEvent('keyup', { bubbles: true, key: searchTerm.slice(-1) })`

4. **Increase search result wait time:** Change the setTimeout delay from 800ms to 1200ms. ESPN's React rendering + network filter may need more time, especially on slower connections.

5. **Add retry for button lookup after search:** Inside the setTimeout callback, if `button[data-player-id="${playerId}"]` is not found on first check, add a second attempt after 500ms (nested setTimeout) before giving up. This handles slow ESPN table re-renders. Structure:
   ```
   setTimeout(() => {
     let queueButton = findButton(playerId);
     if (queueButton && !queueButton.disabled) {
       this.clickPlayerButton(queueButton, candidateName, playerId, candidateReason);
       setTimeout(() => this.clearPlayerSearch(), 1000);
       return;
     }
     // Retry once after 500ms
     setTimeout(() => {
       queueButton = findButton(playerId);
       if (queueButton && !queueButton.disabled) {
         this.clickPlayerButton(queueButton, candidateName, playerId, candidateReason);
       } else {
         console.warn(`[AutoNominate] Player button still not found after search for ${candidateName} (ID: ${playerId})`);
         this.nominationAttempts++;
         this.lastNominationTime = Date.now();
       }
       setTimeout(() => this.clearPlayerSearch(), 1000);
     }, 500);
   }, 1200);
   ```
   Extract the button lookup to a small helper: `const findButton = (pid: number) => document.querySelector<HTMLButtonElement>(\`button[data-player-id="${pid}"]\`);`

**clearPlayerSearch() fixes:**

1. **Selectors are correct, keep them as-is.**

2. **Add focus() before clearing:** Focus the input before resetting its value, same rationale as above.

3. **Improve React event compatibility:** Same InputEvent pattern as in searchAndNominate — dispatch `new InputEvent('input', { bubbles: true, data: '', inputType: 'deleteContentBackward' })` after resetting value to empty string.

4. **Click clear button with fallback:** When clicking the `.player--search--clear` element, if the first querySelector returns null, also try `div.player--search--clear svg` as a separate selector (the SVG inside the div may be the actual click target). If the SVG is found, click its `parentElement` instead of the SVG directly.

Keep all existing console.log/warn messages. Do not change any other methods.
  </action>
  <verify>
Run `cd /Users/jay-work/Code/espn-agent && npx tsc --noEmit -p packages/extension/tsconfig.json 2>&1 | head -30` to confirm no TypeScript errors.

Grep for the key changes:
- `searchInput.focus()` appears in searchAndNominate
- `InputEvent` appears in both searchAndNominate and clearPlayerSearch
- Retry setTimeout appears in searchAndNominate
- 1200 appears as the primary search delay
  </verify>
  <done>
searchAndNominate() focuses input before typing, dispatches React-compatible InputEvent, waits 1200ms for results with a 500ms retry, and clearPlayerSearch() uses matching event improvements. TypeScript compiles cleanly.
  </done>
</task>

</tasks>

<verification>
- TypeScript compiles with no errors: `npx tsc --noEmit -p packages/extension/tsconfig.json`
- searchAndNominate method contains: focus(), InputEvent, 1200ms delay, retry logic
- clearPlayerSearch method contains: focus(), InputEvent
- No other methods in AutoBidController were modified
</verification>

<success_criteria>
The searchAndNominate() and clearPlayerSearch() methods use robust React-compatible DOM interaction: focusing the input, dispatching InputEvent with proper data/inputType fields, allowing adequate time for ESPN's React rendering, and retrying button lookup once before failing.
</success_criteria>

<output>
After completion, create `.planning/quick/86-fix-search-functionality-update-espn-sea/86-SUMMARY.md`
</output>
