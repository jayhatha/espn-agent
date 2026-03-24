---
phase: 101-fix-waiver-rank-color-inversion-and-trad
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/frontend/src/app/leagues/[id]/waivers/page.tsx
  - packages/backend/src/agents/trade-recommendation.ts
autonomous: true
requirements: [BUG-101-RANK-COLOR, BUG-101-TRADE-ROSTER]

must_haves:
  truths:
    - "Waiver rank improvement (negative deltaRank) displays in green"
    - "Waiver rank worsening (positive deltaRank) displays in red"
    - "Trade roster validation accepts all slot types from league settings including DH"
    - "Trade roster validation does not produce false 'cannot be assigned' errors for leagues with non-standard slot types"
  artifacts:
    - path: "packages/frontend/src/app/leagues/[id]/waivers/page.tsx"
      provides: "Inverted color logic for rank delta"
      contains: "renderDeltaRank"
    - path: "packages/backend/src/agents/trade-recommendation.ts"
      provides: "Dynamic slot order from rosterSlots keys"
      contains: "Object.keys"
  key_links:
    - from: "packages/frontend/src/app/leagues/[id]/waivers/page.tsx"
      to: "renderDeltaValue"
      via: "rank-specific rendering with inverted colors"
      pattern: "renderDeltaRank|invert"
    - from: "packages/backend/src/agents/trade-recommendation.ts"
      to: "rosterSlots"
      via: "dynamic slot order derivation"
      pattern: "Object\\.keys.*rosterSlots"
---

<objective>
Fix two bugs found during user testing: (1) waiver recommendation rank delta colors are inverted (green for worse rank, red for better), and (2) trade roster validation fails with "cannot be assigned" for leagues with slot types not in the hardcoded list (e.g., DH).

Purpose: Correct misleading UI feedback and eliminate false validation errors blocking trade analysis.
Output: Two patched files with correct behavior.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/frontend/src/app/leagues/[id]/waivers/page.tsx
@packages/backend/src/agents/trade-recommendation.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix waiver rank delta color inversion</name>
  <files>packages/frontend/src/app/leagues/[id]/waivers/page.tsx</files>
  <action>
    Add a `renderDeltaRank` function near the existing `renderDeltaValue` function (around line 248). This function renders rank deltas with INVERTED color logic: negative values (rank improved, e.g., 5th to 3rd = -2) should be green (`text-positive`), positive values (rank worsened) should be red (`text-negative`). This is the opposite of `renderDeltaValue` which treats positive = good.

    The function should also add a directional arrow or label for clarity:
    - Negative deltaRank: show green with upward arrow (rank improved)
    - Positive deltaRank: show red with downward arrow (rank worsened)
    - Zero: show em dash like renderDeltaValue

    Then update the category impact table (around line 298) to call `renderDeltaRank(impact.deltaRank)` instead of `renderDeltaValue(impact.deltaRank)`.

    Keep `renderDeltaValue` unchanged for the points column (line 300-304 area) since positive points = good is correct there.
  </action>
  <verify>
    Run `cd /Users/jay-work/Code/espn-agent && npx tsc --noEmit -p packages/frontend/tsconfig.json` to confirm no type errors. Visually inspect that `renderDeltaRank` is called for rank columns and `renderDeltaValue` for points columns.
  </verify>
  <done>
    Negative deltaRank values render in green (improvement), positive in red (worsening). Points column unchanged. No TypeScript errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix trade roster slot validation to use dynamic slot order</name>
  <files>packages/backend/src/agents/trade-recommendation.ts</files>
  <action>
    In the `validateRosterLegality` method (around line 212-250), replace the hardcoded `slotOrder` array on line 217 with dynamic derivation from the `rosterSlots` parameter:

    1. Get all slot types from `Object.keys(rosterSlots)`.
    2. Separate into three tiers for greedy assignment ordering:
       - Specific position slots (C, 1B, 2B, 3B, SS, OF, SP, RP) - most constrained, fill first
       - Generic multi-position slots (P, DH, UTIL) - fill second
       - Overflow slots (BN, IL) - fill last
    3. Build `slotOrder` by: filtering keys into each tier, then concatenating specific -> generic -> overflow. Any slot type not recognized goes into the generic tier (safe default).

    Also update `canFillSlot` method (line 255-268):
    - Add DH handling: `if (slotType === "DH") return true;` (DH accepts any hitter, and in practice any player). Place this alongside the UTIL/BN/IL check.
    - This ensures DH slots don't cause unassigned player errors.

    The key insight: by deriving slotOrder from `Object.keys(rosterSlots)`, any league-specific slot types (DH, MI, CI, etc.) are automatically included. Unknown slot types fall through to `canFillSlot`'s exact position match, which is the safe default.

    For common composite slots, also add to `canFillSlot`:
    - `MI` (middle infield): accepts 2B or SS
    - `CI` (corner infield): accepts 1B or 3B
  </action>
  <verify>
    Run `cd /Users/jay-work/Code/espn-agent && npx tsc --noEmit -p packages/backend/tsconfig.json` to confirm no type errors. Grep for the old hardcoded slotOrder to confirm it's replaced.
  </verify>
  <done>
    slotOrder is dynamically derived from rosterSlots keys. canFillSlot handles DH, MI, CI slots. No hardcoded slot list remains. TypeScript compiles cleanly.
  </done>
</task>

</tasks>

<verification>
- TypeScript compiles for both frontend and backend packages
- No hardcoded slotOrder array remains in trade-recommendation.ts
- renderDeltaRank function exists in waivers/page.tsx with inverted color logic
- renderDeltaValue still used for points (positive = green unchanged)
</verification>

<success_criteria>
- Waiver rank deltas show correct colors: green for improvement (negative), red for worsening (positive)
- Trade roster validation dynamically uses all slot types from league settings
- DH, MI, CI slots handled in canFillSlot
- Both packages compile without errors
</success_criteria>

<output>
After completion, create `.planning/quick/101-fix-waiver-rank-color-inversion-and-trad/101-01-SUMMARY.md`
</output>
