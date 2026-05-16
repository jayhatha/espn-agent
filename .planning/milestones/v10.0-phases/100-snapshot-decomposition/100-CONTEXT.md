# Phase 100: Snapshot Pipeline Decomposition — Context

**Gathered:** 2026-05-15
**Status:** Ready
**Milestone:** v10.0 Architecture Improvements

<domain>
## Phase Boundary

Decompose `SnapshotOrchestratorAgent.executeSnapshot()` from a single 300+ line method mixing 8 concerns into named private phases, each independently testable.

## Evidence

`executeSnapshot()` at line 90 currently mixes:

1. ESPN API fetch
2. Raw payload archival
3. Settings-version resolution (`getOrCreateSettingsVersion()` at L599)
4. Degraded-state policy (already extracted as `computeDegradedStatus()` at L27)
5. DB transaction writes: snapshot + teams + players + rosters + free-agents + category-totals + ranks + overall + period-stats
6. Projected standings computation (`standingsAgent.computeProjectedStandings()` at L298)
7. Change-log emission (`changeLogAgent.generateEvents()` at L331)
8. Job progress reporting

`computeDegradedStatus()` at L27 is already a good pattern — extend it to the rest.
</domain>

<decisions>
## Implementation Strategy

Extract 5 private methods from `executeSnapshot()`:

1. `fetchAndArchive(leagueId, espnLeagueId, cookies)` → `{ raw, settingsVersion }` — ESPN fetch + raw archive + settings resolution
2. `writeSnapshotRows(leagueId, settingsVersion, raw, snapshot)` → void — all DB writes in one transaction
3. `computeProjections(leagueId, snapshotId, date)` → void — projected standings computation
4. `emitChangeLog(leagueId, previousSnapshot, currentSnapshot)` → void — event generation

`executeSnapshot()` becomes an orchestrator calling the 4 methods in sequence with degraded-state threading.

## Acceptance Criteria

- `executeSnapshot()` body ≤ 40 lines (orchestration only)
- Each extracted method can be called from a test with minimal mocking
- Existing tests in `snapshot-pipeline.test.ts` continue to pass

## Files to Modify

- `packages/backend/src/agents/snapshot-orchestrator.ts`
- `packages/backend/src/__tests__/snapshot-pipeline.test.ts` — extend with new tests for extracted methods
  </decisions>
