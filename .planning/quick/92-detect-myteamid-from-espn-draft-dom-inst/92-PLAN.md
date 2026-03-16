---
phase: 92-detect-myteamid
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/entrypoints/content.tsx
autonomous: true
requirements: [DETECT-TEAM-01]

must_haves:
  truths:
    - "Extension detects user team ID from ESPN DOM instead of using hardcoded DEFAULT_TEAM_ID"
    - "Practice drafts work because team ID is detected dynamically"
    - "Real league drafts still work via DEFAULT_TEAM_ID fallback when detection fails"
    - "Late-loading DOM elements are handled via retry/re-detection"
  artifacts:
    - path: "packages/extension/entrypoints/content.tsx"
      provides: "Dynamic team ID detection during draft initialization"
      contains: "setMyTeamId"
  key_links:
    - from: "packages/extension/entrypoints/content.tsx"
      to: "packages/extension/lib/draft-config-detector.ts"
      via: "detectMyTeam() call used to set myTeamId in store"
      pattern: "detectMyTeam.*setMyTeamId"
---

<objective>
Wire up the existing `detectMyTeam()` function to actually set `myTeamId` in the draft store, replacing the hardcoded `DEFAULT_TEAM_ID` usage. The function already exists and works -- it is just never used to update the team ID.

Purpose: Practice drafts assign arbitrary team IDs, so the hardcoded `DEFAULT_TEAM_ID = 13` fails. Dynamic detection reads the `.auction-pick-component--own` CSS class from ESPN's DOM.

Output: Modified `content.tsx` that detects team ID dynamically with DEFAULT_TEAM_ID fallback.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/entrypoints/content.tsx
@packages/extension/lib/draft-config-detector.ts (detectMyTeam function, lines 302-363)
@packages/extension/lib/draft-state.ts (setMyTeamId action exists at line 366)
@packages/shared/src/league-defaults.ts (DEFAULT_TEAM_ID = 13)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Wire detectMyTeam() to set myTeamId in draft store</name>
  <files>packages/extension/entrypoints/content.tsx</files>
  <action>
There are 4 specific changes in content.tsx, all in the draft initialization flow:

**Change 1 — Early detection before initializeDraft (around line 245-252):**
Before the `state.initializeDraft()` call, attempt an early `detectMyTeam()`. Use the result for `myTeamId` if available, otherwise fall back to `DEFAULT_TEAM_ID`:

```typescript
const earlyDetection = detectMyTeam();
const detectedTeamId = earlyDetection?.teamId || String(DEFAULT_TEAM_ID);
```

Then pass `myTeamId: detectedTeamId` to `initializeDraft()` instead of `String(DEFAULT_TEAM_ID)`. Update the log message on line 264 to reflect the detected vs fallback status.

**Change 2 — computeMyGridColumn closure (line 282-291):**
The `computeMyGridColumn` function on line 286 compares `entry.teamId === String(DEFAULT_TEAM_ID)`. Change this to use `detectedTeamId` (the variable from Change 1) so the grid column lookup uses the actual detected team ID:

```typescript
if (entry.teamId === detectedTeamId) {
```

Update the log on line 295 similarly.

**Change 3 — detectMyTeam fallback block (lines 299-307):**
When `detectMyTeam()` succeeds in the existing fallback block, also update the store's myTeamId AND update the local `detectedTeamId` variable (declare it with `let` not `const`):

```typescript
if (myTeamDetection) {
  detectedTeamId = myTeamDetection.teamId;
  useDraftStore.getState().setMyTeamId(myTeamDetection.teamId);
  useDraftStore.getState().setRemainingBudget(myTeamDetection.remainingBudget);
  // ... existing gridColumn logic
}
```

**Change 4 — Add periodic re-detection (after the existing 3s retry block ending at line 333):**
Add a second setTimeout at ~5s that attempts `detectMyTeam()` one more time. If it finds a team ID different from what is currently in the store, update it. This handles the case where the `--own` CSS class appears late:

```typescript
setTimeout(() => {
  const lateDetection = detectMyTeam();
  if (lateDetection) {
    const currentState = useDraftStore.getState();
    if (currentState.myTeamId !== lateDetection.teamId) {
      logger.log("[ESPN Draft Assistant] Late team detection updated myTeamId from " + currentState.myTeamId + " to " + lateDetection.teamId);
      currentState.setMyTeamId(lateDetection.teamId);
    }
    if (!myGridColumn && lateDetection.gridColumn) {
      myGridColumn = String(lateDetection.gridColumn);
    }
  }
}, 5000);
```

**Change 5 — Deferred auction re-init (line 892):**
Line 892 already uses `latestState.myTeamId || String(DEFAULT_TEAM_ID)` which is correct -- once we set myTeamId properly via Changes 1-4, this line will pick up the detected value. No change needed here, but verify it reads from the store (it does).

Do NOT modify `draft-config-detector.ts` or `league-defaults.ts` -- they are fine as-is.
  </action>
  <verify>
Run TypeScript compilation to verify no type errors:
```bash
cd packages/extension && npx tsc --noEmit 2>&1 | head -20
```

Grep to confirm DEFAULT_TEAM_ID is no longer used directly in initializeDraft or computeMyGridColumn:
```bash
grep -n "DEFAULT_TEAM_ID" packages/extension/entrypoints/content.tsx
```
Expected: DEFAULT_TEAM_ID should only appear in the fallback expression (`earlyDetection?.teamId || String(DEFAULT_TEAM_ID)`) and the line 892 deferred re-init, NOT in the `computeMyGridColumn` closure or `initializeDraft` call directly.

Confirm `setMyTeamId` is called with detection results:
```bash
grep -n "setMyTeamId" packages/extension/entrypoints/content.tsx
```
Expected: At least 2 calls -- one in the fallback detection block, one in the late re-detection timeout.
  </verify>
  <done>
- `initializeDraft()` receives detected team ID from `detectMyTeam()` when available, falls back to DEFAULT_TEAM_ID only when detection returns null
- `computeMyGridColumn` uses detected team ID for grid column lookup
- `setMyTeamId()` is called on the store whenever detection succeeds (initial, fallback, and late re-detection)
- Late re-detection at 5s catches cases where `--own` class appears after initial load
- TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
1. TypeScript compiles: `cd packages/extension && npx tsc --noEmit`
2. No direct DEFAULT_TEAM_ID usage in initializeDraft or computeMyGridColumn
3. setMyTeamId called in at least 2 places (fallback + late detection)
4. detectMyTeam() called at least 3 times (early, fallback at ~line 299, late at 5s)
</verification>

<success_criteria>
- Practice drafts: Extension detects arbitrary team ID from DOM instead of assuming team 13
- Real league drafts: Falls back gracefully to DEFAULT_TEAM_ID when detection fails
- Grid column mapping uses detected team ID, not hardcoded value
- No regression in existing draft functionality
</success_criteria>

<output>
After completion, create `.planning/quick/92-detect-myteamid-from-espn-draft-dom-inst/92-SUMMARY.md`
</output>
