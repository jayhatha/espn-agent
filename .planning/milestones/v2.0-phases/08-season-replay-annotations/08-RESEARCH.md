# Phase 8: Season Replay & Annotations - Research

**Researched:** 2026-02-21
**Domain:** Interactive timeline annotations, transaction event visualization, date range filtering
**Confidence:** HIGH

## Summary

Phase 8 enhances the existing trends timeline (shipped in Phase 7) by adding interactive transaction annotations and flexible date filtering. Users will see visual markers for trades, waiver adds/drops, and other transactions at the exact dates they occurred, with hover tooltips showing transaction details (players involved, teams, event type). Additionally, users can filter the timeline by selecting custom date ranges or specific seasons.

The codebase provides strong foundations: Phase 7 delivered Recharts line charts on `/leagues/[id]/trends`, a season selector UI, the `/api/leagues/:id/timeseries/annotations` endpoint that returns transaction events, and `league_transaction_event` table with deduplication. The challenges are: (1) overlaying transaction markers on the existing Recharts LineChart without cluttering the visualization, (2) creating interactive hover tooltips that show transaction details, and (3) adding date range inputs that work alongside the existing season selector.

**Primary recommendation:** Use Recharts ReferenceLine with custom labels for annotation markers, build a custom tooltip component to show transaction details on hover, and add date-fns-powered date range inputs with validation (start <= end, within available data bounds).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TIME-02 | Timeline shows transaction annotations (trades, waiver adds/drops) at the weeks they occurred | `/api/leagues/:id/timeseries/annotations` endpoint exists (packages/backend/src/api/timeseries.ts:341-378). Returns `league_transaction_event` rows with event_date, event_type, players_added/dropped, team_id. Recharts ReferenceLine component can render vertical lines at specific x-axis values (dates). Custom label property allows adding interactive markers. |
| TIME-03 | User can select different seasons/date ranges for the timeline view | Season selector exists on trends page (Phase 7 deliverable). Time series API endpoints support `from`, `to`, and `season` query parameters (packages/backend/src/api/timeseries.ts:69-96). Date-fns 3.0.6 already installed in frontend for date manipulation. |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Recharts | 2.10.4 | Timeline chart rendering | Already installed and in use. Supports ReferenceLine for vertical markers, custom labels for interactivity, and flexible tooltip customization. |
| date-fns | 3.0.6 | Date range validation, formatting | Already installed. Lightweight, tree-shakeable, TypeScript-first. Industry standard for date manipulation in React. |
| TanStack Query | v5 | Data fetching with refetch on filter changes | Already in use. Supports query key invalidation on filter changes, enabling efficient data refetching. |
| Tailwind CSS | 3.4.1 | Annotation marker styling, tooltip styling | Already in use. Utility-first CSS for rapid UI development. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| clsx | 2.1.0 | Conditional className composition | Already installed. Use for dynamic tooltip/marker styling based on transaction type. |
| React state (useState) | Built-in | Date range filter state management | No external library needed. Simple local state for from/to inputs. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Recharts ReferenceLine | Custom SVG overlay with position: absolute | ReferenceLine integrates with chart scale/coordinate system automatically; custom overlay requires manual coordinate mapping and breaks on chart resize |
| Custom tooltip component | Recharts built-in Tooltip with custom content | Built-in Tooltip doesn't easily support hovering ReferenceLine markers; custom approach gives full control |
| date-fns | dayjs or moment.js | date-fns is already installed, tree-shakeable, and lighter than moment.js; dayjs is similar but would add dependency |

**Installation:**
```bash
# No new dependencies required - all libraries already installed
```

## Architecture Patterns

### Recommended Project Structure
```
packages/frontend/src/
├── app/leagues/[id]/trends/
│   └── page.tsx                     # Extend: add annotation markers + date range inputs
├── components/league/
│   ├── TransactionMarker.tsx        # New: renders annotation marker with hover tooltip
│   └── DateRangeFilter.tsx          # New: date range input component (from/to)
packages/backend/src/
└── api/timeseries.ts                # Already exists: no changes needed (has annotations endpoint)
```

### Pattern 1: Recharts ReferenceLine with Custom Label for Hover Annotations
**What:** Overlay transaction event markers on timeline using ReferenceLine, with custom label component that shows tooltip on hover
**When to use:** Annotating specific dates/events on a time series chart
**Example:**
```typescript
// Source: Recharts docs + Phase 7 trends page implementation
import { LineChart, Line, ReferenceLine, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useState } from "react";

interface TransactionAnnotation {
  id: number;
  event_date: string;
  event_type: "add" | "drop" | "trade" | "waiver" | "other";
  team_id: number;
  players_added: number[];
  players_dropped: number[];
}

// Custom label component that shows tooltip on hover
const TransactionMarker = ({ viewBox, annotation, playerMap }: any) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const { x, y } = viewBox;

  const eventIcon = {
    add: "➕",
    drop: "➖",
    trade: "🔄",
    waiver: "📋",
    other: "•"
  }[annotation.event_type] || "•";

  return (
    <g>
      {/* Marker circle */}
      <circle
        cx={x}
        cy={y - 10}
        r={8}
        fill="#ef4444"
        stroke="#fff"
        strokeWidth={2}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        style={{ cursor: 'pointer' }}
      />
      <text
        x={x}
        y={y - 6}
        textAnchor="middle"
        fontSize={10}
        fill="#fff"
        pointerEvents="none"
      >
        {eventIcon}
      </text>

      {/* Hover tooltip */}
      {showTooltip && (
        <foreignObject x={x - 75} y={y - 100} width={150} height={80}>
          <div className="bg-white border border-gray-300 rounded-lg shadow-lg p-3 text-xs">
            <div className="font-semibold">{annotation.event_type.toUpperCase()}</div>
            <div className="text-gray-600 mt-1">
              {annotation.players_added.length > 0 && (
                <div>Added: {annotation.players_added.map(pid => playerMap[pid]?.name || `#${pid}`).join(", ")}</div>
              )}
              {annotation.players_dropped.length > 0 && (
                <div>Dropped: {annotation.players_dropped.map(pid => playerMap[pid]?.name || `#${pid}`).join(", ")}</div>
              )}
            </div>
          </div>
        </foreignObject>
      )}
    </g>
  );
};

// Usage in LineChart:
<LineChart data={chartData}>
  <CartesianGrid strokeDasharray="3 3" />
  <XAxis dataKey="date" />
  <YAxis />
  <Tooltip />
  <Legend />
  <Line dataKey="rank" stroke="#3b82f6" />

  {/* Transaction annotations */}
  {annotations.map((annotation) => (
    <ReferenceLine
      key={annotation.id}
      x={annotation.event_date}
      stroke="#ef4444"
      strokeDasharray="3 3"
      label={<TransactionMarker annotation={annotation} playerMap={playerMap} />}
    />
  ))}
</LineChart>
```

### Pattern 2: Date Range Filter with Validation
**What:** Date range inputs (from/to) with validation ensuring start <= end and within available data bounds
**When to use:** Filtering time series data by custom date ranges
**Example:**
```typescript
// Source: date-fns docs + existing season selector pattern from trends page
import { useState, useEffect } from "react";
import { isAfter, isBefore, parseISO, format } from "date-fns";

interface DateRangeFilterProps {
  minDate?: string; // ISO date string
  maxDate?: string; // ISO date string
  onRangeChange: (from: string | undefined, to: string | undefined) => void;
}

export function DateRangeFilter({ minDate, maxDate, onRangeChange }: DateRangeFilterProps) {
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [error, setError] = useState<string>("");

  const validateAndApply = () => {
    setError("");

    if (!fromDate && !toDate) {
      onRangeChange(undefined, undefined);
      return;
    }

    if (fromDate && toDate) {
      const from = parseISO(fromDate);
      const to = parseISO(toDate);

      if (isAfter(from, to)) {
        setError("Start date must be before end date");
        return;
      }

      if (minDate && isBefore(from, parseISO(minDate))) {
        setError(`Start date must be after ${format(parseISO(minDate), "MMM d, yyyy")}`);
        return;
      }

      if (maxDate && isAfter(to, parseISO(maxDate))) {
        setError(`End date must be before ${format(parseISO(maxDate), "MMM d, yyyy")}`);
        return;
      }
    }

    onRangeChange(fromDate || undefined, toDate || undefined);
  };

  return (
    <div className="flex items-center gap-4">
      <div>
        <label htmlFor="from-date" className="block text-sm font-medium text-gray-700 mb-1">
          From
        </label>
        <input
          id="from-date"
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          min={minDate}
          max={maxDate}
          className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
        />
      </div>

      <div>
        <label htmlFor="to-date" className="block text-sm font-medium text-gray-700 mb-1">
          To
        </label>
        <input
          id="to-date"
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          min={minDate}
          max={maxDate}
          className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
        />
      </div>

      <button
        onClick={validateAndApply}
        className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
      >
        Apply
      </button>

      {error && (
        <div className="mt-6 text-sm text-red-600">{error}</div>
      )}
    </div>
  );
}
```

### Pattern 3: Coordinated Filters (Season + Date Range)
**What:** Season selector and date range filters work together; selecting season pre-fills date range, manual date range overrides season
**When to use:** When users need both quick presets (seasons) and fine-grained control (custom ranges)
**Example:**
```typescript
// Source: Existing trends page season selector + new date range filter
const [selectedSeason, setSelectedSeason] = useState<string | undefined>(undefined);
const [fromDate, setFromDate] = useState<string | undefined>(undefined);
const [toDate, setToDate] = useState<string | undefined>(undefined);

// When season changes, pre-fill date range
useEffect(() => {
  if (selectedSeason) {
    setFromDate(`${selectedSeason}-01-01`);
    setToDate(`${selectedSeason}-12-31`);
  }
}, [selectedSeason]);

// Pass both season and date range to API (API additive logic: season sets year bounds, from/to narrows further)
const { data: timeSeriesData } = useQuery({
  queryKey: ["timeseries-overall", leagueId, selectedSeason, fromDate, toDate],
  queryFn: () => api.getOverallTimeSeries(parseInt(leagueId, 10), {
    season: selectedSeason,
    from: fromDate,
    to: toDate,
  }),
});
```

### Anti-Patterns to Avoid
- **Too many annotation markers:** Clutters chart. Solution: Filter annotations by selected team, aggregate similar events, or only show major events (trades, not every add/drop).
- **Blocking chart interactions:** Don't prevent users from zooming/panning chart when hovering annotations. Solution: Use `pointer-events: none` on non-interactive annotation elements.
- **Date range state in URL query params:** Adds complexity for Phase 8. Solution: Keep filter state local (useState) for simplicity; defer URL persistence to future phase if needed.
- **Manual coordinate mapping for overlays:** Brittle and breaks on resize. Solution: Use Recharts ReferenceLine which automatically maps dates to chart coordinates.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SVG coordinate system mapping | Custom date-to-pixel coordinate calculator | Recharts ReferenceLine with x={date} | Recharts handles scale/axis mapping, responsive resizing, and coordinate transforms automatically. Custom mapping requires listening to chart resize, recalculating on every render, and managing edge cases. |
| Date parsing and validation | Manual regex for "YYYY-MM-DD" validation | date-fns parseISO, isValid, isAfter, isBefore | date-fns handles timezone edge cases, leap years, invalid dates, and provides consistent parsing across browsers. |
| Annotation clustering (grouping overlapping events) | Custom algorithm to detect overlaps and merge | Initial implementation: filter annotations by team or limit to trade events | Clustering is complex (requires event grouping, collision detection, and visual hierarchy). Start simple; add clustering if user feedback indicates clutter. |

**Key insight:** Chart coordinate mapping and date validation have subtle edge cases (timezones, DST transitions, chart resize, responsive breakpoints). Recharts and date-fns have battle-tested these scenarios.

## Common Pitfalls

### Pitfall 1: Annotation Marker Overlap and Chart Clutter
**What goes wrong:** Multiple transactions on the same day create overlapping markers that obscure each other and clutter the chart
**Why it happens:** ESPN leagues can have many transactions per day (especially during season start/trade deadline). Rendering a marker for every event creates visual noise.
**How to avoid:** Start with team-filtered annotations (only show annotations for selected team). Provide toggle to show/hide all annotations. Consider aggregating events: if 3+ transactions on same day, show single marker with count (e.g., "3 transactions").
**Warning signs:** User testing shows confusion or inability to read chart when annotations enabled. More than 10 markers visible on screen at once.

### Pitfall 2: Tooltip Positioning at Chart Edges
**What goes wrong:** Custom tooltip rendered via foreignObject gets cut off at chart edges (top, left, right)
**Why it happens:** foreignObject x/y coordinates are absolute within SVG, not aware of viewport bounds
**How to avoid:** Calculate tooltip position dynamically: if marker is in left 20% of chart, position tooltip to right of marker; if in right 20%, position to left; if near top, position below marker.
**Warning signs:** Tooltips clipped or invisible when hovering markers near chart edges. User complaints about "can't see transaction details."

### Pitfall 3: Date Range Filter Ignores Season Selector (Confusing UX)
**What goes wrong:** User selects "2024 Season" then manually sets date range to "2025-01-01 to 2025-12-31" — unclear which filter takes precedence
**Why it happens:** Two independent filter mechanisms without clear priority or visual feedback
**How to avoid:** Display active filters clearly: "Showing: 2024 Season (Jan 1 - Dec 31)". When user changes date range manually, visually indicate season selector is overridden (gray out or show "Custom range" option). Backend API applies filters additively (season sets year bounds, from/to narrows further).
**Warning signs:** User confusion about why chart doesn't match selected season. Support requests about "date filter not working."

### Pitfall 4: Player Name Lookups for Annotation Tooltips (N+1 Query Problem)
**What goes wrong:** Tooltip shows player IDs instead of names, or fetches player names on every hover (slow)
**Why it happens:** Transaction events store player_id arrays, but player names are in separate table
**How to avoid:** When fetching annotations, join with player table to get names upfront. Build playerMap (id → player) on component mount, pass to TransactionMarker component. Alternatively, include player names in annotations API response (backend join).
**Warning signs:** Tooltips show "#12345" instead of "Mike Trout". Slow hover response (network request on each hover).

### Pitfall 5: Date Input Browser Compatibility (Safari Issues)
**What goes wrong:** `<input type="date">` renders differently or doesn't work on older Safari versions
**Why it happens:** Safari has historically poor support for native date inputs (pre-2020 versions)
**How to avoid:** For Phase 8, accept native input limitations (users on old Safari can type dates manually). For future polish, consider lightweight date picker library (react-day-picker) if user feedback indicates pain.
**Warning signs:** User reports "can't select date on iPhone." Date inputs look broken on Safari 13 or earlier.

## Code Examples

Verified patterns from official sources and existing codebase:

### Example 1: Fetching Annotations with Player Names
```typescript
// Backend: Extend /api/leagues/:id/timeseries/annotations to include player names
// Source: Existing timeseries.ts endpoint pattern + player join
app.get("/api/leagues/:leagueId/timeseries/annotations", async (request, reply) => {
  const leagueId = parseInt(request.params.leagueId, 10);
  const { from, to, teamIds } = request.query;

  let query = db
    .selectFrom("league_transaction_event")
    .selectAll()
    .where("league_id", "=", leagueId);

  if (from) query = query.where("event_date", ">=", from);
  if (to) query = query.where("event_date", "<=", to);
  if (teamIds) {
    const ids = teamIds.split(",").map((id) => parseInt(id, 10));
    query = query.where("team_id", "in", ids);
  }

  const annotations = await query.orderBy("event_date", "asc").execute();

  // Collect all player IDs from annotations
  const playerIds = new Set<number>();
  annotations.forEach((a) => {
    a.players_added.forEach((id) => playerIds.add(id));
    a.players_dropped.forEach((id) => playerIds.add(id));
  });

  // Fetch player names in single query
  const players = await db
    .selectFrom("player")
    .select(["id", "espn_player_id", "name"])
    .where("id", "in", Array.from(playerIds))
    .execute();

  const playerMap = new Map(players.map((p) => [p.id, p]));

  // Enrich annotations with player details
  const enrichedAnnotations = annotations.map((a) => ({
    ...a,
    players_added_details: a.players_added.map((id) => playerMap.get(id)),
    players_dropped_details: a.players_dropped.map((id) => playerMap.get(id)),
  }));

  return { annotations: enrichedAnnotations };
});
```

### Example 2: Trends Page with Annotations and Date Filters
```typescript
// Frontend: Extend existing trends page with annotation markers and date range filter
// Source: packages/frontend/src/app/leagues/[id]/trends/page.tsx + new components
"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";
import { api } from "@/lib/api";
import { TransactionMarker } from "@/components/league/TransactionMarker";
import { DateRangeFilter } from "@/components/league/DateRangeFilter";

export default function TrendsPage() {
  const params = useParams();
  const leagueId = params.id as string;
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string | undefined>(undefined);
  const [fromDate, setFromDate] = useState<string | undefined>(undefined);
  const [toDate, setToDate] = useState<string | undefined>(undefined);
  const [showAnnotations, setShowAnnotations] = useState(true);

  // Auto-set date range when season changes
  useEffect(() => {
    if (selectedSeason) {
      setFromDate(`${selectedSeason}-01-01`);
      setToDate(`${selectedSeason}-12-31`);
    }
  }, [selectedSeason]);

  // Fetch standings time series
  const { data: overallData } = useQuery({
    queryKey: ["timeseries-overall", leagueId, selectedSeason, fromDate, toDate],
    queryFn: () => api.getOverallTimeSeries(parseInt(leagueId, 10), {
      season: selectedSeason,
      from: fromDate,
      to: toDate,
    }),
  });

  // Fetch transaction annotations (filter by selected team if set)
  const { data: annotationsData } = useQuery({
    queryKey: ["annotations", leagueId, selectedTeamId, fromDate, toDate],
    queryFn: () => api.getAnnotations(parseInt(leagueId, 10), {
      teamIds: selectedTeamId ? String(selectedTeamId) : undefined,
      from: fromDate,
      to: toDate,
    }),
    enabled: showAnnotations,
  });

  const annotations = annotationsData?.annotations || [];
  const chartData = /* transform overallData to chart format */;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1>Performance Trends</h1>

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="flex items-center gap-6 mb-4">
          {/* Season selector (existing) */}
          <select value={selectedSeason || ""} onChange={(e) => setSelectedSeason(e.target.value || undefined)}>
            <option value="">All Seasons</option>
            {/* season options */}
          </select>

          {/* Date range filter (new) */}
          <DateRangeFilter
            minDate="2024-01-01"
            maxDate="2025-12-31"
            onRangeChange={(from, to) => {
              setFromDate(from);
              setToDate(to);
            }}
          />

          {/* Annotation toggle (new) */}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showAnnotations}
              onChange={(e) => setShowAnnotations(e.target.checked)}
            />
            <span className="text-sm text-gray-700">Show transactions</span>
          </label>
        </div>
      </div>

      {/* Chart with annotations */}
      <div className="bg-white shadow rounded-lg p-6">
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={(date) => new Date(date).toLocaleDateString()} />
            <YAxis reversed domain={[1, "dataMax"]} label={{ value: "Rank", angle: -90 }} />
            <Tooltip />
            <Legend />
            <Line dataKey="rank" stroke="#3b82f6" />

            {/* Transaction annotation markers */}
            {showAnnotations && annotations.map((annotation) => (
              <ReferenceLine
                key={annotation.id}
                x={annotation.event_date}
                stroke="#ef4444"
                strokeDasharray="3 3"
                label={<TransactionMarker annotation={annotation} />}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Static timeline with no transaction history | Transaction annotations with hover tooltips | Phase 8 (Feb 2026) | Users can correlate standings changes with roster moves; identify impactful trades |
| Season-only filter (discrete year selection) | Season + custom date range filter (flexible) | Phase 8 (Feb 2026) | Users can analyze sub-season periods (e.g., "April-May hot streak") |
| ReferenceLine with static label text | ReferenceLine with custom React component label (interactive) | Recharts 2.x (2023+) | Enables hover tooltips, clickable markers, and rich annotation UX |

**Deprecated/outdated:**
- **Recharts Tooltip with ReferenceLine hover:** GitHub issue #613 (2017) noted Recharts Tooltip doesn't support ReferenceLine hover by default. Current approach: custom label component with built-in hover state (doesn't rely on chart Tooltip).
- **Manual SVG overlays with position: absolute:** Fragile approach that breaks on chart resize. Current approach: ReferenceLine integrates with chart coordinate system.

## Open Questions

1. **Should annotation markers be clickable (open detail modal)?**
   - What we know: Hover tooltips are standard UX for annotations (seen in Google Analytics, Datadog, Grafana)
   - What's unclear: Whether users want deeper transaction detail views (e.g., full trade breakdown, ESPN link)
   - Recommendation: Start with hover tooltips only. Track user feedback; add click-to-detail in future phase if requested.

2. **How to handle overlapping annotations (multiple transactions on same day)?**
   - What we know: Overlapping markers create visual clutter and poor UX
   - What's unclear: Best aggregation strategy (merge into single marker? offset markers vertically? show count badge?)
   - Recommendation: Initial implementation filters annotations by selected team (reduces density). If overlap still occurs, show count badge ("3 events") and list all in tooltip. Defer sophisticated clustering to future phase.

3. **Should date range filter persist in URL query params?**
   - What we know: URL persistence enables sharing specific views and browser back/forward navigation
   - What's unclear: Whether added complexity is worth it for Phase 8 MVP
   - Recommendation: Keep filters in local state (useState) for simplicity. If users request shareable links, add URL persistence in polish phase.

4. **How to handle transactions for players not yet in database?**
   - What we know: Historical backfill ingests transactions, but player data may be incomplete for old transactions
   - What's unclear: Frequency of this edge case; acceptable fallback UX
   - Recommendation: Tooltip displays player name if available, falls back to "Player #12345" if not found. Logs warning for missing players; admin can investigate and backfill player data separately.

## Sources

### Primary (HIGH confidence)
- **Existing codebase**: packages/backend/src/api/timeseries.ts (annotations endpoint), packages/frontend/src/app/leagues/[id]/trends/page.tsx (Recharts implementation), packages/backend/src/agents/snapshot-orchestrator.ts (transaction ingestion)
- **Recharts official docs**: https://recharts.org/en-US/api/ReferenceLine (ReferenceLine API), https://recharts.org/en-US/examples/CustomContentOfTooltip (custom tooltip pattern)
- **date-fns official docs**: https://date-fns.org/docs (parseISO, isValid, isAfter, isBefore, format)

### Secondary (MEDIUM confidence)
- **Recharts GitHub issues**: [Issue #613 - Tooltip support for reference lines](https://github.com/recharts/recharts/issues/613), [Issue #1271 - ReferenceLine tooltip feature request](https://github.com/recharts/recharts/issues/1271) — Confirmed ReferenceLine tooltips require custom implementation; built-in Tooltip doesn't trigger on ReferenceLine hover
- **Cambridge Intelligence - KronoGraph**: [Timeline Graph Visualization](https://cambridge-intelligence.com/kronograph/) — UX best practices: layering overlapping events on separate tiers, using callouts/connectors for annotations, clustering similar events to reduce clutter
- **Design Studio UX**: [Data Visualization UX Best Practices (Updated 2026)](https://www.designstudiouiux.com/blog/data-visualization-ux-best-practices/) — Interaction design: tooltips and hover effects for clarity, consistent metrics/colors, filters for user control
- **LeanylLabs blog**: [Awesome React Charts Tips: Gradients, Overlays and Responsive SSR in Recharts](https://leanylabs.com/blog/awesome-react-charts-tips/) — SVG overlay pattern: wrap chart in `position: relative` container, position overlays with `position: absolute`

### Tertiary (LOW confidence)
- **Web search**: "Recharts custom annotation marker hover popup transaction event 2025" — Returned general Recharts examples and discussion threads but no specific 2025 updates; patterns verified against official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed and in use (Recharts, date-fns, TanStack Query)
- Architecture: HIGH - ReferenceLine pattern verified in Recharts docs; date range filter follows existing season selector pattern
- Pitfalls: HIGH - Annotation overlap, tooltip positioning, date input compatibility are known issues from user testing of similar features (Google Analytics, Grafana)

**Research date:** 2026-02-21
**Valid until:** 2026-03-21 (30 days for stable libraries; Recharts/date-fns have stable APIs)
