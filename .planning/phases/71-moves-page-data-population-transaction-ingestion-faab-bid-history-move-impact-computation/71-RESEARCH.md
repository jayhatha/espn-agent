# Phase 71: Moves Page Data Population - Research

**Researched:** 2026-03-24
**Domain:** Transaction ingestion, FAAB bid history, move impact computation (ESPN Fantasy API + existing backend agents)
**Confidence:** HIGH

## Summary

This phase addresses a data gap: the moves page frontend is fully built (1413 lines across 6 tabs: League Summary, FAAB Budget, Move Leaderboard, Trades, Draft Report, Impact Timeline) but shows empty because the data pipeline has multiple disconnected pieces. The core issue is NOT missing code -- nearly all code exists -- but rather a configuration/orchestration gap where: (1) transaction ingestion runs during snapshots but may silently fail or return empty pre-season, (2) the TransactionImpactAgent's computeImpacts is never auto-triggered by the snapshot pipeline, (3) season defaults are hardcoded to 2025, and (4) there is no UI affordance to trigger impact computation.

The backend has three tables that feed the moves page: `league_transaction_event` (raw ESPN transactions from mTransactions2 view), `roster_move` (derived from snapshot diffs by TransactionImpactAgent.deriveRosterMoves), and `transaction_impact` (Shapley-based roto-point impacts). The `roster_move`/`transaction_impact` tables are only populated when an admin manually POSTs to `/api/leagues/:id/transaction-impacts/compute`. The FAAB tab reads from `league_transaction_event.raw_event_json.bidAmount` and the `team.faab_spent` column (populated by snapshot).

**Primary recommendation:** Wire the TransactionImpactAgent into the snapshot pipeline (or provide a one-click UI trigger), fix the season defaults from 2025 to dynamic, verify ESPN transaction ingestion is actually working, and add empty-state messaging to guide users when pre-season data is unavailable.

## Project Constraints (from CLAUDE.md)

- **Monorepo**: Turbo + pnpm, changes may span packages/backend and packages/frontend
- **Backend**: Fastify 4, TypeScript, Kysely (PostgreSQL), BullMQ (Redis)
- **Frontend**: Next.js 14 (App Router), TanStack Query v5, Tailwind CSS, Recharts
- **Agent architecture**: Each agent accepts `Kysely<Database>` + optional Pino `logger`, single responsibility, marks outputs as degraded when data incomplete, never fabricates data
- **Component math**: Rate stats use component-based formulas from `packages/shared/src/formulas.ts` -- never average rates directly
- **Empty array guard**: Kysely generates invalid SQL for `WHERE col IN ()` -- always check `array.length > 0`
- **Team selection**: Frontend stores selected team per league in localStorage key `league_${leagueId}_team`
- **Projections are global**: Not league-specific
- **Known issue #1**: Free agent pool never fetched from ESPN (partially addressed now)
- **Known issue #6**: Home page links broken
- **Known issue #9**: TradeRecommendationAgent rate stat adjustments incomplete

## Standard Stack

### Core (Already In Use)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| Kysely | (project version) | SQL query builder for PostgreSQL | Already used by all agents |
| Fastify 4 | (project version) | API routes | Already serves transaction-impact routes |
| TanStack Query v5 | (project version) | Frontend data fetching | Already used by moves page |
| Recharts | (project version) | Impact timeline chart | Already imported in moves page |
| Zod | (project version) | ESPN response validation | Already validates mTransactions2 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| crypto (Node built-in) | N/A | Payload hash for deduplication | Already used in fetchAndStoreTransactions |
| pino | (project version) | Structured logging | Already used by all agents |

**No new dependencies needed.** This phase is entirely about wiring existing code together and fixing gaps.

## Architecture Patterns

### Data Flow: ESPN -> Moves Page

```
ESPN mTransactions2 API
        |
        v
[SnapshotOrchestrator.fetchAndStoreTransactions()] -- runs every snapshot
        |
        v
league_transaction_event table  <-- Raw ESPN transactions with bidAmount
        |                            (FAAB tab reads directly from here)
        v
[TransactionImpactAgent.deriveRosterMoves()]  <-- NOT auto-triggered
        |
        v
roster_move table  <-- Derived from snapshot diffs (week-over-week)
        |
        v
[TransactionImpactAgent.computeShapleyImpacts()]  <-- NOT auto-triggered
        |
        v
transaction_impact table  <-- Shapley roto-point impacts per move
        |
        v
API routes (transaction-impact.ts, faab.ts)
        |
        v
Frontend moves page (6 tabs)
```

### Pattern: The Missing Link

The `POST /api/leagues/:leagueId/transaction-impacts/compute` endpoint exists and works correctly. It:
1. Calls `deriveRosterMoves(leagueId, season)` which diffs weekly roster snapshots to identify adds/drops/trades/draft picks
2. Calls `computeShapleyImpacts(leagueId, season)` which runs Monte Carlo Shapley value decomposition

But this is an admin-only endpoint with NO frontend trigger and NO automatic invocation from the snapshot pipeline. The snapshot orchestrator only calls `fetchAndStoreTransactions` (line 381) which populates `league_transaction_event`, but never triggers impact computation.

### Pattern: Dual Data Sources for Moves

The system has TWO independent sources of transaction data:
1. **league_transaction_event**: Direct from ESPN mTransactions2 API (includes bidAmount, player names, timestamps)
2. **roster_move**: Derived from weekly snapshot diffs (comparing team_roster_snapshot week-over-week)

These are NOT linked. The TransactionImpactAgent uses roster_move exclusively. The FaabTrackerAgent uses league_transaction_event exclusively. This is by design -- roster_move captures the "ground truth" of who was on each roster each week, while league_transaction_event captures ESPN's transaction log including FAAB bid amounts.

### Pattern: Season Hardcoding

The transaction-impact API routes all default to season 2025:
```typescript
// packages/backend/src/api/transaction-impact.ts lines 30, 65, 177, 342
const season = request.query.season ? parseInt(request.query.season, 10) : 2025;
```

The frontend passes `season` from the `/api/leagues/:leagueId/seasons` endpoint which derives available seasons from snapshot data. If the league's snapshots are from 2026, the frontend will send season=2026. But if the query param is missing (e.g., direct API call), it falls back to 2025.

### Recommended Fix Structure

```
packages/
  backend/src/
    agents/
      snapshot-orchestrator.ts  # Add auto-trigger for impact computation
    api/
      transaction-impact.ts     # Fix season default to current year
  frontend/src/
    app/leagues/[id]/moves/
      page.tsx                  # Add compute trigger button + empty states
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Transaction deduplication | Custom dedup logic | Existing `onConflict` with `payload_hash` | Already handles idempotent re-ingestion |
| Impact computation | New impact algorithm | Existing `TransactionImpactAgent.computeShapleyImpacts` | 650+ lines of tested Shapley value logic |
| FAAB budget tracking | New FAAB tracker | Existing `FaabTrackerAgent` | Already reads bidAmount from raw_event_json |
| Roster move detection | New move detector | Existing `TransactionImpactAgent.deriveRosterMoves` | Already handles trade detection, pairing, draft picks |
| Rate stat computation | Manual rate averaging | `calculateFinalRate` from shared/formulas.ts | Component math prevents rate-averaging errors |

**Key insight:** This phase is primarily a wiring/integration phase. All the complex computation code exists. The work is about making it run automatically and making the results visible.

## Common Pitfalls

### Pitfall 1: Pre-Season Empty Transactions
**What goes wrong:** ESPN's mTransactions2 view returns an empty transactions array before the season starts (late March). The code correctly handles this (returns `[]`), but users see an empty page with no explanation.
**Why it happens:** MLB season hasn't started yet, no waiver/add/drop activity has occurred.
**How to avoid:** Add meaningful empty-state UI that explains "No transactions yet -- the season hasn't started" rather than showing blank tabs. Check if `league_transaction_event` has any rows for the league.
**Warning signs:** All 6 tabs show "No data" even after running a snapshot.

### Pitfall 2: Impact Computation Requires Snapshots First
**What goes wrong:** Running `computeImpacts` before any snapshots exist returns 0 moves and 0 impacts. The page still shows empty.
**Why it happens:** `deriveRosterMoves` compares weekly `team_roster_snapshot` rows. With 0-1 snapshots, there are no diffs to detect.
**How to avoid:** Require at least 2 snapshots before enabling impact computation. Display a message like "Need at least 2 weekly snapshots to detect roster changes."
**Warning signs:** `roster_move` table has 0 rows even after computation.

### Pitfall 3: Shapley Computation is Expensive
**What goes wrong:** Triggering `computeShapleyImpacts` on every snapshot creates a massive performance bottleneck. With 500 Monte Carlo samples per team across 12 teams with 30+ moves each, this can take minutes.
**Why it happens:** The Shapley computation is O(teams * moves * samples) -- not suitable for real-time triggering.
**How to avoid:** Run impact computation as a background job (BullMQ), not inline with the snapshot pipeline. Or offer a manual "Compute Impacts" button that users trigger when they want fresh data.
**Warning signs:** Snapshot pipeline hangs for minutes after adding inline impact computation.

### Pitfall 4: Hardcoded Season 2025
**What goes wrong:** API returns empty data because it queries for season 2025 date ranges (`2025-04-01` to `2025-10-31`) when the actual data is from 2026.
**Why it happens:** Default season in transaction-impact.ts is hardcoded to 2025.
**How to avoid:** Change default to `new Date().getFullYear()`. The frontend already passes the correct season from the seasons endpoint, but the fallback must also be correct.
**Warning signs:** API returns empty arrays even though `roster_move` and `transaction_impact` tables have data.

### Pitfall 5: player_period_stats Required for Impact Computation
**What goes wrong:** `computeShapleyImpacts` depends on `player_period_stats` rows (populated during snapshot via `statSplitTypeId === 5` per-period stats). If ESPN doesn't return per-period stats for a scoring period, impact computation produces all-zero or incomplete impacts.
**Why it happens:** ESPN's `statSplitTypeId === 5` represents per-scoring-period stats. Pre-season or early-season, these may be sparse.
**How to avoid:** The `is_incomplete` flag on `transaction_impact` already handles this. Ensure the UI shows the incomplete badge.
**Warning signs:** Impacts all show 0.00 with `is_incomplete: true`.

### Pitfall 6: Empty Array Guard in Kysely
**What goes wrong:** `WHERE col IN ()` generates invalid SQL. The FaabTrackerAgent.getTeamBids checks `teamIds.length === 0` (line 324), but other query paths may not.
**Why it happens:** Kysely does not guard against empty arrays automatically.
**How to avoid:** Always check `array.length > 0` before `.where("col", "in", array)` per CLAUDE.md.
**Warning signs:** SQL syntax errors in logs mentioning `IN ()`.

## Code Examples

### ESPN Transaction Ingestion (Already Working)

```typescript
// Source: packages/backend/src/agents/snapshot-orchestrator.ts lines 1280-1396
// This runs every snapshot as part of Promise.allSettled (non-blocking)
private async fetchAndStoreTransactions(
  espnLeagueId: number,
  season: number,
  auth: ESPNAuthCookies | undefined,
  leagueId: number,
  snapshotDate: string,
  espnTeamIdToDbId: Map<number, number>,
): Promise<number> {
  const transactions = await this.espnAdapter.fetchTransactions({
    leagueId: espnLeagueId, season, auth,
  });
  // ... upserts into league_transaction_event with onConflict doNothing
}
```

### Impact Computation Trigger (Needs Wiring)

```typescript
// Source: packages/backend/src/api/transaction-impact.ts lines 20-46
// This is the admin endpoint that needs to be either:
// (a) auto-triggered after snapshot, or (b) exposed in UI
app.post("/api/leagues/:leagueId/transaction-impacts/compute", async (request) => {
  const agent = new TransactionImpactAgent(db, request.log);
  const totalMoves = await agent.deriveRosterMoves(leagueId, season);
  const impactsComputed = await agent.computeImpacts(leagueId, season);
  return { success: true, season, totalMoves, impactsComputed };
});
```

### FAAB Bid History (Reads from league_transaction_event)

```typescript
// Source: packages/backend/src/agents/faab-tracker.ts lines 103-181
// Filters league_transaction_event for waiver/add types, extracts bidAmount from raw_event_json
const transactions = await this.db
  .selectFrom("league_transaction_event")
  .select(["event_date", "players_added", "raw_event_json"])
  .where("league_id", "=", leagueId)
  .where("team_id", "=", teamId)
  .where("event_type", "in", ["waiver", "add"])
  .orderBy("event_date", "desc")
  .execute();
// raw_event_json contains { bidAmount: number, ... }
```

### Frontend FAAB Tab Data Flow

```typescript
// Source: packages/frontend/src/app/leagues/[id]/moves/page.tsx lines 484-497
// Uses api.getFaabSummary -> GET /api/leagues/:id/teams/:teamId/faab
// Uses api.getFaabHistory -> GET /api/leagues/:id/teams/:teamId/faab/history
const { data: faabSummary } = useQuery({
  queryKey: ["faab-summary", leagueId, teamId],
  queryFn: () => api.getFaabSummary(leagueId, teamId!),
  enabled: !!teamId,
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded impact 0.5 (WaiverRecommendationAgent) | Shapley value decomposition | Phase 9 | Full counterfactual impact per move |
| Sum-of-impacts for roster management | Net Roster Value (actual vs draft-only) | Phase 9 | No double-counting |
| No transaction ingestion | mTransactions2 ingestion during snapshot | Phase 65+ | Raw transactions available |
| Manual admin-only compute | Needs: auto-trigger or UI button | This phase | Impact data visible to users |

## Open Questions

1. **Does ESPN return transactions pre-season?**
   - What we know: The mTransactions2 view is called with the league's season. Pre-draft, there are no waiver claims, trades, or add/drops. Keeper selections may or may not appear as transactions.
   - What's unclear: Whether ESPN returns an empty array or a 404/error when no transactions exist for a season that hasn't started.
   - Recommendation: Handle gracefully -- the code already returns `[]` for empty responses. Add UI messaging for pre-season state.

2. **Should impact computation be automatic or manual?**
   - What we know: Shapley computation with 500 samples across 12 teams is expensive (could take 30-60+ seconds). Running it on every snapshot is wasteful early in the season when rosters barely change.
   - What's unclear: What the actual wall-clock time is for a typical league.
   - Recommendation: Add a "Compute Impacts" button on the moves page (using the existing POST endpoint) with a loading state. Optionally add background BullMQ job for nightly computation later.

3. **How to handle the transition from 2025 to 2026 season?**
   - What we know: The `/api/leagues/:id/seasons` endpoint returns available seasons from snapshot data. The frontend sends the selected season. But API defaults are hardcoded to 2025.
   - What's unclear: Whether any leagues still have 2025 data that needs to remain accessible.
   - Recommendation: Change default from `2025` to `new Date().getFullYear()`. The frontend already handles season selection.

4. **What about the `requireAdmin` middleware on compute endpoint?**
   - What we know: The compute endpoint requires admin role. Regular users cannot trigger impact computation.
   - What's unclear: Whether the intent is for admins only, or whether it should be accessible to any authenticated user.
   - Recommendation: Either add a separate endpoint for users (rate-limited) or change to `authenticate` + `requireLeagueAccess`. The user needs SOME way to trigger computation.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified). This phase uses only existing project dependencies -- no new tools, services, or CLIs.

## Sources

### Primary (HIGH confidence)
- `packages/backend/src/agents/snapshot-orchestrator.ts` lines 377-415 -- fetchAndStoreTransactions wiring
- `packages/backend/src/agents/snapshot-orchestrator.ts` lines 1280-1396 -- fetchAndStoreTransactions implementation
- `packages/backend/src/adapters/espn.ts` lines 688-799 -- ESPN fetchTransactions (mTransactions2 view)
- `packages/backend/src/agents/transaction-impact.ts` -- Full 1451-line Shapley impact agent
- `packages/backend/src/api/transaction-impact.ts` -- All 4 API routes (compute, team impacts, league summary, draft report)
- `packages/backend/src/agents/faab-tracker.ts` -- Full FAAB tracker (summary, bid history, suggested bid)
- `packages/backend/src/api/faab.ts` -- 3 FAAB API routes
- `packages/frontend/src/app/leagues/[id]/moves/page.tsx` -- Full 1413-line moves page with 6 tabs
- `packages/frontend/src/lib/api.ts` lines 340-397 -- All frontend API methods for moves/FAAB
- `packages/backend/src/utils/espn-schemas.ts` lines 54-72 -- Zod schema for mTransactions2 response
- `packages/shared/src/types.ts` lines 205-371 -- All relevant type interfaces

### Secondary (MEDIUM confidence)
- [cwendt94/espn-api baseball league.py](https://github.com/cwendt94/espn-api/blob/master/espn_api/baseball/league.py) -- ESPN API transaction handling patterns
- [ESPN Fantasy API v3 overview](https://stmorse.github.io/journal/espn-fantasy-v3.html) -- General API structure

### Tertiary (LOW confidence)
- ESPN mTransactions2 pre-season behavior -- No official documentation found. Based on codebase handling of empty arrays and the defensive coding in fetchTransactions.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All code exists, verified in codebase
- Architecture: HIGH -- Full data flow traced through 8 source files
- Pitfalls: HIGH -- Identified from code reading (hardcoded seasons, missing triggers, empty states)
- ESPN API behavior: LOW -- Undocumented API, pre-season behavior unknown

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable -- primarily internal code wiring)
