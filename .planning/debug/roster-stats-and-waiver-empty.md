---
slug: roster-stats-and-waiver-empty
status: resolved
trigger: manual
date: 2026-05-15
---

## Symptoms

1. League detail page → RosterSection falls back to the basic name/team/pos table instead of the enriched hitter/pitcher stat tables.
2. Waiver page (Manual Eval mode) → "Drop from Your Roster" table shows "No hitters on roster" / "No pitchers on roster".

Both involve `api.getTeamRoster()` → `GET /api/leagues/:leagueId/teams/:teamId/roster`.

---

## Investigation

### Data flow

```
page.tsx
  enrichedRosterData = useQuery(["roster-enriched", leagueId, teamId])
    → api.getTeamRoster() → GET /api/leagues/:id/teams/:teamId/roster
  enrichedRoster = enrichedRosterData?.roster ?? null
  → RosterSection({ enrichedRoster })
      enrichedRoster truthy  → HitterTable / PitcherTable (enriched view)
      enrichedRoster null    → basic name/team/pos fallback
      enrichedRoster []      → enriched view showing "No hitters" / "No pitchers"

waivers/page.tsx
  rosterData = useQuery(["roster", leagueId, teamId], enabled: manual mode)
    → api.getTeamRoster() → same endpoint
  rosterRows = rosterData?.roster → [] if undefined/empty → "No hitters on roster"
```

### Root causes found

#### RC-1: ESPN lineup slot 19 (IF utility) classified as `"unknown"`

`packages/backend/src/adapters/espn/normalizer.ts` — `lineupSlotId >= 0 && lineupSlotId <= 15` → `"active"`, but the IF utility slot is **slot 19**, which falls outside the range. Players in the IF slot get `roster_status = "unknown"`, which is excluded by the roster endpoint's `WHERE roster_status IN ('active', 'bench')` filter.

```ts
// BEFORE
else if (lineupSlotId >= 0 && lineupSlotId <= 15) rosterStatus = "active";
// AFTER
else if ((lineupSlotId >= 0 && lineupSlotId <= 15) || lineupSlotId === 19) rosterStatus = "active";
```

#### RC-2: Roster endpoint resolves date from `league_daily_snapshot` but queries `team_roster_snapshot`

`packages/backend/src/api/recommendations.ts` — If a snapshot partially completed (wrote a `league_daily_snapshot` row for today but failed before writing `team_roster_snapshot` rows), the roster endpoint uses today's date from `league_daily_snapshot`, finds zero rows in `team_roster_snapshot`, and returns `{ roster: [] }`.

The overview endpoint (`/api/leagues/:id/teams/:teamId/overview`) also queries `team_roster_snapshot` with the same date, so the overview's `roster` array would also be empty. But `team_daily_category_totals` might have data for the same date (written before the roster failure), causing the overview to show category stats with an empty roster — matching the described symptom.

Fix: resolve date from the most recent `team_roster_snapshot` for the specific team, not from `league_daily_snapshot`.

#### RC-3: No loading state distinction in RosterSection

`enrichedRoster = enrichedRosterData?.roster ?? null` is `null` both while loading and on error. The RosterSection had no way to distinguish these states — it always showed the basic fallback while `null`. Users see the basic view "stuck" rather than a loading indicator.

Fix: pass `enrichedRosterIsLoading` prop from the page, show "Loading stats…" skeleton instead of the basic fallback while loading.

#### RC-4: Waiver page shows "No hitters on roster" silently on API error

When the roster query fails, `rosterData = undefined`, `rosterRows = []`, and the UI shows "No hitters on roster" — indistinguishable from a genuinely empty roster. No error state was shown.

Fix: destructure `isError: rosterError` and render `<ErrorAlert>` in the manual eval section when the roster query fails.

---

## Evidence

| File                                                                       | Issue                                                                              |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `packages/backend/src/adapters/espn/normalizer.ts:78-81`                   | Slot 19 (IF) → "unknown", excluded from active roster                              |
| `packages/backend/src/api/recommendations.ts:148-163`                      | Date resolved from `league_daily_snapshot`, mismatches `team_roster_snapshot` data |
| `packages/frontend/src/app/leagues/[id]/_sections/RosterSection.tsx:56-58` | No `enrichedRosterIsLoading` prop — loading and error indistinguishable            |
| `packages/frontend/src/app/leagues/[id]/waivers/page.tsx:1162`             | `rosterError` not handled — shows empty table on failure                           |

---

## Resolution

### root_cause

Two backend bugs: (1) ESPN slot 19 (IF utility) incorrectly classified as "unknown" roster status causing players to be filtered out of the `/roster` endpoint; (2) the roster endpoint uses `league_daily_snapshot` date which may not match the actual date of `team_roster_snapshot` data, returning an empty roster after a partial snapshot.

Two frontend gaps: (3) `RosterSection` shows the basic fallback while enriched data is loading, giving no visual feedback; (4) waiver page shows "No hitters on roster" silently on API failure.

### fix

All four issues fixed:

1. `normalizer.ts`: `(lineupSlotId >= 0 && lineupSlotId <= 15) || lineupSlotId === 19` → maps slot 19 IF to "active"
2. `recommendations.ts`: date now resolved from `team_roster_snapshot` for the specific team (falls back to `league_daily_snapshot` only if team has no snapshot history)
3. `RosterSection.tsx`: added `enrichedRosterIsLoading` prop; hitter/pitcher sections show `animate-pulse` "Loading stats…" while the query is in flight
4. `waivers/page.tsx`: added `isError: rosterError` from the roster query; manual eval section renders `<ErrorAlert>` instead of empty tables on failure

### files_changed

- `packages/backend/src/adapters/espn/normalizer.ts`
- `packages/backend/src/api/recommendations.ts`
- `packages/frontend/src/app/leagues/[id]/_sections/RosterSection.tsx`
- `packages/frontend/src/app/leagues/[id]/page.tsx`
- `packages/frontend/src/app/leagues/[id]/waivers/page.tsx`

---

## Open questions

- If RC-2 is the primary cause, the underlying issue is that the snapshot orchestrator doesn't write `team_roster_snapshot` atomically with `league_daily_snapshot`. A more robust fix would be to wrap both writes in a single DB transaction and only commit `league_daily_snapshot` after all dependent tables are populated.
- The `SnapshotOrchestratorAgent` is known to not ingest `player_period_stats` — the tenure stats section in the roster endpoint always returns null, which is handled gracefully.
- External Baseball Savant requests (in `AdvancedStatsAdapter`) can be slow on cold cache (server restart). The 20s timeout × 3 retries = up to ~87s wait. Consider reducing timeout for this non-critical enrichment or making it a separate async step.
