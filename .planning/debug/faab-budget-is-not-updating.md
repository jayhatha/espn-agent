---
status: resolved
trigger: faab budget is not updating.
created: 2026-05-05
updated: 2026-05-05
---

# Symptoms

- expected: FAAB budget reflects latest ESPN spending for selected team after snapshots refresh league data.
- actual: FAAB budget view remains unchanged or stale instead of reflecting updated spend.
- errors: none reported.
- timeline: current issue reported after prior waiver and trade debugging work.
- reproduction: open FAAB budget UI for league team after ESPN-side budget changes or new snapshot.

# Current Focus

- hypothesis: confirmed. Snapshot persistence path was dropping `normalized.teams[].faabSpent`, so `FaabTrackerAgent` read stale/default `team.faab_spent` values.
- test: inspected ESPN adapter extraction, snapshot orchestrator team upsert, and FAAB tracker read path.
- expecting: confirmed. Adapter exposed `faabSpent`, tracker read `team.faab_spent`, snapshot upsert omitted persistence.
- next_action: trigger snapshot refresh and verify FAAB budget updates from persisted spend.

# Evidence

- timestamp: 2026-05-05T00:00:00Z
  fact: `FaabTrackerAgent.getSummary()` reads `team.faab_spent` for current and league-average remaining budget.
- timestamp: 2026-05-05T00:00:00Z
  fact: `ESPNAdapter.normalizeLeague()` extracts `transactionCounter.acquisitionBudgetSpent` into `faabSpent`.
- timestamp: 2026-05-05T00:00:00Z
  fact: current `SnapshotOrchestratorAgent` team upsert only writes `league_id`, `espn_team_id`, and `name`, with no `faab_spent` update.

# Eliminated

- hypothesis: none yet.

# Resolution

- root_cause: `SnapshotOrchestratorAgent` team upsert never persisted ESPN `faabSpent` into `team.faab_spent`, so FAAB summary read stale/default database values after refreshes.
- fix: added `faab_spent: team.faabSpent ?? 0` to team insert rows and `faab_spent: eb.ref("excluded.faab_spent")` to conflict updates in snapshot persistence.
- verification: direct backend `tsc --noEmit` still fails on unrelated pre-existing error `packages/backend/src/db/migrate.ts:325` (`getAppliedVersions` missing); control-path verification now aligns adapter extract -> snapshot persist -> tracker read.
- files_changed: ["packages/backend/src/agents/snapshot-orchestrator.ts", ".planning/debug/faab-budget-is-not-updating.md"]