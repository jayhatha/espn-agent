---
phase: quick-46
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/entrypoints/content.tsx
  - packages/extension/lib/engine/index.ts
  - packages/extension/lib/engine/draft-simulator.ts
autonomous: true
requirements: [WIN-PROB-FIX]

must_haves:
  truths:
    - "Win probability does not show ~100% for a top-heavy roster that spent all budget on 4 players"
    - "Rate stats (AVG, ERA, WHIP) produce non-zero values in simulation standings for all teams"
    - "Opponents with unknown budgets get a reasonable budget estimate, not the user's depleted budget"
    - "Teams tied in a category share roto points equally instead of receiving arbitrary different points"
  artifacts:
    - path: "packages/extension/entrypoints/content.tsx"
      provides: "Default 5x5 categories with formula_id on RATE stats"
      contains: "formula_id"
    - path: "packages/extension/lib/engine/index.ts"
      provides: "Opponent budget fallback using estimated initial budget minus known spend"
      contains: "estimatedInitialBudget"
    - path: "packages/extension/lib/engine/draft-simulator.ts"
      provides: "Tie-handling in roto point assignment"
      contains: "avgPts"
  key_links:
    - from: "packages/extension/entrypoints/content.tsx"
      to: "packages/extension/lib/engine/draft-simulator.ts"
      via: "categories passed through engine pipeline to computeSimStandings"
      pattern: "formula_id.*avg|era|whip"
    - from: "packages/extension/lib/engine/index.ts"
      to: "packages/extension/lib/engine/draft-simulator.ts"
      via: "budget flows into SimTeamState which affects simulated drafting behavior"
      pattern: "budget.*isMyTeam"
---

<objective>
Fix win probability simulation always showing ~100% regardless of roster strategy.

Purpose: Three independent bugs compound to make the simulation useless: (A) rate stats silently produce 0 for all teams due to missing formula_id, (B) opponents inherit the user's depleted budget making them unable to draft competitive rosters, and (C) tied values get arbitrarily different roto points. Together these consistently favor the user's team index.

Output: Corrected simulation that produces realistic win probabilities reflecting actual roster composition and budget strategy.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/entrypoints/content.tsx
@packages/extension/lib/engine/index.ts
@packages/extension/lib/engine/draft-simulator.ts
@packages/extension/lib/draft-config-detector.ts (reference for formula_id values and getDefault5x5Categories)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add formula_id to default RATE categories in content.tsx</name>
  <files>packages/extension/entrypoints/content.tsx</files>
  <action>
In the fallback default categories block (around lines 163-168), add `formula_id` and `required_components` to the three RATE stat entries. These must match the values already defined in `draft-config-detector.ts` `getDefault5x5Categories()`:

- AVG line: add `formula_id: "avg", required_components: ["AB", "H"]`
- ERA line: add `formula_id: "era", required_components: ["ER", "IP"]`
- WHIP line: add `formula_id: "whip", required_components: ["IP", "H", "BB"]`

The existing `getDefault5x5Categories()` in `draft-config-detector.ts` already has these values correct. The bug is ONLY in the fallback block in `content.tsx` which was written separately and omitted `formula_id`.

Do NOT change anything else in the file. Do NOT refactor the fallback to call `getDefault5x5Categories()` -- that function lives in a module with DOM dependencies that may complicate imports in the content script entry. Just add the missing fields inline.
  </action>
  <verify>
Run: `cd /Users/jay-work/Code/espn-agent && grep -n 'formula_id' packages/extension/entrypoints/content.tsx`
Expected: Three lines showing formula_id: "avg", formula_id: "era", formula_id: "whip" in the default categories block.
  </verify>
  <done>All three RATE categories in the content.tsx fallback include formula_id matching draft-config-detector values. The `computeSimStandings` rate-stat branch (`cat.type === "RATE" && cat.formula_id`) will now execute for these categories instead of producing value=0.</done>
</task>

<task type="auto">
  <name>Task 2: Fix opponent budget fallback and add roto tie-handling</name>
  <files>packages/extension/lib/engine/index.ts, packages/extension/lib/engine/draft-simulator.ts</files>
  <action>
**Bug B fix -- engine/index.ts, `buildSimDraftState` function, around line 138-140:**

Replace the opponent budget fallback logic. Currently:
```typescript
const budget = isMyTeam
  ? input.remainingBudget
  : (opponentModel.teamBudgets.get(teamId) ?? input.remainingBudget);
```

Change to:
```typescript
const budget = (() => {
  if (isMyTeam) return input.remainingBudget;
  const knownBudget = opponentModel.teamBudgets.get(teamId);
  if (knownBudget != null) return knownBudget;
  // Estimate: derive initial budget from user's own data, then subtract opponent's known spend
  const mySpent = input.myRoster.reduce((s, p) => s + (p.cost ?? 0), 0);
  const estimatedInitialBudget = input.remainingBudget + mySpent;
  const initialBudget = estimatedInitialBudget > 0 ? estimatedInitialBudget : 260;
  const teamSpent = input.allPicks
    .filter(p => p.teamId === teamId)
    .reduce((s, p) => s + (p.cost ?? 0), 0);
  return Math.max(1, initialBudget - teamSpent);
})();
```

This ensures opponents who aren't in the opponent model get a budget derived from (estimated league initial budget - their known spend), NOT the user's remaining budget. When the user has $5 left after blowing their budget, opponents who have spent less will correctly have more remaining.

**Bug C fix -- engine/draft-simulator.ts, `computeSimStandings` function, around lines 307-310:**

Replace the simple roto point assignment loop:
```typescript
for (let i = 0; i < teamValues.length; i++) {
  rotoPts[teamValues[i].teamIdx] += n - i;
}
```

With tie-aware assignment (standard roto practice -- tied teams share the average of the positions they span):
```typescript
let i = 0;
while (i < teamValues.length) {
  let j = i;
  while (j < teamValues.length && teamValues[j].value === teamValues[i].value) {
    j++;
  }
  // Average the roto points across the tied group
  let totalPts = 0;
  for (let k = i; k < j; k++) {
    totalPts += n - k;
  }
  const avgPts = totalPts / (j - i);
  for (let k = i; k < j; k++) {
    rotoPts[teamValues[k].teamIdx] += avgPts;
  }
  i = j;
}
```

This prevents teams with identical values (e.g., all zeros when Bug A was active, or genuinely tied counting stats) from receiving arbitrarily different roto points based on sort order.
  </action>
  <verify>
Run: `cd /Users/jay-work/Code/espn-agent && npx tsc --noEmit -p packages/extension/tsconfig.json 2>&1 | head -30`
Expected: No type errors related to the changed files.

Run: `cd /Users/jay-work/Code/espn-agent && grep -n 'estimatedInitialBudget' packages/extension/lib/engine/index.ts`
Expected: Shows the new budget estimation logic.

Run: `cd /Users/jay-work/Code/espn-agent && grep -n 'avgPts' packages/extension/lib/engine/draft-simulator.ts`
Expected: Shows the tie-handling assignment.

Run: `cd /Users/jay-work/Code/espn-agent && grep -n 'input\.remainingBudget' packages/extension/lib/engine/index.ts`
Expected: `input.remainingBudget` should appear in the `isMyTeam` branch and the estimation line, but NOT as a direct fallback for opponents.
  </verify>
  <done>
Opponent budget fallback uses estimated initial budget minus known team spend instead of the user's depleted budget. Roto point assignment shares points among tied teams. Together with Bug A fix, the simulation will no longer systematically favor the user's team.
  </done>
</task>

</tasks>

<verification>
After both tasks complete:
1. `npx tsc --noEmit -p packages/extension/tsconfig.json` -- no type errors
2. `grep 'formula_id' packages/extension/entrypoints/content.tsx` -- shows avg, era, whip
3. `grep -c 'input\.remainingBudget' packages/extension/lib/engine/index.ts` -- should NOT appear as a bare opponent fallback
4. `grep 'avgPts' packages/extension/lib/engine/draft-simulator.ts` -- tie-handling present
5. Any existing tests: `cd packages/extension && npx vitest run --reporter=verbose 2>&1 | tail -20`
</verification>

<success_criteria>
- All three RATE categories in content.tsx fallback have formula_id matching draft-config-detector
- Opponent budget fallback derives from estimated initial budget, not user's remaining budget
- Roto point assignment handles ties by sharing averaged points
- TypeScript compiles without errors
- Existing tests pass
</success_criteria>

<output>
After completion, create `.planning/quick/46-fix-win-probability-showing-100-with-top/46-SUMMARY.md`
</output>
