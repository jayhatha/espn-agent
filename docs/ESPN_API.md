# ESPN Fantasy Baseball API Reference

> Reverse-engineered from network traces, source analysis, and live probing. April 2026.
> Covers Fantasy Baseball (game=`flb`). Football is `ffl`, basketball `fba`.

---

## Base URL

```
https://lm-api-reads.fantasy.espn.com/apis/v3/games/flb
```

All endpoints below are relative to this base.

---

## Authentication

Private leagues require two cookies:

| Cookie    | Description                                                     |
| --------- | --------------------------------------------------------------- |
| `SWID`    | ESPN user GUID, format `{xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}` |
| `espn_s2` | Session token (long opaque string, URL-encoded)                 |

Pass as a single `Cookie` header:

```http
Cookie: SWID={69AB0A2B-...}; espn_s2=AEAv...
```

Additional headers ESPN's own client sends (safe to omit but improves compatibility):

```http
X-Fantasy-Source: kona
X-Fantasy-Platform: espn-fantasy-web
Accept: application/json
```

**Getting credentials**: Log into ESPN Fantasy in Chrome → DevTools → Application → Cookies → `espn.com`.

---

## League Endpoint

```
GET /seasons/{season}/segments/0/leagues/{leagueId}
```

| Param             | Description                                           |
| ----------------- | ----------------------------------------------------- |
| `season`          | Year, e.g. `2026`                                     |
| `leagueId`        | ESPN league ID (visible in the URL on espn.com)       |
| `view`            | Repeating: `?view=mTeam&view=mStandings&...`          |
| `scoringPeriodId` | Specific scoring period (day/week). Omit for current. |

### Views

Views control which top-level keys are returned. **Combine freely — no documented limit.**

| View            | Returns                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------- |
| `mSettings`     | `settings` — league name, scoring categories, roster slots, acquisition rules             |
| `mTeam`         | `teams[]` — names, owners, `valuesByStat`, `points`, `pointsByStat`, `pointsDelta`, ranks |
| `mStandings`    | `teams[]` — same as mTeam but with final standings data                                   |
| `mRoster`       | `teams[].roster.entries[]` — full roster with player detail and stats                     |
| `mLiveScoring`  | Intended for in-period live scoring. **In practice returns same `team.points` as mTeam.** |
| `mMatchupScore` | `schedule[]` — matchup results for current/past periods                                   |
| `mStatus`       | `status` — current scoring period, season metadata                                        |
| `mNav`          | Navigation metadata (not useful for data)                                                 |
| `modular`       | Modular display data (not useful for data)                                                |

**ESPN website views** (from network trace, standings page):

```
mLiveScoring, mMatchupScore, mRoster, mSettings, mStandings, mStatus, mTeam, modular, mNav
```

**Our current live-poll views:**

```
mSettings, mTeam, mStandings, mLiveScoring
```

### X-Fantasy-Filter Header

JSON header that filters the `players` array inside rosters. **Does NOT affect `team.points` or `team.valuesByStat`.**

```json
{
  "players": {
    "filterStatsForSourceIds": { "value": [0] },
    "filterStatsForSplitTypeIds": { "value": [5] }
  }
}
```

| Field                        | Values                                          |
| ---------------------------- | ----------------------------------------------- |
| `filterStatsForSourceIds`    | `0` = real-time, `1` = projected                |
| `filterStatsForSplitTypeIds` | `0` = season totals, `5` = current period       |
| `filterStatsForExternalIds`  | `[scoringPeriodId]` — filter to specific period |
| `sortPercOwned`              | Sort by ownership % (useful for free agents)    |
| `limit` / `offset`           | Pagination for player lists                     |

**Historical week fetch** uses:

```json
{
  "players": {
    "filterStatsForSplitTypeIds": { "value": [5] },
    "filterStatsForSourceIds": { "value": [0, 1] },
    "filterStatsForExternalIds": { "value": [scoringPeriodId] },
    "sortPercOwned": { "sortAsc": false, "sortPriority": 1 },
    "limit": 1500,
    "offset": 0
  }
}
```

The `filterStatsForExternalIds` + `splitTypeId=5` combination is what makes historical per-period stats work. Without it, ESPN returns only season totals and most players lack per-period entries, causing drastically low team totals.

---

## Team Object

Fields present on every `teams[]` entry when using `mTeam` or `mStandings`:

| Field                   | Type                     | Description                                     |
| ----------------------- | ------------------------ | ----------------------------------------------- |
| `id`                    | number                   | ESPN team ID within the league                  |
| `name`                  | string                   | Team name                                       |
| `abbrev`                | string                   | Team abbreviation                               |
| `primaryOwner`          | string                   | SWID of primary owner                           |
| `owners`                | string[]                 | All owner SWIDs                                 |
| `valuesByStat`          | `Record<statId, number>` | **Season-to-date accumulated stat values**      |
| `points`                | number                   | ESPN pre-computed roto points total             |
| `pointsAdjusted`        | number                   | Points after adjustments                        |
| `pointsByStat`          | `Record<statId, number>` | Roto points per category (sums to `points`)     |
| `pointsDelta`           | number                   | **In-game live scoring delta** (see note below) |
| `rankCalculatedFinal`   | number                   | ESPN's computed rank                            |
| `currentProjectedRank`  | number                   | ESPN's projected final rank                     |
| `draftDayProjectedRank` | number                   | Rank projected on draft day                     |
| `rankFinal`             | number                   | Final rank (end of season)                      |
| `record`                | object                   | Win/loss record (H2H leagues)                   |
| `playoffSeed`           | number                   | Playoff seeding                                 |
| `waiverRank`            | number                   | Waiver priority rank                            |
| `transactionCounter`    | object                   | Transaction counts including FAAB spent         |

### `pointsDelta` — The Live Scoring Gap

**Key finding from investigation (April 23, 2026):**

ESPN's website shows different roto point totals than `team.points` during live game days. The discrepancy is **not** from any API parameter — we tested:

- All ESPN's exact views (`mLiveScoring`, `mMatchupScore`, `mRoster`, etc.)
- `X-Fantasy-Filter` with `splitTypeId=5` and `sourceId=0`
- `statView=live` query parameter
- Minimal view combinations

**Result**: `team.points` is a **cached value** that ESPN updates periodically (likely at end of scoring periods, not real-time). `pointsDelta` was `0` during the probe but is presumably non-zero when MLB games are in progress — representing the live delta between completed game stats not yet baked into `team.points`.

**ESPN website behavior**: The site computes a live adjusted total using `team.points + team.pointsDelta` (or similar client-side logic combining data from the `kona_game_state` endpoint). The underlying stat accumulation happens client-side using live player game feeds not exposed via the standard polling endpoint.

**Implementation (fixed 2026-04-23)**: `live-poll.ts` now uses `espnPoints + espnPointsDelta` as the source for `team_daily_overall.overall_points` and re-ranks teams by this live total. During active game hours the displayed standings will match ESPN's website. After games complete, `pointsDelta` resets to 0 and the official batch value is used. `ESPNTeamData` now exposes both `espnPoints` and `espnPointsDelta` fields.

---

## Season / Game State Endpoint

```
GET /seasons/{season}
```

Returns season metadata including `currentScoringPeriod.id` (current day number). No auth required.

```
GET /seasons/{season}?view=kona_game_state
```

ESPN's standings page also fetches this (cached 5 min). Likely contains live MLB game state used for client-side live scoring overlay. Not yet fully explored.

---

## Free Agents Endpoint

```
GET /seasons/{season}/segments/0/leagues/{leagueId}?view=kona_playercard
```

Or via `X-Fantasy-Filter` with the main league endpoint. ESPN returns free agents as part of the main response when roster data is requested with the right filter. Use `limit`/`offset` for pagination.

---

## Scoring Period IDs

ESPN uses "scoring period" as a proxy for calendar day in rotisserie baseball:

- Period 1 = first day of season
- Period IDs are sequential daily; `status.currentMatchupPeriod` = current week
- `status.finalScoringPeriod` = last day (e.g. 187 for 2026 season)
- Historical data: pass `scoringPeriodId` query param to get stats as of that day

---

## Stat ID → Key Mapping

Full mapping in `packages/backend/src/adapters/espn.ts` (`ESPN_STAT_MAP`). Key IDs for roto baseball:

### Batting

| ID  | Key | Name            | Type     |
| --- | --- | --------------- | -------- |
| 0   | AB  | At Bats         | COUNTING |
| 1   | H   | Hits            | COUNTING |
| 2   | AVG | Batting Average | RATE     |
| 5   | HR  | Home Runs       | COUNTING |
| 8   | TB  | Total Bases     | COUNTING |
| 10  | BB  | Walks           | COUNTING |
| 12  | HBP | Hit By Pitch    | COUNTING |
| 13  | SF  | Sacrifice Flies | COUNTING |
| 17  | OBP | On Base Pct     | RATE     |
| 18  | OPS | OPS             | RATE     |
| 20  | R   | Runs            | COUNTING |
| 21  | RBI | RBI             | COUNTING |
| 23  | SB  | Stolen Bases    | COUNTING |

### Pitching

| ID  | Key  | Name           | Type     |
| --- | ---- | -------------- | -------- |
| 33  | GS   | Games Started  | COUNTING |
| 34  | OUTS | Outs Recorded  | COUNTING |
| 37  | HA   | Hits Allowed   | COUNTING |
| 39  | BBA  | Walks Allowed  | COUNTING |
| 41  | WHIP | WHIP           | RATE     |
| 45  | ER   | Earned Runs    | COUNTING |
| 47  | ERA  | ERA            | RATE     |
| 48  | K    | Strikeouts     | COUNTING |
| 53  | W    | Wins           | COUNTING |
| 57  | SV   | Saves          | COUNTING |
| 60  | HLD  | Holds          | COUNTING |
| 63  | QS   | Quality Starts | COUNTING |

> Rate stats (`AVG`, `OBP`, `OPS`, `ERA`, `WHIP`) in `valuesByStat` are **computed from components** (see `packages/shared/src/formulas.ts`). Never average rates directly — combine components, then compute.

---

## Lineup Slot IDs

| ID  | Slot | Description       |
| --- | ---- | ----------------- |
| 0   | C    | Catcher           |
| 1   | 1B   | First Base        |
| 2   | 2B   | Second Base       |
| 3   | 3B   | Third Base        |
| 4   | SS   | Shortstop         |
| 5   | OF   | Outfield          |
| 6   | MI   | Middle Infield    |
| 7   | CI   | Corner Infield    |
| 11  | DH   | Designated Hitter |
| 12  | UTIL | Utility           |
| 13  | P    | Pitcher           |
| 14  | SP   | Starting Pitcher  |
| 15  | RP   | Relief Pitcher    |
| 16  | BE   | Bench             |
| 17  | IL   | Injured List      |
| 19  | IF   | Infield           |

---

## MLB Team IDs

| ID  | Abbr | ID  | Abbr | ID  | Abbr |
| --- | ---- | --- | ---- | --- | ---- |
| 1   | BAL  | 11  | OAK  | 21  | NYM  |
| 2   | BOS  | 12  | SEA  | 22  | PHI  |
| 3   | LAA  | 13  | TEX  | 23  | PIT  |
| 4   | CWS  | 14  | TOR  | 24  | STL  |
| 5   | CLE  | 15  | ATL  | 25  | SD   |
| 6   | DET  | 16  | CHC  | 26  | SF   |
| 7   | KC   | 17  | CIN  | 27  | COL  |
| 8   | MIL  | 18  | HOU  | 28  | MIA  |
| 9   | MIN  | 19  | LAD  | 29  | ARI  |
| 10  | NYY  | 20  | WSH  | 30  | TB   |

---

## Rate Limiting & Caching

- ESPN enforces rate limits. Our adapter enforces **2-second minimum between calls** (global p-limit queue).
- Our adapter caches responses in an LRU cache (max 2000 entries, 1hr TTL).
- ESPN's own CDN caches some endpoints — `kona_game_state` is cached 5 min per trace.
- On `429` responses, axios-retry backs off using the `Retry-After` header.

---

## Known Quirks / Gotchas

1. **HTML response = auth failure.** If ESPN returns `<html>` instead of JSON for a private league, the auth cookies are missing or expired. Check SWID + espn_s2 are current.

2. **`team.points` is NOT real-time.** It's a cached roto total. During live game hours, ESPN's website shows a higher number computed client-side. The gap closes after game stats finalize. `pointsDelta` may carry the live delta when games are in progress (was 0 in our probe — no active games at test time).

3. **Rate stats in `valuesByStat` require component math.** `valuesByStat[2]` (AVG) is computed as `H/AB` across the team. When projecting end-of-season values, combine the component counting stats, then compute the rate — never average team rates.

4. **`filterStatsForSplitTypeIds: [5]`** in the X-Fantasy-Filter header is **essential for historical per-period stats**. Without it, ESPN returns only season totals and most players lack period-specific entries, making team totals wildly incorrect.

5. **View params are repeated, not array-serialized.** Use `?view=mTeam&view=mRoster`, not `?view[]=mTeam&view[]=mRoster`. The adapter's `paramsSerializer` handles this correctly.

6. **`statView=live` query param has no effect.** Tested — returns identical `team.points` and `valuesByStat`. Not a real API param.

7. **`statSplitTypeId` on player stat entries**: `0` = season total, `5` = scoring period, `6` = date range. When inspecting player-level stats from `roster.entries`, check this field to know what time window the stats cover.

8. **Free agent pool is never empty in reality** but our adapter returns empty because the free agent fetch isn't implemented (see `CLAUDE.md` known issues).

9. **ESPN auth cookies expire.** `espn_s2` tokens last weeks to months. If league data stops updating, re-authenticate and update via `PATCH /api/leagues/:id/auth`.

---

## Our Adapter Usage

```typescript
import { ESPNAdapter } from "../adapters/espn.js";

const adapter = new ESPNAdapter(logger);

const raw = await adapter.fetchLeague({
  leagueId: 112523,
  season: 2026,
  auth: { SWID: "...", espn_s2: "..." },
  views: ["mSettings", "mTeam", "mStandings", "mLiveScoring"],
  xFantasyFilter: {
    players: {
      filterStatsForSourceIds: { value: [0] },
      filterStatsForSplitTypeIds: { value: [5] },
    },
  },
});

const normalized = adapter.normalizeLeagueData(raw.data);
// normalized.teams[].statValues = Record<espnStatId, number>
```

Key methods:

| Method                    | Purpose                                               |
| ------------------------- | ----------------------------------------------------- |
| `fetchLeague()`           | Fetch current league data with caching                |
| `fetchHistoricalWeek()`   | Fetch a specific scoring period (throttled, no cache) |
| `getFinalScoringPeriod()` | Get last period ID for a season                       |
| `normalizeLeagueData()`   | Raw ESPN response → `ESPNLeagueData` canonical shape  |
| `fetchFreeAgents()`       | Stub — returns empty array (not implemented)          |
| `fetchTransactions()`     | Activity feed transactions                            |
