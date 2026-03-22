---
phase: 96-fix-auto-nominate-bug
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/auto-bid-controller.ts
autonomous: true
requirements: [NOMINATE-TIMING-01]
must_haves:
  truths:
    - "Search dropdown has 500ms initial delay before polling begins"
    - "Search dropdown timeout allows 3000ms total for ESPN to render results"
    - "Match button click has a 150ms settle delay after dropdown appears"
    - "Diagnostic logging shows dropdown state and match button count"
  artifacts:
    - path: "packages/extension/lib/auto-bid-controller.ts"
      provides: "Tuned search timing constants and added settle delay + logging"
      contains: "SEARCH_INITIAL_DELAY_MS"
  key_links:
    - from: "searchAndNominate"
      to: "pollForDropdown"
      via: "setTimeout with SEARCH_INITIAL_DELAY_MS"
      pattern: "SEARCH_INITIAL_DELAY_MS"
---

<objective>
Fix auto-nominate bug where search text is typed but the select/nominate button is never clicked. The root cause is insufficient delay after typing before polling for the search dropdown, plus no settle time between finding the dropdown and clicking the match button.

Purpose: ESPN's search dropdown renders asynchronously and the current 300ms initial delay + 2000ms total timeout is too aggressive for slower network/rendering conditions.
Output: Updated timing constants and added diagnostic logging in `auto-bid-controller.ts`.
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
  <name>Task 1: Increase search timing constants and add settle delay before clicking match</name>
  <files>packages/extension/lib/auto-bid-controller.ts</files>
  <action>
Make the following changes to `packages/extension/lib/auto-bid-controller.ts`:

**1. Update timing constants (lines 112-121):**
- Change `SEARCH_DROPDOWN_TIMEOUT_MS` from `2000` to `3000` — gives ESPN more time to fetch and render search results.
- Add a new constant `SEARCH_INITIAL_DELAY_MS = 500` — replaces the hardcoded `300` on line 1010. This is the delay after typing before we start polling for the dropdown.
- Add a new constant `SEARCH_MATCH_SETTLE_MS = 150` — a short delay after the dropdown appears and match buttons are found, before clicking. Ensures DOM is fully interactive.

**2. Add settle delay before clicking match button (inside `pollForDropdown`, around line 972-976):**
Currently when `matchButton` is found, it's clicked immediately (line 976: `matchButton.click()`). Wrap the click and its follow-up logic in a `setTimeout` of `SEARCH_MATCH_SETTLE_MS` (150ms). The block to wrap starts at `matchButton.click()` (line 976) through to the `return;` (line 991). Structure:

```typescript
if (matchButton) {
  // NEW: small settle delay to ensure DOM is fully interactive
  setTimeout(() => {
    logger.log(
      `[AutoNominate] Clicking search match for ${candidateName} (ID: ${playerId})`,
    );
    matchButton!.click();
    this.nominationAttempts++;
    this.lastNominationTime = Date.now();
    this.lastAttemptResult = `Clicked search dropdown match for ${candidateName}`;

    setTimeout(() => {
      this.pollForNominateButton(candidateName, 0);
    }, AutoBidController.SEARCH_DROPDOWN_SETTLE_MS);

    setTimeout(() => {
      this.clearPlayerSearch();
    }, AutoBidController.SEARCH_DROPDOWN_SETTLE_MS + 1000);
  }, AutoBidController.SEARCH_MATCH_SETTLE_MS);
  return;
}
```

**3. Use the new initial delay constant (line 1010):**
Change `setTimeout(() => pollForDropdown(0), 300);` to `setTimeout(() => pollForDropdown(0), AutoBidController.SEARCH_INITIAL_DELAY_MS);`

**4. Add diagnostic logging inside `pollForDropdown`:**
Right after `matchButtons` is computed (after line 949), add a log on the first poll (elapsed === 0) and on timeout:

```typescript
if (elapsed === 0) {
  logger.log(
    `[AutoNominate] First poll: dropdown=${!!matchesContainer}, matchButtons=${matchButtons.length}`,
  );
}
```

Also enhance the timeout warning (line 999-1001) to include more detail:
```typescript
logger.warn(
  `[AutoNominate] Search dropdown timed out after ${maxElapsed}ms for ${candidateName} (ID: ${playerId}). ` +
  `Dropdown visible: ${!!document.querySelector('.player--search--matches')}, ` +
  `match buttons: ${document.querySelectorAll('button.player--search--match').length}`,
);
```
  </action>
  <verify>
Run `cd /Users/jay-work/Code/espn-agent && pnpm --filter extension build` — TypeScript compiles without errors.

Verify constants: `grep -n "SEARCH_INITIAL_DELAY_MS\|SEARCH_MATCH_SETTLE_MS\|SEARCH_DROPDOWN_TIMEOUT_MS" packages/extension/lib/auto-bid-controller.ts`

Confirm no hardcoded 300 remains for the initial delay: `grep -n "setTimeout.*pollForDropdown.*300" packages/extension/lib/auto-bid-controller.ts` should return nothing.

Confirm diagnostic logging: `grep -n "First poll:" packages/extension/lib/auto-bid-controller.ts` should return a match.
  </verify>
  <done>
SEARCH_DROPDOWN_TIMEOUT_MS is 3000, SEARCH_INITIAL_DELAY_MS is 500 (replacing hardcoded 300), SEARCH_MATCH_SETTLE_MS is 150 (new settle delay before clicking match button). Diagnostic logging shows dropdown state on first poll and detailed info on timeout. Extension builds cleanly.
  </done>
</task>

</tasks>

<verification>
- `pnpm --filter extension build` succeeds
- Constants declared: SEARCH_INITIAL_DELAY_MS (500), SEARCH_MATCH_SETTLE_MS (150), SEARCH_DROPDOWN_TIMEOUT_MS (3000)
- No hardcoded `300` delay for initial poll start
- Match button click wrapped in SEARCH_MATCH_SETTLE_MS setTimeout
- Diagnostic log on first poll and enhanced timeout warning
</verification>

<success_criteria>
The searchAndNominate method gives ESPN 500ms initial delay (up from 300ms), 3000ms total dropdown timeout (up from 2000ms), and 150ms settle time after finding the match button before clicking it. Diagnostic logging aids future debugging. Extension compiles cleanly.
</success_criteria>

<output>
After completion, create `.planning/quick/96-fix-auto-nominate-bug-add-delay-after-se/96-SUMMARY.md`
</output>
