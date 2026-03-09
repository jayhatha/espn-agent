---
phase: quick-83
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/engine/types.ts
  - packages/extension/lib/engine/index.ts
  - packages/extension/lib/draft-state.ts
  - packages/extension/lib/use-draft-engine.ts
  - packages/extension/components/IdealRosterPanel.tsx
autonomous: true
requirements: [TARGETS-01]

must_haves:
  truths:
    - "Ideal roster panel shows per-category progress bars with projected totals vs winning targets"
    - "Category targets are persisted in Zustand store across page reloads"
    - "Rate stats (OPS, ERA, WHIP) are computed from components, not averaged"
    - "Counting stats (R, HR, RBI, SB, K, W, SV) are summed directly from FG projections"
  artifacts:
    - path: "packages/extension/lib/engine/types.ts"
      provides: "CategoryProgress type and categoryTargets input field"
      contains: "CategoryProgress"
    - path: "packages/extension/lib/engine/index.ts"
      provides: "Category progress computation in computeIdealRoster"
      contains: "categoryProgress"
    - path: "packages/extension/lib/draft-state.ts"
      provides: "categoryTargets state field with defaults and setter"
      contains: "categoryTargets"
    - path: "packages/extension/components/IdealRosterPanel.tsx"
      provides: "Progress bar UI for each category target"
      contains: "categoryProgress"
  key_links:
    - from: "packages/extension/lib/draft-state.ts"
      to: "packages/extension/lib/use-draft-engine.ts"
      via: "categoryTargets passed into DraftEngineInput"
      pattern: "categoryTargets"
    - from: "packages/extension/lib/engine/index.ts"
      to: "packages/extension/components/IdealRosterPanel.tsx"
      via: "categoryProgress array on IdealRosterSignal"
      pattern: "categoryProgress"
---

<objective>
Add winning category targets to the ideal roster computation and display progress bars showing how close the ideal roster's projected stats are to historical winning values.

Purpose: Let the user see at a glance which categories their ideal roster would hit winning thresholds in, and which categories are falling short -- informing draft strategy adjustments.

Output: Category progress bars in the IdealRosterPanel, persisted targets in Zustand store, component-based rate stat projection.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/lib/engine/types.ts
@packages/extension/lib/engine/index.ts
@packages/extension/lib/draft-state.ts
@packages/extension/lib/use-draft-engine.ts
@packages/extension/components/IdealRosterPanel.tsx
@packages/extension/components/EngineInsights.tsx
@packages/extension/lib/fangraphs-data.ts
@packages/shared/src/formulas.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add types, store field, and engine computation for category progress</name>
  <files>
    packages/extension/lib/engine/types.ts
    packages/extension/lib/draft-state.ts
    packages/extension/lib/use-draft-engine.ts
    packages/extension/lib/engine/index.ts
  </files>
  <action>
**types.ts:**
1. Add `CategoryProgress` interface after `IdealRosterSignal`:
```ts
export interface CategoryProgress {
  statKey: string;           // e.g. "HR", "OPS", "ERA"
  label: string;             // Display name from Category
  target: number;            // Winning value from targets
  projected: number;         // Sum/rate from ideal roster players
  percent: number;           // projected/target * 100 (capped at 150 for display)
  direction: "HIGHER_BETTER" | "LOWER_BETTER";
}
```

2. Add `categoryTargets?: Record<string, number>` to `DraftEngineInput` (after `pitcherHitterSplit`).

3. Add `categoryProgress?: CategoryProgress[]` to `IdealRosterSignal` (after `computeTimeMs`).

**draft-state.ts:**
1. Add a module-level constant `DEFAULT_CATEGORY_TARGETS`:
```ts
export const DEFAULT_CATEGORY_TARGETS: Record<string, number> = {
  R: 1188, HR: 348, RBI: 1132, SB: 247, OPS: 0.789,
  K: 1619, SO: 1619, W: 107, SV: 132, ERA: 3.36, WHIP: 1.11,
};
```
(Include both `K` and `SO` since the engine may use either stat key.)

2. Add `categoryTargets: Record<string, number>` to `DraftState` interface, default to `DEFAULT_CATEGORY_TARGETS`.

3. Add `setCategoryTargets: (targets: Record<string, number>) => void` action.

4. Add `categoryTargets` to the `partialize` config so it persists across reloads.

5. Bump `version` from 3 to 4 in persist config, and add a migration case `if (version < 4)` that sets `categoryTargets: DEFAULT_CATEGORY_TARGETS` (pass through existing state).

**use-draft-engine.ts:**
1. Destructure `categoryTargets` from `useDraftStore()`.
2. Pass `categoryTargets` into the `computeDraftEngine` input object.
3. Add `categoryTargets` to the `useMemo` dependency array.

**engine/index.ts — computeIdealRoster function:**
After building the combined `players` array (line ~564) and before the return statement (line ~576):

1. If `input.categoryTargets` is provided and `input.leagueCategories.length > 0`:
   - Ensure `cachedHitterProjMap` and `cachedPitcherProjMap` are built (they are module-level caches, already populated by the time `computeIdealRoster` runs since `computeDraftEngine` builds them earlier at line ~665).
   - Sum components across ALL players in the `players` array (both drafted and optimizer picks). For each player, look up by `normalizeName(player.name)` in `cachedHitterProjMap` and `cachedPitcherProjMap`.
   - Accumulate hitter components: `AB, H, BB, HBP, SF, TB` and counting stats `R, HR, RBI, SB`.
   - Accumulate pitcher components: `IP, ER, HA, BBA` and counting stats `W, SV, SO`.
   - For each category in `input.leagueCategories` that has a matching key in `input.categoryTargets`:
     - COUNTING stats: use summed value directly.
     - RATE stats: use `calculateFinalRate(cat.formula_id, {}, components)` where `components` is the merged hitter+pitcher component totals.
     - Compute `percent`: for `HIGHER_BETTER`, `(projected / target) * 100`. For `LOWER_BETTER`, `(target / projected) * 100` (lower actual is better, so ratio inverts).
     - Cap percent at 150 for display sanity.
   - Attach the resulting `CategoryProgress[]` array to the return object as `categoryProgress`.

Import `normalizeName` from `./archetype` (already imported at line 6). Import `calculateFinalRate` from `@espn-fantasy/shared` (already imported at line 12).
  </action>
  <verify>
Run `cd packages/extension && npx tsc --noEmit` to verify no type errors. The new fields are optional so existing callsites remain valid.
  </verify>
  <done>
    - `CategoryProgress` type exists in types.ts
    - `categoryTargets` field exists in DraftEngineInput and DraftState
    - `categoryProgress` computed in computeIdealRoster using component-based math for rate stats
    - Store persists categoryTargets with migration from v3 to v4
    - use-draft-engine passes categoryTargets through to engine
  </done>
</task>

<task type="auto">
  <name>Task 2: Display category progress bars in IdealRosterPanel</name>
  <files>
    packages/extension/components/IdealRosterPanel.tsx
  </files>
  <action>
Add a "Category Targets" section to `IdealRosterPanel.tsx` below the existing roster list and above the unfilled slots notice.

1. Import `CategoryProgress` type from `../lib/engine/types`.

2. After the `players.map(...)` block (around line 87), add a category progress section that only renders when `idealRoster.categoryProgress` exists and has entries:

```tsx
{idealRoster.categoryProgress && idealRoster.categoryProgress.length > 0 && (
  <div className="mt-3 border-t border-surface-tertiary pt-2">
    <div className="text-body-xs font-semibold text-content mb-1.5">Category Targets</div>
    <div className="space-y-1.5">
      {idealRoster.categoryProgress.map((cat) => {
        // Color logic: green >= 100%, yellow 80-99%, red < 80%
        // For LOWER_BETTER, the percent already accounts for inversion
        const pct = Math.min(cat.percent, 100);
        const barColor = cat.percent >= 100
          ? "bg-success"
          : cat.percent >= 80
          ? "bg-warning"
          : "bg-error";

        // Format the projected value: rate stats get 3 decimal places, counting stats get whole numbers
        const isRate = cat.direction === "LOWER_BETTER" || cat.statKey === "OPS" || cat.statKey === "AVG" || cat.statKey === "OBP" || cat.statKey === "SLG";
        const projectedDisplay = isRate ? cat.projected.toFixed(3) : Math.round(cat.projected).toString();
        const targetDisplay = isRate ? cat.target.toFixed(3) : Math.round(cat.target).toString();

        return (
          <div key={cat.statKey}>
            <div className="flex items-center justify-between text-body-xs mb-0.5">
              <span className="text-content-secondary">{cat.statKey}</span>
              <span className="text-content-secondary">
                {projectedDisplay} / {targetDisplay}
                <span className={`ml-1 font-semibold ${cat.percent >= 100 ? "text-success" : cat.percent >= 80 ? "text-warning" : "text-error"}`}>
                  {Math.round(cat.percent)}%
                </span>
              </span>
            </div>
            <div className="h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${barColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  </div>
)}
```

3. Use Tailwind classes consistent with the existing panel design tokens (bg-surface, text-content, text-content-secondary, bg-surface-tertiary, etc.). Use `bg-success`, `bg-warning`, `bg-error` for progress bar fill colors (these follow the extension's existing design token conventions).
  </action>
  <verify>
Run `cd packages/extension && npx tsc --noEmit` to verify no type errors. Visually: the category progress section should appear inside the Ideal Roster `<details>` accordion when expanded, showing one progress bar per category with label, projected/target numbers, percentage, and colored fill.
  </verify>
  <done>
    - IdealRosterPanel renders progress bars for each category in categoryProgress
    - Bars are color-coded: green (>=100%), yellow (80-99%), red (<80%)
    - Rate stats display with 3 decimal places, counting stats as integers
    - Section only renders when categoryProgress data exists
  </done>
</task>

</tasks>

<verification>
1. `cd packages/extension && npx tsc --noEmit` passes with no errors
2. Build succeeds: `cd packages/extension && pnpm build` (or `npx wxt build`)
3. New types are properly exported and consumed across the module boundary
4. categoryTargets defaults are set and persist via Zustand store v4 migration
</verification>

<success_criteria>
- IdealRosterPanel shows progress bars for R, HR, RBI, SB, OPS, K, W, SV, ERA, WHIP when ideal roster is computed
- Rate stats (OPS, ERA, WHIP) are calculated from component sums, not averaged
- Counting stats are summed directly from FG projections
- Category targets persist in chrome.storage.local via Zustand persist middleware
- No TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/83-add-winning-category-targets-to-ideal-ro/83-SUMMARY.md`
</output>
