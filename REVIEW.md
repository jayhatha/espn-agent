---
phase: fantasy-baseball-domain-review-reassessment
reviewed: 2026-11-06
depth: findings-reassessment
status: issues_found
prior_findings: 18
resolved: 15
partial: 2
open: 3
---

# Fantasy Baseball Domain Review

## Current Findings

### OPEN-01: Two-way players can lose batting value in daily lineup optimization

- **Severity:** Medium
- **File:** `packages/backend/src/agents/lineup-optimizer.ts:533`
- **Issue:** Pitcher eligibility or pitching components selects pitcher-only daily projection logic. A two-way player who is not a probable starter and has no relief appearances gets no projected appearance, even when they have batting projections. Pitcher-only slot eligibility can also exclude them from hitter slots.
- **Impact:** Daily lineup recommendations can omit valid batting production from two-way players.

### OPEN-02: Draft SGP values remain heuristic

- **Severity:** Low
- **File:** `packages/backend/src/agents/draft-value-model.ts`
- **Issue:** The old player-pool z-score and infeasible top-player roster allocation have been replaced with standings-gap denominators and roster-feasible assignments. This is an improvement, but remains an approximation rather than a calibrated SGP model based on historical or projected league scoring distributions.
- **Impact:** Draft rankings and dollar valuations can be sensitive to roster configuration and the generated player pool.

### OPEN-03: Season-date fallback remains approximate

- **Severity:** Low
- **File:** `packages/backend/src/utils/league-settings.ts`
- **Issue:** Season dates now prefer ESPN settings, status, and schedule data. If those are unavailable, date resolution falls back to generic March 20 and October 1 dates; GS pacing also uses a fixed 26-week fallback.
- **Impact:** Leagues without usable schedule metadata may have inaccurate date proration or pace calculations.

## Prior Critical Findings

- **CR-01 — Resolved:** Current counting totals now use category values, and rate components are merged without double-counting; see `packages/backend/src/simulation/state-builder.ts`.
- **CR-02 — Resolved:** Active and bench players compete for projected roster slots; IL/NA handling remains distinct; see `packages/backend/src/projection/hitter-allocation.ts`.
- **CR-03 — Resolved:** Trade and add/drop simulations rebuild affected rosters through the projection allocator; see `packages/backend/src/agents/roster-simulator.ts`.
- **CR-04 — Resolved:** Simulated category rankings use tie-aware ranks and actual stored baseline roto points; see `packages/backend/src/agents/roster-simulator.ts`.
- **CR-05 — Resolved:** ESPN GS caps and FAAB budgets are normalized, and no cap is represented explicitly; see `packages/backend/src/utils/league-settings.ts`.
- **CR-06 — Resolved:** Churn replacement demand is calculated from projected AB/IP opportunity volume; see `packages/backend/src/simulation/daily-simulator.ts`.
- **CR-07 — Resolved:** Monte Carlo sampling derives coherent batting and pitching components rather than perturbing each independently; see `packages/backend/src/projection/variance.ts`.
- **CR-08 — Resolved:** Repeated slot occupants are grouped by canonical slot and eligibility uses shared slot rules; see `packages/backend/src/agents/lineup-optimizer.ts`.
- **CR-09 — Resolved:** Weekly starts count matched probable-pitcher appearances by MLB identity or normalized name; see `packages/backend/src/agents/streaming-pitcher.ts`.
- **CR-10 — Resolved:** Draft valuation adds universal UTIL/P eligibility and uses roster-feasible assignments; see `packages/backend/src/agents/draft-value-model.ts`.

## Prior Warnings

- **WR-01 — Partially resolved:** Daily projections now use per-appearance values and schedule/lineup context. Two-way player batting value remains open as OPEN-01.
- **WR-02 — Partially resolved:** Projection output is scaled per start or appearance and labeled with its basis. Matchup scoring remains a schedule-only heuristic when opponent context is unavailable.
- **WR-03 — Resolved:** FAAB suggestions use the latest free-agent snapshot, replacement value, standings leverage, and competitor budget estimates; see `packages/backend/src/agents/faab-tracker.ts`.
- **WR-04 — Partially resolved:** Roster-feasible SGP valuation replaced player-pool z-scores. Calibration against league or historical distributions remains open as OPEN-02.
- **WR-05 — Resolved:** Rate confidence intervals now use coherent component simulations; see `packages/backend/src/projection/variance.ts`.
- **WR-06 — Resolved:** Overall standings use competition-rank tie handling; see `packages/backend/src/utils/roto-ranking.ts`.
- **WR-07 — Partially resolved:** Season dates derive from league and schedule metadata where available. Generic fallback dates and fixed 26-week GS fallback remain open as OPEN-03.
- **WR-08 — Resolved:** Unsupported scoring formats are marked degraded instead of being silently treated as roto; see `packages/backend/src/agents/standings-projection.ts` and `packages/backend/src/simulation/state-builder.ts`.

## Verification

- Backend typecheck passed.
- Tests passed: 31 files, 411 passed, 1 skipped.
