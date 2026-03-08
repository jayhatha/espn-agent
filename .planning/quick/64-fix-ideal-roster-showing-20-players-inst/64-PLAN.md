---
phase: 64-fix-ideal-roster-duplicates
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/draft-state.ts
autonomous: true
requirements: [DEDUP-01]

must_haves:
  truths:
    - "Same player parsed from different DOM paths is not added to myRoster twice"
    - "Same player parsed from different DOM paths is not added to allPicks twice"
    - "Ideal roster shows correct count (e.g. 10 not 20) after page reload"
  artifacts:
    - path: "packages/extension/lib/draft-state.ts"
      provides: "Name-based dedup in addPick and updateRoster"
      contains: "normalizeName"
  key_links:
    - from: "packages/extension/lib/draft-state.ts"
      to: "addPick / updateRoster"
      via: "normalized playerName comparison as fallback dedup"
      pattern: "normalizeName"
---

<objective>
Fix duplicate player entries in myRoster and allPicks caused by multiple DOM scan paths
producing different playerIds/teamIds for the same player.

Purpose: After page reload, observeDraftBoard runs multiple scans (scanCompletedPicks,
scanEntireDocument, collectCompletedPicksSnapshot) that parse the same player from different
DOM elements. Different parse contexts yield different playerIds (real ESPN id vs hash fallback)
and different teamIds (grid column index vs team name string). The current dedup in addPick and
updateRoster only checks playerId equality, so the same player with two different playerIds
passes dedup and gets added twice, inflating myRoster from 10 to 20.

Output: Updated draft-state.ts with name-based dedup fallback in both addPick and updateRoster.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/lib/draft-state.ts
@packages/shared/src/types.ts (DraftPick lines 391-401, DraftedPlayer lines 403-410)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add name-based dedup to updateRoster and addPick in draft-state.ts</name>
  <files>packages/extension/lib/draft-state.ts</files>
  <action>
Add a `normalizeName` helper function at the top of the file (after imports, before the interface
declarations). This function should:
- Take a string, lowercase it, trim whitespace
- Remove accents/diacritics (using String.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
- Remove suffixes like " Jr.", " Sr.", " II", " III", " IV" (case-insensitive)
- Collapse multiple spaces to single space
- Return the normalized string

Example: `normalizeName("Ronald Acuna Jr.")` -> `"ronald acuna"`

Then modify `updateRoster` (line ~206-224) to add name-based dedup:
```typescript
updateRoster: (player) => {
  set((state) => {
    const normalizedIncoming = normalizeName(player.playerName);
    const alreadyOnRoster = state.myRoster.some(
      (existing) =>
        existing.playerId === player.playerId ||
        normalizeName(existing.playerName) === normalizedIncoming,
    );

    if (alreadyOnRoster) {
      return state;
    }

    return {
      myRoster: [...state.myRoster, player],
      remainingBudget:
        state.draftFormat === "auction"
          ? state.remainingBudget - (player.cost || 0)
          : state.remainingBudget,
    };
  });
},
```

Then modify `addPick` (line ~186-203) to add name-based dedup:
```typescript
addPick: (pick) => {
  set((state) => {
    const normalizedIncoming = normalizeName(pick.playerName);
    const existingPick = state.allPicks.find(
      (existing) =>
        (existing.playerId === pick.playerId ||
         normalizeName(existing.playerName) === normalizedIncoming) &&
        existing.cost === pick.cost,
    );

    if (existingPick) {
      return state;
    }

    return {
      allPicks: [...state.allPicks, pick],
      currentPick: state.currentPick + 1,
    };
  });
},
```

Key points:
- The name match uses OR with playerId match, so either match prevents duplicates
- For addPick, keep the cost check as an additional guard (same player at different costs
  would be genuinely different auction events, though this is unlikely)
- Remove the teamId check from addPick dedup since teamId can differ between parse paths
  for the same pick
  </action>
  <verify>
Run TypeScript compilation: `cd /Users/jay-work/Code/espn-agent && pnpm --filter extension exec tsc --noEmit`

Verify the normalizeName function works correctly by checking the code manually:
- normalizeName is defined and exported (or module-scoped)
- updateRoster uses `||` with normalizeName comparison
- addPick uses `||` with normalizeName comparison
  </verify>
  <done>
Both addPick and updateRoster in draft-state.ts deduplicate by playerName in addition to
playerId. A player parsed from scanCompletedPicks with playerId=12345 and from
scanEntireDocument with playerId=67890 (hash fallback) will be recognized as the same player
if their names match after normalization. myRoster will contain at most one entry per
unique player name.
  </done>
</task>

</tasks>

<verification>
- TypeScript compiles without errors for the extension package
- The normalizeName helper handles edge cases: accents, suffixes, extra whitespace
- Both addPick and updateRoster use the dual dedup (playerId OR playerName)
- No existing functionality is broken (budget deduction still works, pick counting still works)
</verification>

<success_criteria>
- draft-state.ts compiles cleanly
- updateRoster deduplicates by normalized playerName OR playerId
- addPick deduplicates by normalized playerName OR playerId (with cost guard)
- normalizeName handles real baseball player names correctly (accents, Jr/Sr suffixes)
</success_criteria>

<output>
After completion, create `.planning/quick/64-fix-ideal-roster-showing-20-players-inst/64-SUMMARY.md`
</output>
