<!-- generated-by: gsd-doc-writer -->

# Database Schema Reference

PostgreSQL database accessed via [Kysely](https://kysely.dev/). Type definitions live in
`packages/backend/src/db/schema.ts` (which re-exports shared types from `packages/shared/src/types.ts`).
All DDL is in numbered migration files under `packages/backend/src/db/migrations/`.

---

## Table of Contents

**Core**

- [league](#league)
- [league_settings_version](#league_settings_version)
- [team](#team)
- [player](#player)
- [player_identity_map](#player_identity_map)

**Raw Archive**

- [league_raw_payload](#league_raw_payload)

**Daily Snapshots**

- [league_daily_snapshot](#league_daily_snapshot)
- [league_free_agent_snapshot](#league_free_agent_snapshot)
- [team_daily_category_totals](#team_daily_category_totals)
- [team_daily_category_ranks](#team_daily_category_ranks)
- [team_daily_overall](#team_daily_overall)
- [team_roster_snapshot](#team_roster_snapshot)

**Projections**

- [projections_run](#projections_run)
- [player_projection](#player_projection)
- [team_daily_projected_category](#team_daily_projected_category)
- [team_daily_projected_overall](#team_daily_projected_overall)

**Transactions**

- [league_transaction_event](#league_transaction_event)

**Transaction Impact Analysis (Roto WPA)**

- [player_period_stats](#player_period_stats)
- [roster_move](#roster_move)
- [transaction_impact](#transaction_impact)

**Auth / Users**

- [users](#users)
- [refresh_tokens](#refresh_tokens)

**Slack Integration**

- [slack_installation](#slack_installation)
- [slack_user_link](#slack_user_link)
- [slack_notification_target](#slack_notification_target)
- [agent_report](#agent_report)
- [agent_action](#agent_action)
- [agent_action_decision](#agent_action_decision)
- [slack_message_ref](#slack_message_ref)

**Injury Tracking**

- [injury_event](#injury_event)

**Season Finalization**

- [season_metadata](#season_metadata)

**Change Events**

- [standings_change_event](#standings_change_event)

---

## Key Patterns

### NUMERIC columns and `parseFloat`

`node-postgres` returns `NUMERIC` (OID 1700) as strings by default to avoid floating-point precision
loss. The connection pool in `packages/backend/src/db/connection.ts` registers a global type parser:

```ts
types.setTypeParser(1700, (val: string) => parseFloat(val));
```

This applies to all connections obtained via `getDb()`. Affected columns (all marked `NUMERIC` in the
DDL): `value`, `roto_points`, `projected_value`, `projected_roto_points`, `overall_points`,
`projected_overall_points`, `confidence`, `pct_owned`, `impact_roto_points`, `shapley_impact`,
`ci_low`, `ci_high`, `replacement_level_impact`, `faab_spent`, `espn_asv`, and all `NUMERIC(6,2)`
columns in `standings_change_event`. If you use a raw `pg.Pool` or `pg.Client` outside Kysely, parse
these manually.

### Degraded snapshots

`league_daily_snapshot.is_degraded` is set `TRUE` when a snapshot was written with incomplete data.
`degraded_reasons` is a `TEXT[]` array containing one or more of:

- `"projections_missing"` — no projections_run found for this date
- `"projections_stale"` — projections exist but are older than expected
- `"free_agents_empty"` — free agent pool was not fetched

Downstream tables (`team_daily_projected_*`) should be interpreted with caution when the parent
snapshot is degraded.

### `settings_json` JSONB

`league_settings_version.settings_json` stores a complete `LeagueSettings` object as JSONB:

```jsonc
{
  "scoring_format": "roto",           // "roto" | "h2h_category" | "points"
  "categories": [
    {
      "category_id": "HR",
      "name": "Home Runs",
      "stat_key": "HR",
      "type": "COUNTING",             // "COUNTING" | "RATE" | "POINTS"
      "direction": "HIGHER_BETTER"
    }
    // ...
  ],
  "roster_slots": { "C": 1, "1B": 1, ... },
  "acquisition_rules": {
    "waiver_type": "FAAB",
    "acquisition_limit": 40,
    "trade_deadline": "2025-07-31"
  }
}
```

A new row is inserted whenever league settings change (not updated in place). The current effective
version is always the row with the largest `effective_date ≤ snapshot_date`.

### `player_identity_map` confidence scores

`confidence` is a `NUMERIC(3,2)` in the range `[0, 1]`. Resolution method values:

| `resolution_method` | Meaning                                              |
| ------------------- | ---------------------------------------------------- |
| `exact_match`       | Name matched exactly                                 |
| `fuzzy_match`       | Levenshtein / token sort with team/position boosting |
| `manual_override`   | Manually corrected via admin interface               |

### `player.id` is the ESPN player ID

Since migration 016, `player.id` stores the ESPN player ID directly (previously a separate
`espn_player_id` column existed alongside a sequential `id`). All foreign keys in other tables that
reference `player(id)` therefore reference ESPN player IDs.

### Encrypted ESPN credentials

`league.espn_swid_encrypted` and `league.espn_s2_encrypted` store AES-256-GCM encrypted cookies.
Binary format: `[iv:16 bytes][authTag:16 bytes][ciphertext:*]` stored as `BYTEA`. The plaintext
columns `espn_swid` and `espn_s2` were removed in migration 015.

> **Type discrepancy:** The shared `League` TypeScript interface (`packages/shared/src/types.ts`)
> still declares `espn_swid: string | null` and `espn_s2: string | null`. These columns **no longer
> exist in the database** (dropped in migration 015). Code relying on those fields at the DB layer
> will receive `undefined`.

---

## Core

### `league`

Represents a single ESPN fantasy league for one season. A league-year pair is the top-level tenant.

| Column                | SQL Type    | Nullable | Default              | Description                                     |
| --------------------- | ----------- | -------- | -------------------- | ----------------------------------------------- |
| `id`                  | `SERIAL`    | NO       | auto                 | Surrogate primary key                           |
| `provider`            | `TEXT`      | NO       | `'espn'`             | Data provider identifier                        |
| `espn_league_id`      | `INTEGER`   | NO       | —                    | ESPN's numeric league ID                        |
| `season`              | `INTEGER`   | NO       | —                    | MLB season year (e.g. `2025`)                   |
| `name`                | `TEXT`      | NO       | —                    | Human-readable league name                      |
| `timezone`            | `TEXT`      | NO       | `'America/New_York'` | IANA timezone for scheduling                    |
| `espn_swid_encrypted` | `BYTEA`     | YES      | —                    | AES-256-GCM encrypted SWID cookie               |
| `espn_s2_encrypted`   | `BYTEA`     | YES      | —                    | AES-256-GCM encrypted espn_s2 cookie            |
| `user_team_id`        | `INTEGER`   | YES      | —                    | FK → `team(id)` — the authenticated user's team |
| `created_at`          | `TIMESTAMP` | NO       | `NOW()`              | Row creation time                               |

**Primary key:** `id`

**Unique constraints:**

- `(provider, espn_league_id, season)` — prevents duplicate imports of the same league-year

**Indexes:**

- `idx_league_espn` on `(espn_league_id, season)`
- `idx_league_has_auth` on `(id)` WHERE `espn_swid_encrypted IS NOT NULL` (partial)
- `idx_league_user_team` on `(user_team_id)`

---

### `league_settings_version`

Append-only log of league setting snapshots. A new row is written whenever settings change.

| Column           | SQL Type    | Nullable | Default | Description                                     |
| ---------------- | ----------- | -------- | ------- | ----------------------------------------------- |
| `id`             | `SERIAL`    | NO       | auto    | Surrogate primary key                           |
| `league_id`      | `INTEGER`   | NO       | —       | FK → `league(id)` ON DELETE CASCADE             |
| `effective_date` | `DATE`      | NO       | —       | Date from which these settings apply            |
| `settings_json`  | `JSONB`     | NO       | —       | Full `LeagueSettings` object (see Key Patterns) |
| `created_at`     | `TIMESTAMP` | NO       | `NOW()` | Row creation time                               |

**Primary key:** `id`

**Unique constraints:**

- `(league_id, effective_date)` — one settings snapshot per league per date

**Indexes:**

- `idx_league_settings_league` on `(league_id, effective_date DESC)`

---

### `team`

A fantasy team within a league. One team belongs to one league-season.

| Column         | SQL Type    | Nullable | Default | Description                                                                            |
| -------------- | ----------- | -------- | ------- | -------------------------------------------------------------------------------------- |
| `id`           | `SERIAL`    | NO       | auto    | Surrogate primary key                                                                  |
| `league_id`    | `INTEGER`   | NO       | —       | FK → `league(id)` ON DELETE CASCADE                                                    |
| `espn_team_id` | `INTEGER`   | NO       | —       | ESPN's numeric team ID within the league                                               |
| `name`         | `TEXT`      | NO       | —       | Team name                                                                              |
| `user_id`      | `INTEGER`   | YES      | —       | FK → `users(id)` — owning application user                                             |
| `faab_spent`   | `NUMERIC`   | YES      | `0`     | FAAB dollars spent this season (from ESPN `transactionCounter.acquisitionBudgetSpent`) |
| `created_at`   | `TIMESTAMP` | NO       | `NOW()` | Row creation time                                                                      |

**Primary key:** `id`

**Unique constraints:**

- `(league_id, espn_team_id)` — one team record per ESPN team per league

**Indexes:**

- `idx_team_league` on `(league_id)`
- `idx_team_user_id` on `(user_id)`

---

### `player`

MLB players. `id` is the ESPN player ID (since migration 016).

| Column                      | SQL Type       | Nullable | Default | Description                                                                          |
| --------------------------- | -------------- | -------- | ------- | ------------------------------------------------------------------------------------ |
| `id`                        | `INTEGER`      | NO       | —       | **ESPN player ID** — primary key (not auto-increment)                                |
| `name`                      | `TEXT`         | NO       | —       | Full player name                                                                     |
| `mlb_team`                  | `TEXT`         | YES      | —       | Current MLB team abbreviation                                                        |
| `positions`                 | `TEXT[]`       | NO       | `'{}'`  | Eligible fantasy positions (e.g. `{C, 1B}`)                                          |
| `bats_throws`               | `TEXT`         | YES      | —       | e.g. `'R/R'`                                                                         |
| `pct_owned`                 | `NUMERIC(5,2)` | YES      | —       | Rostered % across ESPN leagues (0–100)                                               |
| `current_season_stats_json` | `JSONB`        | YES      | —       | Current-season counting stats `{AB, H, R, HR, RBI, SB, BB, IP, K, W, SV, ERA, WHIP}` |
| `last_synced_at`            | `TIMESTAMP`    | YES      | —       | Last successful ESPN sync                                                            |
| `injury_status`             | `TEXT`         | YES      | —       | Current injury status: `IL`, `DTD`, `OUT`, `HEALTHY`, or `NULL`                      |
| `injury_updated_at`         | `TIMESTAMP`    | YES      | —       | When `injury_status` was last changed                                                |
| `espn_asv`                  | `NUMERIC`      | YES      | `NULL`  | ESPN Average Season Value (auction draft value)                                      |
| `created_at`                | `TIMESTAMP`    | NO       | `NOW()` | Row creation time                                                                    |

**Primary key:** `id` (ESPN player ID)

**Indexes:**

- `idx_player_name` on `(name)`

> **Migration note:** Before migration 016, `id` was a `SERIAL` surrogate and `espn_player_id` was a
> separate `INTEGER UNIQUE` column. Migration 016 set `id = espn_player_id` and dropped `espn_player_id`.
> All FK references in other tables were updated accordingly.

---

### `player_identity_map`

Maps `player` rows to FanGraphs player keys for projections matching. One row per player (1-to-1).

| Column              | SQL Type       | Nullable | Default | Description                                         |
| ------------------- | -------------- | -------- | ------- | --------------------------------------------------- |
| `player_id`         | `INTEGER`      | NO       | —       | PK + FK → `player(id)` ON DELETE CASCADE            |
| `fangraphs_key`     | `TEXT`         | YES      | —       | FanGraphs player ID string                          |
| `confidence`        | `NUMERIC(3,2)` | NO       | —       | Match confidence score, `[0.00, 1.00]`              |
| `resolution_method` | `TEXT`         | NO       | —       | `exact_match` \| `fuzzy_match` \| `manual_override` |
| `updated_at`        | `TIMESTAMP`    | NO       | `NOW()` | Last resolution update                              |

**Primary key:** `player_id`

**Check constraint:** `confidence >= 0 AND confidence <= 1`

**Indexes:**

- `idx_player_identity_fangraphs` on `(fangraphs_key)` — fast FanGraphs ID lookups

---

## Raw Archive

### `league_raw_payload`

Verbatim archive of ESPN API responses with schema fingerprinting for change detection.

| Column               | SQL Type    | Nullable | Default | Description                                           |
| -------------------- | ----------- | -------- | ------- | ----------------------------------------------------- |
| `id`                 | `BIGSERIAL` | NO       | auto    | Surrogate primary key                                 |
| `league_id`          | `INTEGER`   | NO       | —       | FK → `league(id)` ON DELETE CASCADE                   |
| `fetched_at`         | `TIMESTAMP` | NO       | `NOW()` | Fetch timestamp                                       |
| `endpoint`           | `TEXT`      | NO       | —       | ESPN API endpoint path                                |
| `views`              | `TEXT[]`    | NO       | `'{}'`  | ESPN `?view=` parameters used                         |
| `scoring_period_id`  | `INTEGER`   | YES      | —       | ESPN scoring period, if applicable                    |
| `x_fantasy_filter`   | `JSONB`     | YES      | —       | `X-Fantasy-Filter` header value sent                  |
| `response_json`      | `JSONB`     | NO       | —       | Full ESPN API response body                           |
| `schema_fingerprint` | `TEXT`      | NO       | —       | Hash of response schema structure for drift detection |

**Primary key:** `id`

**Indexes:**

- `idx_raw_payload_league_time` on `(league_id, fetched_at DESC)`
- `idx_raw_payload_fingerprint` on `(league_id, schema_fingerprint)`

---

## Daily Snapshots

### `league_daily_snapshot`

One row per league per day. Parent record for all daily stat and rank tables.

| Column                | SQL Type    | Nullable | Default | Description                                                     |
| --------------------- | ----------- | -------- | ------- | --------------------------------------------------------------- |
| `league_id`           | `INTEGER`   | NO       | —       | PK + FK → `league(id)` ON DELETE CASCADE                        |
| `snapshot_date`       | `DATE`      | NO       | —       | PK — date of the snapshot                                       |
| `settings_version_id` | `INTEGER`   | NO       | —       | FK → `league_settings_version(id)` — settings in effect         |
| `projections_run_id`  | `INTEGER`   | YES      | —       | FK → `projections_run(id)` — projections used (NULL if missing) |
| `is_degraded`         | `BOOLEAN`   | NO       | `FALSE` | `TRUE` if snapshot data is incomplete                           |
| `degraded_reasons`    | `TEXT[]`    | NO       | `'{}'`  | Array of degradation reason codes (see Key Patterns)            |
| `created_at`          | `TIMESTAMP` | NO       | `NOW()` | Row creation time                                               |

**Primary key:** `(league_id, snapshot_date)`

**Indexes:**

- `idx_snapshot_date` on `(snapshot_date DESC)`
- `idx_league_snapshot_league_date` on `(league_id, snapshot_date DESC)`

---

### `league_free_agent_snapshot`

Free agent pool recorded at each snapshot date with ESPN ownership percentages.

| Column          | SQL Type       | Nullable | Default             | Description                              |
| --------------- | -------------- | -------- | ------------------- | ---------------------------------------- |
| `league_id`     | `INTEGER`      | NO       | —                   | PK + FK → `league(id)` ON DELETE CASCADE |
| `snapshot_date` | `DATE`         | NO       | —                   | PK                                       |
| `player_id`     | `INTEGER`      | NO       | —                   | PK + FK → `player(id)` ON DELETE CASCADE |
| `ownership_pct` | `DECIMAL(5,2)` | YES      | `0`                 | Ownership % across ESPN leagues          |
| `started_pct`   | `DECIMAL(5,2)` | YES      | `0`                 | Started % across ESPN leagues            |
| `created_at`    | `TIMESTAMP`    | NO       | `CURRENT_TIMESTAMP` | Row creation time                        |

**Primary key:** `(league_id, snapshot_date, player_id)`

**Indexes:**

- `idx_free_agent_snapshot_league_date` on `(league_id, snapshot_date)`
- `idx_free_agent_snapshot_player` on `(player_id)`

---

### `team_daily_category_totals`

Season-to-date accumulation totals per team per scoring category at each snapshot date.

| Column            | SQL Type  | Nullable | Default | Description                                                          |
| ----------------- | --------- | -------- | ------- | -------------------------------------------------------------------- |
| `league_id`       | `INTEGER` | NO       | —       | PK + composite FK → `league_daily_snapshot`                          |
| `snapshot_date`   | `DATE`    | NO       | —       | PK                                                                   |
| `team_id`         | `INTEGER` | NO       | —       | PK + FK → `team(id)` ON DELETE CASCADE                               |
| `category_id`     | `TEXT`    | NO       | —       | PK — category identifier (e.g. `"HR"`, `"ERA"`)                      |
| `value`           | `NUMERIC` | NO       | —       | Season-to-date stat value (`parseFloat` required — see Key Patterns) |
| `components_json` | `JSONB`   | YES      | —       | Raw counting stat components used to derive rate stats               |

**Primary key:** `(league_id, snapshot_date, team_id, category_id)`

**Foreign keys:**

- `(league_id, snapshot_date)` → `league_daily_snapshot(league_id, snapshot_date)` ON DELETE CASCADE
- `team_id` → `team(id)` ON DELETE CASCADE

**Indexes:**

- `idx_category_totals_team` on `(team_id, snapshot_date DESC)`
- `idx_team_daily_cat_totals_league_date_team` on `(league_id, snapshot_date DESC, team_id)`

---

### `team_daily_category_ranks`

Roto rank per team per category for each snapshot.

| Column          | SQL Type  | Nullable | Default | Description                                  |
| --------------- | --------- | -------- | ------- | -------------------------------------------- |
| `league_id`     | `INTEGER` | NO       | —       | PK + composite FK → `league_daily_snapshot`  |
| `snapshot_date` | `DATE`    | NO       | —       | PK                                           |
| `team_id`       | `INTEGER` | NO       | —       | PK + FK → `team(id)` ON DELETE CASCADE       |
| `category_id`   | `TEXT`    | NO       | —       | PK                                           |
| `rank`          | `INTEGER` | NO       | —       | Category rank (1 = best)                     |
| `roto_points`   | `NUMERIC` | YES      | —       | Roto points assigned (`numTeams - rank + 1`) |

**Primary key:** `(league_id, snapshot_date, team_id, category_id)`

**Foreign keys:**

- `(league_id, snapshot_date)` → `league_daily_snapshot` ON DELETE CASCADE
- `team_id` → `team(id)` ON DELETE CASCADE

**Indexes:**

- `idx_category_ranks_team` on `(team_id, snapshot_date DESC)`

---

### `team_daily_overall`

Aggregated roto standings (sum of category roto points) per team per day.

| Column           | SQL Type  | Nullable | Default | Description                                 |
| ---------------- | --------- | -------- | ------- | ------------------------------------------- |
| `league_id`      | `INTEGER` | NO       | —       | PK + composite FK → `league_daily_snapshot` |
| `snapshot_date`  | `DATE`    | NO       | —       | PK                                          |
| `team_id`        | `INTEGER` | NO       | —       | PK + FK → `team(id)` ON DELETE CASCADE      |
| `overall_points` | `NUMERIC` | NO       | —       | Total roto points across all categories     |
| `overall_rank`   | `INTEGER` | NO       | —       | Overall standings rank                      |

**Primary key:** `(league_id, snapshot_date, team_id)`

**Foreign keys:**

- `(league_id, snapshot_date)` → `league_daily_snapshot` ON DELETE CASCADE

**Indexes:**

- `idx_overall_team` on `(team_id, snapshot_date DESC)`
- `idx_team_daily_overall_date` on `(team_id, snapshot_date DESC)`

---

### `team_roster_snapshot`

Player–team associations recorded at each snapshot date.

| Column             | SQL Type  | Nullable | Default | Description                                                        |
| ------------------ | --------- | -------- | ------- | ------------------------------------------------------------------ |
| `league_id`        | `INTEGER` | NO       | —       | PK + composite FK                                                  |
| `snapshot_date`    | `DATE`    | NO       | —       | PK                                                                 |
| `team_id`          | `INTEGER` | NO       | —       | PK + FK → `team(id)` ON DELETE CASCADE                             |
| `player_id`        | `INTEGER` | NO       | —       | PK + FK → `player(id)` ON DELETE CASCADE                           |
| `roster_status`    | `TEXT`    | NO       | —       | `active` \| `bench` \| `il` \| `na` \| `unknown`                   |
| `roster_slot`      | `TEXT`    | YES      | —       | Starting lineup slot (e.g. `"C"`, `"UTIL"`)                        |
| `acquisition_type` | `TEXT`    | YES      | —       | How player was acquired: `"DRAFT"`, `"FREEAGENT"`, `"TRADE"`, etc. |

**Primary key:** `(league_id, snapshot_date, team_id, player_id)`

**Foreign keys:**

- `(league_id, snapshot_date)` → `league_daily_snapshot` ON DELETE CASCADE
- `team_id` → `team(id)` ON DELETE CASCADE
- `player_id` → `player(id)` ON DELETE CASCADE

**Indexes:**

- `idx_roster_snapshot_team` on `(team_id, snapshot_date DESC)`
- `idx_team_roster_snapshot_league_date_team` on `(league_id, snapshot_date, team_id)`

---

## Projections

### `projections_run`

One row per projections dataset upload. Shared globally across all leagues.

| Column           | SQL Type    | Nullable | Default              | Description                                    |
| ---------------- | ----------- | -------- | -------------------- | ---------------------------------------------- |
| `id`             | `SERIAL`    | NO       | auto                 | Surrogate primary key                          |
| `source`         | `TEXT`      | NO       | `'fangraphs'`        | Data source identifier                         |
| `system`         | `TEXT`      | NO       | `'depth_charts_ros'` | Projection system name                         |
| `as_of_date`     | `DATE`      | NO       | —                    | Date the projections are valid for             |
| `ingested_at`    | `TIMESTAMP` | NO       | `NOW()`              | Ingest timestamp                               |
| `staleness`      | `TEXT`      | NO       | `'fresh'`            | `fresh` \| `stale` \| `missing`                |
| `artifacts_json` | `JSONB`     | YES      | —                    | Ingest metadata (file names, row counts, etc.) |

**Primary key:** `id`

**Unique constraints:**

- `(source, system, as_of_date)` — one run per source/system/date combination

**Indexes:**

- `idx_projections_run_date` on `(as_of_date DESC)`

---

### `player_projection`

Rest-of-season stat projections per player per projections run.

| Column                 | SQL Type  | Nullable | Default | Description                                                                        |
| ---------------------- | --------- | -------- | ------- | ---------------------------------------------------------------------------------- |
| `projections_run_id`   | `INTEGER` | NO       | —       | PK + FK → `projections_run(id)` ON DELETE CASCADE                                  |
| `player_id`            | `INTEGER` | NO       | —       | PK + FK → `player(id)` ON DELETE CASCADE                                           |
| `stat_components_json` | `JSONB`   | NO       | —       | Projected `StatComponents` object (AB, H, HR, RBI, SB, BB, IP, ER, K, W, SV, etc.) |

**Primary key:** `(projections_run_id, player_id)`

**Indexes:**

- `idx_player_projection_player` on `(player_id)`
- `idx_player_projection_composite` on `(player_id, projections_run_id)`

---

### `team_daily_projected_category`

Projected end-of-season totals and roto ranks per team per category, computed by `StandingsProjectionAgent`.

| Column                      | SQL Type  | Nullable | Default | Description                                                       |
| --------------------------- | --------- | -------- | ------- | ----------------------------------------------------------------- |
| `league_id`                 | `INTEGER` | NO       | —       | PK + composite FK                                                 |
| `snapshot_date`             | `DATE`    | NO       | —       | PK                                                                |
| `team_id`                   | `INTEGER` | NO       | —       | PK + FK → `team(id)` ON DELETE CASCADE                            |
| `category_id`               | `TEXT`    | NO       | —       | PK                                                                |
| `projected_value`           | `NUMERIC` | NO       | —       | Projected final season stat value                                 |
| `projected_rank`            | `INTEGER` | NO       | —       | Projected final rank for this category                            |
| `projected_roto_points`     | `NUMERIC` | YES      | —       | Projected roto points                                             |
| `projected_components_json` | `JSONB`   | YES      | —       | Combined current + ROS component totals used to derive rate stats |

**Primary key:** `(league_id, snapshot_date, team_id, category_id)`

**Foreign keys:**

- `(league_id, snapshot_date)` → `league_daily_snapshot` ON DELETE CASCADE

**Indexes:**

- `idx_projected_category_team` on `(team_id, snapshot_date DESC)`

---

### `team_daily_projected_overall`

Projected total roto points and overall rank per team per snapshot.

| Column                     | SQL Type  | Nullable | Default | Description                                        |
| -------------------------- | --------- | -------- | ------- | -------------------------------------------------- |
| `league_id`                | `INTEGER` | NO       | —       | PK + composite FK                                  |
| `snapshot_date`            | `DATE`    | NO       | —       | PK                                                 |
| `team_id`                  | `INTEGER` | NO       | —       | PK + FK → `team(id)` ON DELETE CASCADE             |
| `projected_overall_points` | `NUMERIC` | NO       | —       | Sum of projected roto points across all categories |
| `projected_overall_rank`   | `INTEGER` | NO       | —       | Projected overall standings rank                   |

**Primary key:** `(league_id, snapshot_date, team_id)`

**Foreign keys:**

- `(league_id, snapshot_date)` → `league_daily_snapshot` ON DELETE CASCADE

**Indexes:**

- `idx_projected_overall_team` on `(team_id, snapshot_date DESC)`

---

## Transactions

### `league_transaction_event`

Parsed add/drop/trade/waiver events from the ESPN activity feed.

| Column                 | SQL Type    | Nullable | Default | Description                                       |
| ---------------------- | ----------- | -------- | ------- | ------------------------------------------------- |
| `id`                   | `BIGSERIAL` | NO       | auto    | Surrogate primary key                             |
| `league_id`            | `INTEGER`   | NO       | —       | FK → `league(id)` ON DELETE CASCADE               |
| `event_time`           | `TIMESTAMP` | NO       | —       | Exact event timestamp                             |
| `event_date`           | `DATE`      | NO       | —       | Calendar date of event                            |
| `event_type`           | `TEXT`      | NO       | —       | `add` \| `drop` \| `trade` \| `waiver` \| `other` |
| `team_id`              | `INTEGER`   | NO       | —       | FK → `team(id)` — primary team involved           |
| `counterparty_team_id` | `INTEGER`   | YES      | —       | FK → `team(id)` — other team (trades only)        |
| `players_added`        | `INTEGER[]` | NO       | `'{}'`  | ESPN player IDs added                             |
| `players_dropped`      | `INTEGER[]` | NO       | `'{}'`  | ESPN player IDs dropped                           |
| `espn_event_id`        | `TEXT`      | YES      | —       | ESPN's own event identifier                       |
| `payload_hash`         | `TEXT`      | NO       | —       | Hash of raw event for deduplication               |
| `raw_event_json`       | `JSONB`     | NO       | —       | Full ESPN activity event JSON                     |

**Primary key:** `id`

**Unique constraints:**

- `(league_id, event_time, team_id, payload_hash)` — deduplication guard

**Indexes:**

- `idx_transaction_league_time` on `(league_id, event_date DESC)`
- `idx_transaction_team` on `(team_id, event_date DESC)`
- `idx_transaction_espn_id` on `(espn_event_id)` WHERE `espn_event_id IS NOT NULL` (partial)

---

## Transaction Impact Analysis (Roto WPA)

### `player_period_stats`

Per-player per-scoring-period counting stats. Used for backfill and tenure-based analysis.

| Column            | SQL Type  | Nullable | Default | Description                                          |
| ----------------- | --------- | -------- | ------- | ---------------------------------------------------- |
| `league_id`       | `INTEGER` | NO       | —       | PK + FK → `league(id)` ON DELETE CASCADE             |
| `snapshot_date`   | `DATE`    | NO       | —       | Date the stats were recorded                         |
| `scoring_period`  | `INTEGER` | NO       | —       | PK — ESPN scoring period number                      |
| `player_id`       | `INTEGER` | NO       | —       | PK + FK → `player(id)` ON DELETE CASCADE             |
| `team_id`         | `INTEGER` | NO       | —       | FK → `team(id)` — team the player was on this period |
| `lineup_slot_id`  | `INTEGER` | YES      | —       | ESPN lineup slot identifier                          |
| `components_json` | `JSONB`   | NO       | —       | `StatComponents` for this period                     |

**Primary key:** `(league_id, scoring_period, player_id)`

**Indexes:**

- `idx_pps_team` on `(team_id, league_id, scoring_period)`
- `idx_pps_snapshot` on `(league_id, snapshot_date)`

---

### `roster_move`

Roster changes derived from weekly snapshot diffs (adds, drops, trades, drafts).

| Column           | SQL Type  | Nullable | Default | Description                                                          |
| ---------------- | --------- | -------- | ------- | -------------------------------------------------------------------- |
| `id`             | `SERIAL`  | NO       | auto    | Surrogate primary key                                                |
| `league_id`      | `INTEGER` | NO       | —       | FK → `league(id)` ON DELETE CASCADE                                  |
| `team_id`        | `INTEGER` | NO       | —       | FK → `team(id)` ON DELETE CASCADE                                    |
| `move_type`      | `TEXT`    | NO       | —       | `add` \| `drop` \| `trade_in` \| `trade_out` \| `draft` \| `unknown` |
| `player_id`      | `INTEGER` | NO       | —       | FK → `player(id)` ON DELETE CASCADE                                  |
| `effective_date` | `DATE`    | NO       | —       | Date the move took effect                                            |
| `paired_move_id` | `INTEGER` | YES      | —       | Self-referential FK → `roster_move(id)` — links add↔drop pairs       |

**Primary key:** `id`

**Unique constraints:**

- `(league_id, team_id, player_id, effective_date, move_type)`

**Indexes:**

- `idx_rm_team` on `(team_id, league_id, effective_date)`

---

### `transaction_impact`

Cached roto-WPA impact scores per roster move, extended with Shapley values and SGP normalization.

| Column                         | SQL Type    | Nullable | Default | Description                                        |
| ------------------------------ | ----------- | -------- | ------- | -------------------------------------------------- |
| `id`                           | `SERIAL`    | NO       | auto    | Surrogate primary key                              |
| `league_id`                    | `INTEGER`   | NO       | —       | FK → `league(id)` ON DELETE CASCADE                |
| `team_id`                      | `INTEGER`   | NO       | —       | FK → `team(id)` ON DELETE CASCADE                  |
| `move_type`                    | `TEXT`      | NO       | —       | Move type string                                   |
| `player_gained_id`             | `INTEGER`   | YES      | —       | FK → `player(id)` — player added (NULL for drops)  |
| `player_lost_id`               | `INTEGER`   | YES      | —       | FK → `player(id)` — player dropped (NULL for adds) |
| `effective_date`               | `DATE`      | NO       | —       | Move date                                          |
| `gained_components`            | `JSONB`     | YES      | —       | Stat components of the gained player               |
| `lost_components`              | `JSONB`     | YES      | —       | Stat components of the dropped player              |
| `impact_roto_points`           | `NUMERIC`   | NO       | —       | Net roto points change from this move              |
| `category_impacts`             | `JSONB`     | NO       | —       | Per-category impact breakdown                      |
| `is_incomplete`                | `BOOLEAN`   | NO       | `FALSE` | `TRUE` if impact computation was partial           |
| `computed_at`                  | `TIMESTAMP` | NO       | `NOW()` | Computation timestamp                              |
| `shapley_impact`               | `NUMERIC`   | YES      | —       | Shapley-attributed roto points impact              |
| `ci_low`                       | `NUMERIC`   | YES      | —       | Bootstrap 95% CI lower bound                       |
| `ci_high`                      | `NUMERIC`   | YES      | —       | Bootstrap 95% CI upper bound                       |
| `is_uncertain`                 | `BOOLEAN`   | NO       | `FALSE` | `TRUE` if CI crosses zero                          |
| `sgp_category_impacts`         | `JSONB`     | YES      | —       | SGP-normalized per-category deltas                 |
| `replacement_level_components` | `JSONB`     | YES      | —       | Replacement-level baseline (draft picks only)      |
| `replacement_level_impact`     | `NUMERIC`   | YES      | —       | Roto points vs replacement (draft picks only)      |

**Primary key:** `id`

**Unique constraints:**

- `(league_id, effective_date, move_type, player_gained_id, player_lost_id)` — handles adds (lost=NULL), drops (gained=NULL), and trades (both set)

**Indexes:**

- `idx_ti_team` on `(team_id, league_id)`

---

## Auth / Users

### `users`

Application user accounts supporting both local (email/password) and OAuth login.

| Column           | SQL Type    | Nullable | Default  | Description                                             |
| ---------------- | ----------- | -------- | -------- | ------------------------------------------------------- |
| `id`             | `SERIAL`    | NO       | auto     | Surrogate primary key                                   |
| `email`          | `TEXT`      | NO       | —        | User email address (unique)                             |
| `email_verified` | `BOOLEAN`   | NO       | `FALSE`  | Whether email has been verified                         |
| `password_hash`  | `TEXT`      | YES      | —        | Bcrypt hash; `NULL` for OAuth-only users                |
| `role`           | `TEXT`      | NO       | `'user'` | `user` \| `admin`                                       |
| `google_id`      | `TEXT`      | YES      | —        | Google OAuth subject identifier (unique)                |
| `github_id`      | `TEXT`      | YES      | —        | GitHub OAuth user ID (unique)                           |
| `oauth_provider` | `TEXT`      | YES      | —        | Primary OAuth provider: `google` \| `github` \| `local` |
| `display_name`   | `TEXT`      | YES      | —        | Preferred display name                                  |
| `avatar_url`     | `TEXT`      | YES      | —        | Profile image URL                                       |
| `created_at`     | `TIMESTAMP` | NO       | `NOW()`  | Account creation time                                   |
| `updated_at`     | `TIMESTAMP` | NO       | `NOW()`  | Last profile update                                     |
| `last_login_at`  | `TIMESTAMP` | YES      | —        | Most recent login timestamp                             |

**Primary key:** `id`

**Unique constraints:**

- `email` — one account per email address
- `google_id` — one account per Google identity
- `github_id` — one account per GitHub identity

**Check constraint:** `role IN ('user', 'admin')`

**Indexes:**

- `idx_users_email` on `(email)`
- `idx_users_google_id` on `(google_id)`
- `idx_users_github_id` on `(github_id)`

---

### `refresh_tokens`

JWT refresh tokens. Rotated on use; expired tokens are periodically purged.

| Column       | SQL Type    | Nullable | Default | Description                                |
| ------------ | ----------- | -------- | ------- | ------------------------------------------ |
| `id`         | `SERIAL`    | NO       | auto    | Surrogate primary key                      |
| `user_id`    | `INTEGER`   | NO       | —       | FK → `users(id)` ON DELETE CASCADE         |
| `token_hash` | `TEXT`      | NO       | —       | SHA-256 hash of the refresh token (unique) |
| `expires_at` | `TIMESTAMP` | NO       | —       | Token expiry                               |
| `created_at` | `TIMESTAMP` | NO       | `NOW()` | Row creation time                          |

**Primary key:** `id`

**Unique constraints:**

- `token_hash` (added migration 014) — prevents duplicate hashes (security guard)

**Indexes:**

- `idx_refresh_tokens_user_id` on `(user_id)`
- `idx_refresh_tokens_expires_at` on `(expires_at)`

---

## Slack Integration

### `slack_installation`

Slack workspace OAuth installations (workspace-level bot install).

| Column                           | SQL Type    | Nullable | Default              | Description                          |
| -------------------------------- | ----------- | -------- | -------------------- | ------------------------------------ |
| `id`                             | `UUID`      | NO       | `uuid_generate_v4()` | Primary key                          |
| `team_id`                        | `TEXT`      | NO       | —                    | Slack workspace ID (unique)          |
| `enterprise_id`                  | `TEXT`      | YES      | —                    | Slack Enterprise Grid org ID         |
| `bot_token_encrypted`            | `BYTEA`     | NO       | —                    | Encrypted Slack bot token            |
| `bot_user_id`                    | `TEXT`      | NO       | —                    | Bot's Slack user ID                  |
| `installer_slack_user_id`        | `TEXT`      | NO       | —                    | Slack user who installed the app     |
| `incoming_webhook_url_encrypted` | `BYTEA`     | YES      | —                    | Encrypted incoming webhook URL       |
| `incoming_webhook_channel_id`    | `TEXT`      | YES      | —                    | Default webhook channel ID           |
| `incoming_webhook_channel_name`  | `TEXT`      | YES      | —                    | Default webhook channel name         |
| `scopes`                         | `TEXT`      | NO       | —                    | Comma-separated OAuth scopes granted |
| `installed_at`                   | `TIMESTAMP` | NO       | `NOW()`              | Installation timestamp               |
| `revoked_at`                     | `TIMESTAMP` | YES      | —                    | Revocation timestamp (NULL = active) |
| `last_ok_at`                     | `TIMESTAMP` | YES      | —                    | Last successful API call             |
| `last_error`                     | `JSONB`     | YES      | —                    | Most recent Slack API error          |

**Primary key:** `id`

**Unique constraints:** `team_id`

**Indexes:**

- `idx_slack_installation_team` on `(team_id)`
- `idx_slack_installation_active` on `(revoked_at)` WHERE `revoked_at IS NULL` (partial)

---

### `slack_user_link`

Links a Slack user to a specific fantasy league + team.

| Column            | SQL Type    | Nullable | Default              | Description                                          |
| ----------------- | ----------- | -------- | -------------------- | ---------------------------------------------------- |
| `id`              | `UUID`      | NO       | `uuid_generate_v4()` | Primary key                                          |
| `team_id`         | `TEXT`      | NO       | —                    | FK → `slack_installation(team_id)` ON DELETE CASCADE |
| `slack_user_id`   | `TEXT`      | NO       | —                    | Slack user ID (e.g. `U012AB3CD`)                     |
| `league_id`       | `INTEGER`   | NO       | —                    | FK → `league(id)` ON DELETE CASCADE                  |
| `team_id_fantasy` | `INTEGER`   | NO       | —                    | FK → `team(id)` — fantasy team                       |
| `created_at`      | `TIMESTAMP` | NO       | `NOW()`              | Row creation time                                    |

**Primary key:** `id`

**Unique constraints:**

- `(team_id, slack_user_id, league_id)` — one link per Slack user per league

**Indexes:**

- `idx_slack_user_link_lookup` on `(team_id, slack_user_id)`
- `idx_slack_user_link_league` on `(league_id)`
- `idx_slack_user_link_team` on `(team_id_fantasy)`

---

### `slack_notification_target`

Per-user delivery configuration for Slack notifications (channel vs DM, quiet hours).

| Column               | SQL Type    | Nullable | Default              | Description                                           |
| -------------------- | ----------- | -------- | -------------------- | ----------------------------------------------------- |
| `id`                 | `UUID`      | NO       | `uuid_generate_v4()` | Primary key                                           |
| `slack_user_link_id` | `UUID`      | NO       | —                    | FK → `slack_user_link(id)` ON DELETE CASCADE          |
| `league_id`          | `INTEGER`   | NO       | —                    | FK → `league(id)` ON DELETE CASCADE                   |
| `team_id`            | `TEXT`      | NO       | —                    | FK → `slack_installation(team_id)` ON DELETE CASCADE  |
| `target_type`        | `TEXT`      | NO       | —                    | `channel` \| `dm`                                     |
| `channel_id`         | `TEXT`      | YES      | —                    | Slack channel ID (for `target_type = 'channel'`)      |
| `thread_ts`          | `TEXT`      | YES      | —                    | Thread timestamp to reply into                        |
| `is_enabled`         | `BOOLEAN`   | NO       | `TRUE`               | Whether notifications are active                      |
| `quiet_hours_json`   | `JSONB`     | YES      | —                    | Quiet hours configuration (start/end times, timezone) |
| `created_at`         | `TIMESTAMP` | NO       | `NOW()`              | Creation time                                         |
| `updated_at`         | `TIMESTAMP` | NO       | `NOW()`              | Last update                                           |

**Primary key:** `id`

**Unique constraints:**

- `(slack_user_link_id, league_id)` — one notification config per user per league

**Check constraint:** `target_type IN ('channel', 'dm')`

**Indexes:**

- `idx_notification_target_enabled` on `(is_enabled, league_id)` WHERE `is_enabled = TRUE` (partial)
- `idx_notification_target_team` on `(team_id)`

---

### `agent_report`

Daily morning report records generated by the Slack agent.

| Column               | SQL Type    | Nullable | Default              | Description                                     |
| -------------------- | ----------- | -------- | -------------------- | ----------------------------------------------- |
| `id`                 | `UUID`      | NO       | `uuid_generate_v4()` | Primary key                                     |
| `slack_user_link_id` | `UUID`      | NO       | —                    | FK → `slack_user_link(id)` ON DELETE CASCADE    |
| `league_id`          | `INTEGER`   | NO       | —                    | FK → `league(id)` ON DELETE CASCADE             |
| `report_date`        | `DATE`      | NO       | —                    | Date the report covers                          |
| `kind`               | `TEXT`      | NO       | —                    | Report type — currently only `morning`          |
| `summary_markdown`   | `TEXT`      | NO       | —                    | Rendered Markdown summary sent to Slack         |
| `data_json`          | `JSONB`     | NO       | —                    | Structured report data used to generate summary |
| `created_at`         | `TIMESTAMP` | NO       | `NOW()`              | Generation time                                 |

**Primary key:** `id`

**Unique constraints:**

- `(slack_user_link_id, league_id, report_date, kind)` — one report per user per league per day per kind

**Check constraint:** `kind IN ('morning')`

**Indexes:**

- `idx_agent_report_lookup` on `(league_id, report_date DESC)`
- `idx_agent_report_user` on `(slack_user_link_id)`

---

### `agent_action`

Actionable recommendations (waiver claims, lineup changes, trade offers) proposed by the agent.

| Column                 | SQL Type    | Nullable | Default              | Description                                                                              |
| ---------------------- | ----------- | -------- | -------------------- | ---------------------------------------------------------------------------------------- |
| `id`                   | `UUID`      | NO       | `uuid_generate_v4()` | Primary key                                                                              |
| `report_id`            | `UUID`      | NO       | —                    | FK → `agent_report(id)` ON DELETE CASCADE                                                |
| `action_type`          | `TEXT`      | NO       | —                    | `ADD_DROP` \| `WAIVER_CLAIM` \| `SET_LINEUP` \| `TRADE_OFFER`                            |
| `payload_json`         | `JSONB`     | NO       | —                    | Action-type-specific parameters                                                          |
| `expected_impact_json` | `JSONB`     | NO       | —                    | Predicted roto impact                                                                    |
| `risk_flags_json`      | `JSONB`     | YES      | —                    | Risk factors (injury risk, schedule, etc.)                                               |
| `evidence_json`        | `JSONB`     | YES      | —                    | Supporting data and reasoning                                                            |
| `status`               | `TEXT`      | NO       | —                    | `proposed` \| `approved` \| `rejected` \| `expired` \| `executing` \| `done` \| `failed` |
| `expires_at`           | `TIMESTAMP` | NO       | —                    | When the action recommendation expires                                                   |
| `created_at`           | `TIMESTAMP` | NO       | `NOW()`              | Creation time                                                                            |
| `updated_at`           | `TIMESTAMP` | NO       | `NOW()`              | Last status change                                                                       |

**Primary key:** `id`

**Check constraints:** `action_type IN (...)`, `status IN (...)`

**Indexes:**

- `idx_agent_action_report` on `(report_id)`
- `idx_agent_action_status` on `(status, expires_at)`

---

### `agent_action_decision`

Approval or rejection decisions by users on proposed agent actions.

| Column                          | SQL Type    | Nullable | Default              | Description                                     |
| ------------------------------- | ----------- | -------- | -------------------- | ----------------------------------------------- |
| `id`                            | `UUID`      | NO       | `uuid_generate_v4()` | Primary key                                     |
| `action_id`                     | `UUID`      | NO       | —                    | FK → `agent_action(id)` ON DELETE CASCADE       |
| `decided_by_slack_user_link_id` | `UUID`      | NO       | —                    | FK → `slack_user_link(id)` — who decided        |
| `decision`                      | `TEXT`      | NO       | —                    | `approve` \| `reject` \| `modify`               |
| `override_payload_json`         | `JSONB`     | YES      | —                    | Modified parameters (for `decision = 'modify'`) |
| `decided_at`                    | `TIMESTAMP` | NO       | `NOW()`              | Decision timestamp                              |

**Primary key:** `id`

**Check constraint:** `decision IN ('approve', 'reject', 'modify')`

**Indexes:**

- `idx_agent_action_decision_action` on `(action_id)`
- `idx_agent_action_decision_user` on `(decided_by_slack_user_link_id)`

---

### `slack_message_ref`

References to Slack messages (for editing or threading follow-up messages).

| Column       | SQL Type    | Nullable | Default              | Description                                          |
| ------------ | ----------- | -------- | -------------------- | ---------------------------------------------------- |
| `id`         | `UUID`      | NO       | `uuid_generate_v4()` | Primary key                                          |
| `team_id`    | `TEXT`      | NO       | —                    | FK → `slack_installation(team_id)` ON DELETE CASCADE |
| `channel_id` | `TEXT`      | NO       | —                    | Slack channel ID                                     |
| `message_ts` | `TEXT`      | NO       | —                    | Slack message timestamp (unique message identifier)  |
| `report_id`  | `UUID`      | YES      | —                    | FK → `agent_report(id)` ON DELETE CASCADE            |
| `action_id`  | `UUID`      | YES      | —                    | FK → `agent_action(id)` ON DELETE CASCADE            |
| `created_at` | `TIMESTAMP` | NO       | `NOW()`              | Row creation time                                    |

**Primary key:** `id`

**Unique constraints:**

- `(team_id, channel_id, message_ts)` — Slack messages are uniquely identified by workspace + channel + ts

**Indexes:**

- `idx_slack_message_ref_report` on `(report_id)`
- `idx_slack_message_ref_action` on `(action_id)`
- `idx_slack_message_ref_team` on `(team_id)`

---

## Injury Tracking

### `injury_event`

Historical log of player injury status changes.

| Column          | SQL Type    | Nullable | Default | Description                         |
| --------------- | ----------- | -------- | ------- | ----------------------------------- |
| `id`            | `SERIAL`    | NO       | auto    | Surrogate primary key               |
| `player_id`     | `INTEGER`   | NO       | —       | FK → `player(id)` ON DELETE CASCADE |
| `event_date`    | `DATE`      | NO       | —       | Date of the status change           |
| `injury_status` | `TEXT`      | NO       | —       | `IL` \| `DTD` \| `OUT` \| `HEALTHY` |
| `notes`         | `TEXT`      | YES      | —       | Free-text injury description        |
| `created_at`    | `TIMESTAMP` | NO       | `NOW()` | Row creation time                   |

**Primary key:** `id`

**Indexes:**

- `idx_injury_event_player` on `(player_id, event_date DESC)`
- `idx_injury_event_date` on `(event_date DESC)`

---

## Season Finalization

### `season_metadata`

Tracks whether a season has been finalized; finalized seasons skip projection recomputation.

| Column           | SQL Type    | Nullable | Default | Description                              |
| ---------------- | ----------- | -------- | ------- | ---------------------------------------- |
| `league_id`      | `INTEGER`   | NO       | —       | PK + FK → `league(id)` ON DELETE CASCADE |
| `season`         | `INTEGER`   | NO       | —       | PK — MLB season year                     |
| `is_finalized`   | `BOOLEAN`   | NO       | `FALSE` | Whether the season is complete           |
| `finalized_at`   | `TIMESTAMP` | YES      | —       | When finalization was recorded           |
| `snapshot_count` | `INTEGER`   | YES      | —       | Total snapshots taken for this season    |
| `created_at`     | `TIMESTAMP` | NO       | `NOW()` | Row creation time                        |

**Primary key:** `(league_id, season)`

**Indexes:**

- `idx_season_metadata_league` on `(league_id, season)`

---

## Change Events

### `standings_change_event`

Persistent log of roto-point changes per team per category per snapshot. Used to power the
changelog feed and standings movement notifications.

| Column             | SQL Type       | Nullable | Default | Description                                                                       |
| ------------------ | -------------- | -------- | ------- | --------------------------------------------------------------------------------- |
| `id`               | `BIGSERIAL`    | NO       | auto    | Surrogate primary key                                                             |
| `league_id`        | `INTEGER`      | NO       | —       | FK → `league(id)` ON DELETE CASCADE                                               |
| `team_id`          | `INTEGER`      | NO       | —       | FK → `team(id)` ON DELETE CASCADE                                                 |
| `snapshot_date`    | `DATE`         | NO       | —       | Date of the snapshot that produced this event                                     |
| `occurred_at`      | `TIMESTAMP`    | NO       | `NOW()` | Event timestamp                                                                   |
| `category_id`      | `VARCHAR`      | NO       | —       | Category identifier                                                               |
| `category_name`    | `VARCHAR`      | NO       | —       | Human-readable category name                                                      |
| `prev_roto_pts`    | `NUMERIC(6,2)` | NO       | —       | Roto points before this snapshot                                                  |
| `curr_roto_pts`    | `NUMERIC(6,2)` | NO       | —       | Roto points after this snapshot                                                   |
| `roto_delta`       | `NUMERIC(6,2)` | NO       | —       | `curr_roto_pts - prev_roto_pts`                                                   |
| `passed_team_id`   | `INTEGER`      | YES      | —       | FK → `team(id)` — team passed (gained) or that passed us (lost)                   |
| `passed_team_name` | `VARCHAR`      | YES      | —       | Denormalized name of the team passed                                              |
| `direction`        | `VARCHAR(10)`  | NO       | —       | `gained` \| `lost`                                                                |
| `proximate_cause`  | `JSONB`        | YES      | —       | `{playerName, stat, value, description}` — the player/event that drove the change |

**Primary key:** `id`

**Unique constraints:**

- `(league_id, team_id, snapshot_date, category_id)` (constraint: `sce_unique_event`) — one event per team/category/day

**Check constraint:** `direction IN ('gained', 'lost')`

**Indexes:**

- `idx_sce_league_date` on `(league_id, snapshot_date DESC)`
- `idx_sce_team_time` on `(team_id, occurred_at DESC)`

---

## Relationships Summary

```
league
  ├── league_settings_version (league_id)
  ├── team (league_id)
  │   └── users (user_id → users.id)
  ├── league_raw_payload (league_id)
  ├── league_daily_snapshot (league_id) ← pivot for all daily data
  │   ├── team_daily_category_totals (league_id, snapshot_date)
  │   ├── team_daily_category_ranks (league_id, snapshot_date)
  │   ├── team_daily_overall (league_id, snapshot_date)
  │   ├── team_daily_projected_category (league_id, snapshot_date)
  │   ├── team_daily_projected_overall (league_id, snapshot_date)
  │   ├── team_roster_snapshot (league_id, snapshot_date)
  │   └── league_free_agent_snapshot (league_id, snapshot_date)
  ├── league_transaction_event (league_id)
  ├── player_period_stats (league_id)
  ├── roster_move (league_id)
  ├── transaction_impact (league_id)
  ├── season_metadata (league_id)
  ├── standings_change_event (league_id)
  └── slack_user_link (league_id)

player
  ├── player_identity_map (player_id) — 1:1
  ├── player_projection (player_id)
  ├── team_roster_snapshot (player_id)
  ├── player_period_stats (player_id)
  ├── roster_move (player_id)
  ├── transaction_impact (player_gained_id / player_lost_id)
  ├── league_free_agent_snapshot (player_id)
  └── injury_event (player_id)

projections_run
  ├── player_projection (projections_run_id)
  └── league_daily_snapshot (projections_run_id)

users
  ├── team (user_id)
  └── refresh_tokens (user_id)

slack_installation (team_id)
  ├── slack_user_link (team_id)
  ├── slack_notification_target (team_id)
  └── slack_message_ref (team_id)

slack_user_link (id)
  ├── slack_notification_target (slack_user_link_id)
  ├── agent_report (slack_user_link_id)
  └── agent_action_decision (decided_by_slack_user_link_id)

agent_report (id)
  ├── agent_action (report_id)
  └── slack_message_ref (report_id)

agent_action (id)
  ├── agent_action_decision (action_id)
  └── slack_message_ref (action_id)
```

---

## Schema vs. Shared Types Discrepancy

The shared `League` TypeScript interface (`packages/shared/src/types.ts`) declares:

```ts
espn_swid: string | null;
espn_s2: string | null;
```

These columns **were dropped from the database** in migration 015. Any code that reads `league.espn_swid`
or `league.espn_s2` from a query result will receive `undefined`. The shared type should be updated to
remove these fields.
