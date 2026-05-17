---
status: resolved
trigger: Missing projections for a lot of players
created: 2026-05-17
updated: 2026-05-17
---

## Symptoms

- Roster page shows `--` for projected stats (HR, R, RBI, SB, AVG, OBP) for multiple players
- Affects players on: KC (Maikel Garcia), OAK (Zack Gelof, Henry Bolte), TB (Yandy Diaz), WSH (Curtis Mead, Nasim Nunez)
- Other players on NYY, ATL, SEA, ARI, CIN, HOU show projections correctly

## Current Focus

hypothesis: FanGraphs CSV team abbreviations differ from ESPN_PRO_TEAM_MAP abbreviations stored in player.mlb_team, causing findBestMatch() team filter to return zero candidates for players on those teams
test: Cross-check FanGraphs CSV team columns vs ESPN_PRO_TEAM_MAP values
expecting: All failing teams have abbreviation mismatches
next_action: Implement FANGRAPHS_TO_ESPN_TEAM_MAP normalization in ProjectionsIngestAgent

## Evidence

- timestamp: 2026-05-17
  finding: FanGraphs CSV uses KCR, ATH, TBR, WSN, SDP, SFG — ESPN_PRO_TEAM_MAP uses KC, OAK, TB, WSH, SD, SF
  source: fangraphs-leaderboard-projections-7.csv + packages/backend/src/adapters/espn/constants.ts
- timestamp: 2026-05-17
  finding: findBestMatch() in player-identity.ts filters `WHERE mlb_team = team` (exact match), returns [] candidates for mismatched teams → identity resolution returns null → player unmatched → no projection row
  source: packages/backend/src/agents/player-identity.ts:232

## Eliminated

- hypothesis: projections_run staleness causing projections to be skipped
  why_eliminated: Roster endpoint queries player_projection without staleness filter; stale runs still serve data
- hypothesis: Projection run missing entirely
  why_eliminated: Players on NYY (which uses same abbreviation as ESPN) match fine; issue is selective per team

## Resolution

root_cause: FanGraphs-to-ESPN team abbreviation mismatch in ProjectionsIngestAgent — 6 teams affected (KCR→KC, ATH→OAK, TBR→TB, WSN→WSH, SDP→SD, SFG→SF)
fix: Add FANGRAPHS_TO_ESPN_TEAM_MAP normalization in ProjectionsIngestAgent.normalizeTeam(); apply before passing team to matchPlayer() in both ingestBatters() and ingestPitchers()
files_changed: packages/backend/src/agents/projections-ingest.ts
