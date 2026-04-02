---
phase: quick
plan: 260401-uyx
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/backend/src/api/recommendations.ts
  - packages/frontend/src/app/leagues/[id]/waivers/page.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "Free agents table shows a PL (PitcherList) tier column for SPs when pitcher stats are visible"
    - "PL column is sortable by tier priority (Auto-Start > Probably Start > Questionable Start > Do Not Start)"
    - "Non-pitcher rows and unmatched SPs display '--' in the PL column without errors"
    - "Scrape failure gracefully returns null for all PL values without breaking the table"
  artifacts:
    - path: "packages/backend/src/api/recommendations.ts"
      provides: "pitcherlistVerdict + pitcherlistTier fields on each free agent in /free-agents response"
    - path: "packages/frontend/src/app/leagues/[id]/waivers/page.tsx"
      provides: "plRank + plTier in faRows, sortable PL column in free agents table"
  key_links:
    - from: "recommendations.ts /free-agents handler"
      to: "PitcherlistAdapter.getRankings()"
      via: "normalizePitcherName() map lookup"
    - from: "waivers/page.tsx FreeAgent interface"
      to: "faRows useMemo"
      via: "plRank numeric priority and plTier display string"
---

<objective>
Add a PitcherList tier column ("PL") to the free agents table in the manual waiver eval view, showing each SP's weekly start/sit tier from PitcherList (e.g. "Auto-Start", "Probably Start", "Questionable Start", "Do Not Start").

Purpose: Gives managers a quick pitcher quality signal alongside projections without leaving the waiver page.
Output: Backend enriches /free-agents with pitcherlist fields; frontend renders a sortable PL column in the pitcher stat section of the free agents table only.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

Key interfaces from existing code:

```typescript
// packages/backend/src/adapters/pitcherlist.ts
export function normalizePitcherName(name: string): string // strips diacritics + non-alpha, lowercases
export class PitcherlistAdapter {
  getRankings(): Promise<ExternalRankingEntry[]>
}

// ExternalRankingEntry (from shared/types.ts)
interface ExternalRankingEntry {
  playerName: string;
  verdict: "start" | "lean_start" | "neutral" | "lean_sit" | "sit";
  tier?: string; // "Auto-Start" | "Probably Start" | "Questionable Start" | "Do Not Start"
  source: string;
  sourceUrl: string;
  articleTitle: string;
  scrapedAt: string;
}

// packages/frontend/src/app/leagues/[id]/waivers/page.tsx — FreeAgent interface (lines 37-51)
interface FreeAgent {
  playerId: number;
  playerName: string;
  positions: string[];
  pctOwned: number;
  pctStarted: number;
  projections: Record<string, number> | null;
  // pitcherlistVerdict and pitcherlistTier will be added
}

// faRows shape (lines 314-341) — computed in useMemo from freeAgentsData.freeAgents
// showPitcherStats = positionFilter[0] is SP or RP
// showAllStats = positionFilter is empty
// renderStatHeaders / renderStatCells use showPitcherStats || showAllStats for pitcher columns
```
</context>

<tasks>

<task type="auto">
  <name>Task 1: Enrich /free-agents response with PitcherList tier data</name>
  <files>packages/backend/src/api/recommendations.ts</files>
  <action>
In the `/api/leagues/:leagueId/free-agents` handler, after building `enriched`, add PitcherList tier data:

1. Import `PitcherlistAdapter` and `normalizePitcherName` at the top of the file:
   ```typescript
   import { PitcherlistAdapter, normalizePitcherName } from "../adapters/pitcherlist.js";
   ```

2. Before building `enriched`, instantiate the adapter and fetch rankings:
   ```typescript
   const pitcherlistAdapter = new PitcherlistAdapter(request.log);
   const plRankings = await pitcherlistAdapter.getRankings().catch(() => []);
   const plMap = new Map(
     plRankings.map((entry) => [normalizePitcherName(entry.playerName), entry])
   );
   ```

3. In the `enriched` map, add two new fields after `pctStarted`:
   ```typescript
   const plEntry = plMap.get(normalizePitcherName(fa.name));
   pitcherlistVerdict: plEntry?.verdict ?? null,
   pitcherlistTier: plEntry?.tier ?? null,
   ```

Graceful degradation: `.catch(() => [])` on getRankings() ensures scrape failures return empty map, setting all pl fields to null. The existing `return { freeAgents: [], snapshotDate: date ?? null }` early-exit guard remains before the enrichment block so it never reaches the PL call when there are no free agents.
  </action>
  <verify>
    <automated>cd /Users/jay-work/Code/espn-agent && pnpm --filter backend tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>Backend compiles without errors; /free-agents response includes pitcherlistVerdict and pitcherlistTier fields on each free agent object (null for non-SPs and unmatched names).</done>
</task>

<task type="auto">
  <name>Task 2: Add sortable PL column to free agents table</name>
  <files>packages/frontend/src/app/leagues/[id]/waivers/page.tsx</files>
  <action>
Three changes to waivers/page.tsx:

**1. Extend FreeAgent interface** (around line 37) — add two optional fields:
```typescript
pitcherlistVerdict: string | null;
pitcherlistTier: string | null;
```

**2. Extend faRows useMemo** (around line 314) — add plRank and plTier after WHIP:
```typescript
const VERDICT_PRIORITY: Record<string, number> = {
  start: 4,
  lean_start: 3,
  neutral: 2,
  lean_sit: 1,
  sit: 0,
};
// Inside the map:
plTier: pitcher ? (p.pitcherlistTier ?? null) : null,
plRank: pitcher ? (p.pitcherlistVerdict != null ? (VERDICT_PRIORITY[p.pitcherlistVerdict] ?? -1) : -1) : null,
```
Place the VERDICT_PRIORITY constant outside the useMemo (module-level constant above the component or at the top of the helpers section).

**3. Add PL column header and cell** to renderStatHeaders and renderStatCells:

In `renderStatHeaders`, inside the `if (showPitcherStats || showAllStats)` block, add as the FIRST pitcher column (before W):
```tsx
<SortHeader key="plRank" label="PL" sortKey="plRank" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />,
```

In `renderStatCells`, inside the `if (showPitcherStats || showAllStats)` block, add as the first pitcher cell (before W):
```tsx
<td key="plRank" className="px-2 py-2 text-data whitespace-nowrap">
  {row._isPitcher && row.plTier
    ? <span className={cn(
        "text-xs font-medium px-1.5 py-0.5 rounded",
        row.plRank === 4 ? "bg-positive-light dark:bg-positive-dark-bg/30 text-positive" :
        row.plRank === 3 ? "bg-shell-accent/10 text-shell-accent" :
        row.plRank === 2 ? "bg-warning-light dark:bg-warning-dark-bg/20 text-warning" :
        "bg-negative-light dark:bg-negative-dark-bg/20 text-negative"
      )}>{row.plTier}</span>
    : <span className="text-content-tertiary dark:text-shell-muted">--</span>}
</td>,
```

Do NOT add the PL column to the Roster (drop) table — PitcherList rankings are for add candidates only. The renderStatCells / renderStatHeaders functions are shared between both tables, so add a `forFreeAgents?: boolean` parameter to renderStatHeaders/renderStatCells and only render the PL column when `forFreeAgents` is true. Pass `forFreeAgents={true}` only to the free agents table's calls.

Alternatively (simpler): move the PL column outside of renderStatHeaders/renderStatCells — add it as a standalone `<th>` and `<td>` directly in the free agents table JSX (lines 731-763), after the "% Start" column, guarded by `(showPitcherStats || showAllStats)`. This avoids modifying shared helpers. Use this approach.
  </action>
  <verify>
    <automated>cd /Users/jay-work/Code/espn-agent && pnpm --filter frontend tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>Frontend compiles without TypeScript errors. Free agents table shows a PL column when SP/RP/All position filter is active. Column is sortable by clicking the "PL" header. Non-pitcher rows show "--". Roster (drop) table is unchanged.</done>
</task>

</tasks>

<verification>
1. `pnpm --filter backend tsc --noEmit` — zero errors
2. `pnpm --filter frontend tsc --noEmit` — zero errors
3. In browser: waivers page manual mode, set position filter to "SP" — PL column appears between "% Start" and "W" columns
4. Rows with PitcherList match show a colored tier badge (green=Auto-Start, blue=Probably Start, amber=Questionable Start, red=Do Not Start/Sit)
5. Clicking "PL" header sorts SP rows by tier priority descending (Auto-Starts first)
6. Non-SP rows show "--" in PL column when "All Positions" filter is active
7. Roster (drop) table has no PL column
</verification>

<success_criteria>
- /free-agents API response includes pitcherlistVerdict and pitcherlistTier on each free agent
- PL column visible in free agents table when pitcher stats are shown (SP filter or All)
- PL column sortable with Auto-Start > Probably Start > Questionable Start > Do Not Start priority
- "--" shown gracefully for non-SPs, unmatched SPs, and on scrape failure
- Roster table unchanged
- Both packages compile with zero TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/260401-uyx-add-pitcherlist-sp-ranking-column-to-wai/260401-uyx-SUMMARY.md`
</output>
