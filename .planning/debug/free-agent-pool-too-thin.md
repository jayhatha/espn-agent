---
status: resolved
slug: free-agent-pool-too-thin
trigger: "Waiver recommendations are always empty because the authoritative free-agent pool is too thin."
created: 2026-05-05
updated: 2026-05-05
---

# Debug Session: free-agent-pool-too-thin

## Symptoms

- **Expected:** `GET /api/leagues/:id/teams/:teamId/waivers/recommendations` returns a non-empty list of add/drop suggestions.
- **Actual:** Returns `{ recommendations: [] }` even though projections exist and the team has a full roster.
- **Errors:** No error — silent empty result.
- **Timeline:** Persists after the waiver-recs fix work that enforced authoritative-only sources.
- **Reproduction:** Hit the recommendations endpoint; check logs for "Free agents identified" count — it logs 0.

## Evidence

- timestamp: 2026-05-05T00:00Z
  finding: "WaiverRecommendationAgent Tier 2 queries league_free_agent_snapshot for the snapshotDate (waiver-recommendation.ts line 88-97). Returns empty → falls to Tier 3."

- timestamp: 2026-05-05T00:01Z
  finding: "snapshot-orchestrator.ts writeFreeAgentPlayers (line 681+) only upserts into `player` table. No insert into `league_free_agent_snapshot`. Table stays perpetually empty for all snapshot dates."

- timestamp: 2026-05-05T00:02Z
  finding: "Tier 3 falls back to raw ESPN payload parsing. ESPN's primary league endpoint rarely includes free agent entries, so normalized.freeAgents is also empty or near-empty."

- timestamp: 2026-05-05T00:03Z
  finding: "With both Tier 2 and Tier 3 empty, freeAgents = [] → zero add candidates → zero recommendations returned."

- timestamp: 2026-05-05T00:04Z
  finding: "Worktrees agent-ac4ad883 and agent-a805091f both have league_free_agent_snapshot writes in their orchestrator (line 1251) — this is the intended fix that never got merged to main."

## Eliminated

- hypothesis: "Projections are missing — simulateSwap returns null"
  eliminated_by: "Player projections exist (projections_run is fresh). Root cause is upstream: zero free-agent candidates are even passed to simulateSwap."

- hypothesis: "ESPN API never returns free agents"
  eliminated_by: "ESPN's /players endpoint can return non-rostered players, but the free-agent fetch requires a separate API call with filterStatus=AVAILABLE that is not being made during the standard snapshot flow."

## Current Focus

hypothesis: "writeFreeAgentPlayers must write to league_free_agent_snapshot (with league_id + snapshot_date) in addition to (or instead of) the bare player upsert. The recommendations agent Tier 2 then finds rows and recommendations become non-empty."
next_action: "RESOLVED — fix applied in commit 8d86984"

## Resolution

root_cause: "SnapshotOrchestratorAgent never wrote to league_free_agent_snapshot. writeFreeAgentPlayers only upserted into the player table. ESPN primary endpoint does not return free agents reliably, so Tier 2 table stayed empty and Tier 3 fallback also yielded nothing — freeAgents=[] and zero waiver recommendations."
fix: "Added fetchAndStoreFreeAgents() private method that calls espnAdapter.fetchFreeAgents() (separate ESPN /players call with filterStatus=AVAILABLE/WAIVERS, limit 300) and upserts into player and league_free_agent_snapshot with ownership_pct/started_pct. Called non-blocking as step 8 in executeSnapshot; failures are caught/logged without aborting the snapshot."
files_changed:

- packages/backend/src/agents/snapshot-orchestrator.ts
