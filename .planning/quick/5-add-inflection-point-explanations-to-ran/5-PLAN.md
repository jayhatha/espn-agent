---
phase: quick-5
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/backend/src/api/timeseries.ts
  - packages/frontend/src/lib/api.ts
  - packages/frontend/src/app/leagues/[id]/trends/page.tsx
  - packages/frontend/src/components/league/InflectionPointMarker.tsx
autonomous: true
requirements: [QUICK-5]

must_haves:
  truths:
    - "User sees explanations for the biggest ranking changes on the overall standings chart"
    - "Each inflection point shows which categories drove the change (gained/lost roto points)"
    - "Each inflection point shows correlated transactions (players added/dropped near that date)"
    - "Inflection points only appear for the selected team"
  artifacts:
    - path: "packages/backend/src/api/timeseries.ts"
      provides: "GET /api/leagues/:id/timeseries/inflection-points endpoint"
      contains: "inflection-points"
    - path: "packages/frontend/src/components/league/InflectionPointMarker.tsx"
      provides: "SVG marker + tooltip component for inflection points on chart"
      min_lines: 40
    - path: "packages/frontend/src/app/leagues/[id]/trends/page.tsx"
      provides: "Inflection point query + rendering in overall standings chart"
      contains: "inflection"
  key_links:
    - from: "packages/frontend/src/app/leagues/[id]/trends/page.tsx"
      to: "/api/leagues/:id/timeseries/inflection-points"
      via: "TanStack Query fetch through api client"
      pattern: "getInflectionPoints"
    - from: "packages/frontend/src/app/leagues/[id]/trends/page.tsx"
      to: "packages/frontend/src/components/league/InflectionPointMarker.tsx"
      via: "ReferenceDot component with custom label"
      pattern: "InflectionPointMarker"
---

<objective>
Add inflection point explanations to the rankings timeline chart. When viewing overall standings, the biggest week-over-week ranking changes for the selected team are marked with explanatory tooltips showing which category rank shifts and roster transactions drove the change.

Purpose: Users currently see THAT rankings changed but not WHY. This closes the insight gap by attributing major ranking movements to specific category changes and player moves.
Output: Backend endpoint computing inflection points + frontend markers with rich tooltips on the overall standings chart.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/backend/src/api/timeseries.ts
@packages/frontend/src/app/leagues/[id]/trends/page.tsx
@packages/frontend/src/components/league/TransactionMarker.tsx
@packages/frontend/src/lib/api.ts
@packages/backend/src/db/schema.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Backend inflection-points endpoint</name>
  <files>packages/backend/src/api/timeseries.ts, packages/frontend/src/lib/api.ts</files>
  <action>
Add a new GET endpoint at `/api/leagues/:leagueId/timeseries/inflection-points` in `timeseries.ts`.

Query params: `teamId` (required), `season?`, `from?`, `to?`, `limit?` (default 5, max 10).

The endpoint should:

1. Fetch `team_daily_overall` for the given team+league, filtered by date range/season. Order by snapshot_date ASC.

2. Compute deltas: For each consecutive pair of snapshots, calculate `overall_points` change. Take the top N by absolute delta (use the `limit` param).

3. For each inflection point, fetch the category breakdown: Query `team_daily_category_ranks` for both the inflection date AND the previous snapshot date. Compute per-category roto_points delta. Return only categories where delta != 0, sorted by absolute delta descending.

4. For each inflection point, fetch correlated transactions: Query `league_transaction_event` where `team_id` matches AND `event_date` is between the previous snapshot date (exclusive) and the inflection date (inclusive). Enrich with player names from `player` table (same pattern as existing annotations endpoint).

5. Return shape:
```json
{
  "inflectionPoints": [
    {
      "date": "2025-06-15",
      "previousDate": "2025-06-14",
      "pointsDelta": 5,
      "rankBefore": 4,
      "rankAfter": 2,
      "categoryChanges": [
        { "categoryId": "HR", "deltaPts": 2, "rankBefore": 5, "rankAfter": 3 },
        { "categoryId": "SB", "deltaPts": 3, "rankBefore": 8, "rankAfter": 5 }
      ],
      "transactions": [
        {
          "id": 123,
          "eventType": "add",
          "eventDate": "2025-06-15",
          "playersAdded": [{ "id": 1, "name": "Mike Trout" }],
          "playersDropped": [{ "id": 2, "name": "John Doe" }]
        }
      ]
    }
  ]
}
```

Use the same auth middleware pattern as existing timeseries routes: `onRequest: [authenticate], preHandler: [requireLeagueAccess]`.

Guard against empty arrays before `WHERE IN` clauses (Kysely empty array guard per CLAUDE.md).

Then add `getInflectionPoints` method to the frontend `api.ts` client:
```ts
async getInflectionPoints(leagueId: number, teamId: number, params?: { season?: string; from?: string; to?: string; limit?: number }) {
  const qs = new URLSearchParams({ teamId: String(teamId), ...params } as any).toString();
  return fetchAPI(`/api/leagues/${leagueId}/timeseries/inflection-points?${qs}`);
}
```
  </action>
  <verify>Backend compiles: `cd packages/backend && npx tsc --noEmit`. Frontend compiles: `cd packages/frontend && npx tsc --noEmit`.</verify>
  <done>Endpoint returns inflection points with category breakdowns and correlated transactions. API client method exists.</done>
</task>

<task type="auto">
  <name>Task 2: Frontend inflection point markers on the chart</name>
  <files>packages/frontend/src/components/league/InflectionPointMarker.tsx, packages/frontend/src/app/leagues/[id]/trends/page.tsx</files>
  <action>
Create `InflectionPointMarker.tsx` as an SVG component for Recharts `ReferenceDot` label, following the same pattern as `TransactionMarker.tsx` (SVG foreignObject for rich tooltips).

The marker should:
- Render as a diamond shape (rotated square) at the data point's coordinates. Use green fill for positive deltas, red for negative.
- Show the points delta as text inside the diamond (e.g., "+5" or "-3").
- On hover, show a foreignObject tooltip (same pattern as TransactionMarker) containing:
  - Date and overall points change (e.g., "Jun 15: +5 pts (Rank 4 -> 2)")
  - Category changes list: Each line shows category name, points delta, rank change. Color green for gains, red for losses. Example: "HR: +2 pts (5th -> 3rd)"
  - Transactions section (if any): "Added: Mike Trout / Dropped: John Doe"
  - If no transactions: "No roster moves in this period"
- Set foreignObject width=260, height=auto (estimate based on content: 120 + 20*categoryChanges.length + 20*transactions.length, capped at 300).

Props interface:
```ts
interface InflectionPoint {
  date: string;
  previousDate: string;
  pointsDelta: number;
  rankBefore: number;
  rankAfter: number;
  categoryChanges: { categoryId: string; deltaPts: number; rankBefore: number; rankAfter: number }[];
  transactions: { id: number; eventType: string; eventDate: string; playersAdded: { id: number; name: string }[]; playersDropped: { id: number; name: string }[] }[];
}

interface InflectionPointMarkerProps {
  cx?: number;
  cy?: number;
  point: InflectionPoint;
}
```

Then update `trends/page.tsx`:

1. Add a new TanStack Query for inflection points, enabled only when `viewMode === "overall"` AND `selectedTeamId` is set:
```ts
const { data: inflectionData } = useQuery({
  queryKey: ["inflection-points", leagueId, selectedTeamId, selectedSeason, fromDate, toDate],
  queryFn: () => api.getInflectionPoints(parseInt(leagueId, 10), selectedTeamId!, {
    season: selectedSeason,
    from: fromDate,
    to: toDate,
    limit: 5,
  }),
  enabled: !!leagueId && !!selectedTeamId && viewMode === "overall",
});
```

2. Inside the `<LineChart>`, after the transaction annotations block, add inflection point markers using Recharts `ReferenceDot` component (import it). For each inflection point, find the selected team's Y-value (overall_rank) from chartData for that date, then render:
```tsx
{viewMode === "overall" && selectedTeamId && inflectionData?.inflectionPoints?.map((ip) => {
  const selectedTeamName = teamMap.get(selectedTeamId);
  if (!selectedTeamName) return null;
  const dataIndex = chartData.findIndex((d) => d.date === ip.date);
  if (dataIndex === -1) return null;
  return (
    <ReferenceDot
      key={`ip-${ip.date}`}
      x={ip.date}
      y={chartData[dataIndex][selectedTeamName]}
      r={0}
      label={<InflectionPointMarker point={ip} />}
    />
  );
})}
```

3. Add a checkbox control next to the existing "Show Transactions" checkbox: "Show Inflection Points" (default on when a team is selected, hidden when no team selected). Use state `showInflectionPoints` defaulting to true. Wrap the ReferenceDot rendering in `showInflectionPoints &&`.

Import `ReferenceDot` from recharts and `InflectionPointMarker` from the new component file.
  </action>
  <verify>Frontend compiles: `cd packages/frontend && npx tsc --noEmit`. Visual: the markers should appear as diamonds on the chart line at inflection points.</verify>
  <done>Overall standings chart shows diamond markers at inflection points for the selected team. Hovering reveals category breakdowns and correlated transactions. Toggle checkbox controls visibility.</done>
</task>

</tasks>

<verification>
- Backend: `cd packages/backend && npx tsc --noEmit` passes
- Frontend: `cd packages/frontend && npx tsc --noEmit` passes
- Manual: Navigate to trends page, select a team, view overall standings -- diamond markers appear at biggest ranking changes. Hover shows category + transaction details.
</verification>

<success_criteria>
- Inflection points endpoint returns top 5 ranking changes with category breakdowns and correlated transactions
- Diamond markers appear on overall standings chart at inflection points for the selected team
- Tooltip shows category-level attribution (which categories gained/lost roto points) and roster moves
- Toggle checkbox controls inflection point visibility
- Works with season selector and date range filters
</success_criteria>

<output>
After completion, create `.planning/quick/5-add-inflection-point-explanations-to-ran/5-SUMMARY.md`
</output>
