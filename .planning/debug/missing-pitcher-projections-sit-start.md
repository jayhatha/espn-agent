---
status: awaiting_human_verify
trigger: "missing-pitcher-projections-sit-start"
created: 2026-03-29T00:00:00Z
updated: 2026-03-29T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - fetchRosteredSPs in SitStartAdvisor filters roster_slot IN ('SP', 'P'), which excludes 'BE' (bench) and 'IL' slots. Any SP benched or on IL is excluded.
test: Expanding the roster_slot filter to include 'BE' and 'IL', keeping the positions='SP' guard to still exclude relievers.
expecting: All rostered SPs regardless of slot appear in the table
next_action: Apply fix to sit-start-advisor.ts

## Symptoms

expected: All rostered pitchers (including bench) should appear on the sit/start tab with their scraped rankings/projections from PitcherList, RotoBaller, and FanGraphs
actual: Some pitchers are missing from the sit/start tab despite the scrapers finding data for them
errors: No error messages reported
reproduction: View the sit/start tab on the pitching usage page (/leagues/[id]/streaming)
started: Unclear - may have always been this way

## Eliminated

## Evidence

- timestamp: 2026-03-29T00:00:00Z
  checked: packages/backend/src/agents/sit-start-advisor.ts fetchRosteredSPs() method
  found: Line 323 filters `.where("team_roster_snapshot.roster_slot", "in", ["SP", "P"])` — excludes "BE" (bench, ESPN slot 16) and "IL" (injured list, ESPN slot 17)
  implication: Any SP sitting on the bench (roster_slot = 'BE') is invisible to this query. This is the root cause.

- timestamp: 2026-03-29T00:00:00Z
  checked: packages/backend/src/adapters/espn.ts ESPN_LINEUP_SLOT_MAP
  found: Slot 16 = "BE" (bench), Slot 17 = "IL". The rosterSlot field is set to the map value for the player's current lineupSlotId.
  implication: A benched SP gets roster_slot='BE' in team_roster_snapshot, not 'SP'. The existing `'SP' = ANY(player.positions)` guard is a safe secondary filter that will still exclude relievers on bench.

## Resolution

root_cause: SitStartAdvisor.fetchRosteredSPs() filters team_roster_snapshot.roster_slot IN ('SP', 'P'). Bench slot ('BE') and IL slot ('IL') are excluded, so SPs who are currently benched or on IL are never returned and therefore missing from the sit/start table.
fix: Expand the roster_slot filter to include 'BE' and 'IL' slots. The existing `'SP' = ANY(player.positions)` WHERE clause already ensures only SP-eligible players are included, so bench relievers remain excluded.
verification: All 11 existing unit tests pass. Fix is a one-line SQL filter expansion; logic is correct. Awaiting human verification that bench SPs now appear in the sit/start tab.
files_changed: [packages/backend/src/agents/sit-start-advisor.ts]
