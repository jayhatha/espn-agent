---
phase: "81"
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/engine/index.ts
autonomous: true
requirements: ["81-BUG"]
must_haves:
  truths:
    - "Ideal Roster shows the same total roster slot count as Budget Pacing"
    - "When rosterSize=28, ideal roster fills 28 slots (not 26 from DEFAULT_ROSTER_SLOTS)"
  artifacts:
    - path: "packages/extension/lib/engine/index.ts"
      provides: "Slot count reconciliation between rosterSize and activeSlots"
      contains: "reconcile"
  key_links:
    - from: "packages/extension/lib/engine/index.ts"
      to: "computeIdealRoster"
      via: "activeSlotsOpt with reconciled BN count"
      pattern: "rosterSize.*activeSlotsOpt"
---

<objective>
Fix mismatch between Budget Pacing roster slot count and Ideal Roster roster slot count.

Purpose: Budget Pacing correctly uses `rosterSize` from the Position Tracker DOM (e.g., 28). Ideal Roster uses `activeSlots` (from `detectedRosterSlots` or `DEFAULT_ROSTER_SLOTS`) whose values may sum to a different total (e.g., DEFAULT_ROSTER_SLOTS sums to 26). This causes the ideal roster to show fewer total players than Budget Pacing shows roster spots.

Output: Ideal Roster uses the same total roster slot count as Budget Pacing.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/lib/engine/index.ts
@packages/extension/lib/engine/roster-optimizer.ts
@packages/extension/lib/engine/types.ts
@packages/extension/components/AuctionBudgetTracker.tsx
@packages/extension/components/IdealRosterPanel.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Reconcile activeSlots total with rosterSize before passing to ideal roster and other consumers</name>
  <files>packages/extension/lib/engine/index.ts</files>
  <action>
In `computeDraftEngine()`, after line 784 where `activeSlotsOpt` is derived:

```ts
const activeSlotsOpt = input.rosterSlots ?? DEFAULT_ROSTER_SLOTS;
```

Add a reconciliation step that adjusts the BN (bench) slot count so the total matches `input.rosterSize`. The logic:

1. Compute `activeTotal = Object.values(activeSlotsOpt).reduce((s, v) => s + v, 0)`
2. If `activeTotal !== input.rosterSize` AND `input.rosterSize > 0`:
   a. Compute `diff = input.rosterSize - activeTotal`
   b. Create a shallow copy: `const reconciled = { ...activeSlotsOpt }`
   c. Adjust BN: `reconciled.BN = Math.max(0, (reconciled.BN ?? 0) + diff)`
   d. Reassign: use `reconciled` as `activeSlotsOpt` (change from `const` to `let`, or use a new variable name like `reconciledSlots` and replace all downstream uses of `activeSlotsOpt` with `reconciledSlots`)
   e. Log in DEV: `console.log("[DraftEngine] Reconciled roster slots: rosterSize=${input.rosterSize}, slotTotal=${activeTotal}, BN adjusted by ${diff}")`

The existing warning log on lines 788-793 can be removed or converted to a DEV info log since the mismatch is now handled.

Important: This reconciliation must apply to ALL downstream uses of `activeSlotsOpt`, not just ideal roster. Search the file for all references to `activeSlotsOpt` and ensure they use the reconciled value. Current uses:
- Line 797: `buildSGPVectors(allPlayersOpt, input.leagueCategories, activeSlotsOpt, ...)`
- Line 819: `buildOpponentModel(... activeSlotsOpt, ...)`
- Line 829: `const remainingSlotsOpt: Record<string, number> = { ...activeSlotsOpt }`
- Line 888: `computeRosterOptimization(... activeSlotsOpt ...)`
- Line 990: `rosterSlots: remainingSlotsOpt` (derived from activeSlotsOpt)
- Line 1046: `remainingSlotsOpt` (derived from activeSlotsOpt)
- Line 1179: `activeSlotsOpt` passed to `computeIdealRoster`

All of these should automatically use the reconciled value if you reassign the variable.

Do NOT change `DEFAULT_ROSTER_SLOTS` itself -- it remains as the fallback constant.
Do NOT change `rosterSize` -- it's the source of truth from Position Tracker.
Do NOT change budget-curve.ts or AuctionBudgetTracker.tsx -- they already work correctly.
  </action>
  <verify>
1. `cd packages/extension && npx tsc --noEmit` passes
2. Grep for `activeSlotsOpt` to confirm all uses reference the reconciled value
3. Search for the reconciliation log message to confirm the code is in place
  </verify>
  <done>
When `input.rosterSize` (e.g., 28) differs from the sum of `activeSlotsOpt` (e.g., 26), the BN slot count is adjusted so ideal roster fills the correct total number of slots, matching what Budget Pacing reports.
  </done>
</task>

</tasks>

<verification>
- TypeScript compiles without errors
- The reconciliation adjusts BN when activeSlots total differs from rosterSize
- All downstream engine consumers (SGP, opponent model, optimizer, ideal roster) use the reconciled slots
</verification>

<success_criteria>
Ideal Roster shows the same total roster slot count as Budget Pacing's "Roster Spots Left" when they both start from the same `rosterSize`.
</success_criteria>

<output>
After completion, create `.planning/quick/81-bug-budget-pacing-has-the-correct-number/81-SUMMARY.md`
</output>
