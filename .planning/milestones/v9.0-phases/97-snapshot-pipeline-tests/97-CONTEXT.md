# Phase 97: Snapshot Pipeline Integration Tests — Context

**Gathered:** 2026-05-06
**Status:** Complete
**Mode:** Auto-generated (autonomous mode)

<domain>
## Phase Boundary

Add integration tests for the two critical seams in the snapshot pipeline that have no test coverage:

1. `SnapshotRepository.getPlayerProjections` empty-array guard
2. `SnapshotOrchestratorAgent` degraded flag logic (`is_degraded` + `degraded_reasons`)

These seams were identified by the architectural assessment as unverified entry points for data integrity bugs.
</domain>

<decisions>
## Test Location
`packages/backend/src/__tests__/snapshot-pipeline.test.ts` — co-located with existing `trade-recommendation.test.ts`.

## Test Approach

- Use vi.fn() mocks (same pattern as test-helpers.ts) rather than real DB
- Extract the degraded flag logic as a pure local function for unit testing (avoids needing to mock all 9 `executeSnapshot` dependencies)
- Import `SnapshotRepository` directly to test the guard in isolation
  </decisions>
