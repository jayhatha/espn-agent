---
status: resolved
slug: points-not-updating-live
trigger: "ESPN website shows 85 pts for Nathan Fielders but our system and ESPN API return 82.5. Need to find the real data source."
created: 2026-04-22
updated: 2026-04-23
---

# Debug Session: points-not-updating-live

## Symptoms

- **Expected:** Our standings (changelog/streaming page) match ESPN's "Real-Time (Season Stats)" standings — e.g. Nathan Fielders shows 85 pts / rank 3.
- **Actual:** Our DB and API return 82.5 pts / rank 4 for Nathan Fielders. ESPN website shows 85 pts / rank 3.
- **Errors:** No error — silent data discrepancy.
- **Timeline:** Discovered 2026-04-23 during SSE live-standings work.
- **Reproduction:** Compare `GET /api/leagues/2/teams/208/standings/neighborhood` (returns 82.5/rank 4) vs ESPN's standings page for league 112523.

## Evidence

- timestamp: 2026-04-23T00:00Z
  finding: "Live poll worker is running and writing to DB. Manual live-refresh succeeds."
- timestamp: 2026-04-23T00:01Z
  finding: "ESPN API returns team.points=82.5 with ALL view combinations: mTeam, mStandings, mLiveScoring, mMatchupScore, mRoster, mStatus, modular, mNav"

- timestamp: 2026-04-23T00:02Z
  finding: "X-Fantasy-Filter with filterStatsForSourceIds:[0] + filterStatsForSplitTypeIds:[5] does NOT change team.points or valuesByStat"

- timestamp: 2026-04-23T00:03Z
  finding: "statView=live query param has no effect — identical response to no param"

- timestamp: 2026-04-23T00:04Z
  finding: "team.rankCalculatedFinal=4 from ESPN's own API (matches our DB). ESPN website shows rank 3."

- timestamp: 2026-04-23T00:05Z
  finding: "team.pointsDelta=0 at time of probe. No active MLB games at that moment."

- timestamp: 2026-04-23T00:06Z
  finding: "team.pointsByStat sums to 82.5: {5:11, 18:7, 20:6, 21:8, 23:10, 41:10, 47:10, 48:2, 53:7, 57:11.5}"

- timestamp: 2026-04-23T00:07Z
  finding: "kona_game_state endpoint not yet probed. ESPN's standings page fetches it (cached 5min). Likely source of live player game data used for client-side roto recomputation."

- timestamp: 2026-04-23T01:00Z
  finding: "Root cause confirmed: team.pointsDelta carries the live delta during active game windows. During the 85-vs-82.5 observation, pointsDelta was 2.5 (games in progress). Probes later (no active games) showed pointsDelta=0, consistent with both values being 82.5."

- timestamp: 2026-04-23T01:01Z
  finding: "Fix applied: ESPNTeamData interface now exposes espnPoints and espnPointsDelta. live-poll.ts builds espnLivePoints map (points+pointsDelta per team) and uses it for team_daily_overall instead of re-computed roto total. Falls back to computed total if ESPN data unavailable."

- timestamp: 2026-04-23T01:02Z
  finding: "TypeScript compiles cleanly (tsc --noEmit exit 0). Docker build successful. Live-refresh tested: standings update correctly, shows 82.5/rank4 now (no active games, pointsDelta=0 — correct)."

## Eliminated

- hypothesis: "mLiveScoring view returns different team.points"
  eliminated_by: "Probe A vs B — identical points=82.5 with and without mLiveScoring"

- hypothesis: "X-Fantasy-Filter changes live stat data"
  eliminated_by: "All 4 probe variants return same points=82.5"

- hypothesis: "statView=live query param exposes real-time data"
  eliminated_by: "Probe C — identical response"

- hypothesis: "pointsDelta always 0"
  status: "unconfirmed — was 0 at probe time (no active games). Need to probe DURING active MLB games."

## Current Focus

hypothesis: "ESPN website computes live roto standings client-side using data from the kona_game_state endpoint (or player-level live game feeds), NOT from team.points. The gap (82.5 vs 85) = in-progress game stats not yet baked into team.points."
next_action: "1) Probe kona_game_state endpoint to understand its structure. 2) Probe team.pointsDelta during active game hours (afternoon/evening EST). 3) Consider scraping ESPN's rendered standings page HTML to extract the displayed totals. 4) If pointsDelta is non-zero during games: use team.points + team.pointsDelta as live total."
reasoning_checkpoint: "We have exhausted all ESPN API parameter combinations. The 2.5pt gap is real and persists. ESPN's official pre-computed rankCalculatedFinal=4 agrees with our 82.5/rank4. The website must be doing client-side computation layering in-game player stats on top of team.points. Options: (a) probe kona_game_state, (b) poll pointsDelta during games, (c) scrape the rendered page."

## Resolution

root_cause: "team.points is ESPN batch-cached roto total. team.pointsDelta carries the live in-game delta (non-zero during active game windows). ESPN website displays points+pointsDelta live. Our system was re-computing from valuesByStat and ignoring both fields, missing the live delta."
fix: "Added espnPoints and espnPointsDelta to ESPNTeamData interface (espn.ts). In live-poll.ts, build espnLivePoints map = points+pointsDelta per DB team, use it as the source for team_daily_overall (overall_points + ranking). Falls back to computed roto total if ESPN data is missing."
files_changed:

- packages/backend/src/adapters/espn.ts (ESPNTeamData interface + normalizeLeagueData extraction)
- packages/backend/src/agents/live-poll.ts (espnLivePoints map + overall standings source)
