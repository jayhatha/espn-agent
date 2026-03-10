---
phase: 90-fix-auto-nominate-queue-button-selector
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/auto-bid-controller.ts
  - packages/extension/lib/dom-observers.ts
autonomous: true
requirements: [SELECTOR-01]

must_haves:
  truths:
    - "All button selectors target action-btn class to avoid matching non-action elements"
    - "Fallback to bare selector preserves robustness if ESPN changes class names"
    - "Queue, Select, and Dequeue buttons are reliably found during nomination flow"
  artifacts:
    - path: "packages/extension/lib/auto-bid-controller.ts"
      provides: "Fixed button selectors in populateQueue, evaluateAndNominate, searchAndQueue"
      contains: "button.action-btn[data-player-id"
    - path: "packages/extension/lib/dom-observers.ts"
      provides: "Fixed button selector in scrapeESPNNominationQueue"
      contains: "button.action-btn[data-player-id"
  key_links:
    - from: "auto-bid-controller.ts populateQueue()"
      to: "ESPN DOM action buttons"
      via: "button.action-btn[data-player-id] selector"
      pattern: "button\\.action-btn\\[data-player-id"
    - from: "dom-observers.ts scrapeESPNNominationQueue()"
      to: "ESPN DOM action buttons"
      via: "button.action-btn[data-player-id] selector"
      pattern: "button\\.action-btn\\[data-player-id"
---

<objective>
Fix all bare `button[data-player-id]` CSS selectors in the extension's auto-bid controller and DOM observers to use `button.action-btn[data-player-id]` instead.

Purpose: The ESPN auction draft page has multiple elements with `data-player-id` attributes (player name links, stat cells, etc.). Only the Queue/Select/Dequeue action buttons carry the `action-btn` class. Using bare `button[data-player-id]` risks matching non-action elements, causing clicks on the wrong elements or false turn detection.

Output: Updated selectors in both files with fallback to bare selector for robustness.
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
  <name>Task 1: Fix button selectors in auto-bid-controller.ts and dom-observers.ts</name>
  <files>packages/extension/lib/auto-bid-controller.ts, packages/extension/lib/dom-observers.ts</files>
  <action>
Create a helper function at the top of `auto-bid-controller.ts` (near other utility functions) to encapsulate the selector logic with fallback:

```typescript
/** Find an action button for a specific player, preferring .action-btn class */
function findActionButton(playerId: string | number): HTMLButtonElement | null {
  return (
    document.querySelector<HTMLButtonElement>(
      `button.action-btn[data-player-id="${playerId}"]`,
    ) ??
    document.querySelector<HTMLButtonElement>(
      `button[data-player-id="${playerId}"]`,
    )
  );
}

/** Find all action buttons, preferring .action-btn class */
function findAllActionButtons(): NodeListOf<HTMLButtonElement> {
  const buttons = document.querySelectorAll<HTMLButtonElement>(
    "button.action-btn[data-player-id]",
  );
  if (buttons.length > 0) return buttons;
  return document.querySelectorAll<HTMLButtonElement>("button[data-player-id]");
}
```

Then update these 6 locations in `auto-bid-controller.ts`:

1. **populateQueue() ~line 451-452** (turn detection guard):
   Replace `document.querySelectorAll<HTMLButtonElement>('button[data-player-id]')` with `findAllActionButtons()`.

2. **populateQueue() ~line 540-541** (direct button lookup):
   Replace `document.querySelector<HTMLButtonElement>(\`button[data-player-id="${playerId}"]\`)`with`findActionButton(playerId)`.

3. **evaluateAndNominate() ~line 676-677** (queue entry button):
   Replace `document.querySelector<HTMLButtonElement>(\`button[data-player-id="${queuePlayerId}"]\`)`with`findActionButton(queuePlayerId)`.

4. **evaluateAndNominate() ~line 765-766** (engine candidate button):
   Replace `document.querySelector<HTMLButtonElement>(\`button[data-player-id="${playerId}"]\`)`with`findActionButton(playerId)`.

5. **searchAndQueue() ~line 897-898** (poll direct button):
   Replace `document.querySelector<HTMLButtonElement>(\`button[data-player-id="${playerId}"]\`)`with`findActionButton(playerId)`.

6. **searchAndQueue() ~line 915** (poll all buttons):
   Replace `document.querySelectorAll<HTMLButtonElement>('button[data-player-id]')` with `findAllActionButtons()`.

Then update 1 location in `dom-observers.ts`:

7. **scrapeESPNNominationQueue() ~line 1269-1271**:
   Replace `document.querySelectorAll<HTMLButtonElement>("button[data-player-id]")` with:
   ```typescript
   const allPlayerButtons = (() => {
     const specific = document.querySelectorAll<HTMLButtonElement>(
       "button.action-btn[data-player-id]",
     );
     return specific.length > 0
       ? specific
       : document.querySelectorAll<HTMLButtonElement>("button[data-player-id]");
   })();
   ```
   (Inline fallback since the helper lives in auto-bid-controller.ts, not dom-observers.ts. Alternatively, move the helpers to a shared selector utils file if preferred, but inline is simpler for this scope.)

Do NOT change the `isMyTurnToNominate()` strategy 4 selector (`button.Button--select[data-player-id]:not([disabled])`) — it already uses a class-based selector and is correct.
</action>
<verify>
Run TypeScript compilation to ensure no type errors:

```bash
cd packages/extension && npx tsc --noEmit
```

Grep to confirm no remaining bare `button[data-player-id]` selectors (except the known-good `button.Button--select` one in isMyTurnToNominate):

```bash
grep -n 'button\[data-player-id' packages/extension/lib/auto-bid-controller.ts packages/extension/lib/dom-observers.ts
```

All matches should either contain `.action-btn` or be inside the fallback branch of the helper functions.
</verify>
<done>
All 7 selector locations updated to prefer `button.action-btn[data-player-id]` with fallback to bare selector. TypeScript compiles cleanly. No bare `button[data-player-id]` selectors remain outside of fallback paths and the already-correct isMyTurnToNominate strategy 4.
</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` in packages/extension passes
2. Grep for `button[data-player-id` shows all instances are either `.action-btn` prefixed or inside explicit fallback logic
3. The helper functions `findActionButton` and `findAllActionButtons` exist and are used at all 6 call sites in auto-bid-controller.ts
4. dom-observers.ts scrapeESPNNominationQueue uses the `.action-btn` selector with fallback
</verification>

<success_criteria>

- All button[data-player-id] selectors in auto-bid-controller.ts and dom-observers.ts use .action-btn class prefix
- Fallback to bare selector ensures robustness if ESPN changes class names
- TypeScript compiles without errors
- isMyTurnToNominate() strategy 4 selector is unchanged
  </success_criteria>

<output>
After completion, create `.planning/quick/90-fix-auto-nominate-queue-button-selector-/90-01-SUMMARY.md`
</output>
