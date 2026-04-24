<!-- generated-by: gsd-doc-writer -->

# API Reference

Backend HTTP API for ESPN Fantasy Baseball Assistant. All routes are served by the Fastify backend on port `3001` by default.

## Authentication

> **Note:** Authentication middleware is **bypassed in single-user mode (v4.0)**. All middleware functions are no-ops that inject a mock admin user (`userId: 1`, `role: "admin"`). The auth routes (`/api/auth/*`) still exist and are functional for future multi-user support, but `authenticate`, `requireLeagueAccess`, `requireTeamOwnership`, and `requireAdmin` checks are not enforced.

When multi-user mode is active, credentials are passed via `HttpOnly` cookies set by the auth flow:

| Cookie         | Description                             |
| -------------- | --------------------------------------- |
| `accessToken`  | Short-lived JWT for API access          |
| `refreshToken` | Long-lived JWT for silent token refresh |

---

## Auth

### POST /api/auth/signup

Register a new user account.

**Auth required:** No

**Request body:**

| Field         | Type   | Required | Description                              |
| ------------- | ------ | -------- | ---------------------------------------- |
| `email`       | string | Yes      | Email address (stored lowercase)         |
| `password`    | string | Yes      | Password (hashed with bcrypt, 13 rounds) |
| `displayName` | string | No       | Display name                             |

**Response:**

```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "role": "user",
    "displayName": "My Name",
    "avatarUrl": null
  }
}
```

Sets `accessToken` and `refreshToken` cookies. Returns `409` if email already registered.

---

### POST /api/auth/login

Authenticate an existing user.

**Auth required:** No

**Request body:**

| Field      | Type   | Required |
| ---------- | ------ | -------- |
| `email`    | string | Yes      |
| `password` | string | Yes      |

**Response:** Same shape as `/api/auth/signup`. Sets auth cookies. Returns `401` on invalid credentials.

---

### POST /api/auth/refresh

Rotate the refresh token and issue a new access token. Implements token reuse detection — presenting a previously invalidated refresh token revokes all sessions for that user.

**Auth required:** No (reads `refreshToken` cookie directly)

**Response:**

```json
{ "success": true }
```

Sets new `accessToken` and `refreshToken` cookies. Returns `401` if token is missing, invalid, or expired.

---

### GET /api/auth/me

Get the currently authenticated user's profile.

**Auth required:** Yes

**Response:**

```json
{
  "id": 1,
  "email": "user@example.com",
  "role": "admin",
  "displayName": "My Name",
  "avatarUrl": null,
  "createdAt": "2025-01-01T00:00:00.000Z"
}
```

---

### POST /api/auth/logout

Clear auth cookies and invalidate all refresh tokens for the current user.

**Auth required:** No (best-effort; clears cookies even if token is invalid)

**Response:**

```json
{ "success": true }
```

---

## Leagues

### POST /api/leagues/connect

Connect a new ESPN fantasy baseball league. Auto-detects the user's team from the SWID cookie owner if `auth.SWID` is provided. ESPN credentials are encrypted at rest — `ENCRYPTION_KEY` environment variable must be set.

**Auth required:** Yes  
**Rate limit:** 30 requests / minute

**Request body:**

| Field          | Type   | Required | Description                               |
| -------------- | ------ | -------- | ----------------------------------------- |
| `espnLeagueId` | number | Yes      | ESPN league ID                            |
| `season`       | number | Yes      | Season year (e.g. `2025`)                 |
| `auth.SWID`    | string | No       | ESPN SWID cookie (for private leagues)    |
| `auth.espn_s2` | string | No       | ESPN espn_s2 cookie (for private leagues) |
| `name`         | string | No       | Override league display name              |
| `timezone`     | string | No       | Timezone (default: `America/New_York`)    |
| `teamEspnId`   | number | No       | Explicitly set user's ESPN team ID        |

**Response (team auto-detected):**

```json
{
  "league": {
    "id": 1,
    "name": "My League",
    "espn_league_id": 123456,
    "season": 2025
  },
  "isNew": true,
  "userTeamDetected": true
}
```

**Response (team not detected — prompt user to pick):**

```json
{
  "league": { ... },
  "isNew": true,
  "userTeamDetected": false,
  "teams": [
    { "espnTeamId": 3, "name": "The Naturals" }
  ]
}
```

Triggers an initial snapshot in the background for newly connected leagues.

---

### POST /api/leagues/bootstrap

Single-user mode convenience endpoint. Creates the default configured league (from `DEFAULT_ESPN_LEAGUE_ID`) and triggers an initial snapshot using `ESPN_SWID` / `ESPN_S2` environment variables. Returns existing league if already bootstrapped.

**Auth required:** Yes  
**Rate limit:** 5 requests / minute

**Response:**

```json
{
  "league": { "id": 1, ... },
  "isNew": true,
  "message": "League bootstrapped"
}
```

Returns `400` if ESPN env credentials are not set.

---

### GET /api/leagues

List all connected leagues.

**Auth required:** Yes  
**Rate limit:** 100 requests / minute

**Response:**

```json
{
  "leagues": [
    { "id": 1, "name": "My League", "espn_league_id": 123456, "season": 2025, ... }
  ]
}
```

---

### GET /api/leagues/:leagueId/status

Get league status, latest snapshot metadata, and current season MLB games played count.

**Auth required:** Yes — league membership check  
**Rate limit:** 100 requests / minute

**Response:**

```json
{
  "league": { "id": 1, "name": "My League", ... },
  "latestSnapshot": {
    "snapshot_date": "2025-04-23",
    "is_degraded": false,
    "degraded_reasons": []
  },
  "snapshotCount": 45,
  "gamesPlayed": 15
}
```

`gamesPlayed` is cached daily (one MLB API call per day max).

---

### GET /api/leagues/:leagueId/teams

List all teams in a league.

**Auth required:** Yes — league membership check  
**Rate limit:** 100 requests / minute

**Response:**

```json
{
  "teams": [
    { "id": 1, "name": "The Naturals", "espn_team_id": 3, "league_id": 1 }
  ]
}
```

---

### PATCH /api/leagues/:leagueId/auth

Update ESPN auth cookies for a league. Credentials are encrypted before storage.

**Auth required:** Yes — league membership check  
**Rate limit:** 30 requests / minute

**Request body:**

| Field     | Type   | Required |
| --------- | ------ | -------- |
| `SWID`    | string | No       |
| `espn_s2` | string | No       |

**Response:**

```json
{ "league": { "id": 1, ... } }
```

Returns `500` if `ENCRYPTION_KEY` is not configured.

---

### POST /api/leagues/:leagueId/snapshot

Trigger a manual snapshot for a league. Runs synchronously (awaits completion).

**Auth required:** Yes — league membership check  
**Rate limit:** 10 requests / hour

**Response:**

```json
{
  "success": true,
  "message": "Snapshot created successfully",
  "snapshotDate": "2025-04-23"
}
```

---

### GET /api/leagues/:leagueId/teams/:teamId/overview

Get a combined team overview: roster, category totals+ranks, and overall standings for the latest snapshot date.

**Auth required:** Yes — league membership check

**Response:**

```json
{
  "snapshotDate": "2025-04-23",
  "team": { "id": 1, "name": "The Naturals" },
  "overall": {
    "overall_points": 72.5,
    "overall_rank": 3,
    "total_teams": 12
  },
  "categories": [
    {
      "category_id": "HR",
      "name": "Home Runs",
      "value": 42,
      "rank": 2,
      "roto_points": 11
    }
  ],
  "roster": [
    {
      "player_id": 4001,
      "player_name": "Mike Trout",
      "roster_slot": "CF",
      "roster_status": "active",
      "acquisition_type": "draft"
    }
  ]
}
```

---

## Projections

> **Admin only.** All write endpoints require `role: "admin"`.

### POST /api/projections/upload

Upload a single FanGraphs Depth Charts RoS CSV (batters **or** pitchers). Auto-detects player type from column headers: pitcher CSVs contain `IP`, `ERA`, or `ER`; all others are treated as batters.

**Auth required:** Yes (admin role)  
**Rate limit:** 10 requests / hour  
**Content-Type:** `multipart/form-data`

**Form field:** single file upload (any field name)

**Response:**

```json
{
  "projectionsRunId": 7,
  "batters": { "matched": 280, "unmatched": 12, "total": 292 },
  "pitchers": null
}
```

After upload, triggers re-snapshots for leagues with stale or missing projections. If both batters and pitchers are now present (`staleness: "fresh"`), re-snapshots **all** leagues that have a snapshot for today.

---

### POST /api/projections/upload-batch

Upload batters and pitchers CSVs in a single multipart request.

**Auth required:** Yes (admin role)  
**Rate limit:** 10 requests / hour  
**Content-Type:** `multipart/form-data`

**Form fields:**

| Field name              | Description                        |
| ----------------------- | ---------------------------------- |
| `batters` or `batter`   | Batters CSV (explicit field name)  |
| `pitchers` or `pitcher` | Pitchers CSV (explicit field name) |
| Any other name          | Auto-detected from headers         |

**Response:** Same shape as `/api/projections/upload`.

---

### GET /api/projections

List all projection runs.

**Auth required:** Yes

**Response:**

```json
{
  "runs": [
    {
      "id": 7,
      "as_of_date": "2025-04-23",
      "staleness": "fresh",
      "created_at": "..."
    }
  ]
}
```

---

### GET /api/projections/:runId

Get details for a specific projection run.

**Auth required:** Yes

**Response:**

```json
{
  "run": { "id": 7, "as_of_date": "2025-04-23", "staleness": "fresh" }
}
```

---

## Time Series

All time series endpoints support these shared query parameters:

| Parameter | Type        | Description                       |
| --------- | ----------- | --------------------------------- |
| `from`    | date string | Filter from date (YYYY-MM-DD)     |
| `to`      | date string | Filter to date (YYYY-MM-DD)       |
| `teamIds` | string      | Comma-separated team IDs          |
| `season`  | string      | Filter to a single season year    |
| `limit`   | string      | Max rows to return (default 1000) |

If no `season`, `from`, or `to` is provided, defaults to the league's current season.

All time series endpoints require **auth** and **league membership check**.

---

### GET /api/leagues/:leagueId/seasons

Available seasons (years with snapshot data) for a league.

**Response:**

```json
{ "seasons": [2025, 2024] }
```

---

### GET /api/leagues/:leagueId/timeseries/overall

Overall roto standings over time.

**Response:**

```json
{
  "series": [
    {
      "league_id": 1,
      "team_id": 1,
      "snapshot_date": "2025-04-23",
      "overall_points": 72.5,
      "overall_rank": 3
    }
  ]
}
```

---

### GET /api/leagues/:leagueId/timeseries/category-rank

Category rank over time for a specific category.

**Additional query params:**

| Parameter    | Required | Description                            |
| ------------ | -------- | -------------------------------------- |
| `categoryId` | Yes      | Category identifier (e.g. `HR`, `AVG`) |

**Response:**

```json
{
  "series": [
    {
      "league_id": 1,
      "team_id": 1,
      "snapshot_date": "2025-04-23",
      "category_id": "HR",
      "rank": 2,
      "roto_points": 11
    }
  ]
}
```

---

### GET /api/leagues/:leagueId/timeseries/category-total

Raw category total values over time.

**Additional query params:**

| Parameter    | Required | Description         |
| ------------ | -------- | ------------------- |
| `categoryId` | Yes      | Category identifier |

**Response:**

```json
{
  "series": [
    {
      "league_id": 1,
      "team_id": 1,
      "snapshot_date": "2025-04-23",
      "category_id": "HR",
      "value": 42
    }
  ]
}
```

---

### GET /api/leagues/:leagueId/timeseries/projected-overall

Projected end-of-season overall points over time.

**Response:**

```json
{
  "series": [
    {
      "team_id": 1,
      "snapshot_date": "2025-04-23",
      "projected_overall_points": 78.5,
      "projected_overall_rank": 2
    }
  ]
}
```

---

### GET /api/leagues/:leagueId/timeseries/annotations

Transaction events (add/drop/trade) as timeline annotations, enriched with player and team names.

**Response:**

```json
{
  "annotations": [
    {
      "id": 1,
      "event_date": "2025-04-10",
      "team_id": 1,
      "team_name": "The Naturals",
      "players_added_details": [{ "id": 4001, "name": "Mike Trout" }],
      "players_dropped_details": [{ "id": 4002, "name": "Some Guy" }]
    }
  ]
}
```

---

### GET /api/leagues/:leagueId/timeseries/inflection-points

Biggest overall ranking changes for a team. Optionally scoped to a single category.

**Query params:**

| Parameter    | Required | Description                               |
| ------------ | -------- | ----------------------------------------- |
| `teamId`     | Yes      | Team ID                                   |
| `categoryId` | No       | Scope to a single category's rank changes |
| `limit`      | No       | Max results (default 5, max 10)           |

**Response:** Array of snapshot-to-snapshot rank change events with rank-before, rank-after, and magnitude.

---

### GET /api/leagues/:leagueId/standings/projected

Latest projected end-of-season standings by category, including Monte Carlo confidence intervals. Also returns current standings for comparison.

**Query params:**

| Parameter      | Description                              |
| -------------- | ---------------------------------------- |
| `snapshotDate` | Override date (default: latest snapshot) |

**Response:**

```json
{
  "snapshotDate": "2025-04-23",
  "previousSnapshotDate": "2025-04-22",
  "categories": [ { "category_id": "HR", "name": "Home Runs", ... } ],
  "categoryStandings": [
    {
      "team_id": 1,
      "teamName": "The Naturals",
      "category_id": "HR",
      "projected_value": 185,
      "projected_rank": 1,
      "confidence": { "p10": 172, "p50": 185, "p90": 198 }
    }
  ],
  "overallStandings": [
    {
      "team_id": 1,
      "teamName": "The Naturals",
      "projected_overall_points": 84.5,
      "projected_overall_rank": 1,
      "previousProjectedPoints": 82.0,
      "pointsDelta": 2.5,
      "confidence": { "p10": 80, "p50": 84.5, "p90": 89 }
    }
  ],
  "currentCategoryStandings": [ ... ],
  "currentOverallStandings": [ ... ]
}
```

---

### GET /api/leagues/:leagueId/standings/swing

Explains why projected standings changed between the two most recent snapshots for a team (standings swing attribution).

**Auth required:** Yes — league membership check

**Query params:**

| Parameter      | Required | Description                            |
| -------------- | -------- | -------------------------------------- |
| `teamId`       | Yes      | Team ID                                |
| `snapshotDate` | No       | Target date (default: latest snapshot) |

**Response:** Attribution breakdown by player and category.

---

### GET /api/leagues/:leagueId/categories

List scoring categories for the league (from the latest settings version).

**Auth required:** Yes — league membership check

**Response:**

```json
{
  "categories": [
    {
      "category_id": "HR",
      "name": "Home Runs",
      "stat_key": "HR",
      "type": "COUNTING",
      "direction": "HIGHER_BETTER"
    }
  ]
}
```

---

## Recommendations

### GET /api/leagues/:leagueId/free-agents

List available free agents fetched live from ESPN, optionally enriched with FanGraphs projections and PitcherList Top 100 SP rankings.

**Auth required:** No (unauthenticated endpoint)

**Query params:**

| Parameter      | Description                                               |
| -------------- | --------------------------------------------------------- |
| `snapshotDate` | Use projections from this date (default: latest snapshot) |
| `limit`        | Max players to return (default 300)                       |
| `position`     | Comma-separated position filter (e.g. `SP,RP`)            |

**Response:**

```json
{
  "freeAgents": [
    {
      "playerId": 4001,
      "espnPlayerId": 4001,
      "playerName": "Some Pitcher",
      "mlbTeam": "NYY",
      "positions": ["SP"],
      "pctOwned": 42.5,
      "pctStarted": 38.0,
      "projections": { "IP": 145, "K": 160, "ERA": 3.45, ... },
      "pitcherlistRank": 87
    }
  ],
  "snapshotDate": "2025-04-23"
}
```

`pitcherlistRank` is `null` for non-SP players or if PitcherList fetch fails (graceful degradation).

---

### GET /api/leagues/:leagueId/teams/:teamId/roster

Get a team's current roster with projections, current season stats, and tenure stats (stats accumulated while on this team).

**Auth required:** No

**Query params:**

| Parameter      | Description                            |
| -------------- | -------------------------------------- |
| `snapshotDate` | Target date (default: latest snapshot) |

**Response:**

```json
{
  "roster": [
    {
      "playerId": 4001,
      "espnPlayerId": 4001,
      "playerName": "Mike Trout",
      "mlbTeam": "LAA",
      "positions": ["CF"],
      "rosterStatus": "active",
      "rosterSlot": "CF",
      "projections": { "AB": 420, "HR": 28, ... },
      "currentStats": { ... },
      "tenureStats": { "AB": 89, "HR": 7, ... }
    }
  ],
  "snapshotDate": "2025-04-23"
}
```

---

### POST /api/leagues/:leagueId/teams/:teamId/waivers/evaluate

Evaluate the projected standings impact of a specific add/drop swap.

**Auth required:** No

**Request body:**

| Field          | Type   | Required | Description                            |
| -------------- | ------ | -------- | -------------------------------------- |
| `addPlayerId`  | number | Yes      | Player ID to add                       |
| `dropPlayerId` | number | Yes      | Player ID to drop                      |
| `snapshotDate` | string | No       | Target date (default: latest snapshot) |

**Response:**

```json
{
  "addPlayer": { "id": 4001, "name": "Good Player", "positions": ["SP"] },
  "dropPlayer": { "id": 4002, "name": "Bad Player", "positions": ["RP"] },
  "deltaOverallPoints": 1.5,
  "categoryImpacts": [{ "categoryId": "K", "delta": 2.3 }],
  "explanation": "Adding Good Player improves K category significantly.",
  "isLegal": true,
  "legalityIssues": [],
  "snapshotDate": "2025-04-23"
}
```

Returns `404` if no projected standings exist (projections not yet uploaded).

---

### GET /api/leagues/:leagueId/teams/:teamId/waivers/recommendations

AI-generated waiver add/drop recommendations ranked by projected standings impact delta.

**Auth required:** No

**Query params:**

| Parameter            | Description                            |
| -------------------- | -------------------------------------- |
| `snapshotDate`       | Target date (default: latest snapshot) |
| `maxRecommendations` | Max suggestions to return (default 10) |

**Response:**

```json
{
  "recommendations": [
    {
      "addPlayerId": 4001,
      "dropPlayerId": 4002,
      "deltaOverallPoints": 2.1,
      "categoryImpacts": [ ... ],
      "explanation": "...",
      "isLegal": true,
      "legalityIssues": []
    }
  ],
  "snapshotDate": "2025-04-23"
}
```

---

### POST /api/leagues/:leagueId/teams/:teamId/trades/impact

Analyze the projected standings impact of a proposed trade.

**Auth required:** No

**Request body:**

| Field                  | Type     | Required | Description                            |
| ---------------------- | -------- | -------- | -------------------------------------- |
| `trade.givePlayers`    | number[] | Yes      | Player IDs your team gives away        |
| `trade.receivePlayers` | number[] | Yes      | Player IDs your team receives          |
| `snapshotDate`         | string   | No       | Target date (default: latest snapshot) |

**Response:**

```json
{
  "analysis": {
    "deltaOverallPoints": -0.5,
    "categoryBreakdown": [ ... ]
  },
  "snapshotDate": "2025-04-23"
}
```

> **Note:** Rate stat adjustments are counting-stats only (known limitation — rate stat deltas not fully implemented).

---

### GET /api/leagues/:leagueId/teams/:teamId/trades/recommendations

Generate 1-for-1 trade candidates ranked by projected standings improvement.

**Auth required:** No

**Query params:**

| Parameter       | Description                            |
| --------------- | -------------------------------------- |
| `snapshotDate`  | Target date (default: latest snapshot) |
| `maxCandidates` | Max candidates to return (default 10)  |

**Response:**

```json
{
  "candidates": [
    {
      "givePlayerId": 4001,
      "receivePlayerId": 4002,
      "deltaOverallPoints": 1.8,
      "partnerTeamId": 3
    }
  ],
  "snapshotDate": "2025-04-23"
}
```

---

### GET /api/leagues/:leagueId/teams/:teamId/trades/partners

List potential trade partner teams (all teams in the league except the requesting team).

**Auth required:** No

**Response:**

```json
{
  "partners": [{ "id": 2, "name": "The Rivals", "espn_team_id": 5 }]
}
```

---

### GET /api/leagues/:leagueId/teams/:teamId/trades/partners/:partnerTeamId/rosters

Get both teams' rosters enriched with projections for manual trade building.

**Auth required:** No

**Query params:**

| Parameter      | Description                            |
| -------------- | -------------------------------------- |
| `snapshotDate` | Target date (default: latest snapshot) |

**Response:**

```json
{
  "snapshotDate": "2025-04-23",
  "userTeam": {
    "id": 1,
    "name": "The Naturals",
    "roster": [ { "playerId": 4001, "playerName": "Mike Trout", "projections": { ... } } ]
  },
  "partnerTeam": {
    "id": 2,
    "name": "The Rivals",
    "roster": [ ... ]
  }
}
```

---

## Streaming Pitchers

### GET /api/leagues/:leagueId/streaming-pitchers

Streaming pitcher recommendations for the upcoming week based on schedule, matchup quality, projected K upside, and Rotoballer grades.

**Auth required:** Yes — league membership check

**Query params:**

| Parameter       | Description                                 | Default |
| --------------- | ------------------------------------------- | ------- |
| `teamId`        | Team ID (used to exclude rostered pitchers) | —       |
| `startDate`     | Start of look-ahead window (YYYY-MM-DD)     | Today   |
| `lookAheadDays` | Days to look ahead                          | `7`     |
| `limit`         | Max candidates to return                    | `20`    |

**Response:**

```json
{
  "candidates": [
    {
      "playerId": 4001,
      "playerName": "Good Streamer",
      "mlbTeam": "NYY",
      "matchupOpponent": "DET",
      "isHome": true,
      "gameDate": "2025-04-25",
      "compositeScore": 8.4,
      "projectionScore": 7.2,
      "matchupScore": 9.1,
      "multiStartBonus": 1.0,
      "weekStarts": 2,
      "ownershipPct": 22.5,
      "rotoballerVerdict": "Start",
      "rotoballerGrade": "A",
      "rotoballerSourceUrl": "https://...",
      "pickupDeadline": "2025-04-24T23:59:59Z"
    }
  ],
  "dateRange": { "start": "2025-04-24", "end": "2025-04-30" },
  "totalCandidates": 14,
  "generatedAt": "2025-04-23T12:00:00.000Z",
  "rotoballerSource": "https://..."
}
```

---

## Pitching Usage

All pitching usage endpoints require **auth** and **league membership check**. Team-scoped endpoints additionally require **team ownership check**.

### GET /api/leagues/:leagueId/teams/:teamId/pitching/gs

Season GS pacing summary for a team: actual starts vs pace, projected season total, and budget usage.

**Auth required:** Yes — league membership + team ownership

**Response:** GS pacing summary object (from `GsPacingAgent.getSeasonSummary`).

---

### GET /api/leagues/:leagueId/teams/:teamId/pitching/gs/weekly

Weekly GS breakdown for a team.

**Auth required:** Yes — league membership + team ownership

**Query params:**

| Parameter   | Description                                                |
| ----------- | ---------------------------------------------------------- |
| `weekStart` | ISO date for the start of the week (default: current week) |

**Response:** Weekly GS breakdown object (from `GsPacingAgent.getWeeklySummary`).

---

### GET /api/leagues/:leagueId/teams/:teamId/pitching/start-plan

SP start/sit planner for the upcoming week for a team.

**Auth required:** Yes — league membership + team ownership

**Response:** Start plan object (from `GsPacingAgent.getStartPlan`).

---

### GET /api/leagues/:leagueId/pitching/gs/league

League-wide GS and K/GS efficiency overview across all teams.

**Auth required:** Yes — league membership check

**Response:** League GS overview object (from `GsPacingAgent.getLeagueGsOverview`).

---

### GET /api/leagues/:leagueId/teams/:teamId/pitching/sit-start

External sit/start recommendations for a team's SP roster from PitcherList and Rotoballer.

**Auth required:** Yes — league membership + team ownership

**Response:** Sit/start recommendations object (from `SitStartAdvisor.getRecommendations`).

---

## FAAB

All FAAB endpoints require **auth**, **league membership check**, and **team ownership check**.

### GET /api/leagues/:leagueId/teams/:teamId/faab

FAAB budget summary: total budget, amount spent, remaining balance, and spending rate.

**Response:** Summary object from `FaabTrackerAgent.getSummary`.

---

### GET /api/leagues/:leagueId/teams/:teamId/faab/history

Full FAAB bid history for a team.

**Response:**

```json
{
  "bids": [
    {
      "playerId": 4001,
      "playerName": "Good Player",
      "bidAmount": 15,
      "date": "2025-04-10",
      "won": true
    }
  ]
}
```

---

### GET /api/leagues/:leagueId/teams/:teamId/faab/suggested-bid/:playerId

Get a data-driven suggested FAAB bid for a specific player.

**Path params:**

| Param      | Description           |
| ---------- | --------------------- |
| `playerId` | Player ID to evaluate |

**Response:** Suggested bid object from `FaabTrackerAgent.getSuggestedBid`.

---

## Trends

All trends endpoints require **auth** and **league membership check**.

### GET /api/leagues/:leagueId/teams/:teamId/trends/hot-cold

Rolling hot/cold trend analysis for all rostered players over a configurable window. Computes OPS-vs-season-baseline for hitters and ERA/K-rate for pitchers.

**Query params:**

| Parameter | Description            | Default |
| --------- | ---------------------- | ------- |
| `days`    | Rolling window in days | `7`     |

**Response:**

```json
{
  "dataAvailable": true,
  "snapshotDate": "2025-04-23",
  "windowDays": 7,
  "players": [
    {
      "playerId": 4001,
      "playerName": "Mike Trout",
      "rosterSlot": "CF",
      "rosterStatus": "active",
      "playerType": "hitter",
      "trend": "hot",
      "drivingStat": "OPS surge",
      "sevenDay": { "ops": 1.05, "hr": 3, "sb": 2, "ab": 22 },
      "season": { "ops": 0.87, "hr": 8, "sb": 5, "ab": 89 },
      "ratios": { "opsRatio": 1.21 }
    }
  ]
}
```

`trend` values: `"hot"` | `"cold"` | `"neutral"` | `"insufficient"` (fewer than 5 AB or 3 IP)

---

### GET /api/leagues/:leagueId/teams/:teamId/trends/lineup-efficiency

Daily lineup efficiency analysis: bench production totals and warnings for days a bench player outproduced a starter at the same position slot.

**Query params:**

| Parameter | Description              | Default |
| --------- | ------------------------ | ------- |
| `days`    | Look-back window in days | `7`     |

**Response:**

```json
{
  "dataAvailable": true,
  "days": [
    {
      "date": "2025-04-22",
      "benchProduction": {
        "totalHR": 2,
        "totalSB": 1,
        "totalOPS": 0.82,
        "totalAB": 12
      },
      "warnings": [
        {
          "benchPlayerId": 4005,
          "benchPlayerName": "Bench Guy",
          "starterId": 4001,
          "starterName": "Started Guy",
          "position": "1B",
          "benchStat": { "hr": 1, "ops": 0.92 },
          "starterStat": { "hr": 0, "ops": 0.65 },
          "reason": "Bench OPS: 0.920 vs Starter OPS: 0.650"
        }
      ]
    }
  ]
}
```

---

## Draft

### GET /api/leagues/:leagueId/draft/rankings

Pre-draft VBD (Value Over Replacement) rankings scoped to a specific league's settings.

**Auth required:** Yes — league membership check

**Query params:**

| Parameter          | Description                    | Default |
| ------------------ | ------------------------------ | ------- |
| `position`         | Filter by position (e.g. `SP`) | All     |
| `limit`            | Max players to return          | `300`   |
| `projectionsRunId` | Use a specific projection run  | Latest  |

**Response:**

```json
{
  "rankings": [
    {
      "playerId": 4001,
      "playerName": "Mike Trout",
      "positions": ["CF"],
      "vbd": 42.5,
      "rank": 1
    }
  ],
  "meta": {
    "leagueId": 1,
    "leagueName": "My League",
    "totalTeams": 12,
    "generatedAt": "2025-04-23T12:00:00.000Z"
  }
}
```

---

### GET /api/leagues/:leagueId/draft/auction

Auction dollar valuations scoped to a league's settings.

**Auth required:** Yes — league membership check

**Query params:**

| Parameter          | Description                     | Default |
| ------------------ | ------------------------------- | ------- |
| `position`         | Filter by position              | All     |
| `limit`            | Max players                     | `300`   |
| `budget`           | Total auction budget (100–1000) | `260`   |
| `minBid`           | Minimum bid amount (1–10)       | `1`     |
| `projectionsRunId` | Use a specific projection run   | Latest  |

**Response:**

```json
{
  "valuations": [
    {
      "playerId": 4001,
      "playerName": "Mike Trout",
      "dollarValue": 48.0,
      "rank": 1
    }
  ],
  "meta": {
    "leagueId": 1,
    "leagueName": "My League",
    "totalTeams": 12,
    "budget": 260,
    "minBid": 1,
    "playersAboveReplacement": 168,
    "generatedAt": "2025-04-23T12:00:00.000Z"
  }
}
```

---

### GET /api/leagues/:leagueId/draft/auction/validate

Compare ESPN's native auction values against VBD-derived values. Requires ESPN global draft data to be available for the season.

**Auth required:** Yes — league membership check

**Query params:**

| Parameter          | Description                   | Default |
| ------------------ | ----------------------------- | ------- |
| `limit`            | Max players to compare        | `100`   |
| `projectionsRunId` | Use a specific projection run | Latest  |

**Response:** Comparison array with ESPN value, VBD value, and delta per player.

---

### GET /api/draft/rankings

Generic VBD rankings — no league required. Accepts draft configuration inline.

**Auth required:** No  
**Rate limit:** 100 requests / minute

**Query params:**

| Parameter          | Required | Description                          |
| ------------------ | -------- | ------------------------------------ |
| `numTeams`         | Yes      | Number of teams (2–30)               |
| `categories`       | Yes      | JSON array of category objects       |
| `rosterSlots`      | Yes      | JSON object mapping position → count |
| `position`         | No       | Filter by position                   |
| `limit`            | No       | Max players (default 300)            |
| `projectionsRunId` | No       | Use a specific projection run        |

**`categories` array element shape:**

```json
{
  "category_id": 1,
  "stat_key": "HR",
  "type": "COUNTING",
  "direction": "HIGHER_BETTER"
}
```

**Response:** Same shape as `/api/leagues/:leagueId/draft/rankings` (without `leagueId`/`leagueName` in meta).

---

### GET /api/draft/auction

Generic auction valuations — no league required.

**Auth required:** No  
**Rate limit:** 100 requests / minute

**Query params:** All params from `GET /api/draft/rankings` plus `budget` (default `260`) and `minBid` (default `1`).

**Response:** Same shape as `/api/leagues/:leagueId/draft/auction`.

---

## Transaction Impact

### POST /api/leagues/:leagueId/transaction-impacts/compute

**Admin only.** Derives roster moves from transaction history and computes Shapley-value impact scores for each move. Idempotent — deletes and re-derives on each run.

**Auth required:** Admin role (bypassed in single-user mode)

**Query params:**

| Parameter | Description | Default      |
| --------- | ----------- | ------------ |
| `season`  | Season year | Current year |

**Response:**

```json
{
  "success": true,
  "season": 2025,
  "totalMoves": 48,
  "impactsComputed": 45
}
```

---

### GET /api/leagues/:leagueId/teams/:teamId/transaction-impacts

All roster moves for a team with impact scores, net roster value, and summary stats.

**Auth required:** Yes — league membership check

**Query params:**

| Parameter | Description            | Default      |
| --------- | ---------------------- | ------------ |
| `season`  | Season year            | Current year |
| `sortBy`  | `"impact"` or `"date"` | `"impact"`   |

**Response:**

```json
{
  "impacts": [
    {
      "id": 1,
      "moveType": "add",
      "effectiveDate": "2025-04-10",
      "impactRotoPoints": 2.5,
      "shapleyImpact": 2.1,
      "ciLow": 1.4,
      "ciHigh": 2.8,
      "isUncertain": false,
      "playerGained": { "id": 4001, "name": "Mike Trout", "positions": ["CF"] },
      "playerLost": { "id": 4002, "name": "Some Guy", "positions": ["OF"] },
      "categoryImpacts": { "HR": 0.8, "SB": 0.3 },
      "isIncomplete": false
    }
  ],
  "summary": {
    "totalMoves": 12,
    "netRosterValue": 8.4,
    "actualRotoPoints": 72.5,
    "draftOnlyRotoPoints": 64.1,
    "avgImpactPerMove": 0.7,
    "sumOfIndividualImpacts": 8.4,
    "bestMove": { "playerName": "Mike Trout", "impact": 2.1 },
    "worstMove": { "playerName": "Some Guy", "impact": -1.3 }
  }
}
```

---

### GET /api/leagues/:leagueId/transaction-impacts/league-summary

League-wide best/worst moves and per-team roster management rankings.

**Auth required:** Yes — league membership check

**Query params:**

| Parameter | Description                       | Default      |
| --------- | --------------------------------- | ------------ |
| `season`  | Season year                       | Current year |
| `limit`   | Moves to show in best/worst lists | `10`         |

**Response:**

```json
{
  "bestMoves": [ { "teamName": "...", "playerGained": { ... }, "impact": 3.2 } ],
  "worstMoves": [ { "teamName": "...", "playerGained": { ... }, "impact": -2.1 } ],
  "teamRankings": [
    {
      "teamId": 1,
      "teamName": "The Naturals",
      "moveCount": 12,
      "netRosterValue": 8.4,
      "actualRotoPoints": 72.5,
      "draftOnlyRotoPoints": 64.1,
      "sumOfImpacts": 8.40
    }
  ],
  "tradePackages": [ ... ]
}
```

---

## Error Responses

All endpoints use consistent error shapes:

```json
{ "error": "Human-readable message" }
```

Validation failures include detail:

```json
{
  "error": "Validation failed",
  "details": [
    { "code": "invalid_type", "path": ["email"], "message": "Required" }
  ]
}
```

| Status | Meaning                                 |
| ------ | --------------------------------------- |
| `400`  | Bad request / validation failure        |
| `401`  | Unauthenticated (invalid/missing token) |
| `403`  | Forbidden (insufficient role)           |
| `404`  | Resource not found                      |
| `409`  | Conflict (e.g. duplicate email)         |
| `500`  | Internal server error                   |
