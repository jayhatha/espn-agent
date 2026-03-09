---
phase: "89"
plan: "01"
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/auto-bid-controller.ts
autonomous: true
requirements: ["FIX-SEARCH-QUEUE"]
must_haves:
  truths:
    - "searchAndQueue successfully finds and clicks the Queue button after clicking a search dropdown match"
    - "Queue button detection uses polling with retry instead of a single fixed timeout"
    - "searchAndQueue handles ESPN table re-render delay after search selection"
  artifacts:
    - path: "packages/extension/lib/auto-bid-controller.ts"
      provides: "Fixed searchAndQueue with polling-based Queue button detection"
      contains: "pollForQueueButton"
  key_links:
    - from: "searchAndQueue dropdown match click"
      to: "Queue button click"
      via: "polling loop with multiple selector strategies"
      pattern: "pollForQueueButton"
---

<objective>
Fix `searchAndQueue()` in auto-bid-controller.ts so the Queue button click works after selecting a player from the search dropdown.

Purpose: The search-based queue population (added in quick-88) successfully finds players via the search bar and clicks the dropdown match, but fails to find/click the Queue button afterward. The nomination flow (`searchAndNominate`) works because `clickNominateButton()` uses extensive selector strategies and scanning. The queue flow uses a single `button[data-player-id]` lookup after a fixed 500ms wait with no retry -- this fails because ESPN re-renders the player table after a search selection, and the Queue button may not be available immediately or may need broader selector matching.

Output: Working `searchAndQueue()` that reliably finds and clicks the Queue button after search selection.
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
  <name>Task 1: Replace single-wait Queue button lookup with polling loop and broadened selectors</name>
  <files>packages/extension/lib/auto-bid-controller.ts</files>
  <action>
In `searchAndQueue()` (around line 890-910), replace the current single `setTimeout` Queue button detection with a polling loop similar to `pollForDropdown`.

Current broken code (after clicking the search dropdown match):
```typescript
setTimeout(() => {
  const queueButton = document.querySelector<HTMLButtonElement>(
    `button[data-player-id="${playerId}"]`
  );
  const queueButtonText = queueButton?.textContent?.trim().toLowerCase() ?? '';
  if (queueButton && queueButtonText.includes('queue')) {
    queueButton.click();
    // ...success path
  } else {
    // ...failure path
  }
}, 500);
```

Replace with a `pollForQueueButton` inner function that:

1. Polls every 300ms for up to 3000ms (longer than the dropdown poll since ESPN needs to re-render the table after search selection).

2. Uses THREE selector strategies in order:
   a. **Primary:** `button[data-player-id="${playerId}"]` -- same as current, check text includes "queue"
   b. **Broadened data-player-id:** `button[data-player-id="${playerId}"]` but also accept text like "select" (when it's user's turn, Queue becomes Select -- the button is still clickable for queueing intent)
   c. **Table row scan fallback:** Find the closest `.fixedDataTableRowLayout_main` row that contains the player name or ID, then look for any `button[data-player-id]` within that row

3. On finding the button, click it, log success, clear search, resolve true.

4. On timeout (no button found after 3000ms), log the failure with details about what WAS found in the DOM (for debugging), clear search, resolve false.

5. Add a console.log at the start of the poll loop showing what selectors are being tried and the elapsed time, to help debug in future runs.

Implementation pattern -- model after the existing `pollForDropdown` recursive setTimeout:
```typescript
const pollForQueueButton = (elapsed: number): void => {
  // Strategy 1: direct data-player-id match
  const directButton = document.querySelector<HTMLButtonElement>(
    `button[data-player-id="${playerId}"]`
  );
  if (directButton && !directButton.disabled) {
    const text = directButton.textContent?.trim().toLowerCase() ?? '';
    if (text.includes('queue') || text.includes('select')) {
      directButton.click();
      console.log(`[AutoQueue] Clicked "${directButton.textContent?.trim()}" button for ${candidateName} after search (${elapsed}ms)`);
      setTimeout(() => {
        this.clearPlayerSearch();
        setTimeout(() => resolve(true), 500);
      }, 500);
      return;
    }
  }

  // Strategy 2: scan all button[data-player-id] buttons for one near
  // the player name in the DOM (ESPN may re-render with different structure)
  const allPlayerButtons = document.querySelectorAll<HTMLButtonElement>('button[data-player-id]');
  for (const btn of allPlayerButtons) {
    if (btn.disabled) continue;
    const btnPlayerId = btn.getAttribute('data-player-id');
    if (btnPlayerId === String(playerId)) {
      const text = btn.textContent?.trim().toLowerCase() ?? '';
      if (text.includes('queue') || text.includes('select')) {
        btn.click();
        console.log(`[AutoQueue] Clicked "${btn.textContent?.trim()}" (scan) for ${candidateName} after search (${elapsed}ms)`);
        setTimeout(() => {
          this.clearPlayerSearch();
          setTimeout(() => resolve(true), 500);
        }, 500);
        return;
      }
    }
  }

  // Continue polling
  if (elapsed + 300 < 3000) {
    setTimeout(() => pollForQueueButton(elapsed + 300), 300);
  } else {
    // Timeout — log diagnostics
    const foundButtons = document.querySelectorAll<HTMLButtonElement>('button[data-player-id]');
    const buttonSummary = Array.from(foundButtons).slice(0, 5).map(b =>
      `${b.getAttribute('data-player-id')}:"${b.textContent?.trim()}"`
    ).join(', ');
    console.warn(`[AutoQueue] Queue button not found for ${candidateName} (ID: ${playerId}) after 3000ms polling. Visible buttons: [${buttonSummary}]`);
    this.clearPlayerSearch();
    resolve(false);
  }
};

// Start polling after initial delay for ESPN to process the dropdown click
setTimeout(() => pollForQueueButton(0), 500);
```

IMPORTANT: Keep the rest of `searchAndQueue` unchanged -- the search input typing, dropdown polling, and match clicking logic all work correctly. Only replace the post-match-click Queue button detection (the `setTimeout` block after `matchButton.click()`).
  </action>
  <verify>
Run `cd /Users/jay-work/Code/espn-agent && npx tsc --noEmit --project packages/extension/tsconfig.json 2>&1 | head -20` to verify TypeScript compiles without new errors.

Grep for `pollForQueueButton` in auto-bid-controller.ts to confirm the polling loop was added.

Grep for the old pattern `const queueButton = document.querySelector` inside searchAndQueue to confirm it was replaced (should NOT be found in the searchAndQueue method).
  </verify>
  <done>
searchAndQueue() uses a polling loop (300ms interval, 3000ms max) with multiple selector strategies to find the Queue button after clicking a search dropdown match. The old single-setTimeout approach is replaced. TypeScript compiles without new errors.
  </done>
</task>

</tasks>

<verification>
- TypeScript compiles: `npx tsc --noEmit --project packages/extension/tsconfig.json`
- `pollForQueueButton` exists in `searchAndQueue` method
- Polling loop has 3000ms timeout with 300ms intervals
- Accepts both "queue" and "select" button text
- Diagnostic logging on timeout shows visible buttons for debugging
- `clearPlayerSearch()` called on both success and failure paths
</verification>

<success_criteria>
searchAndQueue() reliably detects and clicks the Queue button after ESPN re-renders the table in response to a search dropdown match click, using polling with retry instead of a single fixed-delay attempt.
</success_criteria>

<output>
After completion, create `.planning/quick/89-fix-queue-button-clicking-after-search-n/89-SUMMARY.md`
</output>
