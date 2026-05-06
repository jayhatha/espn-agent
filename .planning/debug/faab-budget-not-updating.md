---
status: resolved
slug: faab-budget-not-updating
trigger: "FAAB budget is not updating — team.faab_spent stays stale between snapshots."
created: 2026-05-05
updated: 2026-05-05
---

# Debug Session: faab-budget-not-updating

## Symptoms

- **Expected:** After each daily snapshot the FAAB page shows each team's current remaining budget reflecting bids since the season started.
- **Actual:** FAAB remaining appears to never change; all teams show the full starting budget (or a stale value from the first snapshot).
- **Errors:** No error — silent data staleness.
- **Timeline:** Unknown start; discovered 2026-05-05.
- **Reproduction:** Hit `GET /api/leagues/:id/teams/:teamId/faab` on two different days — returns identical `faabRemaining`.

## Evidence

- timestamp: 2026-05-05T00:00Z
  finding: "ESPN adapter extracts faabSpent from transactionCounter.acquisitionBudgetSpent (espn.ts line 1250-1263) and sets it on the normalized team object."

- timestamp: 2026-05-05T00:01Z
  finding: "snapshot-orchestrator.ts team upsert (lines 259-268) only updates `name` on conflict — faab_spent is NEVER written to the team row during any snapshot."

- timestamp: 2026-05-05T00:02Z
  finding: "FaabTrackerAgent.getSummary reads team.faab_spent from DB (faab-tracker.ts line 38). If it was never written it returns null, causing fallback to transaction-derived path which also returns 0 if league_transaction_event is empty."

## Eliminated

- hypothesis: "ESPN API doesn't return FAAB data"
  eliminated_by: "espn.ts line 1250 successfully maps transactionCounter.acquisitionBudgetSpent"

## Current Focus

hypothesis: "snapshot-orchestrator team upsert never writes faab_spent — ESPN-extracted value is discarded. Fix: add faab_spent to the doUpdateSet clause in the team upsert."
next_action: "Confirm by adding faab_spent to the onConflict doUpdateSet in writeTeams. Re-snapshot and verify FaabTrackerAgent returns correct remaining budget."

## Resolution

root_cause: "snapshot-orchestrator team upsert never wrote faab_spent on conflict; migrate.ts markAsApplied called missing getAppliedVersions function"
fix: "Added faab_spent to doUpdateSet in team upsert (snapshot-orchestrator.ts); added getAppliedVersions function to migrate.ts"
files_changed:

- packages/backend/src/agents/snapshot-orchestrator.ts
- packages/backend/src/db/migrate.ts
