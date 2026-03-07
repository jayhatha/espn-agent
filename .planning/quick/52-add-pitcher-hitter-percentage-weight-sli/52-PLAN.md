---
phase: "52"
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/draft-state.ts
  - packages/extension/lib/engine/types.ts
  - packages/extension/lib/engine/index.ts
  - packages/extension/lib/use-draft-engine.ts
  - packages/extension/components/DraftSidebar.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "User can adjust a slider from 0-100 controlling pitcher/hitter budget allocation preference"
    - "Moving the slider changes which players the optimizer favors in ideal roster and shopping list"
    - "Slider value persists across page reloads"
    - "Default slider value is 65 (65% hitting, 35% pitching)"
  artifacts:
    - path: "packages/extension/lib/draft-state.ts"
      provides: "pitcherHitterSplit state with setter, persisted"
      contains: "pitcherHitterSplit"
    - path: "packages/extension/lib/engine/types.ts"
      provides: "pitcherHitterSplit field on DraftEngineInput"
      contains: "pitcherHitterSplit"
    - path: "packages/extension/lib/engine/index.ts"
      provides: "SGP multiplier logic based on split value"
      contains: "pitcherHitterSplit"
    - path: "packages/extension/components/DraftSidebar.tsx"
      provides: "Slider UI for pitcher/hitter split"
      contains: "pitcherHitterSplit"
  key_links:
    - from: "packages/extension/components/DraftSidebar.tsx"
      to: "packages/extension/lib/draft-state.ts"
      via: "useDraftStore pitcherHitterSplit + setPitcherHitterSplit"
      pattern: "setPitcherHitterSplit"
    - from: "packages/extension/lib/use-draft-engine.ts"
      to: "packages/extension/lib/engine/index.ts"
      via: "pitcherHitterSplit passed through DraftEngineInput"
      pattern: "pitcherHitterSplit"
    - from: "packages/extension/lib/engine/index.ts"
      to: "packages/extension/lib/engine/roster-optimizer.ts"
      via: "SGP values multiplied by split factor before optimizer call"
      pattern: "split.*50"
---

<objective>
Add a pitcher/hitter percentage weight slider that controls budget allocation preference between pitchers and hitters. The slider value (0-100, default 65 = 65% hitting) applies as an SGP multiplier in the optimizer: hitters get `split/50` boost, pitchers get `(100-split)/50` boost. At 50/50 both get 1.0x; at 65/35 hitters get 1.3x and pitchers get 0.7x.

Purpose: Let users express a draft philosophy (e.g., "I want to spend more on hitting") and have the optimizer, ideal roster, shopping list, bid optimizer, and Monte Carlo all reflect that preference.
Output: Working slider UI + engine integration with persisted preference.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/lib/draft-state.ts
@packages/extension/lib/engine/types.ts
@packages/extension/lib/engine/index.ts
@packages/extension/lib/use-draft-engine.ts
@packages/extension/components/DraftSidebar.tsx
@packages/extension/lib/engine/roster-optimizer.ts
@packages/extension/lib/engine/bid-optimizer.ts
@packages/extension/components/EngineInsights.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add pitcherHitterSplit to state, types, and engine logic</name>
  <files>
    packages/extension/lib/draft-state.ts
    packages/extension/lib/engine/types.ts
    packages/extension/lib/engine/index.ts
    packages/extension/lib/use-draft-engine.ts
  </files>
  <action>
    1. **types.ts** — Add `pitcherHitterSplit?: number;` to the `DraftEngineInput` interface, after `espnDomAuctionValues`. Add JSDoc: "Budget allocation preference: 0-100 where value = % allocated to hitting. Default 65. Applied as SGP multiplier: hitters get split/50, pitchers get (100-split)/50."

    2. **draft-state.ts** — Add to DraftState interface:
       - `pitcherHitterSplit: number;` (state field)
       - `setPitcherHitterSplit: (split: number) => void;` (action)

       Add to initial state: `pitcherHitterSplit: 65,`

       Add action: `setPitcherHitterSplit: (split) => set({ pitcherHitterSplit: Math.max(0, Math.min(100, split)) }),`

       Add `pitcherHitterSplit` to the `partialize` function so it persists across reloads (it's a user preference). Do NOT add it to `reset()` — this is a preference, not draft-session data.

    3. **use-draft-engine.ts** — Read `pitcherHitterSplit` from `useDraftStore()` and pass it into the `computeDraftEngine()` call as `pitcherHitterSplit`. Add it to the `useMemo` dependency array.

    4. **engine/index.ts** — In `computeDraftEngine()`, after SGP values are computed (line ~779 where `sgpValuesOpt = cachedSGPVectors.playerSGPs`), apply the pitcher/hitter split multiplier to create `adjustedSgpValuesOpt`:

       ```typescript
       // Apply pitcher/hitter split weighting
       const splitValue = input.pitcherHitterSplit ?? 65;
       const hitterMultiplier = splitValue / 50;      // 65 → 1.3
       const pitcherMultiplier = (100 - splitValue) / 50;  // 65 → 0.7
       const adjustedSgpValuesOpt = sgpValuesOpt.map((sgp, i) => {
         const multiplier = allPlayersOpt[i].isPitcher ? pitcherMultiplier : hitterMultiplier;
         return sgp * multiplier;
       });
       ```

       Then replace `sgpValuesOpt` with `adjustedSgpValuesOpt` in ALL downstream calls:
       - `computeRosterOptimization(...)` — the `sgpValues` parameter (6th arg)
       - `computeIdealRoster(...)` — the `sgpValuesRaw` parameter (2nd arg)
       - Forward simulation calls that use `sgpValuesOpt` (in the simulation section ~line 910+): `simulateFullDraft`, `compareDecisions`, `recommendNomination`

       IMPORTANT: Do NOT modify the cached `sgpValuesOpt` or `cachedSGPVectors.playerSGPs` — those are the base values. The split multiplier is applied on top each time, since the user can change the slider without the SGP cache key changing. Also invalidate the idealRoster cache when the split changes — add `pitcherHitterSplit` to the idealRosterCacheKey (e.g., change from just `allPicks.length` to `${allPicks.length}_${splitValue}`).

       Similarly, update the `bidCacheKey` to include the split value so that bid results recompute when the slider changes: `${input.currentAuctionPlayerId ?? 'none'}_${input.allPicks.length}_${splitValue}`.

       And update `simulationCacheKey` to include split value: `${input.allPicks.length}_${input.currentAuctionPlayerId ?? 'none'}_${splitValue}`.
  </action>
  <verify>
    Run `cd /Users/jay-work/Code/espn-agent && npx tsc --noEmit -p packages/extension/tsconfig.json` — no type errors.
  </verify>
  <done>
    pitcherHitterSplit flows from Zustand store through DraftEngineInput into computeDraftEngine where it multiplies SGP values for all downstream optimizer/simulation consumers. Value persists in chrome.storage.local. Cache keys include split value so changes trigger recomputation.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add pitcher/hitter split slider UI to DraftSidebar</name>
  <files>
    packages/extension/components/DraftSidebar.tsx
  </files>
  <action>
    Add a compact slider control in DraftSidebar.tsx, positioned inside the "Draft Status" section (the `bg-surface-secondary p-4 border-b` div, after the roster count line). Only render when `draftFormat === "auction"`.

    Read `pitcherHitterSplit` and `setPitcherHitterSplit` from `useDraftStore()`.

    UI structure (compact, inline with the status area):
    ```tsx
    {draftFormat === "auction" && (
      <div className="mt-2 pt-2 border-t border-surface-tertiary">
        <div className="flex items-center justify-between text-body-xs mb-1">
          <span className="text-content-secondary">Hit/Pitch Split</span>
          <span className="font-semibold text-content">{pitcherHitterSplit}/{100 - pitcherHitterSplit}</span>
        </div>
        <input
          type="range"
          min={20}
          max={80}
          value={pitcherHitterSplit}
          onChange={(e) => setPitcherHitterSplit(Number(e.target.value))}
          className="w-full h-1.5 bg-surface-tertiary rounded-full appearance-none cursor-pointer accent-accent"
        />
        <div className="flex justify-between text-body-xs text-content-secondary mt-0.5">
          <span>Pitch</span>
          <span>Hit</span>
        </div>
      </div>
    )}
    ```

    Slider range is clamped to 20-80 in the UI (preventing extreme values that would make the optimizer ignore an entire player type). The underlying store still accepts 0-100 from the setter for API flexibility.

    Style notes:
    - Use existing design tokens (text-body-xs, text-content-secondary, bg-surface-tertiary, accent-accent)
    - The `accent-accent` class styles the range thumb/track to match the app's accent color
    - Keep it compact — this is a preference control, not a primary display element
  </action>
  <verify>
    Run `cd /Users/jay-work/Code/espn-agent && npx tsc --noEmit -p packages/extension/tsconfig.json` — no type errors. Visually inspect the slider renders in the Draft Status section during auction mode.
  </verify>
  <done>
    Slider visible in the Draft Status section of the sidebar during auction drafts. Shows "Hit/Pitch Split" label with current values (e.g., "65/35"). Range slider from 20-80 updates the store on change. Label shows "Pitch" on left, "Hit" on right.
  </done>
</task>

</tasks>

<verification>
1. TypeScript compiles without errors: `npx tsc --noEmit -p packages/extension/tsconfig.json`
2. The slider renders in auction mode sidebar with default value 65/35
3. Changing the slider causes engine recomputation (cache keys include split value)
4. At split=50, hitters and pitchers get equal 1.0x multiplier (neutral)
5. At split=65 (default), hitters get 1.3x and pitchers get 0.7x SGP multiplier
6. The slider value persists after page reload (in partialize)
</verification>

<success_criteria>
- pitcherHitterSplit persisted in Zustand store with default 65
- SGP values weighted by split before all optimizer/simulation calls
- Cache keys updated to include split value
- Compact slider UI visible in auction draft sidebar
- No TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/52-add-pitcher-hitter-percentage-weight-sli/52-SUMMARY.md`
</output>
