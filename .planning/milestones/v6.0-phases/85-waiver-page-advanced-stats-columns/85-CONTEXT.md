# Phase 85: Waiver Page Advanced Stats Columns - Context

**Gathered:** 2026-05-04
**Status:** Ready for planning
**Mode:** Autonomous inferred context

<domain>
## Phase Boundary

Add advanced hitter and pitcher stat columns to the waiver page manual-evaluation tables so managers can compare free agents and drop candidates with richer quality-of-contact and run-prevention signals.

</domain>

<decisions>
## Implementation Decisions

### Data surface

- Keep the feature scoped to the existing waiver manual-eval data path: `GET /api/leagues/:id/free-agents` and `GET /api/leagues/:id/teams/:teamId/roster`
- Do not add DB tables or snapshot pipeline work for this phase; enrich the live waiver endpoints directly

### External source

- Use Baseball Savant expected-stat CSV exports for exact `xBA`, `xSLG`, `xwOBA`, and `xERA`
- Cache Savant lookups in-process to avoid repeated full-season downloads on every page load

### Derived metrics

- Derive `BABIP`, `ISO`, and `K/9` from existing ESPN component stats already stored in `player.current_season_stats_json`
- Derive `K-BB%` and `FIP` from available pitching components when possible

### Graceful degradation

- `xFIP` and `SIERA` must not be fabricated; return `null` and render `--` when no reliable public source is available from the backend environment
- Unmatched Statcast rows must degrade to `null` rather than guessing across duplicate names

</decisions>

<canonical_refs>

## Canonical References

### Waiver data flow

- `packages/backend/src/api/recommendations.ts` — free-agent and roster endpoints that feed the waiver page
- `packages/frontend/src/app/leagues/[id]/waivers/page.tsx` — manual-evaluation tables and column rendering

### Existing stats infrastructure

- `packages/backend/src/agents/player-pool-sync.ts` — writes `current_season_stats_json` into `player`
- `packages/backend/src/adapters/espn.ts` — `ESPN_STAT_MAP` defining available counting/rate components
- `packages/shared/src/formulas.ts` — existing rate-stat helpers already used across the app

</canonical_refs>

<specifics>
## Specific Ideas

- Free-agent responses currently omit `currentStats`; add that alongside `advancedStats`
- Keep the advanced stat rendering inside the existing horizontally scrollable tables rather than creating a new subpanel
- Use exact requested labels on headers: `K-BB%`, `K/9`, `FIP`, `xFIP`, `xERA`, `SIERA`, `BABIP`, `xBA`, `xSLG`, `xwOBA`, `ISO`

</specifics>

<deferred>
## Deferred Ideas

- Persist advanced stats in the player table for reuse outside waivers
- Add a reliable server-side source for `xFIP` and `SIERA` if a non-blocked export/API becomes available

</deferred>

---

_Phase: 85-waiver-page-advanced-stats-columns_
_Context gathered: 2026-05-04_
