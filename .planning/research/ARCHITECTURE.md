# Architecture Research: In-Season Roto Command Center

**Domain:** In-season fantasy baseball analytics — standings projection, marginal gain, waiver/trade analysis
**Researched:** 2026-03-23
**Confidence:** HIGH (existing system fully read) / MEDIUM (ESPN FAAB API field — not yet extracted)

---

## Executive Summary

This document answers: "How do roto interpolation, marginal gain, FAAB tracking, GS/K tracking, net waiver analysis, trade finder, dark theme, and Linear-style nav integrate with the existing Fastify + Next.js + agent architecture?"

The existing system already has the critical data foundation:

- `team_daily_projected_category` stores projected values AND projected ranks per team per category per day.
- `StandingsProjectionAgent` already performs the full rank assignment loop.
- `WaiverRecommendationAgent.simulateSwap()` already re-ranks all teams after a swap and computes roto point delta.
- `LeagueTransactionEvent` stores bid amounts from ESPN transactions.

What's missing is: (1) interpolation between rank slots for fractional roto points, (2) a marginal-gain query layer that reads existing projection rows and computes gaps to the next rank, (3) FAAB remaining per team (ESPN exposes this in `mTeam` view but the adapter never extracts it), (4) GS/K pace tracking (counting stats available in snapshots, limit not stored), and (5) a new frontend layout with left nav and dashboard shell.

None of the eight features require new tables or new agent classes from scratch. All integrate into the existing agent/API/page pattern.

---

## Current Architecture (Baseline)

### System Overview

```
ESPN API (lm-api-reads.fantasy.espn.com)
  ↓
ESPNAdapter (adapters/espn.ts)
  ↓ normalizeLeagueData()
SnapshotOrchestratorAgent (agents/snapshot-orchestrator.ts)
  ├── writes: league_daily_snapshot, team_roster_snapshot
  ├── writes: team_daily_category_totals (current-YTD values + components)
  ├── writes: team_daily_category_ranks (current rank per category)
  ├── writes: team_daily_overall (current roto points total)
  └── calls: StandingsProjectionAgent.computeProjectedStandings()
               ├── reads: team_daily_category_totals, team_roster_snapshot, player_projection
               ├── writes: team_daily_projected_category (projected value + rank + roto points)
               └── writes: team_daily_projected_overall

WaiverRecommendationAgent
  ├── reads: team_daily_projected_category (all teams — for re-ranking)
  ├── calls: simulateSwap() → re-ranks all teams after add/drop
  └── returns: deltaOverallPoints + categoryImpacts per candidate

TradeRecommendationAgent
  ├── reads: team_daily_projected_category, player_projection
  └── simulates swaps between two teams, returns impact analysis

API layer (Fastify routes)
  ├── /api/leagues/:id/standings/projected   → reads team_daily_projected_category
  ├── /api/leagues/:id/teams/:teamId/waivers/recommendations
  ├── /api/leagues/:id/teams/:teamId/trades/recommendations
  └── /api/leagues/:id/timeseries/*          → reads historical snapshots

Frontend (Next.js App Router)
  └── /leagues/[id]/
      ├── page.tsx           (league dashboard)
      ├── standings/         (projected standings table)
      ├── waivers/           (waiver recommendations)
      ├── trades/            (trade finder)
      ├── streaming/         (streaming pitcher page)
      ├── trends/            (historical timeseries)
      └── ...
```

### Key Data Tables

| Table | What It Stores | Who Writes It |
|-------|---------------|---------------|
| `team_daily_category_totals` | Current YTD value + stat components per team per category | SnapshotOrchestratorAgent |
| `team_daily_category_ranks` | Current rank + roto points per team per category | SnapshotOrchestratorAgent |
| `team_daily_projected_category` | Projected final value + rank + roto points + components | StandingsProjectionAgent |
| `team_daily_projected_overall` | Projected final total roto points + overall rank | StandingsProjectionAgent |
| `league_transaction_event` | Add/drop/trade/waiver events, includes `bidAmount` field | SnapshotOrchestratorAgent |
| `team_roster_snapshot` | Roster per team per day with `acquisition_type` | SnapshotOrchestratorAgent |
| `player_projection` | FanGraphs RoS stat components per player | ProjectionsIngestAgent |

### Agent Class Pattern

Every agent:
- Constructor: `(db: Kysely<Database>, logger?: Logger)`
- Single public method per responsibility
- Reads projections from `player_projection` via `projections_run_id` on snapshot
- Marks degraded when data is incomplete — never fabricates

---

## Feature Integration Map

### Feature 1: Roto Point Interpolation Engine

**What it is:** Instead of integer roto points (rank 1 = N pts, rank 2 = N-1 pts), compute fractional points based on how close a team's projected value is to the adjacent rank. This makes the "next roto point" gap continuous rather than a step function.

**Where it lives:** `packages/shared/src/formulas.ts` — pure function, no DB access needed.

**New function signature:**
```typescript
// packages/shared/src/formulas.ts
export function interpolateRotoPoints(
  teamValue: number,
  allValues: number[],      // all teams' projected values for this category, sorted
  direction: "HIGHER_BETTER" | "LOWER_BETTER",
  numTeams: number
): number  // fractional roto points, e.g. 8.3 instead of 8
```

**Integration point:** `StandingsProjectionAgent.rankAndStore()` optionally calls this instead of integer `numTeams - rank + 1`. The stored column `projected_roto_points` in `team_daily_projected_category` is already `number | null` — no schema change.

**Alternative use:** The interpolation function can also be called on-the-fly in `simulateSwap()` inside `WaiverRecommendationAgent` to compute fractional delta points for waiver candidates. This does not require storing fractional values in the DB.

**Build dependency:** None. Can be built first as a pure utility.

---

### Feature 2: Marginal Gain Calculator

**What it is:** For each category, compute: "how many more [stat] does my team need to move from rank N to rank N-1?" This is the gap to the next roto point.

**Where it lives:** New query function inside a new agent or added to `StandingsProjectionAgent`.

**Recommended approach:** Expose as a new method on `StandingsProjectionAgent`:

```typescript
// packages/backend/src/agents/standings-projection.ts (extended)
async getMarginalGains(
  leagueId: number,
  teamId: number,
  snapshotDate: string
): Promise<Array<{
  categoryId: string;
  categoryName: string;
  currentRank: number;
  currentValue: number;
  nextRankValue: number;          // the value team just above us has
  gapToNextRank: number;          // nextRankValue - currentValue (signed)
  statUnit: string;               // "HR", "SB", "ERA points", etc.
  canGainPoint: boolean;          // true if within reach (e.g. < 10% gap)
}>>
```

**Data source:** `team_daily_projected_category` already has `projected_value` and `projected_rank` for all teams. The query is a self-join: for each category, find the team ranked one slot above the target team and return the value gap.

**New API endpoint:**
```
GET /api/leagues/:id/teams/:teamId/marginal-gains
```

Returns the marginal gain array. Frontend renders as a "what to target" priority list.

**Build dependency:** Requires `StandingsProjectionAgent.computeProjectedStandings()` to have run first (i.e., there must be rows in `team_daily_projected_category`). No schema changes.

---

### Feature 3: FAAB Tracking

**What it is:** Show each team's remaining FAAB budget. ESPN tracks this per-team and exposes it in the `mTeam` view.

**Gap identified:** ESPN's `acquisitionBudgetRemaining` field is in the raw `mTeam` response but `normalizeLeagueData()` in `ESPNAdapter` never extracts it. `ESPNTeamData` interface does not include a budget field. `team` table has no FAAB column.

**Two-part fix:**

**Part A — Extract from ESPN (adapter change):**
```typescript
// packages/backend/src/adapters/espn.ts
export interface ESPNTeamData {
  // existing fields...
  acquisitionBudgetRemaining?: number;  // FAAB remaining (null if snake draft league)
  acquisitionBudgetSpent?: number;
}
// In normalizeLeagueData():
acquisitionBudgetRemaining: t.acquisitionBudgetRemaining ?? null,
acquisitionBudgetSpent: t.waiverBudgetSpent ?? null,
```

**Part B — Store per-snapshot:** FAAB changes every waiver processing cycle. Best approach is to store it in `team_roster_snapshot` (add two nullable columns) OR in a new `team_daily_faab` table. Recommendation: add to `team_roster_snapshot` as nullable columns (`faab_remaining`, `faab_spent`) — avoids a new table and the data is already written per snapshot.

**Alternatively (simpler, read-only path):** Query FAAB live from the ESPN API on request rather than caching it. The `/api/leagues/:id/teams` endpoint could include FAAB from the most recent raw payload without storing it. This avoids the migration entirely for an MVP.

**FAAB from transactions:** `league_transaction_event` already stores `bidAmount` (set in the adapter at line 780). Summing `bid_amount` per team over `event_type = 'waiver'` gives total FAAB spent. If the league budget is known (from `acquisition_rules` in settings_json), remaining = budget - spent. This works today without any schema change.

**Recommended path for MVP:** Derive FAAB from transaction history (sum of bid amounts). Add the raw extraction as a follow-up when transactions are fully ingested.

**New API endpoint:**
```
GET /api/leagues/:id/faab
```
Returns `{ teamId, teamName, faabRemaining, faabSpent, faabBudget }[]`.

**Build dependency:** Requires transaction ingestion to be working (SnapshotOrchestratorAgent already writes `league_transaction_event` rows with bid amounts).

---

### Feature 4: GS/K Pace Tracking

**What it is:** Track how many games started (GS) and total innings pitched each pitcher has accumulated vs. league caps. Project remaining GS to end-of-season.

**Gap identified:** There is no GS cap concept in the current data model. The `team_daily_category_totals` table stores IP (via OUTS) and K totals — the accumulation is there — but:
1. No GS column exists (ESPN does not expose GS directly in stat views)
2. No per-pitcher GS tracking exists — only team totals
3. No "cap remaining" concept

**Data source options:**

Option A — MLB Stats API (already integrated via `MLBStatsAPIAdapter`): The `StreamingPitcherAgent` already uses this adapter to fetch probable starters and start counts per week. The same API can return season GS totals per pitcher.

Option B — FanGraphs projections CSV: Already includes IP projection per pitcher. GS can be estimated as `projected_IP / 6` (rough average). This is lower fidelity but requires no new API call.

Option C — ESPN current stats: ESPN's `valuesByStat` includes OUTS (stat ID 34). GS is not a standard ESPN stat ID in the current map.

**Recommended approach:** Use MLB Stats API (already available via `MLBStatsAPIAdapter`) for actual GS-to-date per pitcher on a team's roster. Add a new method to `StreamingPitcherAgent` or a new `GsPaceAgent`:

```typescript
async getTeamGsPace(
  teamId: number,
  snapshotDate: string,
  gsCapPerTeam: number   // from league settings, default 0 if uncapped
): Promise<{
  pitcherId: number;
  pitcherName: string;
  gsToDate: number;
  projectedSeasonGs: number;  // linear pace projection
  ipToDate: number;
  projectedSeasonIp: number;
  kToDate: number;
  projectedSeasonK: number;
}>
```

**No new DB table required** for MVP: results can be computed on-demand by joining roster snapshot with MLB Stats API response. If caching is needed, add to `player_period_stats` (already in schema).

**New API endpoint:**
```
GET /api/leagues/:id/teams/:teamId/pace
```

**Build dependency:** Requires working `MLBStatsAPIAdapter`. Can be built independently.

---

### Feature 5: Net Waiver Analysis (Roto-Point-Delta Waivers)

**What it is:** `WaiverRecommendationAgent` already computes `deltaOverallPoints` per add/drop candidate. The extension needed is: expose this delta in the UI more clearly, support filtering by category need, and integrate with the marginal gain calculator to surface "which free agents close my biggest gaps."

**Current state:** `WaiverRecommendationAgent.simulateSwap()` is fully implemented and computes fractional category impacts correctly. The hardcoded `0.5` stub mentioned in `CLAUDE.md` was apparently fixed — the agent now re-ranks all teams after the swap.

**What needs to change:**

1. **Category-targeted filtering:** Add an optional `targetCategories?: string[]` parameter to `getRecommendations()`. Filter free agents by which categories they contribute to. This removes the need to evaluate O(freeAgents × roster) if the user only wants ERA improvement.

2. **Marginal gain integration:** Cross-reference waiver candidates with marginal gain output: prefer candidates who contribute to categories where the team is within reach of gaining a roto point.

3. **UI presentation:** The existing `/leagues/[id]/waivers/page.tsx` can be extended to show "category impact breakdown" per recommendation, sourced from the existing `categoryImpacts` array in `WaiverRecommendation`.

**No new agent class needed.** Extend `WaiverRecommendationAgent.getRecommendations()` with optional parameters and update the API endpoint to pass them through.

**Build dependency:** Depends on Feature 2 (marginal gain calculator) for the cross-reference. Can be shipped without it — the raw `deltaOverallPoints` is already useful.

---

### Feature 6: Trade Finder (N×M Roster Combinations)

**What it is:** Scan all possible M-for-N player swaps between two teams and surface roto-point-positive combinations. Current `TradeRecommendationAgent` only generates 1-for-1 candidates.

**Current state:** `TradeRecommendationAgent` has `analyzeTradeImpact()` (evaluates a specific proposed trade) and `generateTradeCandidates()` (generates 1-for-1 suggestions). The simulation logic uses the same component-math approach as `WaiverRecommendationAgent`.

**Extension path:**

The N×M search is a combinatorial explosion. For a 10-player roster and 2-for-2 swaps: C(10,2) × C(10,2) = 45 × 45 = 2025 candidates per pair. Manageable. For 3-for-3: C(10,3)^2 = 14,400. Gets expensive.

Recommended approach: implement 2-for-2 search with a pre-filter (only consider players who contribute to different categories to avoid redundant combos), then add 3-for-3 as an optional slow path.

**New method on `TradeRecommendationAgent`:**
```typescript
async generateMultiPlayerCandidates(
  leagueId: number,
  teamId: number,
  partnerTeamId: number,
  snapshotDate: string,
  options: { maxPlayersEachSide: number; limit: number }
): Promise<TradeImpactAnalysis[]>
```

**New API endpoint:**
```
GET /api/leagues/:id/teams/:teamId/trades/candidates?partnerTeamId=X&maxPlayersEachSide=2
```

**Build dependency:** Depends on `team_daily_projected_category` being populated. Internally reuses `analyzeTradeImpact()` — no new simulation code needed, just a combinatorial wrapper.

**Performance note:** For 2-for-2, 2025 candidates × the cost of `analyzeTradeImpact()` (2 DB queries per call) = ~4050 queries. This will be slow for real-time use. Solutions: (a) precompute nightly and cache results, (b) compute async with a BullMQ job, (c) use in-memory projection data (load all projections once, loop without DB calls). Option (c) is cleanest — load all team projections into memory at the start of the search.

---

### Feature 7: Dark Theme

**Where it lives:** `packages/frontend/tailwind.config.js` and `packages/frontend/src/app/globals.css`.

**Current state:** Tailwind config has a light theme only. The `grafana` color palette (dark: `#181b1f` bg, `#22252b` panel) is already defined in the config — it was added for the mobile draft companion. CSS variables are not used — all colors are Tailwind utility classes applied directly.

**Approach options:**

Option A — Tailwind `darkMode: 'class'` toggle (recommended): Add `darkMode: 'class'` to `tailwind.config.js`. Add dark variants to existing utility classes in components (`dark:bg-grafana-bg dark:text-grafana-text`). Toggle by adding/removing `dark` class on `<html>`. Store preference in `localStorage`. This requires touching every component that uses surface/content colors.

Option B — CSS variables (cleaner for a full dark theme): Define `--color-surface`, `--color-content`, etc. as CSS custom properties in `globals.css`. Switch the variable values under a `.dark` selector. Components use `bg-surface` → maps to the variable. This requires converting Tailwind color references to CSS variable references — a larger refactor.

**Recommended path for this milestone:** Option A (Tailwind class dark mode) is faster. The `grafana.*` palette already defines a dark theme. A `ThemeProvider` context stores `isDark: boolean`, adds/removes `dark` class on `<html>`. Component by component, add `dark:` variants where needed.

**Key implementation note:** The Tailwind config uses semantic names (`surface`, `content`, `accent`) — not `gray-100` etc. This makes the dark theme migration tractable: each semantic name gets a `dark:` variant that maps to the `grafana.*` equivalents.

**New files needed:**
- `packages/frontend/src/contexts/ThemeContext.tsx` — stores isDark, provides toggle
- `packages/frontend/src/components/ui/ThemeToggle.tsx` — button for the new nav

**Modified files:**
- `packages/frontend/tailwind.config.js` — add `darkMode: 'class'`
- `packages/frontend/src/app/globals.css` — add dark body defaults
- `packages/frontend/src/app/layout.tsx` — wrap in `ThemeProvider`
- Navigation component — add `ThemeToggle`

---

### Feature 8: Linear-Style Left Nav + Dashboard Layout

**What it is:** Replace the top horizontal navigation bar with a left sidebar that lists league-specific views. The dashboard layout has a persistent left nav, collapsible on mobile, with the main content area to the right.

**Current state:** `Navigation` component in `packages/frontend/src/app/navigation.tsx` is a top-bar with Home/Leagues/Admin links. League-level navigation (standings, waivers, trades, etc.) is not exposed in the top nav — users navigate by typing URLs or clicking within-page links on the league dashboard.

**New layout structure:**

```
RootLayout (layout.tsx)
  ├── Navigation (top bar — simplified to logo + user menu only)
  └── LeagueShell (new layout component for /leagues/[id]/* routes)
      ├── LeftNav (sidebar with league-specific links)
      │   ├── League name + season
      │   ├── Dashboard (overview)
      │   ├── Standings
      │   ├── Waivers
      │   ├── Trades
      │   ├── Trends
      │   ├── Streaming
      │   ├── Lineup
      │   └── Moves
      └── MainContent (children)
```

**Where it lives in Next.js App Router:** Add a `layout.tsx` at `packages/frontend/src/app/leagues/[id]/layout.tsx`. This layout wraps all sub-pages under `/leagues/[id]/` and renders the left sidebar.

**Current state check:** There is no `layout.tsx` at `packages/frontend/src/app/leagues/[id]/` yet — only a `page.tsx`. The league-level layout file is new.

**New files:**
- `packages/frontend/src/app/leagues/[id]/layout.tsx` — LeagueShell with LeftNav
- `packages/frontend/src/components/league/LeagueNav.tsx` — sidebar nav component

**Modified files:**
- `packages/frontend/src/app/navigation.tsx` — simplify top bar (remove league links, keep logo + user)
- `packages/frontend/src/app/layout.tsx` — may need minor adjustments if Navigation changes

**Build dependency:** None — purely frontend. Can be built first to establish the shell before adding new pages/features. All existing pages under `/leagues/[id]/` will automatically get the new shell layout when `layout.tsx` is added.

---

## Build Order

Dependencies flow as follows. Items on the same level can be built in parallel.

```
Level 0 (pure foundations, no deps)
  ├── Feature 7: Dark theme + ThemeProvider
  ├── Feature 8: Left nav + LeagueShell layout
  └── Feature 1: Roto interpolation pure function (packages/shared/src/formulas.ts)

Level 1 (depends on Level 0 being stable)
  └── Feature 2: Marginal gain calculator
      ├── New method on StandingsProjectionAgent
      └── New API endpoint GET /api/leagues/:id/teams/:teamId/marginal-gains

Level 2 (depends on Feature 2 existing)
  └── Feature 5: Net waiver analysis
      ├── Extend WaiverRecommendationAgent with marginal-gain cross-reference
      └── Update waivers API + waivers page UI

Level 2 (parallel path, no dep on Feature 2)
  ├── Feature 3: FAAB tracking
  │   ├── Derive from transaction history (no schema change)
  │   └── New API endpoint GET /api/leagues/:id/faab
  └── Feature 4: GS/K pace tracking
      ├── New GsPaceAgent using MLBStatsAPIAdapter
      └── New API endpoint GET /api/leagues/:id/teams/:teamId/pace

Level 3 (depends on Level 1 + Level 2 being stable)
  └── Feature 6: N×M trade finder
      ├── Extend TradeRecommendationAgent with combinatorial search
      └── Update trades API + trades page UI
```

**Rationale for order:**
- Dark theme and left nav are purely frontend and establish the shell before features populate it.
- Roto interpolation is a pure function with zero risk — build it first to validate the math.
- Marginal gain depends on projections being computed (existing) and unlocks the smart waiver filtering.
- FAAB and GS/K pace are independent data-fetch features — can be parallelized.
- Trade finder comes last because it's computationally expensive and depends on having the projection engine stable.

---

## Component Boundaries

### New Components

| Component | Package | Type | Responsibility |
|-----------|---------|------|----------------|
| `interpolateRotoPoints()` | `shared/src/formulas.ts` | Pure function | Fractional roto point interpolation |
| `StandingsProjectionAgent.getMarginalGains()` | backend | New method on existing agent | Gap-to-next-rank calculation |
| `GsPaceAgent` | backend | New agent class | GS/K pace projection via MLBStatsAPIAdapter |
| `LeagueShell` + `LeagueNav` | frontend | Layout + nav | Left sidebar shell for /leagues/[id]/* |
| `ThemeContext` + `ThemeToggle` | frontend | Context + UI | Dark theme management |
| `GET /marginal-gains` | backend API | New route | Marginal gain data endpoint |
| `GET /faab` | backend API | New route | FAAB budget tracking endpoint |
| `GET /pace` | backend API | New route | GS/K pace endpoint |

### Modified Components

| Component | Package | Change | Why |
|-----------|---------|--------|-----|
| `ESPNAdapter.normalizeLeagueData()` | backend | Extract `acquisitionBudgetRemaining` | FAAB data source |
| `WaiverRecommendationAgent.getRecommendations()` | backend | Add `targetCategories` param + marginal gain cross-reference | Net waiver analysis |
| `TradeRecommendationAgent` | backend | Add `generateMultiPlayerCandidates()` | N×M trade finder |
| `tailwind.config.js` | frontend | Add `darkMode: 'class'` | Dark theme |
| `layout.tsx` (root) | frontend | ThemeProvider wrap | Dark theme |
| `navigation.tsx` | frontend | Simplify to logo + user only | Left nav takes over league navigation |

### Unchanged Components

| Component | Why Untouched |
|-----------|---------------|
| `StandingsProjectionAgent.computeProjectedStandings()` | Core algorithm unchanged; interpolation is additive |
| `ProjectionsIngestAgent` | No changes to projection ingestion |
| `SnapshotOrchestratorAgent` | Snapshot flow unchanged; FAAB is a separate read path |
| All existing frontend pages under `/leagues/[id]/` | Pages gain left nav for free via new `layout.tsx` |
| `packages/shared/src/types.ts` | Existing types sufficient; new types added only if needed |

---

## Data Flow Map

### Marginal Gain Request Flow

```
User loads /leagues/[id]/waivers
  ↓
Frontend: useQuery(["marginalGains", leagueId, teamId])
  ↓ GET /api/leagues/:id/teams/:teamId/marginal-gains
  ↓
API handler → StandingsProjectionAgent.getMarginalGains(leagueId, teamId, latestDate)
  ↓
DB query: SELECT * FROM team_daily_projected_category
          WHERE league_id = ? AND snapshot_date = ?
          ORDER BY category_id, projected_rank
  ↓
Self-join: for each (teamId, categoryId), find the team ranked one above
Compute: gapToNextRank = adjacentTeamValue - myValue
  ↓
Response: [{ categoryId, currentRank, gapToNextRank, canGainPoint }, ...]
  ↓
Frontend renders: priority list of categories to target
```

### FAAB from Transaction History

```
User loads /leagues/[id]/faab (or included in dashboard)
  ↓
GET /api/leagues/:id/faab
  ↓
API handler:
  1. Load league settings → acquisition_rules.acquisition_budget (or default 100)
  2. SELECT team_id, SUM(raw_event_json->>'bidAmount') as spent
     FROM league_transaction_event
     WHERE league_id = ? AND event_type = 'waiver'
     GROUP BY team_id
  3. Compute remaining = budget - spent
  ↓
Response: [{ teamId, teamName, faabBudget, faabSpent, faabRemaining }, ...]
```

Note: `bidAmount` is stored in `raw_event_json` (not a typed column). The `LeagueTransactionEvent` type does not expose `bid_amount` as a first-class field. A migration to add `bid_amount` as a proper column would be cleaner, but the JSONB extraction works for MVP.

### GS/K Pace Request Flow

```
GET /api/leagues/:id/teams/:teamId/pace
  ↓
GsPaceAgent.getTeamGsPace(teamId, snapshotDate, gsCap)
  ↓
1. Load roster from team_roster_snapshot
2. Load SP/RP players from player table (filter by positions)
3. Call MLBStatsAPIAdapter for YTD stats (GS, IP, K) per player
4. Load remaining RoS projections from player_projection
5. Compute pace: projectedSeasonGs = gsToDate + projectedRemainingGs
  ↓
Response per pitcher: { gsToDate, ipToDate, kToDate, projectedSeasonGs, projectedSeasonIp, projectedSeasonK }
```

### N×M Trade Finder Flow

```
GET /api/leagues/:id/teams/:teamId/trades/candidates?partnerTeamId=Y&maxPlayersEachSide=2
  ↓
TradeRecommendationAgent.generateMultiPlayerCandidates()
  ↓
1. Load all player projections for both rosters into memory (one query each)
2. Load all teams' projected category values into memory (one query)
3. Generate all combinations: C(myRoster, N) × C(partnerRoster, N) for N=1..maxPlayersEachSide
4. For each combination: simulate swap using in-memory projections (no DB calls in inner loop)
5. Rank by deltaOverallPoints for my team (positive = beneficial)
6. Return top K results
  ↓
Response: [TradeImpactAnalysis] sorted by delta
```

---

## Architectural Patterns

### Pattern 1: Extend Existing Agents, Don't Create New Ones

**What:** `getMarginalGains()` lives on `StandingsProjectionAgent`, not a new class. The marginal gain calculation is a direct consequence of the projection data `StandingsProjectionAgent` already writes.

**When to use:** When the new functionality is a query/transform of data the existing agent owns. New agent classes are warranted only when the data source is new (e.g., `GsPaceAgent` needs MLB Stats API, which is a different data source than the existing projection/snapshot flow).

**Trade-off:** Agents can grow large. If `StandingsProjectionAgent` exceeds ~400 lines with the new method, consider extracting the marginal gain logic to a thin helper module that the agent calls.

### Pattern 2: In-Memory Projection Cache for Combinatorial Search

**What:** For the N×M trade finder, load all needed data once into memory before the combinatorial loop. Do not query the DB inside the inner loop.

**When to use:** Any operation that evaluates O(N^2) or more candidates.

**Example:**
```typescript
// Load once before loop
const allProjections = await loadAllProjectionsForLeague(leagueId, snapshotDate);
const allCategoryValues = await loadAllCategoryProjections(leagueId, snapshotDate);

// Inner loop uses in-memory data only
for (const combo of combinations) {
  const delta = simulateSwapInMemory(combo, allProjections, allCategoryValues);
}
```

### Pattern 3: JSONB Extraction for Untyped Fields

**What:** Fields that exist in `raw_event_json` but not as typed DB columns can be extracted with Kysely's `sql` template tag.

**Example:**
```typescript
import { sql } from "kysely";
const result = await db
  .selectFrom("league_transaction_event")
  .select([
    "team_id",
    sql<number>`COALESCE((raw_event_json->>'bidAmount')::numeric, 0)`.as("bid_amount")
  ])
  .where("event_type", "=", "waiver")
  .execute();
```

**Trade-off:** JSONB extraction is slower than a typed column. Add a `bid_amount numeric` column via migration when volume grows.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Re-ranking Inside Every API Request

**What people do:** When computing marginal gains, re-run the full standings projection (fetch all projections, compute rate stats, rank all teams) inside the API handler.

**Why it's wrong:** `StandingsProjectionAgent.computeProjectedStandings()` runs ~1 second and writes to DB. `team_daily_projected_category` already has the ranked data. Re-running it on every request defeats the daily snapshot model.

**Do this instead:** `getMarginalGains()` reads from `team_daily_projected_category` (already ranked). The snapshot runs once daily. The API reads pre-computed data.

### Anti-Pattern 2: Averaging Rate Stats

**What people do:** Compute "average ERA" across multiple pitchers as the mean of individual ERAs.

**Why it's wrong:** `StandingsProjectionAgent` uses component math (`calculateFinalRate()`). Averaging rates loses volume weighting. A 300-IP ace at 2.50 ERA contributes more than a 20-IP reliever at 2.50 ERA.

**Do this instead:** Always combine stat components and compute the rate from totals. This is already implemented in `StandingsProjectionAgent` — extend it, don't bypass it.

### Anti-Pattern 3: New DB Table per Feature

**What people do:** Create a `team_daily_marginal_gain` table to store the gap values.

**Why it's wrong:** Marginal gain is a derived query from `team_daily_projected_category`. Materializing it adds a write step, a sync step, and a migration — for data that's trivially recomputed in milliseconds from an already-indexed table.

**Do this instead:** Query `team_daily_projected_category` on demand. Only materialize if query performance becomes an issue (currently a trivial self-join on an indexed table).

### Anti-Pattern 4: Frontend Direct DB Queries

**What people do:** Use Prisma or direct DB access in Next.js Server Components to bypass the Fastify API layer.

**Why it's wrong:** All business logic (rate stat formulas, roto point computation, degraded state handling) lives in the Fastify agents. Bypassing the API layer would require duplicating this logic in the frontend.

**Do this instead:** All data access goes through the Fastify API. Frontend uses TanStack Query with `api.*` client calls.

---

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| StandingsProjectionAgent ↔ team_daily_projected_category | DB read/write | getMarginalGains() reads what computeProjectedStandings() writes |
| WaiverRecommendationAgent ↔ StandingsProjectionAgent | Direct call for marginal gain cross-reference | Pass marginGains result in, not a new DB table |
| GsPaceAgent ↔ MLBStatsAPIAdapter | Direct call (already instantiated in StreamingPitcherAgent pattern) | Follow same constructor injection pattern |
| TradeRecommendationAgent ↔ in-memory projections | In-process data loaded at start of combinatorial search | Load projections once per trade search request |
| ThemeContext ↔ Tailwind dark: variants | HTML class toggle (`dark` on `<html>`) | Standard Tailwind class-based dark mode |
| LeagueShell layout ↔ existing pages | Next.js layout.tsx nesting | All /leagues/[id]/* sub-pages inherit shell automatically |

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| ESPN API (mTeam view) | Existing ESPNAdapter fetch | Add extraction of `acquisitionBudgetRemaining` from existing raw response |
| MLB Stats API | Existing MLBStatsAPIAdapter | GsPaceAgent uses the same adapter already used by StreamingPitcherAgent |
| FanGraphs CSV | Existing ProjectionsIngestAgent | No changes needed for GS/K pace (uses MLB Stats API instead) |

---

## Sources

- Existing codebase: `packages/backend/src/agents/standings-projection.ts` — rankAndStore() method, roto point assignment loop (read 2026-03-23)
- Existing codebase: `packages/backend/src/agents/waiver-recommendation.ts` — simulateSwap() full implementation (read 2026-03-23)
- Existing codebase: `packages/backend/src/agents/trade-recommendation.ts` — TradeImpactAnalysis interface, generateTradeCandidates() (read 2026-03-23)
- Existing codebase: `packages/backend/src/adapters/espn.ts` — ESPNTransaction.bidAmount field, normalizeLeagueData() acquisitionRules extraction (read 2026-03-23)
- Existing codebase: `packages/backend/src/db/schema.ts` — all 24 table interfaces including league_transaction_event without bid_amount column (read 2026-03-23)
- Existing codebase: `packages/shared/src/types.ts` — LeagueTransactionEvent, LeagueSettings.acquisition_rules (read 2026-03-23)
- Existing codebase: `packages/frontend/tailwind.config.js` — grafana dark palette already defined, darkMode not set (read 2026-03-23)
- Existing codebase: `packages/frontend/src/app/navigation.tsx` — top-bar nav, no league-level links (read 2026-03-23)
- MEDIUM confidence: ESPN `acquisitionBudgetRemaining` field name — based on known ESPN API structure and the `waiverBudgetSpent` reference at line 1185 of espn.ts; needs verification against live API response

---

*Architecture research for: In-season roto command center*
*Researched: 2026-03-23*
