---
phase: quick-4
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/frontend/src/app/leagues/[id]/moves/page.tsx
autonomous: true
requirements: [QUICK-4]
must_haves:
  truths:
    - "User can select a season from a dropdown and see impact data for that season"
    - "Season selector defaults to the most recent season available"
    - "User can click a Trades tab to see only trade-type moves with trade-specific display"
    - "All existing tabs (leaderboard, draft, timeline) continue to work with season selection"
  artifacts:
    - path: "packages/frontend/src/app/leagues/[id]/moves/page.tsx"
      provides: "Season selector dropdown, Trades tab, season-aware queries"
      contains: "getLeagueSeasons"
  key_links:
    - from: "packages/frontend/src/app/leagues/[id]/moves/page.tsx"
      to: "/api/leagues/:id/seasons"
      via: "api.getLeagueSeasons in useQuery"
      pattern: "api\\.getLeagueSeasons"
    - from: "packages/frontend/src/app/leagues/[id]/moves/page.tsx"
      to: "/api/leagues/:id/teams/:teamId/transaction-impacts"
      via: "season query param from selector"
      pattern: "getTransactionImpacts.*season"
---

<objective>
Add season selector and trades tab to the Move Impact page.

Purpose: Allow users to view move impact data across different seasons and analyze trades specifically in a dedicated tab.
Output: Updated moves page with season dropdown and new "Trades" tab.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/frontend/src/app/leagues/[id]/moves/page.tsx
@packages/frontend/src/lib/api.ts
@packages/frontend/src/app/leagues/[id]/trends/page.tsx (season selector pattern reference)
@packages/frontend/src/components/league/ImpactDetailCard.tsx
@packages/frontend/src/components/league/ImpactBadge.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add season selector dropdown to the team selector bar</name>
  <files>packages/frontend/src/app/leagues/[id]/moves/page.tsx</files>
  <action>
  1. Replace `const [season] = useState(2025)` with `const [season, setSeason] = useState<number | null>(null)`.

  2. Add a useQuery to fetch available seasons (follow the pattern from trends page):
     ```
     const { data: seasonsData } = useQuery({
       queryKey: ["league-seasons", leagueId],
       queryFn: () => api.getLeagueSeasons(leagueId),
       enabled: !!leagueId,
     });
     ```

  3. Add a useEffect to default `season` to the first (most recent) season when seasonsData loads:
     ```
     useEffect(() => {
       if (seasonsData?.seasons?.length && season === null) {
         setSeason(seasonsData.seasons[0]);
       }
     }, [seasonsData, season]);
     ```

  4. In the team selector `<div className="bg-white shadow rounded-lg p-4 mb-6">`, add a season dropdown AFTER the team `<select>` element:
     ```
     <label className="text-sm font-medium text-gray-700">Season:</label>
     <select
       value={season || ""}
       onChange={(e) => setSeason(parseInt(e.target.value, 10))}
       className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
     >
       {seasonsData?.seasons?.map((s: number) => (
         <option key={s} value={s}>{s}</option>
       ))}
     </select>
     ```

  5. Update the `enabled` guards on the transaction-impacts and draft-report queries to also require `!!season` (since season can now be null during loading). The timeline query should pass `season: String(season)` as well.

  6. Ensure the `season` value passed to `api.getTransactionImpacts` and `api.getDraftReport` is the new stateful `season` value (it already uses `season` in the query key and queryFn, so this should work with the renamed state).
  </action>
  <verify>Run `cd /Users/jay-work/Code/espn-agent && pnpm turbo build --filter=frontend` to confirm no TypeScript errors.</verify>
  <done>Season dropdown renders next to team selector, defaults to most recent season, and all queries use the selected season value.</done>
</task>

<task type="auto">
  <name>Task 2: Add Trades tab with trade-filtered view</name>
  <files>packages/frontend/src/app/leagues/[id]/moves/page.tsx</files>
  <action>
  1. Update the `TabView` type to include "trades": `type TabView = "timeline" | "leaderboard" | "draft" | "trades";`

  2. Update the tab navigation array from `["leaderboard", "draft", "timeline"]` to `["leaderboard", "trades", "draft", "timeline"]`.

  3. Update the tab label rendering to include trades:
     ```
     tab === "leaderboard" ? "Move Leaderboard" :
     tab === "trades" ? "Trades" :
     tab === "draft" ? "Draft Report" :
     "Impact Timeline"
     ```

  4. Add the TradesTab render block inside the tab content area, between the leaderboard and draft conditions:
     ```
     {activeTab === "trades" && (
       <TradesTab
         impacts={impacts.filter((m) => m.moveType === "trade")}
         expandedMoveId={expandedMoveId}
         setExpandedMoveId={setExpandedMoveId}
       />
     )}
     ```

  5. Create a `TradesTab` component at the bottom of the file (before or after TimelineTab). It receives trade-filtered impacts (already filtered to moveType === "trade"). The component should:

     a. Show a trade summary header with count and net impact:
        - Total trades count
        - Net trade impact (sum of all trade Shapley/impact values)

     b. Render a table of trades sorted by impact (desc by absolute value). Columns:
        - Date (formatted like leaderboard: "MMM DD")
        - Received (playerGained name + positions)
        - Sent (playerLost name + positions) -- for trades, playerLost is the player traded away
        - Impact (ImpactBadge with Shapley/CI)
        - Top Category (same pattern as leaderboard — best SGP category)

     c. Each row is clickable to expand an ImpactDetailCard (same pattern as LeaderboardTab).

     d. Show empty state "No trades found for this season." when the filtered list is empty.

     The TradesTab is essentially a simplified version of LeaderboardTab without the move type filter buttons (since it's already filtered to trades), styled with purple accents to match the existing `MOVE_TYPE_COLORS.trade` palette.

  Props interface:
  ```typescript
  function TradesTab({
    impacts,
    expandedMoveId,
    setExpandedMoveId,
  }: {
    impacts: MoveImpact[];
    expandedMoveId: number | null;
    setExpandedMoveId: (id: number | null) => void;
  })
  ```
  </action>
  <verify>Run `cd /Users/jay-work/Code/espn-agent && pnpm turbo build --filter=frontend` to confirm no TypeScript errors. Visually inspect that the tab navigation shows 4 tabs.</verify>
  <done>Trades tab appears in nav between "Move Leaderboard" and "Draft Report", shows only trade-type moves sorted by impact, with expandable detail cards and a trade summary header.</done>
</task>

</tasks>

<verification>
- `pnpm turbo build --filter=frontend` passes with zero errors
- Season dropdown appears next to team selector with available seasons
- Changing season re-fetches impact data with new season param
- Four tabs visible: Move Leaderboard, Trades, Draft Report, Impact Timeline
- Trades tab filters to only trade-type moves
- Trades tab shows expandable detail cards on click
- Existing leaderboard/draft/timeline tabs still work correctly
</verification>

<success_criteria>
- Season selector loads seasons from API and defaults to most recent
- All data queries (impacts, draft, timeline) use selected season
- Trades tab renders trade-only moves with summary and detail expansion
- No TypeScript build errors
</success_criteria>

<output>
After completion, create `.planning/quick/4-season-selector-and-historical-trade-ana/4-SUMMARY.md`
</output>
