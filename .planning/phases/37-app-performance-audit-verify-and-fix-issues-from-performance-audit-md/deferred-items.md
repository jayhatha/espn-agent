# Deferred Items - Phase 37

## N+1 Patterns Discovered But Out of Scope for Plan 02

### 1. `writeFreeAgentPlayers` in snapshot-orchestrator.ts (line 1173)

**File:** `packages/backend/src/agents/snapshot-orchestrator.ts`
**Function:** `writeFreeAgentPlayers` (~line 1164)
**Issue:** Per-FA upsert loop, same N+1 pattern as B-03 but in snapshot orchestrator context
**Impact:** ~300 individual player INSERTs per call
**Fix:** Same batch insert pattern used in recommendations.ts B-03 fix

### 2. `fetchAndStoreFreeAgents` in snapshot-orchestrator.ts (line 1215)

**File:** `packages/backend/src/agents/snapshot-orchestrator.ts`
**Function:** `fetchAndStoreFreeAgents` (~line 1200)
**Issue:** Per-FA upsert loop with additional logic, same N+1 pattern
**Impact:** ~300 individual player INSERTs per snapshot run
**Fix:** Collect all player rows, batch INSERT...ON CONFLICT after loop

These were discovered during verification of Plan 02 B-01 changes. They were not listed in the PERFORMANCE_AUDIT.md targets for this plan and were deferred to avoid scope creep.
