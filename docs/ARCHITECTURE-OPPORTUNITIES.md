# Architecture Deepening Opportunities

Five candidates identified via deletion test. Each hides complexity that reappears in callers when deleted.

---

## 1. SnapshotOrchestratorAgent — collapsed pipeline seam

**Files**
- `packages/backend/src/agents/snapshot-orchestrator.ts`
- `packages/backend/src/workers/snapshot-worker.ts`

**Problem**
The orchestrator constructs its own `ESPNAdapter` and `StandingsProjectionAgent` internally. This collapses the snapshot pipeline composition into an implementation detail. You cannot substitute a stub adapter to test individual pipeline stages or run stages in isolation. The worker further hard-codes both the `db` singleton and the orchestrator instantiation. Deletion test: delete the orchestrator and the complexity (ordering, error propagation, degraded-state flagging) reappears in the worker.

**Solution**
Accept sub-agents and adapters as constructor parameters. The orchestrator's interface becomes "run these stages in order with these inputs," not "also please build all your own tools." The worker becomes a thin launcher.

**Benefits**
- Every pipeline stage gains a seam — testable with fixture data
- Degraded-flag logic testable without touching ESPN
- Snapshot ordering bugs concentrate in one place (locality)

---

## 2. Recommendation routes — missing FreeAgentView / TradeView module

**Files**
- `packages/backend/src/api/recommendations.ts`
- `packages/backend/src/api/leagues.ts`
- `packages/backend/src/api/timeseries.ts`

**Problem**
Route handlers mix HTTP parsing, auth checks, raw DB queries, adapter calls, and response formatting in one function body. The `GET /free-agents` handler queries `league`, `player`, and `player_projection` tables directly, calls `ESPNAdapter.fetchFreeAgents()`, and formats the response — all in-line. No module earns its keep by doing HTTP *and* query orchestration; one of those is the implementation.

**Solution**
Extract a **FreeAgentView** and **TradeView** module that accepts a `leagueId` and returns the assembled domain object. Routes become thin HTTP facades: parse input → call view → format output. The view owns DB queries and adapter orchestration.

**Benefits**
- Views testable without an HTTP server
- Query logic has locality
- Route interface is verifiable (schema validation in, domain object out)

---

## 3. Stat classification — domain knowledge with no home

**Files**
- `packages/backend/src/agents/waiver-recommendation.ts`
- `packages/backend/src/agents/standings-projection.ts`
- `packages/shared/src/formulas.ts`

**Problem**
`PITCHING_STAT_KEYS` is defined identically in two agent files. `isPitcherProjection()` duplicates a classification rule. The shared package has depth in formula calculation but a blind spot in stat classification — knowledge callers need to invoke formulas correctly. Delete either copy of `PITCHING_STAT_KEYS` and the other doesn't help.

**Solution**
Add a `StatRegistry` module to `packages/shared/src/` that classifies every stat (batting/pitching, counting/rate, formula reference). Agent files import from it; formula dispatch can use it to validate inputs.

**Benefits**
- New stat category = one file changes
- Registry testable in isolation
- Single source of truth for agents, formulas, and projections

---

## 4. CachedHttpClient — repeated infrastructure across six adapters

**Files**
- `packages/backend/src/adapters/espn.ts`
- `packages/backend/src/adapters/pitcherlist.ts`
- `packages/backend/src/adapters/advanced-stats.ts`
- `packages/backend/src/adapters/mlb-statsapi.ts`
- `packages/backend/src/adapters/fangraphs.ts`
- `packages/backend/src/adapters/rotoballer.ts`

**Problem**
Every adapter re-implements: `LRUCache` + `axios` + optional throttle. Cache config, TTL logic, and retry behavior are scattered. Each adapter's real value is parsing and normalization, but that logic is buried alongside boilerplate.

**Solution**
A single `CachedHttpClient` that owns caching, throttling, and retry. Adapters accept it as a constructor parameter. Their implementations shrink to parsing logic only.

**Benefits**
- Cache TTLs tunable in one place
- Retry behavior has locality
- Adapters testable with a stub HTTP client

---

## 5. Player name normalization — three orphaned copies

**Files**
- `packages/backend/src/adapters/pitcherlist.ts` — `normalizePitcherName()`
- `packages/backend/src/adapters/advanced-stats.ts` — `normalizePlayerName()`
- `packages/backend/src/agents/sit-start-advisor.ts` — `normalizeName()`

**Problem**
Same function body in three files. `PlayerIdentityResolutionAgent` already exists as the intended owner of player-matching logic, but its normalization helper is not shared. Deletion test: remove any one copy and the complexity reappears in that file — the others don't help.

**Solution**
One `normalizePlayerName()` in `packages/shared/src/` (or exposed via `PlayerIdentityResolutionAgent`'s public interface). All three files import it.

**Benefits**
- Unicode normalization bug fixed once
- `PlayerIdentityResolutionAgent` becomes the obvious place to deepen player-matching (nickname aliases, suffix handling)
- Zero duplication

---

## Exploration Status

| # | Candidate | Status |
|---|-----------|--------|
| 1 | SnapshotOrchestratorAgent pipeline seam | Not started |
| 2 | FreeAgentView / TradeView module | Not started |
| 3 | StatRegistry in shared | Not started |
| 4 | CachedHttpClient | Not started |
| 5 | normalizePlayerName consolidation | Not started |
