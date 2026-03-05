---
phase: quick-39
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/draft-config-detector.ts
  - packages/extension/lib/draft-state.ts
  - packages/extension/lib/engine/types.ts
  - packages/extension/lib/engine/index.ts
  - packages/extension/lib/use-draft-engine.ts
  - packages/extension/entrypoints/content.tsx
autonomous: true
requirements: [QUICK-39]

must_haves:
  truths:
    - "Draft engine uses league-specific roster slots detected from ESPN DOM instead of hardcoded defaults"
    - "When DOM detection has not run, engine falls back to DEFAULT_ROSTER_SLOTS"
    - "Detected roster slots are stored in Zustand and persist across reloads"
  artifacts:
    - path: "packages/extension/lib/draft-config-detector.ts"
      provides: "detectRosterSlotsFromPlayersTable() function"
      contains: "players-table"
    - path: "packages/extension/lib/engine/types.ts"
      provides: "rosterSlots field on DraftEngineInput"
      contains: "rosterSlots"
    - path: "packages/extension/lib/engine/index.ts"
      provides: "Fallback logic using input.rosterSlots ?? DEFAULT_ROSTER_SLOTS"
      contains: "input.rosterSlots"
  key_links:
    - from: "packages/extension/entrypoints/content.tsx"
      to: "packages/extension/lib/draft-state.ts"
      via: "setDetectedRosterSlots()"
      pattern: "setDetectedRosterSlots"
    - from: "packages/extension/lib/use-draft-engine.ts"
      to: "packages/extension/lib/engine/index.ts"
      via: "rosterSlots passed in DraftEngineInput"
      pattern: "rosterSlots"
---

<objective>
Detect roster slot configuration from ESPN's players-table DOM and pass dynamic slots into the draft engine, replacing hardcoded DEFAULT_ROSTER_SLOTS.

Purpose: Different ESPN leagues have different roster configurations (some have CI/MI, some have SP/RP split, varying bench sizes). The engine currently assumes a single fixed layout, which produces incorrect scarcity, SGP, and bid calculations for non-standard leagues.

Output: Dynamic roster slot detection from DOM, stored in Zustand, threaded into all engine computations with fallback to current hardcoded defaults.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/lib/draft-config-detector.ts
@packages/extension/lib/draft-state.ts
@packages/extension/lib/engine/types.ts
@packages/extension/lib/engine/index.ts
@packages/extension/lib/use-draft-engine.ts
@packages/extension/entrypoints/content.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: DOM parser, store field, and engine input type</name>
  <files>
    packages/extension/lib/draft-config-detector.ts
    packages/extension/lib/draft-state.ts
    packages/extension/lib/engine/types.ts
  </files>
  <action>
    1. In `packages/extension/lib/draft-config-detector.ts`, add a new exported function `detectRosterSlotsFromPlayersTable()` that:
       - Queries `document.querySelector('.ResponsiveTable.players-table')` (or fallback `.players-table`)
       - Finds all `<tr>` rows in the table body
       - For each row, reads the first `<td>` and looks for a `<div>` with a `title` attribute — the title text is the slot label (e.g., "C", "1B", "2B/SS", "1B/3B", "OF", "UTIL", "P", "BE")
       - Maps ESPN labels to engine slot keys: "2B/SS" -> "MI", "1B/3B" -> "CI", keep all others as-is (C, 1B, 2B, SS, 3B, OF, UTIL, P)
       - Counts occurrences of each mapped slot (e.g., 4 OF rows -> OF: 4, 9 P rows -> P: 9)
       - Excludes "BE" from the active roster slots record but tracks bench count separately
       - Returns `{ rosterSlots: Record<string, number>; benchCount: number } | null` — null if table not found or zero slots detected
       - Logs detection result: `[ESPN Draft Assistant] Roster slots detected from players-table: ${JSON.stringify(rosterSlots)} (bench: ${benchCount})`

    2. In `packages/extension/lib/draft-state.ts`:
       - Add `detectedRosterSlots: Record<string, number> | null` to the DraftState interface (initial value: null)
       - Add `setDetectedRosterSlots: (slots: Record<string, number>) => void` action
       - Implement the action: `setDetectedRosterSlots: (slots) => set({ detectedRosterSlots: slots })`
       - Add `detectedRosterSlots` to the `partialize` function so it persists across reloads
       - Add `detectedRosterSlots` to the `reset` function (reset to null)
       - In `initializeDraft`, do NOT clear `detectedRosterSlots` — it should survive re-initialization since roster config doesn't change mid-draft

    3. In `packages/extension/lib/engine/types.ts`:
       - Add `rosterSlots?: Record<string, number>` to the `DraftEngineInput` interface, right after the existing `rosterSize: number` field
       - Comment: "Detected roster slot breakdown. Falls back to DEFAULT_ROSTER_SLOTS in engine when undefined."
  </action>
  <verify>
    Run `cd /Users/jay-work/Code/espn-agent && npx tsc --noEmit -p packages/extension/tsconfig.json` — no type errors.
  </verify>
  <done>
    - `detectRosterSlotsFromPlayersTable` exported and maps ESPN DOM labels (2B/SS -> MI, 1B/3B -> CI, BE -> benchCount)
    - `detectedRosterSlots` field exists in Zustand store with setter, persisted via partialize
    - `DraftEngineInput.rosterSlots` optional field exists in types
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire detection into content script and engine consumption</name>
  <files>
    packages/extension/lib/engine/index.ts
    packages/extension/lib/use-draft-engine.ts
    packages/extension/entrypoints/content.tsx
  </files>
  <action>
    1. In `packages/extension/lib/engine/index.ts` — replace all 5 references to `DEFAULT_ROSTER_SLOTS` with `input.rosterSlots ?? DEFAULT_ROSTER_SLOTS`:
       - Line ~128: `const defaultTotal = Object.values(DEFAULT_ROSTER_SLOTS)` -> use `activeSlots` variable
       - Line ~143: `buildSGPVectors(allPlayers, input.leagueCategories, DEFAULT_ROSTER_SLOTS, ...)` -> use `activeSlots`
       - Line ~158: `buildOpponentModel(... DEFAULT_ROSTER_SLOTS, ...)` -> use `activeSlots`
       - Line ~196: `const remainingSlots: Record<string, number> = { ...DEFAULT_ROSTER_SLOTS }` -> use `activeSlots`

       Specifically, at the top of `computeRosterOptimization`, add:
       ```typescript
       const activeSlots = input.rosterSlots ?? DEFAULT_ROSTER_SLOTS;
       ```
       Then replace all `DEFAULT_ROSTER_SLOTS` references in that function with `activeSlots`.

       Keep `DEFAULT_ROSTER_SLOTS` as a module-level constant (it's still the fallback).

       Update the `defaultTotal` variable name to `activeTotal` for clarity, and update the warning message to reflect that we're comparing against active (possibly detected) slots.

    2. In `packages/extension/lib/use-draft-engine.ts`:
       - Read `detectedRosterSlots` from `useDraftStore()` alongside existing fields
       - Pass `rosterSlots: detectedRosterSlots ?? undefined` in the `computeDraftEngine()` call
       - Add `detectedRosterSlots` to the `useMemo` dependency array (recompute engine when roster slots are detected for the first time)

    3. In `packages/extension/entrypoints/content.tsx`:
       - Import `detectRosterSlotsFromPlayersTable` from `../lib/draft-config-detector`
       - After the existing league config detection block (around line 121-167), add roster slot detection:
         ```typescript
         // Detect roster slots from players-table DOM (more accurate than settings panel)
         const playersTableSlots = detectRosterSlotsFromPlayersTable();
         if (playersTableSlots) {
           useDraftStore.getState().setDetectedRosterSlots(playersTableSlots.rosterSlots);
         }
         ```
       - Also add a delayed retry (similar to the existing 2-second format detection timeout around line 581) because the players-table may not be rendered at document_idle:
         ```typescript
         // Retry roster slot detection after DOM stabilizes (players-table may load late)
         setTimeout(() => {
           if (!useDraftStore.getState().detectedRosterSlots) {
             const retrySlots = detectRosterSlotsFromPlayersTable();
             if (retrySlots) {
               useDraftStore.getState().setDetectedRosterSlots(retrySlots.rosterSlots);
               console.log("[ESPN Draft Assistant] Roster slots detected on retry");
             }
           }
         }, 3000);
         ```
  </action>
  <verify>
    1. Run `cd /Users/jay-work/Code/espn-agent && npx tsc --noEmit -p packages/extension/tsconfig.json` — no type errors.
    2. Run `cd /Users/jay-work/Code/espn-agent && pnpm --filter extension test -- --run 2>&1 | tail -20` — existing tests pass (engine tests use DraftEngineInput which now has optional rosterSlots, so no breakage).
    3. Grep to confirm no remaining bare `DEFAULT_ROSTER_SLOTS` usage inside `computeRosterOptimization` (only the module-level constant declaration and the fallback in `activeSlots` should reference it):
       `grep -n "DEFAULT_ROSTER_SLOTS" packages/extension/lib/engine/index.ts`
       Should show only the constant declaration (line ~32-43) and the single fallback line `const activeSlots = input.rosterSlots ?? DEFAULT_ROSTER_SLOTS`.
  </verify>
  <done>
    - All engine computations (SGP, opponent model, bid optimizer, remaining slots) use `activeSlots` derived from `input.rosterSlots ?? DEFAULT_ROSTER_SLOTS`
    - `use-draft-engine.ts` reads `detectedRosterSlots` from store and passes into engine
    - `content.tsx` calls `detectRosterSlotsFromPlayersTable()` at page load and on 3-second retry, storing result in Zustand
    - Existing tests pass without modification (rosterSlots is optional, defaults preserved)
  </done>
</task>

</tasks>

<verification>
1. TypeScript compiles without errors: `npx tsc --noEmit -p packages/extension/tsconfig.json`
2. All existing extension tests pass: `pnpm --filter extension test -- --run`
3. `DEFAULT_ROSTER_SLOTS` only appears in module constant and single fallback assignment in engine/index.ts
4. `detectRosterSlotsFromPlayersTable` is exported from draft-config-detector.ts
5. `detectedRosterSlots` persists in Zustand store (check partialize includes it)
</verification>

<success_criteria>
- Draft engine accepts and uses dynamic roster slots from ESPN DOM when available
- Hardcoded DEFAULT_ROSTER_SLOTS serves as fallback when DOM detection fails or hasn't run
- No regression in existing tests (rosterSlots is optional on DraftEngineInput)
- Roster slot detection maps ESPN labels correctly: 2B/SS -> MI, 1B/3B -> CI, BE excluded from active slots
</success_criteria>

<output>
After completion, create `.planning/quick/39-detect-roster-slots-from-espn-dom-player/39-SUMMARY.md`
</output>
