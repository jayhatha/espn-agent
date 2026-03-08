---
phase: 69-restore-position-slot-guard
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/engine/types.ts
  - packages/extension/lib/engine/index.ts
  - packages/extension/lib/auto-bid-controller.ts
autonomous: true
requirements: [SLOT-GUARD-01]

must_haves:
  truths:
    - "Auto-bid skips a catcher nomination when the user already has their C slot filled"
    - "Auto-bid skips any position nomination when all dedicated slots for that position are filled"
    - "Flex slots (UTIL, BN, P) do not count as available dedicated slots"
    - "DraftEngineSignals exposes remainingSlots so downstream consumers can read slot availability"
  artifacts:
    - path: "packages/extension/lib/engine/types.ts"
      provides: "remainingSlots field on DraftEngineSignals"
      contains: "remainingSlots"
    - path: "packages/extension/lib/engine/index.ts"
      provides: "remainingSlotsOpt included in return object"
      contains: "remainingSlots: remainingSlotsOpt"
    - path: "packages/extension/lib/auto-bid-controller.ts"
      provides: "Position slot guard before bid cap computation"
      contains: "remainingSlots"
  key_links:
    - from: "packages/extension/lib/engine/index.ts"
      to: "DraftEngineSignals"
      via: "return object includes remainingSlots"
      pattern: "remainingSlots"
    - from: "packages/extension/lib/auto-bid-controller.ts"
      to: "DraftEngineSignals.remainingSlots"
      via: "this.lastEngineSignals?.remainingSlots"
      pattern: "lastEngineSignals.*remainingSlots"
---

<objective>
Restore the position-slot guard in auto-bid logic so the controller never bids on a player whose dedicated position slots are already filled.

Purpose: Prevent wasting draft budget on redundant position players (e.g., a second catcher when only 1 C slot exists).
Output: Updated types, engine return, and auto-bid guard.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/lib/engine/types.ts
@packages/extension/lib/engine/index.ts
@packages/extension/lib/auto-bid-controller.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Expose remainingSlots in DraftEngineSignals and return from engine</name>
  <files>packages/extension/lib/engine/types.ts, packages/extension/lib/engine/index.ts</files>
  <action>
1. In `types.ts`, add a `remainingSlots` field to the `DraftEngineSignals` interface (line ~188, after `idealRoster`):
   ```
   remainingSlots: Record<string, number>;  // Unfilled dedicated slots per position (excludes zero-count)
   ```

2. In `index.ts`, add `remainingSlots: remainingSlotsOpt` to the return object at line ~1192 (the `return { inflation, scarcity, ... }` block). The variable `remainingSlotsOpt` is already computed at line 829 and represents unfilled slots with zero-count entries removed.
  </action>
  <verify>Run `npx tsc --noEmit -p packages/extension/tsconfig.json` — no type errors related to remainingSlots.</verify>
  <done>DraftEngineSignals includes remainingSlots field and computeDraftEngine returns it.</done>
</task>

<task type="auto">
  <name>Task 2: Add position-slot guard to auto-bid controller</name>
  <files>packages/extension/lib/auto-bid-controller.ts</files>
  <action>
After the strategy filter block (line 594-599, the `if (!isIdealTarget && !isOpportunity && !isPLUndervalued && !isRankedValue) { return; }` block) and BEFORE the bid cap computation (line 601), add a position-slot guard:

```typescript
// Position-slot guard: skip if all dedicated slots for this position are filled.
// Only checks dedicated position slots (C, 1B, 2B, etc.) — flex slots (UTIL, BN, P)
// don't count because we don't want to spend draft capital just to bench a player.
const remainingSlots = this.lastEngineSignals?.remainingSlots;
const playerPosition = ranking?.primaryPosition;
if (remainingSlots && playerPosition) {
  // Check dedicated slots: the position itself, plus combo slots that accept it
  // CI accepts 1B/3B, MI accepts 2B/SS, OF covers all OF slots
  const dedicatedSlotKeys: string[] = [playerPosition];
  if (playerPosition === '1B' || playerPosition === '3B') dedicatedSlotKeys.push('CI');
  if (playerPosition === '2B' || playerPosition === 'SS') dedicatedSlotKeys.push('MI');

  const hasDedicatedSlot = dedicatedSlotKeys.some((key) => (remainingSlots[key] ?? 0) > 0);
  if (!hasDedicatedSlot) {
    console.log(
      `[AutoBidController] Position slot guard: no remaining dedicated slots for ${playerPosition} — skipping (remaining: ${JSON.stringify(remainingSlots)})`
    );
    return;
  }
}
```

Key logic: For each player's `primaryPosition`, check if there are remaining dedicated slots that accept that position. Dedicated means the position's own slot OR a combo slot (CI for 1B/3B, MI for 2B/SS). UTIL, BN, and P are explicitly excluded since they are flex/bench slots — spending auction budget to fill bench is wasteful.

Note: When `remainingSlots` is null (engine hasn't computed yet) or `playerPosition` is undefined, the guard is skipped (fail-open) to avoid blocking bids when data isn't available yet.
  </action>
  <verify>Run `npx tsc --noEmit -p packages/extension/tsconfig.json` — no type errors. Manually review the guard placement is between the strategy filter return and bid cap computation.</verify>
  <done>Auto-bid controller skips nominations when the player's primary position has no remaining dedicated slots. Flex slots (UTIL, BN, P) are not counted. Guard fails open when engine signals unavailable.</done>
</task>

</tasks>

<verification>
- TypeScript compiles without errors: `npx tsc --noEmit -p packages/extension/tsconfig.json`
- `DraftEngineSignals` type includes `remainingSlots: Record<string, number>`
- `computeDraftEngine` return object includes `remainingSlots: remainingSlotsOpt`
- Auto-bid controller checks `this.lastEngineSignals?.remainingSlots` before bid cap computation
- Guard correctly maps combo slots (CI -> 1B/3B, MI -> 2B/SS)
- Guard does NOT block on UTIL, BN, or P availability
</verification>

<success_criteria>
- When C slot is filled (remainingSlots has no 'C' key), auto-bid skips catcher nominations
- When all dedicated+combo slots for a position are filled, auto-bid skips that position
- When engine signals are not yet available, auto-bid continues without blocking (fail-open)
- No TypeScript compilation errors
</success_criteria>

<output>
After completion, create `.planning/quick/69-restore-guard-against-drafting-a-second-/69-01-SUMMARY.md`
</output>
