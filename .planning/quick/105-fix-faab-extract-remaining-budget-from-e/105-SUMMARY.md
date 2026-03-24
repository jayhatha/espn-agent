# Quick Task 105: Fix FAAB — Extract from ESPN Team Data

**Completed:** 2026-03-24
**Tasks:** 1/1

## Root Cause
FAAB remaining was computed as `budget - sum(bids)` from `league_transaction_event`, but transaction ingestion was never implemented (CLAUDE.md Known Issue). Result: bids sum = 0, so FAAB always showed full budget.

## What Changed

### packages/shared/src/types.ts
- Added `faab_spent: number | null` to `Team` interface

### packages/backend/src/db/migrations/019_add_team_faab_spent.sql
- New migration: `ALTER TABLE team ADD COLUMN faab_spent NUMERIC DEFAULT 0`

### packages/backend/src/adapters/espn.ts
- Added `faabSpent?: number` to `ESPNTeamData` interface
- Extracts `transactionCounter.acquisitionBudgetSpent` from ESPN raw team data during normalization

### packages/backend/src/agents/snapshot-orchestrator.ts
- Writes `faab_spent` to team table during upsert on each snapshot

### packages/backend/src/agents/faab-tracker.ts
- `getSummary()` now reads `faab_spent` directly from team table (ESPN-sourced)
- Falls back to transaction-derived spending only if `faab_spent` is null
