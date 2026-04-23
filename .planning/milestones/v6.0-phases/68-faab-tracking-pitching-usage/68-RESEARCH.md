# Phase 68 Research: FAAB Tracking + Pitching Usage

## RESEARCH COMPLETE

## 1. FAAB Budget Data — Where It Lives

### ESPN API (Current State)
- **`acquisitionSettings`** in ESPN `mSettings` view contains `acquisitionBudgetRemaining` — **MEDIUM confidence** per state blockers, needs live verification
- **`bidAmount`** already parsed from ESPN transactions (`ESPNTransaction.bidAmount`) and stored in `raw_event_json` of `league_transaction_event`
- The snapshot orchestrator stores `bidAmount` in `raw_event_json` (line ~1336 of snapshot-orchestrator.ts)
- **No dedicated FAAB column** on `league_transaction_event` — bid amount is inside `raw_event_json` JSONB

### What Exists
- `league_transaction_event` table stores all waiver claims with `raw_event_json.bidAmount`
- `ESPNAdapter.fetchTransactions()` already extracts `bidAmount` from ESPN response
- `LeagueSettings.acquisition_rules` has `acquisition_limit` but **no FAAB budget field**

### What's Missing
- No `faab_budget_total` field in settings (need to extract from ESPN `acquisitionSettings.acquisitionBudget`)
- No `faab_remaining` per-team tracking (need ESPN's `team.transactionCounter` or computed from transactions)
- No dedicated FAAB columns in DB schema — everything is buried in JSONB

### Recommended Approach
1. **Read FAAB from ESPN API at snapshot time**: ESPN's team object likely has `transactionCounter.acquisitionBudgetSpent` or similar — extract during normalization
2. **Compute FAAB remaining** from total budget - sum of won bid amounts (from `league_transaction_event.raw_event_json.bidAmount`)
3. **Store on `team_daily_overall`** or a new `team_faab_snapshot` — prefer extending `team_daily_overall` with `faab_remaining` column
4. **Fallback**: If ESPN field is unreliable, sum all won bids from `league_transaction_event` and subtract from league budget (default $100)

## 2. GS (Games Started) Tracking

### ESPN API
- ESPN tracks GS limits in `league.settings.rosterSettings` — look for `lineupSlotLimit` or `matchupPeriodSettings`
- Per-team GS used is in `team.valuesByStat` under stat ID 31 (GS) or computed from box scores
- **GS cap** is typically set in league settings (default: 200 for standard ESPN roto leagues, but configurable)

### What Exists
- `StreamingPitcherAgent` already handles pitcher recommendations with multi-start detection
- `team_daily_category_totals` stores current season totals per category per team per day
- `StandingsProjectionAgent` projects final totals including IP — GS is a counting stat
- **GS is NOT in the current category list** — ESPN roto typically uses IP, not GS directly
- Need to check if GS is tracked as a hidden stat or needs separate extraction

### What's Missing
- No explicit GS tracking (used/remaining/cap)
- No `gs_cap` field in `league_settings_version`
- No weekly GS breakdown (which pitchers started which days)
- `team_roster_snapshot` has no start/sit decision history

### Recommended Approach
1. **GS cap from settings**: Extract from ESPN `rosterSettings.starterLimits` or league settings JSONB — add to `league_settings_version.settings_json`
2. **GS used**: Count from `team_roster_snapshot` entries where player has `roster_status = 'active'` and position is SP/pitcher slot, OR extract from ESPN `team.record` stats
3. **Weekly view**: Cross-reference `team_roster_snapshot` dates with MLB schedule to determine which SPs actually started
4. **SP start planner**: Extend `StreamingPitcherAgent` with GS pacing logic — given GS used, GS cap, weeks remaining, recommend starts per week

## 3. Frontend Architecture

### Existing Pages
- `/leagues/[id]/moves/page.tsx` — exists but likely minimal (FAAB Market nav label points here)
- `/leagues/[id]/streaming/page.tsx` — exists with streaming pitcher UI
- Shell components: `LeagueNav.tsx` already has "FAAB Market" (→ `/moves`) and "Pitching Usage" icons
- `TopBar.tsx` has stub: `<StatItem label="FAAB" value="--" />` (SHELL-03 stub, currently unwired)

### Dark Mode Tokens (from Phase 65)
- Background: `dark:bg-shell-bg` (#0B0D10)
- Panels: `dark:bg-shell-panel` (#111318)
- Borders: `dark:border-shell-border` (#1D2128)
- Typography: Inter for text, JetBrains Mono (`font-mono`) for numbers

### UI Components Needed
1. **FAAB Page** (`/moves` or new `/faab`): Budget gauge, spend-rate chart, bid history table, suggested bids
2. **Pitching Usage Page** (`/streaming` or new `/pitching`): Season GS tracker, weekly breakdown, SP start planner
3. **TopBar wire-up**: Connect FAAB remaining and GS pace to TopBar stats

## 4. API Endpoints Needed

### FAAB Endpoints
- `GET /api/leagues/:id/teams/:teamId/faab` — FAAB summary (remaining, spent, league avg, spend rate)
- `GET /api/leagues/:id/teams/:teamId/faab/history` — Bid history with won/lost outcomes
- `GET /api/leagues/:id/teams/:teamId/faab/suggested-bid/:playerId` — Suggested bid for a player

### Pitching Usage Endpoints
- `GET /api/leagues/:id/teams/:teamId/pitching/gs` — Season GS summary (used, cap, pace, projected)
- `GET /api/leagues/:id/teams/:teamId/pitching/gs/weekly` — Weekly GS breakdown
- `GET /api/leagues/:id/teams/:teamId/pitching/start-plan` — SP start/sit recommendations for the week

## 5. Data Gaps & Risks

| Gap | Impact | Mitigation |
|-----|--------|------------|
| FAAB budget field not in ESPN adapter | Can't show remaining balance | Compute from total budget - sum(won bids) |
| `acquisitionBudgetRemaining` field name unverified | May use wrong field | Try multiple ESPN field names, log misses |
| GS cap not in settings JSONB | Can't compute GS pace | Default to 200, allow manual override |
| No weekly lineup history | Can't show "which SPs started this week" | Use `team_roster_snapshot` active pitchers × MLB schedule |
| bid won/lost status not stored | Can't show claim outcomes | ESPN transaction `status` field has EXECUTED/FAILED — extract |
| Free agent FAAB bids from other teams not visible | Can't show league FAAB spending | Only track own team's bids from visible transactions |

## 6. Dependency Analysis

- **Phase 65 (shell)**: Complete — dark mode tokens, nav, TopBar stubs all ready
- **Phase 66 (roto math)**: Not required — FAAB/GS are independent of roto point calculations
- **Phase 67 (waiver)**: Not required — FAAB tracking is separate from waiver recommendation delta
- **Standalone**: Phase 68 has no upstream dependency beyond the shell

## 7. Plan Structure Recommendation

**Plan 68-01: Backend — FAAB tracking + GS pacing engine**
- Extract FAAB budget from ESPN settings, compute remaining from transactions
- Add FAAB API endpoints (summary, history, suggested bid)
- Extract GS cap from settings, compute GS pace
- Add GS API endpoints (summary, weekly, start plan)
- Wire TopBar data into league status endpoint

**Plan 68-02: Frontend — FAAB Market + Pitching Usage pages**
- Build FAAB Market page with budget gauge, spend-rate projection, bid history, ROI
- Build Pitching Usage page with GS tracker, weekly view, SP start planner
- Wire TopBar FAAB and GS pace values from API
