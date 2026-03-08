---
phase: 68-restore-projected-standings
plan: 01
subsystem: extension-ui
tags: [extension, sidebar, projected-standings, ui-restore]
dependency_graph:
  requires: [DraftEngineSignals.projectedStandings]
  provides: [Projected Standings sidebar section]
  affects: [packages/extension/components/EngineInsights.tsx]
tech_stack:
  added: []
  patterns: [collapsible details element, conditional rendering, rate stat formatting]
key_files:
  created: []
  modified:
    - packages/extension/components/EngineInsights.tsx
decisions:
  - "Used &#9662; HTML entity for chevron to match existing pattern in file"
  - "Added categoryValues display alongside rank (plan spec: value + rank/{totalTeams})"
  - "Section labeled 'My Projected Categories' (more descriptive than Phase 25's 'My Category Ranks')"
metrics:
  duration: "~2 minutes"
  completed: "2026-03-07"
  tasks: 1
  files: 1
---

# Quick Task 68: Restore Projected Standings Section to EngineInsights Summary

Restored Projected Standings collapsible section to the extension sidebar EngineInsights component, between IdealRosterPanel and Draft Targets, using the `ProjectedStandingsSignal` the engine already computes.

## What Was Done

**Task 1: Restore Projected Standings section to EngineInsights**

- Added `projectedStandings` to the destructuring of `engineSignals` on line 14
- Inserted a collapsed `<details>` section between `<IdealRosterPanel>` and the Draft Targets section
- Section is gated on `projectedStandings != null && projectedStandings.teamsWithData >= 3`

**Section structure implemented:**

1. **Summary bar:** "Projected Standings" label + user rank badge (`#N` in accent color when `myTeamRank > 0`) + confidence badge (HIGH/MED/LOW based on `draftProgressWeight` thresholds 0.5/0.2) + chevron
2. **Standings table:** All teams from `projectedStandings.standings` (pre-sorted), each row shows rank number, truncated team name (max 15 chars + ellipsis), `(you)` label and `ring-1 ring-accent` highlight for user's team, and roto pts
3. **My Projected Categories sub-section:** Per-category stat value (rate stats `.toFixed(3)`, counting stats `Math.round()`) + rank colored green/red/neutral (top 3 / bottom 3 / middle)
4. **Strong/Weak summary:** `text-positive` "Strong: ..." and `text-negative` "Weak: ..." lines

## Deviations from Plan

None — plan executed exactly as written. Pre-existing TypeScript errors in other extension files (PlayerCard.tsx, content.tsx, api-client.ts, etc.) were present before this change and are not caused by it.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | bd36ecf | feat(68-01): restore Projected Standings section to EngineInsights |

## Self-Check: PASSED

- [x] `packages/extension/components/EngineInsights.tsx` modified
- [x] Commit bd36ecf exists
- [x] "Projected Standings" string present in EngineInsights.tsx
- [x] `projectedStandings` destructured from `engineSignals`
- [x] Section gated on `projectedStandings != null && projectedStandings.teamsWithData >= 3`
- [x] `<details>` without `open` attribute (collapsed by default)
- [x] No new TypeScript errors in EngineInsights.tsx
