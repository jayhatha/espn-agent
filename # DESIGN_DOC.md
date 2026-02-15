# DESIGN_DOC.md — ESPN Fantasy Baseball Assistant (Web App, v1)

## 0) Summary

A web app (mobile-usable UI) that connects to ESPN Fantasy Baseball leagues, automatically adapts to each league’s settings, and provides:

- Draft assistance (snake + auction)
- Trade advice (impact + candidate generation)
- Waiver wire suggestions (adds/drops + category targeting)
- Rest-of-season (RoS) standings projections per category and overall

The app stores **daily snapshots** of standings/stats/rosters/projections at **03:00 league timezone** so you can graph each team’s performance and outlook over time, with **transaction overlays** (adds/drops/trades).

**v1 projections source:** **FanGraphs Depth Charts RoS** (CSV upload; two files/day: batters + pitchers), including **OBP/OPS support** via proper component math.

Non-goals (v1):

- Executing ESPN moves (read-only first)
- Real-time intra-day snapshots (daily only)
- Automated lineup setting (possible v2)

---

## 1) Core Requirements

### R1 — Per-league settings pulled from ESPN

ESPN league settings are authoritative:

- scoring format (roto / H2H categories / points)
- categories (including direction: higher-better / lower-better)
- roster slots & eligibility rules
- acquisition rules (waivers/FAAB, deadlines, limits)

Settings are versioned; daily snapshots reference the settings version active that day.

### R2 — FanGraphs Depth Charts RoS projections (CSV upload) with OBP/OPS

- Ingest FanGraphs **Depth Charts RoS** projections as CSV.
- Two uploads per day:
  - batters CSV
  - pitchers CSV
- Support rate stats including **AVG/OBP/OPS** and pitcher rate categories (ERA/WHIP) using underlying components, not derived rates.
- Produce daily projected final totals, category ranks, and overall standings.

### R3 — Daily snapshots (no backfill)

- Exactly **one canonical snapshot per league per day** at **03:00** league timezone.
- No backfill. If a daily job fails, that date is missing in graphs.

### R4 — Graphs + transaction overlays

Graphs (all required):

- Overall points/rank over time
- Category rank over time
- Category totals over time
- Projected finish over time (overall + per category)

Overlays:

- Adds/drops/trades shown as annotations on graphs (de-duped and day-bucketed).

### R5 — Web app, mobile-usable UI

Responsive design; key flows must work on phone:

- League overview + trends
- Team detail + category graphs
- Waiver recommendations
- Trade impact report
- Draft room mode

---

## 2) External Integrations

### 2.1 ESPN Fantasy Baseball (unofficial endpoints)

- ESPN fantasy endpoints are not formally documented; implement an adapter layer that can evolve without breaking the product.
- Support:
  - Public leagues (no auth)
  - Private leagues (user supplies cookies, e.g., `SWID` and `espn_s2`)
- Use caching + retries + schema drift detection.

### 2.2 FanGraphs projections (Depth Charts RoS via CSV)

**v1 canonical ingestion path:**

- User uploads Depth Charts RoS CSVs (batters + pitchers) daily (or as often as they want).
- The system uses the most recent available run at snapshot time; if today’s run is missing, it uses the most recent prior run and marks projections as stale for that day.

---

## 3) Architecture

### 3.1 High-level components

- Frontend: Next.js (App Router) + responsive UI
- Backend API: FastAPI (Python) or Node/TypeScript (either is fine; contracts below are language-agnostic)
- Worker: background job runner (Celery/RQ or BullMQ) for daily sync + heavy computations
- Storage:
  - Postgres: canonical data + time series
  - Redis: caching ESPN calls, job locks, rate limiting
  - Object storage: projection CSV artifacts + raw payload archives (recommended)

### 3.2 Modules

1. **ESPN Adapter**
   - Fetches ESPN data, handles auth/cookies, normalizes to canonical models
   - Archives raw payloads + calculates schema fingerprints

2. **Projections Ingest (Depth Charts RoS)**
   - Parses CSVs into component stats
   - Produces a daily `projections_run` and `player_projection` rows

3. **Analytics Engine**
   - Computes:
     - projected team totals per category
     - projected category ranks
     - projected overall standings
   - Computes move deltas for waivers/trades/draft decisions

4. **Recommendations**
   - Waiver recommender
   - Trade impact + trade candidate generation
   - Draft assistant

5. **Snapshot Orchestrator**
   - Runs daily at 03:00 league timezone
   - Produces atomic snapshots + computed projections + transaction event ingestion

---

## 4) Data Model (Canonical)

### 4.1 Core entities

**league**

- id (internal)
- provider = `espn`
- espn_league_id
- season
- name
- timezone (from ESPN if available; else configured default)
- created_at

**league_settings_version**

- id
- league_id
- effective_date (DATE)
- settings_json (normalized)
- categories_json (canonical categories; see §5)
- roster_slots_json
- acquisition_rules_json
- created_at

**team**

- league_id
- espn_team_id
- name
- created_at

**player**

- id (internal)
- espn_player_id
- name
- mlb_team (nullable)
- positions (string[])
- bats_throws (nullable)
- created_at

**player_identity_map**

- player_id (internal)
- fangraphs_key (nullable)
- confidence (0..1)
- resolution_method (enum)
- updated_at

### 4.2 Raw payload archive (resilience)

**league_raw_payload**

- id
- league_id
- fetched_at (timestamp)
- endpoint (string)
- views (string[])
- scoring_period_id (int nullable)
- x_fantasy_filter (json nullable)
- response_json (compressed; optionally encrypted)
- schema_fingerprint (string)

### 4.3 Daily snapshots (time series)

**league_daily_snapshot**

- league_id
- snapshot_date (DATE in league timezone)
- created_at
- settings_version_id
- projections_run_id
- is_degraded (bool)
- degraded_reasons (string[])
- PRIMARY KEY (league_id, snapshot_date)

**team_daily_category_totals**

- league_id, snapshot_date, team_id, category_id
- value (float)
- components_json (json nullable; REQUIRED for rate stats)

**team_daily_category_ranks**

- league_id, snapshot_date, team_id, category_id
- rank (int)
- roto_points (float nullable)

**team_daily_overall**

- league_id, snapshot_date, team_id
- overall_points (float)
- overall_rank (int)

### 4.4 Daily projected standings (stored for fast graphs)

**team_daily_projected_category**

- league_id, snapshot_date, team_id, category_id
- projected_value (float)
- projected_rank (int)
- projected_roto_points (float nullable)
- projected_components_json (json nullable)

**team_daily_projected_overall**

- league_id, snapshot_date, team_id
- projected_overall_points (float)
- projected_overall_rank (int)

### 4.5 Rosters & transactions (context + overlays)

**team_roster_snapshot**

- league_id, snapshot_date, team_id
- player_id
- roster_status (enum: active|bench|il|na|unknown)
- roster_slot (string nullable)
- acquisition_type (string nullable)
- PRIMARY KEY (league_id, snapshot_date, team_id, player_id)

**league_transaction_event**

- id
- league_id
- event_time (timestamp)
- event_date (DATE in league timezone) # derived for overlays
- event_type (enum: add|drop|trade|waiver|other)
- team_id (primary actor)
- counterparty_team_id (nullable)
- players_added (int[] player_id)
- players_dropped (int[] player_id)
- espn_event_id (string nullable)
- payload_hash (string) # for de-dupe
- raw_event_json (json)

Deduplication:

- Prefer `espn_event_id` if present
- Else unique on (league_id, event_time, team_id, payload_hash)

### 4.6 FanGraphs projections (Depth Charts RoS, versioned daily)

**projections_run**

- id
- source = `fangraphs`
- system = `depth_charts_ros`
- as_of_date (DATE)
- ingested_at
- staleness (enum: fresh|stale|missing)
- artifacts_json (object storage refs for CSVs; optional but recommended)

**player_projection**

- projections_run_id
- player_id
- stat_components_json (json) # MUST include required components for the league

---

## 5) Categories & Component Math (including OBP/OPS)

### 5.1 Canonical category definition

Each category in `league_settings_version.categories_json` should include:

- `category_id` (stable internal id)
- `name` (e.g., "OBP")
- `stat_key` (e.g., "OBP", "OPS", "AVG", "ERA")
- `type`: COUNTING | RATE | POINTS
- `direction`: HIGHER_BETTER | LOWER_BETTER
- `required_components`: list of strings (for RATE categories)
- `formula_id`: reference to a known formula implementation (e.g., "obp", "ops")

This makes ingestion validation generic: union all required components across categories and validate projections runs contain them.

### 5.2 Required hitter components for v1 (Depth Charts RoS) with OBP/OPS

When a league includes OBP and/or OPS, the batters CSV must provide at least:

- AB, H (AVG; also used by OBP denominator)
- BB, HBP, SF (OBP)
- TB (SLG for OPS)
- R, HR, RBI, SB (common counting categories)

If OBP/OPS exist in league settings and any required component is missing from the uploaded file:

- projections for those categories are marked unsupported for that run
- snapshots using that run are marked degraded:
  - `degraded_reasons += ["projections_missing_components:OBP,OPS"]`
- other categories still compute normally

### 5.3 Formulas (canonical)

Use components to combine current-to-date + RoS projections.

Hitters:

- AVG = H_total / AB_total
- OBP = (H + BB + HBP) / (AB + BB + HBP + SF)
- SLG = TB / AB
- OPS = OBP + SLG

Pitchers:

- ERA = 9 \* ER_total / IP_total
- WHIP = (H_total + BB_total) / IP_total

Where totals are:

- component_total = component_current + component_projected

---

## 6) Projections Upload Workflow (v1)

### 6.1 UX

**Projections → Upload Depth Charts RoS (Today)**

- Upload batters CSV
- Upload pitchers CSV
- Show validation per file:
  - parsed rows count
  - required columns present (league-aware)
  - player mapping coverage to ESPN
  - unmapped players with quick-match UI

### 6.2 Ingestion behavior

On successful uploads:

1. Create or update today’s `projections_run` (`as_of_date = today`, system=`depth_charts_ros`)
2. Parse CSV rows into `player_projection.stat_components_json`
3. Run identity resolution and store confidence per player
4. Mark run `fresh` once both batters + pitchers are present (or allow partial and mark `stale/partial` but v1 can require both before `fresh`)

---

## 7) Daily Snapshot Job (03:00 league timezone)

### 7.1 Orchestrator workflow (atomic)

1. Acquire per-league job lock.
2. Fetch ESPN:
   - settings, teams, rosters, standings/totals
3. Fetch ESPN activity feed for transactions:
   - window: since last successful snapshot (at least 24–48h) to catch late activity
4. Determine `settings_version_id`:
   - create new version if settings changed
5. Select `projections_run_id`:
   - prefer `as_of_date == snapshot_date`
   - else most recent prior; mark snapshot degraded `["projections_stale"]`
6. Begin DB transaction:
   - write raw payload archives
   - write `league_daily_snapshot`
   - write roster snapshot + current totals/ranks/overall
   - write transaction events (de-duped)
   - run standings projection and store projected standings tables
     - if missing components for league categories, degrade only those categories; store what’s computable
7. Commit, release lock, emit metrics.

### 7.2 Failure policy (no backfill)

- If any critical ESPN fetch fails: do not write snapshot; record a sync failure.
- Next day proceeds normally.

---

## 8) Analytics & Recommendations

### 8.1 Daily projected standings

Inputs:

- snapshot day’s current totals by team/category (with components for rate stats)
- snapshot day’s roster snapshot
- Depth Charts RoS projections run attached to that day

Outputs:

- team_daily_projected_category
- team_daily_projected_overall

### 8.2 Waiver suggestions

- Simulate add/drop and compute Δ projected overall points and Δ category ranks.
- Enforce roster legality (positions/slots) per ESPN settings.
- Explain: the categories moved and how many projected points gained/lost.

### 8.3 Trade advice

- Trade impact report for both teams (Δ totals/ranks/overall).
- Candidate trade generation (v1):
  - enumerate 1-for-1 and 2-for-2 in plausible target sets
  - score by user objective + fairness

### 8.4 Draft assistance

- Snake: scarcity + value + roster fit
- Auction: SGP-like values + inflation tracking
- Live draft ingestion when possible; fallback to manual entry mode.

---

## 9) API Endpoints (Backend)

### 9.1 Onboarding & league health

- POST `/api/leagues/connect`
- GET `/api/leagues/{leagueId}/status`

### 9.2 Graph time series (series + annotations)

- GET `/api/leagues/{leagueId}/timeseries/overall?from=YYYY-MM-DD&to=YYYY-MM-DD`
- GET `/api/leagues/{leagueId}/timeseries/category-rank?categoryId=...&from=...&to=...`
- GET `/api/leagues/{leagueId}/timeseries/category-total?categoryId=...&from=...&to=...`
- GET `/api/leagues/{leagueId}/timeseries/projected-overall?from=...&to=...`
- GET `/api/leagues/{leagueId}/timeseries/projected-category?categoryId=...&from=...&to=...`

Response:

- `series[]`: `{date, teamId, value, rank?, points?}`
- `annotations[]`: `{date, type, teamId, label, playerIds}`

### 9.3 Recommendations

- GET `/api/leagues/{leagueId}/teams/{teamId}/waivers/recommendations`
- POST `/api/leagues/{leagueId}/trades/impact`
- GET `/api/leagues/{leagueId}/trades/recommendations?teamId=...`
- GET `/api/leagues/{leagueId}/draft/recommendations?teamId=...`

---

## 10) Frontend UX (Mobile-first Web)

Key screens:

1. League Overview: current vs projected toggle + quick actions
2. Trends: overall/category/projected graphs + transaction overlays toggle
3. Team Detail: category sparklines, tap-to-expand charts
4. Waivers: ranked add/drop cards with Δ projected points
5. Trades: impact simulator + suggested trades
6. Draft Room Mode: recommendations + needs + auction tools (if applicable)
7. Projections Upload: today’s Depth Charts status + upload controls

---

## 11) Security & Privacy

- ESPN cookies treated as secrets:
  - encrypted at rest, never logged
  - user can rotate/delete
- Read-only integration (no ESPN writes)
- Audit logging for sync runs (without secrets)

---

## 12) Testing & Observability

Testing:

- ESPN adapter contract tests + fixtures
- CSV parsing validation tests (including OBP/OPS required components)
- Rate-stat math unit tests
- Daily snapshot atomicity tests

Observability:

- snapshot success/failure rate
- ESPN request error types
- schema drift alerts
- projection run freshness/staleness metrics
