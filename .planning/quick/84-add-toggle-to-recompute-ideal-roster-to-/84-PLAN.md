---
phase: "84"
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/draft-state.ts
  - packages/extension/lib/engine/types.ts
  - packages/extension/lib/use-draft-engine.ts
  - packages/extension/lib/engine/index.ts
  - packages/extension/components/IdealRosterPanel.tsx
autonomous: true
requirements: [IDEAL-ROSTER-TARGETS]
must_haves:
  truths:
    - "User can toggle 'Optimize for Targets' in the Ideal Roster panel"
    - "When toggled ON, ideal roster optimizer biases toward players filling category deficits"
    - "When toggled OFF, optimizer uses pure SGP efficiency (existing behavior)"
    - "Toggle state persists across page reloads"
    - "Category progress bars reflect the target-optimized roster when toggle is ON"
  artifacts:
    - path: "packages/extension/lib/draft-state.ts"
      provides: "optimizeForTargets boolean state + action + persistence"
      contains: "optimizeForTargets"
    - path: "packages/extension/lib/engine/types.ts"
      provides: "optimizeForTargets field on DraftEngineInput"
      contains: "optimizeForTargets"
    - path: "packages/extension/lib/engine/index.ts"
      provides: "2-pass deficit-boosted SGP logic in computeIdealRoster"
      contains: "optimizeForTargets"
    - path: "packages/extension/components/IdealRosterPanel.tsx"
      provides: "Toggle button in panel summary bar"
      contains: "optimizeForTargets"
  key_links:
    - from: "packages/extension/lib/draft-state.ts"
      to: "packages/extension/lib/use-draft-engine.ts"
      via: "useDraftStore().optimizeForTargets read"
      pattern: "optimizeForTargets"
    - from: "packages/extension/lib/use-draft-engine.ts"
      to: "packages/extension/lib/engine/index.ts"
      via: "DraftEngineInput.optimizeForTargets passed to computeDraftEngine"
      pattern: "optimizeForTargets"
    - from: "packages/extension/lib/engine/index.ts"
      to: "packages/extension/lib/engine/roster-optimizer.ts"
      via: "boosted SGP values passed to optimizeRoster when toggle is ON"
      pattern: "optimizeRoster.*boostedSgp"
---

<objective>
Add an "Optimize for Targets" toggle to the Ideal Roster panel that makes the roster optimizer bias player selection toward closing category deficits relative to winning targets.

Purpose: Currently the ideal roster optimizer uses pure SGP efficiency, which maximizes total SGP but may leave category holes. When chasing specific winning targets, users want the optimizer to prefer players who fill deficit categories even if they are slightly less SGP-efficient overall.

Output: Toggle in IdealRosterPanel summary bar, 2-pass deficit-boost logic in computeIdealRoster, persisted toggle state in Zustand store.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/lib/draft-state.ts
@packages/extension/lib/engine/types.ts
@packages/extension/lib/engine/index.ts
@packages/extension/lib/engine/roster-optimizer.ts
@packages/extension/lib/engine/sgp.ts
@packages/extension/lib/use-draft-engine.ts
@packages/extension/components/IdealRosterPanel.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add optimizeForTargets to state, types, and hook</name>
  <files>
    packages/extension/lib/draft-state.ts
    packages/extension/lib/engine/types.ts
    packages/extension/lib/use-draft-engine.ts
  </files>
  <action>
1. In `packages/extension/lib/engine/types.ts` — add `optimizeForTargets?: boolean` to the `DraftEngineInput` interface, after the existing `categoryTargets` field.

2. In `packages/extension/lib/draft-state.ts`:
   - Add `optimizeForTargets: boolean` to the `DraftState` interface (in the state fields section, near `categoryTargets`)
   - Add `setOptimizeForTargets: (enabled: boolean) => void` to the actions section of the interface
   - Set initial value `optimizeForTargets: false` in the store defaults
   - Add the action: `setOptimizeForTargets: (enabled) => set({ optimizeForTargets: enabled })`
   - Add `optimizeForTargets: state.optimizeForTargets` to the `partialize` function (in the "User preferences" section)
   - Bump persist version from 4 to 5
   - Add a migration case `if (version < 5)` that spreads existing state and adds `optimizeForTargets: false` as default. Ensure it also handles the Map deserialization like existing migrations.

3. In `packages/extension/lib/use-draft-engine.ts`:
   - Destructure `optimizeForTargets` from `useDraftStore()` (add it after `categoryTargets`)
   - Pass `optimizeForTargets` into the `computeDraftEngine` input object (after `categoryTargets`)
   - Add `optimizeForTargets` to the `useMemo` dependency array (after `categoryTargets`)
  </action>
  <verify>Run `cd packages/extension && npx tsc --noEmit` — no type errors.</verify>
  <done>optimizeForTargets boolean flows from Zustand store through use-draft-engine hook into DraftEngineInput, persists across reloads, defaults to false.</done>
</task>

<task type="auto">
  <name>Task 2: Implement deficit-boost logic in computeIdealRoster</name>
  <files>
    packages/extension/lib/engine/index.ts
  </files>
  <action>
Modify `computeIdealRoster` in `packages/extension/lib/engine/index.ts` to implement a 2-pass deficit-boosted optimization when `input.optimizeForTargets` is true.

**When `input.optimizeForTargets` is false (or undefined):** Existing behavior unchanged — use `adjustedSgpValues` directly.

**When `input.optimizeForTargets` is true:**

After computing `adjustedSgpValues` (line ~444-449) and before building `playersForOptimizer` / calling `optimizeRoster`, insert the following logic:

1. **Compute category deficits from drafted players' projections.** Using `cachedHitterProjMap` and `cachedPitcherProjMap` (already module-level), sum the projected stats of `input.myRoster` players to get current drafted totals per category. Compare each to `input.categoryTargets` to compute a deficit ratio per category:
   - For HIGHER_BETTER: `deficitRatio = Math.max(0, 1 - (draftedTotal / target))` — 0 when at/above target, 1 when at zero
   - For LOWER_BETTER: skip deficit boost (lower is already better — no "deficit" concept applies in the same way, and boosting pitchers for ERA would be counterproductive)
   - Only process categories present in both `input.leagueCategories` and `input.categoryTargets`

2. **Identify which categories have meaningful deficits.** Filter to categories where `deficitRatio > 0.1` (more than 10% below target). If no categories have deficits, skip boosting entirely (fall through to existing behavior).

3. **Compute per-player deficit contribution scores.** For each player in `allPlayers`, compute how much they contribute to deficit categories using `cachedHitterProjMap`/`cachedPitcherProjMap`:
   - For each deficit category, look up the player's projected stat value
   - Normalize by the category's standard deviation from `cachedSGPVectors.categoryStats[statKey].std` (same SGP denominator used in base SGP computation)
   - Weight by the category's `deficitRatio` — bigger deficits get more boost
   - Sum across all deficit categories to get a single `deficitScore` per player

4. **Boost SGP values.** Create `boostedSgpValues` array:
   ```
   boostedSgpValues[i] = adjustedSgpValues[i] * (1 + deficitBoostFactor * normalizedDeficitScore)
   ```
   Where:
   - `deficitBoostFactor = 0.5` (constant — 50% max boost for a player perfectly filling all deficits)
   - `normalizedDeficitScore = deficitScore / maxDeficitScore` across all players (0-1 range)
   - If `maxDeficitScore === 0`, skip boosting

5. **Use `boostedSgpValues` instead of `adjustedSgpValues`** when calling `optimizeRoster` and when assigning `sgpValue` to `optimizerPlayers`.

6. **Update the ideal roster cache key** to include `optimizeForTargets`:
   - In `computeDraftEngine` around line 1238, change the cache key from:
     ```
     `${input.allPicks.length}_${splitValue}_${targetsKey}`
     ```
     to:
     ```
     `${input.allPicks.length}_${splitValue}_${targetsKey}_${input.optimizeForTargets ? '1' : '0'}`
     ```

Important implementation notes:
- Do NOT modify the `adjustedSgpValues` array (it is shared with other engine signals). Create a new array.
- Rate stat categories (ERA, WHIP, OPS, AVG, OBP, SLG) should be handled carefully: for LOWER_BETTER stats (ERA, WHIP), skip deficit boosting. For HIGHER_BETTER rate stats (OPS, AVG, OBP, SLG), deficit boosting is valid but the player's stat contribution is just the raw rate value from their projection (same as what `getPlayerStat` returns).
- The `cachedSGPVectors` variable is available at module scope (populated before `computeIdealRoster` is called).
- The `cachedHitterProjMap` and `cachedPitcherProjMap` variables are available at module scope.
- Guard: if `cachedSGPVectors` is null, or `cachedHitterProjMap`/`cachedPitcherProjMap` are null, skip boosting and fall through to existing behavior.
  </action>
  <verify>Run `cd packages/extension && npx tsc --noEmit` — no type errors. Run `cd packages/extension && npm run build` — builds successfully.</verify>
  <done>When optimizeForTargets is true, computeIdealRoster applies deficit-weighted SGP boosts before calling optimizeRoster, biasing selection toward players who fill category gaps relative to winning targets. When false, behavior is identical to before this change.</done>
</task>

<task type="auto">
  <name>Task 3: Add toggle button to IdealRosterPanel UI</name>
  <files>
    packages/extension/components/IdealRosterPanel.tsx
  </files>
  <action>
Modify `IdealRosterPanel.tsx` to add a toggle button in the panel's summary bar:

1. Import `useDraftStore` from `../lib/draft-state`.

2. Inside the component, read the toggle state and action:
   ```tsx
   const optimizeForTargets = useDraftStore(s => s.optimizeForTargets);
   const setOptimizeForTargets = useDraftStore(s => s.setOptimizeForTargets);
   ```

3. Add a compact toggle button in the `<summary>` element, between the "filled" text and the chevron. Place it as a clickable element that stops propagation (so clicking the toggle doesn't collapse/expand the details):
   ```tsx
   <button
     onClick={(e) => {
       e.preventDefault();
       e.stopPropagation();
       setOptimizeForTargets(!optimizeForTargets);
     }}
     className={`text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0 transition-colors ${
       optimizeForTargets
         ? "bg-accent text-content-inverse"
         : "bg-surface-tertiary text-content-secondary hover:bg-surface-tertiary/80"
     }`}
     title={optimizeForTargets ? "Optimizing for category targets — click to use pure SGP" : "Using pure SGP efficiency — click to optimize for category targets"}
   >
     TGT
   </button>
   ```

4. The button should be placed inside the summary's flex container, after the existing text span and before the chevron span. Ensure proper gap spacing.
  </action>
  <verify>Run `cd packages/extension && npx tsc --noEmit` — no type errors. Run `cd packages/extension && npm run build` — builds successfully.</verify>
  <done>IdealRosterPanel shows a "TGT" toggle button in its summary bar. When active (accent-colored), the ideal roster uses deficit-boosted optimization. When inactive (muted), it uses pure SGP efficiency. Clicking the button toggles the state and triggers engine recomputation via Zustand store update.</done>
</task>

</tasks>

<verification>
1. `cd packages/extension && npx tsc --noEmit` passes
2. `cd packages/extension && npm run build` succeeds
3. Toggle state persists: setting optimizeForTargets to true, reloading, and confirming it remains true in Zustand persisted state
4. Cache key includes optimizeForTargets so toggling triggers recomputation (not stale cached result)
</verification>

<success_criteria>
- IdealRosterPanel shows "TGT" toggle in summary bar
- Toggle ON: ideal roster biases toward players filling category deficits relative to winning targets
- Toggle OFF: ideal roster uses pure SGP efficiency (existing behavior, no regression)
- Toggle persists across page reloads (Zustand persist v5 migration)
- TypeScript compiles without errors
- Extension builds successfully
</success_criteria>

<output>
After completion, create `.planning/quick/84-add-toggle-to-recompute-ideal-roster-to-/84-SUMMARY.md`
</output>
