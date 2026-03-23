# Pitfalls Research

**Domain:** In-season roto command center added to existing fantasy baseball app
**Researched:** 2026-03-23
**Confidence:** HIGH — all pitfalls derived from first-party codebase inspection (`standings-projection.ts`, `waiver-recommendation.ts`, `trade-recommendation.ts`, `formulas.ts`, `espn.ts`), not external search. Specific line numbers and code paths cited throughout.

---

## Critical Context

This document covers pitfalls specific to **adding these features to an existing system**:

1. Roto point interpolation / marginal gain calculations
2. Waiver roto delta (add/drop component math)
3. Trade finder combinatorial explosion
4. FAAB pacing display
5. GS pacing display
6. Dark mode migration
7. Performance on computed-heavy dashboards

**Existing system facts that shape every pitfall:**

- `StandingsProjectionAgent` computes projected final totals via component math. Rate stats use `calculateFinalRate()` from `packages/shared/src/formulas.ts`, which combines `currentComponents + projectedComponents` before dividing. This is correct.
- `WaiverRecommendationAgent.simulateSwap()` recalculates rate stats by subtracting the dropped player's components from the team's aggregated `projected_components_json`, then adding the acquired player's. This path is correct in structure but has a known fragility detailed below.
- `TradeRecommendationAgent.generateCandidates()` caps total simulations at 500 and limits pairs per partner team to 20. Already has O(N²) pruning, but the pruning relies on a pre-computed value score that can be wrong.
- ESPN adapter has no FAAB budget field — `acquisitionSettings` contains `waiverType` and `acquisitionLimit` only. FAAB remaining balance is not returned by the league endpoint.
- No GS tracking table exists in the schema.
- Frontend uses Tailwind CSS but has zero `dark:` utility classes anywhere in `packages/frontend/src/`.
- `league_daily_snapshot.is_degraded` + `degraded_reasons` is the staleness signal. Roto interpolation accuracy depends on it being trustworthy.

---

## Critical Pitfalls

### Pitfall 1: Roto Interpolation Silently Uses Stale Projections for Some Teams

**What goes wrong:**
The command center displays a team's projected roto points (e.g., "7.3 in ERA"). That number depends on where the team ranks among all 13 teams, not just its own projected ERA. If even one team's projection is stale (e.g., they haven't had a snapshot since FanGraphs projections were updated), that team's position in the ranking is wrong, which shifts every other team's rank by one point. The displayed "7.3" becomes "6.3" or "8.3" silently.

**Why it happens:**
`StandingsProjectionAgent.rankAndStore()` uses `Promise.all(teams.map(...computeTeamProjection))` — it computes all 13 teams from the same `projectionsRunId`. But the `projections_run_id` stored in `league_daily_snapshot` points to the last uploaded FanGraphs CSV, not a per-team freshness timestamp. If the snapshot was taken before the most recent projection upload, `is_degraded = false` but the projections being used are from the prior run.

More specifically: `league_daily_snapshot.projections_run_id` is set by `SnapshotOrchestratorAgent` at snapshot time. If projections were uploaded after the last snapshot, the snapshot's `projections_run_id` is stale until the next snapshot runs.

**How to avoid:**
1. On the command center page, display the projection run's `created_at` timestamp prominently. If it's more than 24 hours old, show a warning banner.
2. Do not re-use `team_daily_projected_category` rows from a stale snapshot date without re-running projections. The UI should always trigger a fresh snapshot before displaying interpolated roto points.
3. When building the marginal gain UI, always fetch the most recent `projections_run` row and compare its `created_at` against `league_daily_snapshot.snapshot_date`. Flag as degraded if they diverge by more than one day.

**Warning signs:**
- A team's projected roto points jump by a full point between page refreshes without any roster change.
- `league_daily_snapshot.is_degraded = false` but `projections_run.created_at` is days older than `snapshot_date`.
- Marginal gain calculations show implausibly large gains (e.g., +3 points) for a player with modest projections.

**Phase to address:** Roto command center MVP phase — add projection freshness indicator to the dashboard before any marginal gain feature ships. Treat stale projections as a UX blocker, not a nice-to-have.

---

### Pitfall 2: Waiver Roto Delta Is Wrong When Add and Drop Players Are Different Types (Pitcher vs Hitter)

**What goes wrong:**
`simulateSwap()` in `WaiverRecommendationAgent` correctly separates pitching and batting categories via `isPitchingCat` and `categoryMatchesAdd/categoryMatchesDrop`. However, the rate stat recalculation path (lines 438–482) subtracts the drop player's components from `projected_components_json` even when the drop player is a hitter and the category is a pitching rate stat (ERA, WHIP). The `withoutDrop` object will subtract zero for pitching components (because `dropComponents.IP` is `undefined`, resolving to `0`), which is harmless. But the reverse case — dropping a pitcher, adding a hitter — can silently produce a negative WHIP denominator if the team's `projected_components_json` has minimal IP remaining and the drop reduces it below a threshold.

The deeper issue: `projected_components_json` stored in `team_daily_projected_category` is the sum of all pitchers' RoS projections combined with the current-season actuals. Dropping a pitcher removes IP from the denominator. If the remaining IP is very small (end of season, or team has few pitchers left), `(HA + BBA) / IP` with a tiny IP produces an extreme WHIP value, which flips the team's projected WHIP rank by 5+ positions.

**Why it happens:**
The guard `if (!categoryMatchesAdd && !categoryMatchesDrop) continue` only skips categories where neither player contributes. When dropping a pitcher for a hitter (or vice versa), one leg of the swap matches and the other doesn't — the code enters the rate stat branch with asymmetric component changes.

**How to avoid:**
1. In `simulateSwap()`, before subtracting drop components from `withoutDrop`, verify the denominator won't go below a safe floor. For ERA/WHIP, `withoutDrop.IP` must be > 0 before computing the new rate. If `IP <= 0` after removal, mark that category as `degraded` and return the current value unchanged.
2. Add a test: "drop only pitcher from a team with 2 pitchers, ensure WHIP doesn't become Infinity."
3. The same guard applies to `calculateFinalRate(category.formula_id, {}, withAdd)` on line 465 — it passes an empty `{}` as `currentComponents` and uses `withAdd` as both. This is calling `combineComponents({}, withAdd)` internally, which is correct, but if `withAdd.IP` rounds to 0 due to floating point, ERA becomes NaN.

**Warning signs:**
- Waiver recommendations show a drop pitcher producing `+12 ERA points` — an implausible number.
- `deltaOverallPoints` for a pitcher swap exceeds `numTeams` (13), which is mathematically impossible in 10-category roto.
- `explanation` string contains `NaN` or `Infinity` for ERA/WHIP categories.

**Phase to address:** Waiver roto delta phase — write a unit test for `simulateSwap()` that covers the cross-type add/drop case before shipping the feature. Add denominator floor guards to rate stat recalculation.

---

### Pitfall 3: Marginal Gain Is Meaningless Without Accounting for Category Ceilings and Floors

**What goes wrong:**
The marginal gain calculation tells a user "adding Player X gains you +0.8 roto points in HR." But if your team is already ranked 1st in HR and Player X contributes 5 more HRs, you're still ranked 1st — the gain is 0, not +0.8. The simulation correctly re-ranks, so in theory this is handled. However, the gain is also misleading near the bottom: if you're ranked 13th and Player X moves you to 12th, that's +1 point, but what actually matters is how many more HR it takes to move to 11th (diminishing returns at category extremes).

The existing `simulateSwap()` does re-rank (lines 486–508) and produces the correct `deltaPoints` for a single add/drop. But the command center's "marginal gain per player" UI, if built naively as a sorted list, will surface many false positives at category extremes where the gain is real but the category was already won or already lost.

**Why it happens:**
Roto is a relative ranking system. Any marginal gain view that shows absolute projected contribution without re-ranking is wrong. Even with re-ranking, the display needs to communicate "you already own this category" vs. "this is a contested category."

**How to avoid:**
1. When building the marginal gain display, always show the team's current projected rank in each category alongside the gain estimate.
2. Mark categories where the team is already ranked 1st (impossible to gain) or ranked 13th with a large deficit (unlikely to gain meaningfully) with a visual indicator.
3. The re-ranking logic in `simulateSwap()` is correct — don't rewrite it. The pitfall is in the display layer, not the engine.

**Warning signs:**
- The top waiver recommendation shows a player that improves HR but the team is already 1st in HR.
- Negative `deltaPoints` recommendations appear in the results (they are filtered out by `delta.deltaOverallPoints > 0`, but this can mask cases where a player helps in one category but hurts another).

**Phase to address:** Command center marginal gain display — include projected rank per category in the API response from the waiver evaluation endpoint. The data is already computed in `categoryImpacts`.

---

### Pitfall 4: FAAB Budget Is Not Exposed by the ESPN League Endpoint — Deriving It from Transactions Is Fragile

**What goes wrong:**
The ESPN adapter parses `acquisitionSettings.waiverProcessDays` and `acquisitionLimit` from the league settings (line 1185 in `espn.ts`). It does not parse per-team FAAB remaining balance because the ESPN league endpoint does not include it in the standard `mTeam` view. FAAB balances live in `teamAcquisitionBudgetRemaining` inside the `mRoster` or `mTeamId` view, which requires a separate per-team fetch.

If FAAB pacing is built by deriving remaining budget from transaction history (total budget minus sum of waiver bids), it will silently produce wrong numbers when:
- The initial FAAB budget was non-standard (ESPN allows custom starting budgets)
- A transaction was voided or a FAAB bid failed (overbid on 0-waiver week)
- A mid-season FAAB adjustment was made by the commissioner

**Why it happens:**
The standard `/apis/v3/games/flb/seasons/{year}/segments/0/leagues/{id}?view=mTeam` response does not include FAAB. Developers assume it's in the team object because it's displayed in ESPN's UI.

**How to avoid:**
1. Fetch FAAB from the `mRoster` view: `?view=mRoster&scoringPeriodId={current}`. This view includes `acquisitionBudgetRemaining` per team.
2. Alternatively, fetch `mTeamId` with `?view=mTeamId` which sometimes includes budget fields depending on league configuration.
3. Cache FAAB balance per team in a new lightweight table or in the existing `team` table via a new column. Do not derive it from transactions.
4. If the ESPN endpoint doesn't return FAAB (some league types don't use it), detect this by checking `acquisition_rules.waiver_type` in `league_settings_version.settings_json`. If `waiver_type` is not FAAB, disable the FAAB pacing UI entirely.

**Warning signs:**
- FAAB balance for a team shows as `undefined` or `null` in the snapshot.
- Derived balance from transactions doesn't match what ESPN's UI shows for a team.
- FAAB pacing shows negative remaining balance (a sure sign of untracked voided transactions).

**Phase to address:** FAAB pacing phase — verify the correct ESPN API view before writing any FAAB storage logic. Do not store in the transactions table; store in team snapshot or a dedicated balance table.

---

### Pitfall 5: GS Pacing Requires Tracking Actual Starts, Which Are Not in the Current Schema

**What goes wrong:**
There is no `games_started` column in any current table. The `team_daily_category_totals` table stores aggregate stat values (like IP, W, K) but not the count of times a pitcher was activated and started. GS pacing requires knowing how many starts a pitcher has made this week/month and how that compares to the league-wide GS cap (if one exists).

More specifically: ESPN fantasy leagues often have a "SP starts per week" or "maximum IP" cap. These caps are in `acquisition_rules` but the current schema only stores `waiver_type` and `acquisition_limit`. A GS pacing feature built against the existing schema has no foundation.

**Why it happens:**
GS is a roster management concept, not a counting stat in the category totals. It requires per-player-per-day slot assignment data (`team_roster_snapshot.slot` field), not aggregate totals.

**How to avoid:**
1. Derive current week GS from `team_roster_snapshot`: if a pitcher is slotted as "SP" on a given day, count it as a start. This requires the slot data to be populated correctly by `SnapshotOrchestratorAgent`.
2. Check that `team_roster_snapshot.slot` is actually being populated with the ESPN `lineupSlotId` — it is populated in `ESPNRosterEntry.rosterSlot` (line 77 in `espn.ts`) and stored in the orchestrator. Verify the slot string is "SP" for actual starts vs "BN" for benched pitchers.
3. Store weekly GS count in `team_daily_overall` or as a new column, computed at snapshot time. Do not compute it on-demand by scanning `team_roster_snapshot` across 7 rows per pitcher — that query pattern is O(pitchers × days) and will be slow.
4. Add `sp_starts_this_week` and `sp_starts_cap` to the league settings snapshot if ESPN exposes a weekly SP limit for the league.

**Warning signs:**
- GS pacing shows "0 starts" even during a week where pitchers were active.
- GS count exceeds the ESPN-imposed cap (means slot data is counting bench appearances or RP slots as starts).
- GS pacing differs between two users viewing the same team (means it's being computed dynamically with different date windows).

**Phase to address:** GS pacing phase — add a migration to compute and store weekly GS counts before building any pacing UI. Do not defer schema work to a later phase.

---

### Pitfall 6: Dark Mode Migration Will Break Existing Components If Tailwind's Dark Strategy Is Not Set First

**What goes wrong:**
The frontend uses Tailwind CSS with zero existing `dark:` utility classes. Adding dark mode requires choosing a dark strategy (`class` or `media`) in `tailwind.config.js`. If you choose `class` strategy (required for user-toggled dark mode), every component that uses hardcoded colors like `bg-white`, `text-gray-900`, `border-gray-200` will remain white in dark mode because those classes have no dark variant applied.

A naive migration approach — "add `dark:` variants to each component as I encounter it" — leads to a half-dark UI where some components invert and others don't. The result looks broken on every page. Since the existing codebase has 0 dark variants, there is no incremental path: the migration requires a full audit of all color utilities.

**Why it happens:**
Tailwind dark mode is opt-in per class. There is no global "invert all colors" toggle. Developers assume switching `darkMode: 'class'` in config is sufficient — it is not. Every existing color utility needs a paired `dark:` variant.

**How to avoid:**
1. Before writing any `dark:` classes, inventory all unique color utilities in use across `packages/frontend/src/`. Run `grep -rh "bg-\|text-\|border-\|ring-\|shadow-" --include="*.tsx" src/ | sort -u` to get the full list.
2. Create a design token file or Tailwind CSS variables layer that maps semantic names (`--color-surface`, `--color-text`) to light/dark values. Apply semantic classes consistently rather than patching raw Tailwind utilities.
3. Alternatively, use a CSS variable approach: define `:root` and `.dark` blocks in `globals.css`, then reference `bg-[var(--color-surface)]` in components. This requires a single migration pass, not a per-class audit.
4. Do not mix the `media` strategy with the `class` strategy. Pick `class` if user control is desired.

**Warning signs:**
- Setting `darkMode: 'class'` in Tailwind config but seeing no dark mode effect — means no `dark:` classes are applied anywhere yet.
- Some cards invert but navigation stays white — means partial coverage.
- Text becomes invisible (white text on white background, or dark text on dark background) — means color utilities were added without both foreground and background dark variants.

**Phase to address:** Dark mode phase — this phase should begin with a full color utility audit and design token definition before touching any component. Treat it as infrastructure, not styling. Do not ship partial dark mode.

---

### Pitfall 7: Trade Finder Combinatorial Explosion Is Already Capped — Breaking the Cap Quietly Reintroduces It

**What goes wrong:**
`TradeRecommendationAgent.generateCandidates()` already has two guards against O(N²) explosion:
- `maxSimulations = 500` caps total `analyzeTradeImpact` calls
- `topPairsForTeam = tradePairs.slice(0, 20)` caps pairs per partner team

The pruning relies on `getPlayerValue()` to pre-sort pairs by value delta before applying the cap. `getPlayerValue()` uses pre-fetched projection values. If player projections are missing for some players (common when `player_identity_map` hasn't been run), `getPlayerValue()` returns 0 for those players. Pairs with value 0 are filtered out by the `valueDelta > 0 || positionalContext.fillsNeed` guard. This means injured or projection-missing players are silently excluded from all trade analysis — which is the desired behavior — but if `fillsNeed` is incorrectly true for those players, they leak through the filter and consume simulation budget.

The real risk: extending the trade finder to 2-for-2 trades multiplies the pair count by O(roster²) per team, blowing past `maxSimulations = 500` almost immediately for any roster > 15 players. A 15-player roster against 12 partners with 2-for-2 trades is 15² × 12 = 2,700 pairs before any `analyzeTradeImpact` calls, each of which queries the database.

**Why it happens:**
The 500-simulation cap was calibrated for 1-for-1 trades only. It is not labeled as such in the code, making it easy for a future developer to add 2-for-2 support without re-evaluating the cap.

**How to avoid:**
1. Label `maxSimulations = 500` with a comment: "Calibrated for 1-for-1 only. For 2-for-2 reduce to 100 or add separate cap."
2. If 2-for-2 is added, pre-filter pairs more aggressively: only generate 2-player combinations where both players are in the top 50% of value for their type (hitter/pitcher).
3. Add an API timeout (Fastify request timeout) for the trade recommendations endpoint as a safety net. A runaway trade scan should not block the server.
4. Cache trade recommendations per (leagueId, teamId, snapshotDate) with a 1-hour TTL. Re-generating all candidates on every page load will make the endpoint unusable at scale.

**Warning signs:**
- Trade recommendations endpoint takes > 10 seconds to respond.
- `simulationsRun` in logs hits 500 early in the scan (means the pre-filter isn't pruning enough).
- Server memory spikes during trade recommendation generation (means all pairs are being materialized before sorting).

**Phase to address:** Trade finder phase — add endpoint-level caching and a labeled simulation cap before adding 2-for-2 support. Do not allow scope creep on trade complexity without re-evaluating the cap.

---

### Pitfall 8: The `projected_components_json` Column Is the Single Source of Truth for Rate Stat Simulation — Corrupting It Breaks All Downstream Features

**What goes wrong:**
`team_daily_projected_category.projected_components_json` stores the combined components (current-season actuals + RoS projections) for each team/category. Both `WaiverRecommendationAgent` and `TradeRecommendationAgent` read this column to simulate swaps. If it is populated incorrectly — for example, if `combineComponents()` double-counts a player who appeared in both the current snapshot and the projections run — all rate stat simulations will be wrong.

The double-count risk is real: `StandingsProjectionAgent.computeTeamProjection()` adds `currentComponents` (from `team_daily_category_totals`) to `projectedComponents` (summed from `player_projection`). If `team_daily_category_totals` already includes some RoS projected stats (which it shouldn't, but could happen if data was incorrectly ingested), the ERA denominator (IP) would be inflated.

**Why it happens:**
The data lineage is: ESPN actuals → `team_daily_category_totals` → combined with → `player_projection` (FanGraphs RoS). If the ESPN adapter ever stores projected stats in the actuals table (a future bug, not a current one), the combination step silently inflates components. There is no assertion that verifies `team_daily_category_totals` contains only season-to-date actuals.

**How to avoid:**
1. Add a schema-level or application-level guard: when writing to `team_daily_category_totals`, assert that the source is ESPN actuals (marked as `view=mTeam` or similar). Never write FanGraphs projection data into this table.
2. When debugging WHIP or ERA anomalies, always check `projected_components_json` directly in the database before assuming the simulation logic is wrong.
3. Add a data integrity check to the snapshot orchestrator: `projected_components_json.IP` for any pitcher-heavy team should not exceed `~240 * numPitchers` (a rough season max). Values above this indicate double-counting.

**Warning signs:**
- Projected ERA for a team is significantly lower than ESPN's actual displayed ERA for the same team.
- `projected_components_json.IP` for a team is more than double the expected innings for their pitching staff.
- Swapping a single relief pitcher produces a `deltaOverallPoints` larger than 2.

**Phase to address:** Every phase that writes to or reads from `team_daily_projected_category`. Add the integrity check to the snapshot orchestrator in the earliest phase that touches this table.

---

### Pitfall 9: Dashboard Performance Degrades Under Multiple Concurrent Computed Views

**What goes wrong:**
The command center dashboard will likely display: current standings, projected standings, marginal gain table, category breakdown, FAAB pacing, GS pacing — all on one page. Each of these requires querying multiple tables joined across `league_daily_snapshot`, `team_daily_projected_category`, `team_daily_projected_overall`, and `player_projection`. Without caching, a single page load triggers 6–10 separate database queries, some of which join large tables.

The specific risk: `team_daily_projected_category` has 13 teams × 10 categories = 130 rows per snapshot. That's manageable. But `player_projection` can have thousands of rows, and the waiver free agent scan queries it with `IN (playerIds)` for every simulation. If the dashboard renders a live "top 10 pickups" widget, it would trigger a full waiver simulation on page load — which is the `O(freeAgents × rosterPlayers)` loop from `WaiverRecommendationAgent`.

**Why it happens:**
Individual endpoints were designed for on-demand queries (snapshot → analyze → display). A dashboard that aggregates all views in parallel is a different access pattern. The existing BullMQ snapshot worker runs snapshots asynchronously, but recommendation generation is synchronous on the request path.

**How to avoid:**
1. Pre-compute top waiver recommendations at snapshot time and store them in a `team_waiver_recommendations` table (or an `agent_action` row). The dashboard reads the pre-computed result, it does not trigger live simulation.
2. Use `TanStack Query`'s `staleTime` on the frontend to avoid re-fetching recommendation data on every focus event. Set `staleTime: 15 * 60 * 1000` (15 minutes) for recommendation endpoints.
3. Add a `GET /api/leagues/:id/dashboard` endpoint that returns all command center data in one query rather than requiring 6 separate fetches.
4. Index `team_daily_projected_category(league_id, snapshot_date)` if not already present. This query runs on every dashboard load.

**Warning signs:**
- Dashboard takes > 3 seconds to load on first visit.
- `waiver/recommendations` endpoint is called on page load without user interaction.
- Multiple requests for the same `snapshotDate` data fire simultaneously (TanStack Query deduplicated requests haven't kicked in).

**Phase to address:** Dashboard phase — design the endpoint response shape before building the UI. Pre-compute recommendations at snapshot time rather than on-demand.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Displaying projected roto points without a staleness timestamp | Simpler UI | Users make decisions based on stale projections; trust erodes when numbers jump unexpectedly | Never for production |
| Deriving FAAB balance from transactions instead of ESPN API | No new ESPN call | Wrong balance when transactions are voided or budget is adjusted mid-season | Never — use the correct API view |
| Computing waiver recommendations on-demand per page load | No pre-computation pipeline | Command center page becomes unusably slow; recommendation endpoint ties up request thread | Only acceptable for POC/demo; must be pre-computed before shipping |
| Adding `dark:` classes to individual components without a design token layer | Quick wins visible immediately | Half-dark UI ships; future components require knowing which dark colors to pair; 50+ files need updating | Only if committing to finishing all components in the same phase |
| Extending trade finder to 2-for-2 without adjusting `maxSimulations` cap | Richer trade analysis | Endpoint hangs; server OOM under load with many concurrent requests | Never without adjusting the cap and adding caching |
| Reading `projected_components_json` directly in simulation without validating denominator | Simpler code path | Rate stat simulation returns Infinity or NaN, corrupting rank display | Never — add denominator floor guard |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| ESPN API — FAAB balance | Reading FAAB from `mTeam` view or deriving from transactions | Fetch `?view=mRoster` which includes `acquisitionBudgetRemaining` per team |
| ESPN API — GS tracking | Reading starts from `mTeam` aggregate stats | Read `lineupSlotId` from `mRoster` per day; only count SP slot activations |
| `projected_components_json` — rate stat delta | Subtracting player components without checking denominator floor | Guard `IP > 0` for ERA/WHIP, `AB > 0` for AVG/OBP/SLG before computing new rate |
| `StandingsProjectionAgent` — projections run freshness | Using the most recent `projections_run_id` stored in snapshot | Always check `projections_run.created_at` vs current date; re-run projections if stale |
| Tailwind dark mode — config strategy | Setting `darkMode: 'class'` without applying `dark:` variants to any component | Audit all color utilities first; build a design token layer before touching components |
| TanStack Query — recommendation endpoints | Calling recommendation endpoints in `useQuery` without stale time | Set `staleTime` for expensive endpoints; never allow refetch on window focus for simulation endpoints |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| On-demand waiver simulation per page load | Dashboard takes 5–30s to load; backend CPU spikes on every page visit | Pre-compute at snapshot time; store results; serve cached data | With a free agent pool of 50+ players and a 25-player roster |
| `team_daily_projected_category` full scan per simulation | Simulation queries 130+ rows per `allTeamsProjections` fetch; called once per add/drop pair | Batch-load once per `simulateSwap` invocation (already done); cache across the recommendation loop | Not currently a problem; becomes one if the category row count grows |
| Trade candidate 2-for-2 combinatorial explosion | Trade recommendations endpoint times out; request queue backs up | Keep 1-for-1 only or halve `maxSimulations`; add endpoint cache | At roster sizes > 20 players with 2-for-2 enabled |
| Multiple React Query refetches on focus | Every tab switch triggers a fresh snapshot fetch | Set `staleTime: 300000` on heavy endpoints | In development (tab switching frequent); less visible in production |
| Rate stat NaN propagating to rank computation | `projected_roto_points` becomes NaN for a team; rank is undefined; sort produces NaN-first order | Add `isFinite()` guards before inserting `projected_value` into DB | When a team's IP projection rounds to 0 (end of season) |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Exposing raw `projected_components_json` JSONB in API responses | Leaks full component breakdown (H, AB, BB, etc.) for all teams to any authenticated user | Keep component data server-side; expose only computed rate values and ranks in API responses |
| Caching recommendation results without per-user scoping | User A sees User B's recommendations if cache key only uses leagueId + snapshotDate | Include `teamId` in all cache keys for recommendation endpoints |
| ESPN auth cookies logged during FAAB endpoint debugging | Cookie values appear in structured logs; Pino transports ship to external logging services | `CLAUDE.md` documents "Never log secrets (ESPN cookies, auth headers)"; review any new ESPN fetch calls for this |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing marginal gain numbers without category context | User adds a pitcher that "gains 0.8 ERA points" but they were already ranked 1st in ERA | Show current rank in category alongside gain estimate; flag already-won categories |
| Roto interpolation displayed without projection date | User trusts the numbers; projections are 10 days stale; standings estimates are wrong | Display "Projections as of [date]" badge prominently; make it link to the projections upload page |
| Dark mode toggle that only affects some pages | User switches to dark mode; some pages are dark, others remain white | Do not expose the toggle until all pages have dark variants applied |
| FAAB pacing showing "N/A" without explanation | User doesn't know if their league uses FAAB or if there's a data fetch error | Explicitly check `acquisition_rules.waiver_type`; show "Your league uses waivers (no FAAB)" if applicable |
| GS pacing reset mid-week without notification | User thinks they have starts remaining but ESPN processed a mid-week reset | Indicate the scoring period end date alongside the GS count |

---

## "Looks Done But Isn't" Checklist

- [ ] **Roto interpolation:** Projected roto points are only trustworthy if the underlying projections run is fresh. Verify `projections_run.created_at` is displayed and used to gate the feature before shipping.
- [ ] **Waiver roto delta:** `simulateSwap()` produces correct results for hitter-for-pitcher swaps specifically. Write a test: drop a pitcher (has IP), add a hitter (no IP) — ERA/WHIP category impact should be calculated, not skipped.
- [ ] **FAAB pacing:** Remaining balance comes from the ESPN `mRoster` view, not derived from transactions. Verify by comparing with ESPN app for a known team.
- [ ] **GS pacing:** Weekly start count is derived from `team_roster_snapshot.slot = 'SP'`, not from `team_daily_category_totals.W` or similar. Verify a benched SP does not count as a start.
- [ ] **Trade finder scale:** `maxSimulations = 500` cap is documented as 1-for-1 calibrated. Any 2-for-2 scope is blocked behind a feature flag or has a separate reduced cap.
- [ ] **Dark mode coverage:** Before exposing the dark mode toggle, verify `grep -r "dark:" packages/frontend/src/ | wc -l` is non-zero and covers at minimum: navigation, all card components, tables, and form inputs.
- [ ] **Dashboard performance:** The command center page does not call the waiver simulation endpoint on load. Recommendations are pre-computed and served from storage.
- [ ] **Rate stat denominators:** Any new rate stat simulation path guards against `IP <= 0`, `AB <= 0`, etc. before computing the final rate. NaN must not reach the database.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Stale projections displayed as current | LOW | Add staleness timestamp to UI; re-trigger snapshot + projection recompute; no data loss |
| Waiver delta NaN/Infinity in production | LOW | Add denominator floor guard to `simulateSwap()`; re-run recommendations for affected date |
| FAAB balance wrong from transaction derivation | MEDIUM | Refetch from ESPN `mRoster` view; update `team` table; backfill from ESPN if historical data needed |
| Dark mode shipped half-complete | MEDIUM | Revert toggle visibility; complete remaining components; re-expose |
| Trade finder endpoint timeout in production | MEDIUM | Add `maxSimulations` early exit and a 10-second Fastify timeout; add Redis cache for results |
| `projected_components_json` double-counting discovered | HIGH | Identify which snapshot dates are affected; re-run `StandingsProjectionAgent` for those dates; verify source data lineage |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Stale projections silently used for roto interpolation | Roto command center MVP | Dashboard shows projection freshness timestamp; staleness warning fires when `projections_run.created_at` > 24h ago |
| Waiver rate stat delta wrong for cross-type swaps | Waiver roto delta phase | Unit test: `simulateSwap(drop=SP, add=OF)` produces a finite, bounded ERA impact |
| Marginal gain misleading at category extremes | Roto command center MVP | UI shows current projected rank alongside each category gain |
| FAAB balance from wrong ESPN view | FAAB pacing phase | Balance matches ESPN app for a verified test team; no derivation from transaction table |
| GS pacing lacks schema support | GS pacing phase | `sp_starts_this_week` is stored in snapshot at write time; not computed on read |
| Dark mode half-migration shipped | Dark mode phase | All color utility classes have `dark:` variants before toggle is exposed to users |
| Trade finder cap not labeled for 1-for-1 | Trade finder phase | Code comment on `maxSimulations` explicitly states 1-for-1 calibration; 2-for-2 behind feature flag |
| `projected_components_json` corruption | Every phase writing to `team_daily_projected_category` | Integrity assertion in snapshot orchestrator catches IP > seasonal max |
| Dashboard on-demand simulation | Dashboard performance phase | Recommendations served from pre-computed storage; no simulation on page load |

---

## Sources

- `packages/backend/src/agents/standings-projection.ts` — `computeTeamProjection()`, `rankAndStore()`, rate stat combination logic. Confidence: HIGH (first-party).
- `packages/backend/src/agents/waiver-recommendation.ts` — `simulateSwap()` rate stat recalculation, denominator handling, cross-type player guard. Confidence: HIGH (first-party).
- `packages/backend/src/agents/trade-recommendation.ts` — `generateCandidates()`, `maxSimulations = 500`, `topPairsForTeam.slice(0, 20)` pruning, `getPlayerValue()` zero-fallback. Confidence: HIGH (first-party).
- `packages/backend/src/adapters/espn.ts` — `acquisitionSettings` normalization (lines 1184–1186); no FAAB balance field present. Confidence: HIGH (first-party).
- `packages/backend/src/db/schema.ts` — Absence of any `games_started`, `faab_remaining`, or weekly GS tracking columns. Confidence: HIGH (first-party).
- `packages/shared/src/formulas.ts` — `calculateWHIP()` fallback (`HA ?? H`), `calculateFinalRate()` dispatch, `combineComponents()` additive behavior. Confidence: HIGH (first-party).
- `packages/shared/src/types.ts` — `LeagueSettings.acquisition_rules` shape; `waiver_type` and `acquisition_limit` only, no `faab_balance`. Confidence: HIGH (first-party).
- `CLAUDE.md` — Known issues list: "TradeRecommendationAgent doesn't handle rate stat adjustments (counting stats only)" — partially outdated, rate stats are now handled but with the denominator fragility noted above. Confidence: HIGH (first-party; cross-referenced against current agent code).

---
*Pitfalls research for: in-season roto command center addition to ESPN fantasy baseball app*
*Researched: 2026-03-23*
