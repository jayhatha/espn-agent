---
phase: quick-80
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/auto-bid-controller.ts
autonomous: true
requirements: [QUICK-80]

must_haves:
  truths:
    - "Autopilot clicks the 'nominate player' button (class bid-player__button) after selecting a player"
    - "isMyTurnToNominate() returns true when Select buttons (class Button--select) are visible in the player table"
  artifacts:
    - path: "packages/extension/lib/auto-bid-controller.ts"
      provides: "Updated nomination selectors matching actual ESPN DOM"
  key_links:
    - from: "clickNominateButton()"
      to: "button.bid-player__button"
      via: "direct querySelector before action area selectors"
      pattern: "bid-player__button"
    - from: "isMyTurnToNominate()"
      to: "button.Button--select[data-player-id]"
      via: "Strategy 4 querySelector"
      pattern: "Button--select"
---

<objective>
Fix two broken selectors in the autopilot nomination flow so that it correctly detects when it's our turn to nominate and successfully clicks the confirmation button.

Purpose: Autopilot nomination is currently broken because the ESPN DOM uses class names that the current selectors don't match.
Output: Updated `auto-bid-controller.ts` with working selectors for both nomination turn detection and confirmation button clicking.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add bid-player__button as high-priority selector and fix isMyTurnToNominate Button--select detection</name>
  <files>packages/extension/lib/auto-bid-controller.ts</files>
  <action>
Two targeted edits to `auto-bid-controller.ts`:

**Edit 1 — `clickNominateButton()` (around line 546):**

Add `"button.bid-player__button"` as the FIRST entry in the `specificSelectors` array (before the existing `"button.nominate-button"` entry). This is a direct class match against the actual ESPN DOM: `<button class="Button Button--default bid-player__button" ...>nominate player</button>`. No parent context required.

The updated `specificSelectors` array should look like:
```typescript
const specificSelectors = [
  "button.bid-player__button",          // ESPN actual: "nominate player" confirm button
  "button.nominate-button",
  'button[class*="nominate"]',
  'button[class*="Nominate"]',
  '[data-testid*="nominate"] button',
  'button[data-testid*="nominate"]',
];
```

Also update the fallback text scan (around line 590) — change `"select player"` to `"nominate player"` so the fallback explicitly matches the button's actual text, and keep `"nominate"` as the broad match:
```typescript
const actionWords = ["nominate player", "nominate", "submit"];
```

**Edit 2 — `isMyTurnToNominate()` Strategy 4 (around line 276):**

The current Strategy 4 checks for any `button[data-player-id]:not([disabled])`. ESPN's actual DOM uses `Button--select` class on the "Select" buttons when it's our turn to nominate (vs "Queue" buttons at other times). Add an explicit Strategy 4a that checks for `Button--select` buttons with a `data-player-id` attribute before the existing generic check.

After the Strategy 3 block (around line 274), add a new Strategy 4 comment block and insert this check before the existing `queueButtons` check:

```typescript
// Strategy 4: Check for "Select" buttons (Button--select class) in the player table
// ESPN changes "Queue" → "Select" when it is your turn to nominate
const selectButtons = document.querySelectorAll<HTMLButtonElement>(
  "button.Button--select[data-player-id]:not([disabled])"
);
if (selectButtons.length > 0) {
  console.log("[AutoNominate] Detected Button--select buttons — it's our turn to nominate");
  return true;
}
```

Keep the existing Strategy 4 (`button[data-player-id]:not([disabled])` check) as Strategy 5 below it — it remains a valid fallback for other button label variants.
  </action>
  <verify>
Run TypeScript compiler check:
```
cd /Users/jay-work/Code/espn-agent && pnpm --filter extension tsc --noEmit 2>&1 | head -30
```
Should produce no new errors. Confirm both `button.bid-player__button` and `button.Button--select[data-player-id]` selectors appear in the file.
  </verify>
  <done>
- `specificSelectors` in `clickNominateButton()` has `"button.bid-player__button"` as first entry
- `isMyTurnToNominate()` has a `button.Button--select[data-player-id]:not([disabled])` querySelector before the generic `button[data-player-id]` check
- Fallback `actionWords` in `clickNominateButton()` includes `"nominate player"` explicitly
- TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
- `grep -n "bid-player__button\|Button--select" packages/extension/lib/auto-bid-controller.ts` shows both new selectors present
- TypeScript build passes: `pnpm --filter extension tsc --noEmit`
</verification>

<success_criteria>
The nomination confirmation button (`button.bid-player__button`) is found by `clickNominateButton()` on the first selector pass. `isMyTurnToNominate()` returns true when `button.Button--select[data-player-id]` buttons are present in the DOM.
</success_criteria>

<output>
After completion, create `.planning/quick/80-fix-autopilot-nomination-select-and-nomi/80-SUMMARY.md`
</output>
