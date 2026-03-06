---
phase: quick-44
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/entrypoints/content.tsx
autonomous: true
requirements: [QUICK-44]

must_haves:
  truths:
    - "Roster count resets to 0 when the draft page is reloaded"
    - "initializeDraft() clears myRoster, allPicks, teamRosters AFTER hydration, so persisted stale state cannot overwrite the reset"
    - "All post-initialization logic (config detection, DOM parsing, observers) still runs correctly after the hydration await"
  artifacts:
    - path: "packages/extension/entrypoints/content.tsx"
      provides: "Hydration-aware draft initialization"
      contains: "onFinishHydration"
  key_links:
    - from: "packages/extension/entrypoints/content.tsx"
      to: "packages/extension/lib/draft-state.ts"
      via: "useDraftStore.persist hydration API"
      pattern: "(hasHydrated|onFinishHydration)"
---

<objective>
Fix roster count not resetting on draft page reload caused by a race condition between Zustand persist async hydration and initializeDraft().

Purpose: When the user reloads the draft page, initializeDraft() clears myRoster to [], but the async chrome.storage.local hydration completes AFTER and the merge() function overwrites with the old persisted state, restoring stale roster data.

Output: content.tsx awaits persist hydration before calling initializeDraft(), ensuring the reset sticks.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/entrypoints/content.tsx
@packages/extension/lib/draft-state.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Await Zustand persist hydration before initializeDraft()</name>
  <files>packages/extension/entrypoints/content.tsx</files>
  <action>
Add a helper function near the top of the `main()` function body (after the league ID parsing, before any store access) that waits for Zustand persist hydration to complete:

```typescript
// Wait for Zustand persist to finish hydrating from chrome.storage.local
// before touching store state. Without this, initializeDraft() clears
// myRoster/allPicks but the async merge() overwrites with stale data.
const waitForHydration = (): Promise<void> => {
  return new Promise<void>((resolve) => {
    if (useDraftStore.persist.hasHydrated()) {
      resolve();
      return;
    }
    const unsub = useDraftStore.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
};
```

Call `await waitForHydration();` BEFORE the first `useDraftStore.getState()` call on line 125 (the `setConfigWarnings` call). This means it should go after the `detectLeagueConfig()` call (which doesn't touch the store) but before any store mutations. Specifically, insert it right before line 125:

```typescript
await waitForHydration();
console.log("[ESPN Draft Assistant] Store hydration complete");
```

This ensures that by the time `initializeDraft()` runs on line 181, hydration has already completed and the merge() has already run. The initializeDraft() call then correctly overwrites the hydrated (stale) state with fresh empty arrays.

Do NOT move initializeDraft() or change its behavior. Do NOT modify draft-state.ts. The fix is purely about ordering: hydrate first, then initialize.
  </action>
  <verify>
1. `cd packages/extension && npx tsc --noEmit` passes without errors
2. `pnpm build` in the extension package succeeds
3. Manual verification: grep content.tsx for `waitForHydration` and `hasHydrated` to confirm the await is present before any `getState()` calls
  </verify>
  <done>
content.tsx awaits Zustand persist hydration before accessing or mutating the draft store. The initializeDraft() reset of myRoster, allPicks, and teamRosters is guaranteed to run AFTER hydration, so the merge() cannot overwrite cleared state with stale persisted data.
  </done>
</task>

</tasks>

<verification>
- TypeScript compilation passes with no errors
- The `await waitForHydration()` call appears before ANY `useDraftStore.getState()` call in content.tsx
- The `initializeDraft()` call remains in its current position (after hydration)
- No changes to draft-state.ts (the persist/merge logic is correct, it was just called in the wrong order)
</verification>

<success_criteria>
- Roster count resets to 0 on page reload instead of showing stale persisted count
- No TypeScript errors introduced
- Extension builds successfully
</success_criteria>

<output>
After completion, create `.planning/quick/44-fix-roster-count-not-resetting-on-draft-/44-01-SUMMARY.md`
</output>
