---
phase: 62-after-reload-ideal-roster-shows-locked-i
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/engine/index.ts
autonomous: true
requirements:
  - FIX-62
must_haves:
  truths:
    - "After page reload, ideal roster only shows players who actually appear in allPicks with myTeamId"
    - "Players from stale persisted myRoster that do not exist in allPicks are excluded from isDrafted entries"
    - "Valid drafted players (present in allPicks) continue to show with isDrafted: true and correct slot/cost"
  artifacts:
    - path: "packages/extension/lib/engine/index.ts"
      provides: "computeIdealRoster() with allPicks cross-validation guard"
      contains: "validMyRoster"
  key_links:
    - from: "input.myRoster"
      to: "input.allPicks"
      via: "playerId match OR normalizedName fallback"
      pattern: "allPicks.*playerId|normalizedName"
---

<objective>
Fix phantom locked-in players appearing in the ideal roster after page reload.

Purpose: After reload, Zustand persist restores a stale myRoster from chrome.storage.local. Because pick detection team ID matching fails on reload (team name vs team number mismatch), myRoster is never re-populated correctly. computeIdealRoster() blindly trusts myRoster and marks those stale entries as isDrafted: true, showing players the user never drafted.

Output: A cross-validation filter inside computeIdealRoster() that discards any myRoster entry not corroborated by allPicks. allPicks is always rebuilt from DOM on reload (it is not subject to the team ID mismatch bug), making it the reliable source of truth.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/jay-work/Code/espn-agent/.planning/ROADMAP.md
@/Users/jay-work/Code/espn-agent/.planning/STATE.md
@/Users/jay-work/Code/espn-agent/packages/extension/lib/engine/index.ts
@/Users/jay-work/Code/espn-agent/packages/shared/src/types.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Cross-validate myRoster against allPicks in computeIdealRoster</name>
  <files>packages/extension/lib/engine/index.ts</files>
  <action>
In `computeIdealRoster()` (starts at line 422), immediately before the `draftedPlayers` loop (currently at line 497), add a filter that builds a validated roster from `input.myRoster`:

```typescript
// Cross-validate myRoster against allPicks to discard stale persisted entries.
// After page reload, the team ID mismatch bug may leave myRoster populated from
// chrome.storage.local with players the user never actually drafted. allPicks is
// rebuilt from DOM on reload and is the authoritative source.
// Match on playerId first (exact), fall back to normalizedName (handles id=0 edge case).
const allPicksNormalizedNames = new Set(
  input.allPicks.map(p => normalizeName(p.playerName))
);
const allPicksPlayerIds = new Set(
  input.allPicks.filter(p => p.playerId > 0).map(p => p.playerId)
);
const validMyRoster = input.myRoster.filter(drafted => {
  if (drafted.playerId > 0 && allPicksPlayerIds.has(drafted.playerId)) return true;
  if (allPicksNormalizedNames.has(normalizeName(drafted.playerName))) return true;
  return false;
});
```

Then replace the loop `for (const drafted of input.myRoster)` with `for (const drafted of validMyRoster)`.

Place this block right before line 497 (the comment `// Assign drafted players to slots using same priority logic`). Do NOT modify any other logic. The `normalizeName` function is already imported at the top of the file.

If `input.allPicks` is empty (pre-draft, before any pick is recorded), `validMyRoster` will also be empty — this is intentional and correct, because no real picks have occurred yet.
  </action>
  <verify>
    1. Run `cd /Users/jay-work/Code/espn-agent && pnpm --filter @espn-fantasy/extension build 2>&1 | tail -20` — must exit 0 with no TypeScript errors.
    2. Run `cd /Users/jay-work/Code/espn-agent && pnpm --filter @espn-fantasy/extension test 2>&1 | tail -30` — all tests must pass.
  </verify>
  <done>
    Build passes. Tests pass. The validMyRoster filter exists in computeIdealRoster() and replaces the raw input.myRoster iteration in the draftedPlayers loop.
  </done>
</task>

</tasks>

<verification>
After the task completes:
- TypeScript build exits 0 with no errors on the extension package.
- Existing test suite passes.
- In `packages/extension/lib/engine/index.ts`, the draftedPlayers loop iterates over `validMyRoster` (not `input.myRoster`).
- The `validMyRoster` filter uses both `playerId` and `normalizeName` matching against `allPicks`.
</verification>

<success_criteria>
After page reload, the ideal roster panel shows only players that appear in `allPicks`. Stale entries from the persisted myRoster that have no corroborating pick record are silently excluded, eliminating phantom locked-in players.
</success_criteria>

<output>
After completion, create `/Users/jay-work/Code/espn-agent/.planning/quick/62-after-reload-ideal-roster-shows-locked-i/62-01-SUMMARY.md`
</output>
