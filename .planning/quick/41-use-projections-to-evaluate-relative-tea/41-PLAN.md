---
phase: quick-41
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/engine/types.ts
  - packages/extension/lib/engine/league-analysis.ts
  - packages/extension/lib/engine/index.ts
  - packages/extension/components/EngineInsights.tsx
autonomous: true
requirements: [QUICK-41]
must_haves:
  truths:
    - "Each team's projected category totals are computed from FanGraphs data using drafted player name matching"
    - "User sees their rank in each category vs the field (e.g., HR: 3rd of 12)"
    - "High-demand categories where many teams are weak are identified"
    - "Strategic recommendations are surfaced based on relative category position"
    - "League analysis recomputes on every engine cycle and stays under 100ms"
  artifacts:
    - path: "packages/extension/lib/engine/league-analysis.ts"
      provides: "computeLeagueAnalysis pure function"
      exports: ["computeLeagueAnalysis"]
    - path: "packages/extension/lib/engine/types.ts"
      provides: "LeagueAnalysisSignal, TeamCategoryRanking types"
      contains: "LeagueAnalysisSignal"
    - path: "packages/extension/lib/engine/index.ts"
      provides: "leagueAnalysis field in DraftEngineSignals return"
      contains: "computeLeagueAnalysis"
    - path: "packages/extension/components/EngineInsights.tsx"
      provides: "League Analysis collapsible section in sidebar"
      contains: "League Analysis"
  key_links:
    - from: "packages/extension/lib/engine/league-analysis.ts"
      to: "packages/extension/lib/engine/archetype.ts"
      via: "import normalizeName, buildFgPlayerPool"
      pattern: "import.*normalizeName.*from.*archetype"
    - from: "packages/extension/lib/engine/index.ts"
      to: "packages/extension/lib/engine/league-analysis.ts"
      via: "import computeLeagueAnalysis"
      pattern: "import.*computeLeagueAnalysis.*from.*league-analysis"
    - from: "packages/extension/components/EngineInsights.tsx"
      to: "packages/extension/lib/engine/types.ts"
      via: "leagueAnalysis field on DraftEngineSignals"
      pattern: "engineSignals.*leagueAnalysis"
---

<objective>
Add league-wide category analysis to the draft engine that evaluates all teams' projected strengths/weaknesses using FanGraphs data, then surfaces category rankings, demand insights, and opponent-aware strategic recommendations in the extension sidebar.

Purpose: During a live auction draft, knowing where you rank in each category vs the field — and which categories will see bidding wars because many teams are weak — gives a significant strategic edge for allocation decisions.

Output: New `league-analysis.ts` engine module, type additions, engine wiring, and a "League Analysis" sidebar section.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/lib/engine/types.ts
@packages/extension/lib/engine/index.ts
@packages/extension/lib/engine/archetype.ts
@packages/extension/lib/engine/category-gap.ts
@packages/extension/components/EngineInsights.tsx
@packages/extension/lib/fangraphs-data.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create LeagueAnalysisSignal types and league-analysis.ts engine module</name>
  <files>
    packages/extension/lib/engine/types.ts
    packages/extension/lib/engine/league-analysis.ts
  </files>
  <action>
**types.ts additions:**

Add these interfaces after `RosterOptimizationSignal`:

```ts
export interface TeamCategoryRanking {
  category: string;
  myRank: number;          // 1-based rank among all teams (1 = best)
  totalTeams: number;
  myTotal: number;
  leagueMedian: number;
  direction: "HIGHER_BETTER" | "LOWER_BETTER";
}

export interface CategoryDemand {
  category: string;
  weakTeamCount: number;   // Teams below median (potential bidders)
  strongTeamCount: number; // Teams above median (unlikely to bid heavily)
  demandLevel: "high" | "medium" | "low";  // high = many weak teams = bidding wars expected
}

export interface LeagueAnalysisSignal {
  categoryRankings: TeamCategoryRanking[];  // My rank per category vs field
  categoryDemand: CategoryDemand[];         // Market demand per category
  recommendations: string[];                // 2-3 strategic recommendations
  teamsAnalyzed: number;                    // How many teams had enough data
  computeTimeMs: number;
}
```

Add `leagueAnalysis: LeagueAnalysisSignal | null;` to `DraftEngineSignals` (after `optimization`).

**league-analysis.ts:**

Create `packages/extension/lib/engine/league-analysis.ts` as a pure function module (same pattern as category-gap.ts / archetype.ts — no Zustand, no DOM).

```ts
export function computeLeagueAnalysis(
  teamRosters: Map<string, { teamId: string; teamName: string; playerIds: number[] }>,
  allPicks: Array<{ playerId: number; playerName: string; teamId: string }>,
  myTeamId: string | null,
  categories: Category[],
  fgHitters: FgHitterProjection[],
  fgPitchers: FgPitcherProjection[],
): LeagueAnalysisSignal
```

Implementation approach (performance-critical — simple stat summation only, NO greedy fill):

1. Build FG projection lookup maps by normalized name (same approach as archetype.ts lines 53-61):
   - `hitterProjMap: Map<string, FgHitterProjection>` keyed by `normalizeName(name)`
   - `pitcherProjMap: Map<string, FgPitcherProjection>` keyed by `normalizeName(name)`
   - Also build `pitcherNameSet: Set<string>` from pitcher proj map keys to classify hitter vs pitcher

2. For each team in `teamRosters`:
   - Look up that team's drafted players from `allPicks` (filter by teamId)
   - For each drafted player, match to FG projection by `normalizeName(playerName)`
   - Build a `PoolPlayer`-like stats record per player (reuse stat key mapping from archetype.ts lines 73-131)
   - For each category:
     - COUNTING stats: sum the stat directly
     - RATE stats: sum components across all team players, then call `calculateFinalRate(category.formula_id, {}, combinedComponents)` — same pattern as `computeCategoryTotal` in archetype.ts lines 341-363
   - Store results as `teamTotals: Map<string, Record<string, number>>` (teamId -> category stat_key -> total)

3. Skip teams with zero matched players (they have no useful data).

4. For each category, rank all teams with data:
   - HIGHER_BETTER: sort descending (most HR = rank 1)
   - LOWER_BETTER: sort ascending (lowest ERA = rank 1)
   - Find myTeamId's rank
   - Compute median total

5. Compute `CategoryDemand`:
   - `weakTeamCount` = teams below median (for HIGHER_BETTER) or above median (for LOWER_BETTER)
   - `demandLevel`: "high" if weakTeamCount >= 60% of teams, "medium" if >= 40%, else "low"

6. Generate 2-3 recommendations as plain strings:
   - If top-3 rank in a category: "Strong in {cat} (rank {N}) — can deprioritize"
   - If bottom-3 rank: "Weak in {cat} (rank {N}) — target {cat} contributors"
   - If a high-demand category exists where user is also weak: "Expect bidding wars for {cat} — many teams need it and so do you"
   - If a high-demand category exists where user is strong: "Leverage {cat} strength — opponents will overpay in a category you already lead"

7. Track performance with `performance.now()` and return `computeTimeMs`.

IMPORTANT: Import `normalizeName` from `./archetype` (already exported). Import `calculateFinalRate` from `@espn-fantasy/shared`. Import `Category` from `@espn-fantasy/shared`. Import FG types from `../fangraphs-data`.

The stat key mapping for building player stats must match archetype.ts exactly:
- Hitters: HR, R, RBI, SB, AVG, OPS, AB, H, BB, HBP, SF, TB, PA
- Pitchers: W, SV, HLD, ERA, WHIP, K (from SO), SO, IP, HA, ER, BBA, QS, HRA
  </action>
  <verify>
    TypeScript compilation: `cd packages/extension && npx tsc --noEmit 2>&1 | head -20` shows no errors related to league-analysis.ts or types.ts
  </verify>
  <done>
    LeagueAnalysisSignal type exists in types.ts. league-analysis.ts exports computeLeagueAnalysis as a pure function. DraftEngineSignals has leagueAnalysis field.
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire league analysis into engine orchestrator and render in sidebar</name>
  <files>
    packages/extension/lib/engine/index.ts
    packages/extension/components/EngineInsights.tsx
  </files>
  <action>
**index.ts changes:**

1. Add import at top: `import { computeLeagueAnalysis } from "./league-analysis";`
2. Add import for FG data types (already imported: `fgLeaderboardHittersData, fgLeaderboardPitchersData`)
3. In `computeDraftEngine()`, after step 5 (alerts) and before step 6 (roster optimization), add step 5b:

```ts
// 5b. League-wide category analysis
let leagueAnalysis: LeagueAnalysisSignal | null = null;
if (input.leagueCategories.length > 0 && input.teamRosters.size > 0 && input.myTeamId) {
  try {
    leagueAnalysis = computeLeagueAnalysis(
      input.teamRosters,
      input.allPicks,
      input.myTeamId,
      input.leagueCategories,
      fgLeaderboardHittersData,
      fgLeaderboardPitchersData,
    );
  } catch (e) {
    console.warn("[DraftEngine] League analysis failed:", e);
  }
}
```

4. Add `leagueAnalysis` to the return object of `computeDraftEngine()`:
```ts
return {
  inflation,
  scarcity,
  categoryGaps,
  budgetCurve,
  alerts,
  computeTimeMs: Math.round(elapsed * 10) / 10,
  optimization,
  leagueAnalysis,
};
```

5. Add `LeagueAnalysisSignal` to the re-export line at top of file.

**EngineInsights.tsx changes:**

Add a "League Analysis" collapsible `<details>` section after Top Scarcity and before the closing `</div>`. Follow the exact same pattern as existing sections (bg-surface-secondary summary, bg-surface content, border-t border-surface-tertiary on summary). Keep it collapsed by default (no `open` attr on `<details>`).

Destructure `leagueAnalysis` from `engineSignals` alongside existing destructuring.

Section content when `leagueAnalysis` is not null and `teamsAnalyzed > 1`:

1. **Category Rankings grid** — show each category with rank badge:
   - For each item in `leagueAnalysis.categoryRankings`:
   - Row: `{category}` left-aligned, rank badge right-aligned
   - Rank badge: `{myRank}/{totalTeams}` with color coding:
     - Top 3: `text-positive` (green)
     - Bottom 3: `text-negative` (red)
     - Middle: `text-content-secondary` (neutral)
   - Show `myTotal` rounded to appropriate precision (0 decimal for counting, 3 for rate)

2. **Category Demand subsection** (only categories with demandLevel "high" or "medium"):
   - Header: "Market Demand" with a divider line (border-t border-surface-tertiary mt-2 pt-2)
   - For each high/medium demand category:
     - `{category}` with demand badge: "HIGH" in `bg-negative-light text-negative` or "MED" in `bg-warning-light text-warning`
     - `{weakTeamCount} of {totalTeams from rankings} teams weak`

3. **Recommendations** (if any exist):
   - Divider line, then each recommendation as a bullet point in `text-body-xs text-content-secondary`
   - Prefix with a simple dash "—"

Guard all rendering with null checks: only show section when `engineSignals.leagueAnalysis != null && engineSignals.leagueAnalysis.teamsAnalyzed > 1`.
  </action>
  <verify>
    TypeScript compilation: `cd packages/extension && npx tsc --noEmit 2>&1 | head -20` shows no errors. Extension builds: `cd packages/extension && pnpm build 2>&1 | tail -5` succeeds.
  </verify>
  <done>
    computeLeagueAnalysis is called in computeDraftEngine and result appears on DraftEngineSignals.leagueAnalysis. EngineInsights shows "League Analysis" section with category rankings, market demand, and strategic recommendations. Extension builds without errors.
  </done>
</task>

</tasks>

<verification>
1. `cd packages/extension && npx tsc --noEmit` — no type errors
2. `cd packages/extension && pnpm build` — extension builds successfully
3. Verify league-analysis.ts has no Zustand imports, no DOM access (pure function)
4. Verify DraftEngineSignals.leagueAnalysis is typed as LeagueAnalysisSignal | null
5. Verify EngineInsights renders the League Analysis section conditionally
</verification>

<success_criteria>
- New league-analysis.ts engine module computes per-team projected category totals from FanGraphs data
- Each team's players matched via normalizeName against FG projection maps
- Category rankings show user's position vs field for each scoring category
- Category demand identifies where bidding wars are likely
- 2-3 strategic recommendations generated based on relative position
- Section renders in sidebar as collapsible details element, collapsed by default
- All computation is pure (no store reads, no DOM) and performs simple stat summation (no greedy fill)
- Extension compiles and builds cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/41-use-projections-to-evaluate-relative-tea/41-SUMMARY.md`
</output>
