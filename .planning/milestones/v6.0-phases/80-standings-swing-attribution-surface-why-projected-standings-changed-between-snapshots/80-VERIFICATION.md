---
phase: 80-standings-swing-attribution-surface-why-projected-standings-changed-between-snapshots
verified: 2026-03-31T20:00:00Z
status: passed
score: 11/11 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "Navigate to /leagues/:id/standings, select Projected Standings tab, select a team"
    expected: "If |totalDelta| >= 0.5 and two snapshots exist, 'What Changed?' card appears with three bucket bars and per-category breakdown table"
    why_human: "Requires real snapshot data with delta >= 0.5 and two recorded snapshots; cannot simulate live DB state programmatically"
  - test: "Verify 'What Changed?' card is hidden when only one snapshot exists"
    expected: "Card does not appear (attribution_available = false); no empty state shown"
    why_human: "Requires a league with exactly one snapshot in the DB to exercise the guard"
---

# Phase 80: Standings Swing Attribution Verification Report

**Phase Goal:** When projected standings swing significantly between snapshots, surface why: player projection changes, actual performance deviations, or competitor roto point movement. Compare snapshot-over-snapshot deltas at category level, identify driving players, attribute to specific causes.
**Verified:** 2026-03-31T20:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Three-bucket attribution (actual_performance + projection_change + competitor_movement) sums to total roto point delta | VERIFIED | Test 1 in test file asserts `actualDelta + projDelta + compDelta === totalDelta` with `toBeCloseTo(totalDelta, 10)`; passes. `attributeCompetitorMovement` is pure residual: `total - actual - projection`. |
| 2 | actual_performance bucket = roto points gained from YTD stat accumulation | VERIFIED | `computeActualPerformanceDelta` builds hypotheticalProjected = prevProjected + (currActuals - prevActuals) per team, re-ranks, returns delta. Tests 2a and 2b confirm isolation (delta=0 when no rank change; delta=+1 when actual accumulation overtakes competitor). |
| 3 | projection_change = 0 when prevRunId === currRunId | VERIFIED | `computeProjectionChangeDelta` has explicit `if (sameRunId) return 0` guard at line 130. Test 3a asserts `projDelta === 0` with `sameRunId=true`. |
| 4 | competitor_movement detected when team absolute value is flat but rank improves | VERIFIED | Test 4 confirms: prevActuals = currActuals (no accumulation), same run ID (no projection change), competitor HR dropped 160→140. `actualDelta=0`, `projDelta=0`, `compDelta=+1` as residual. |
| 5 | attribution_available = false when only one snapshot exists | VERIFIED | `computeSwing` queries for prevSnapshotRow and returns `{ attribution_available: false, totalDelta: 0, buckets: null, categoryBreakdown: [] }` when none found (line 215-226). Also returns false when prevCatRows or currCatRows are empty (line 311-322). Test 5 validates the pure zero-case contract. |
| 6 | LOWER_BETTER categories (ERA, WHIP) handled correctly — ERA decrease is positive roto point change | VERIFIED | `computeActualPerformanceDelta` and `computeProjectionChangeDelta` both accept `direction: "HIGHER_BETTER" | "LOWER_BETTER"` and sort ascending for LOWER_BETTER. Tests 6a, 6b, 6c confirm: ERA 4.5→3.9 overtakes 4.0 competitor (+1 pt), ERA projection update 4.2→3.8 yields +1 projDelta. |
| 7 | GET /api/leagues/:leagueId/standings/swing?teamId=X returns SwingAttributionResult JSON | VERIFIED | Route registered at line 485 of timeseries.ts. Delegates to `StandingsSwingAttributionAgent.computeSwing()` and returns result directly. |
| 8 | Endpoint returns 400 when teamId is missing | VERIFIED | Line 495-497: `if (!teamId) return reply.code(400).send({ error: "teamId is required" })`. Also 400 for non-numeric teamId at line 500-502. |
| 9 | Endpoint returns { attribution_available: false } when only one snapshot exists | VERIFIED | Agent's `computeSwing` returns `attribution_available: false` when no prevSnapshotRow; the route passes through the agent result unchanged. |
| 10 | Frontend api.getStandingsSwing() fetches from the correct URL | VERIFIED | api.ts lines 167-174: method accepts `(leagueId, teamId, params?)`, calls `fetchAPI('/api/leagues/${leagueId}/standings/swing?${query}')` with teamId merged into cleanParams. |
| 11 | 'What Changed?' panel renders in Projected Standings tab with significance threshold and correct guards | VERIFIED | standings/page.tsx line 683: `selectedTeamId && swingData?.attribution_available && Math.abs(swingData.totalDelta) >= 0.5`. Query is enabled only when `viewMode === "projected" && !!selectedTeamId && !!data?.snapshotDate` (line 185). |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/backend/src/agents/__tests__/standings-swing-attribution.test.ts` | Failing-first unit tests for all six attribution behaviors | VERIFIED | 12 tests, all passing. Covers three-bucket sum, actual isolation (2 sub-cases), sameRunId guard (2 sub-cases), competitor residual, no-prev-snapshot contract, LOWER_BETTER direction (3 sub-cases). |
| `packages/backend/src/agents/standings-swing-attribution.ts` | StandingsSwingAttributionAgent class with computeSwing() | VERIFIED | 629 lines. Exports: `StandingsSwingAttributionAgent`, `SwingAttributionResult`, `CategoryAttribution`, `computeActualPerformanceDelta`, `computeProjectionChangeDelta`, `attributeCompetitorMovement`. |
| `packages/backend/src/api/timeseries.ts` | GET /api/leagues/:leagueId/standings/swing route | VERIFIED | Route at line 485. Imports agent at line 7. Instantiates and delegates at line 520-521. 400/404/500 guards present. |
| `packages/frontend/src/lib/api.ts` | api.getStandingsSwing() method | VERIFIED | Lines 166-174. Correct signature and URL pattern. |
| `packages/frontend/src/components/league/SwingAttributionPanel.tsx` | Reusable SwingAttributionPanel component | VERIFIED | 171 lines. Named export + default export. Props-only (no `"use client"`). Semantic token classes only (text-positive/text-negative, dark:text-shell-*). No raw color classes. |
| `packages/frontend/src/app/leagues/[id]/standings/page.tsx` | Wired SwingAttributionPanel in projected view | VERIFIED | Import at line 25. SwingAttributionData interface at line 84. useQuery at line 175. Conditional render at line 683. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `standings-swing-attribution.ts` | `utils/roto-ranking.ts` | `assignRanksWithTies` import | WIRED | Line 4 imports; used at lines 93, 102, 138, 147 in pure helper functions. |
| `standings-swing-attribution.ts` | `db/schema.ts` | `Kysely<Database>` type | WIRED | Lines 2-3 import; constructor typed as `Kysely<Database>`. Multiple `this.db.selectFrom(...)` calls. |
| `packages/backend/src/api/timeseries.ts` | `standings-swing-attribution.ts` | `import StandingsSwingAttributionAgent` | WIRED | Line 7: `import { StandingsSwingAttributionAgent }`. Line 520: `new StandingsSwingAttributionAgent(db, request.log)`. |
| `packages/frontend/src/app/leagues/[id]/standings/page.tsx` | `packages/frontend/src/lib/api.ts` | `api.getStandingsSwing()` in useQuery | WIRED | Lines 179-183: `api.getStandingsSwing(parseInt(leagueId, 10), selectedTeamId, ...)` inside queryFn. |
| `packages/frontend/src/app/leagues/[id]/standings/page.tsx` | `SwingAttributionPanel.tsx` | import + JSX render | WIRED | Line 25: import. Lines 692-695: `<SwingAttributionPanel data={swingData} previousSnapshotDate={swingData.previousSnapshotDate} />`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `SwingAttributionPanel.tsx` | `data` (SwingAttributionResult) | `api.getStandingsSwing()` → GET /standings/swing → `StandingsSwingAttributionAgent.computeSwing()` | Yes — agent queries `team_daily_projected_category`, `team_daily_category_totals`, `team_daily_projected_overall`, `league_daily_snapshot`, `player_projection`, `team_roster_snapshot`, `player`, `team` tables via Kysely | FLOWING |
| `standings/page.tsx` swingData | `swingData` from `useQuery` | `api.getStandingsSwing()` — returns live fetch | Yes — fetches from real API endpoint backed by DB queries | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 12 attribution unit tests pass | `pnpm --filter backend test --run` | `standings-swing-attribution.test.ts (12 tests) 2ms` — all pass | PASS |
| No raw color classes in SwingAttributionPanel | `grep "text-green\|text-red\|text-emerald\|text-amber" SwingAttributionPanel.tsx` | No output | PASS |
| No `"use client"` in props-only component | `grep '"use client"' SwingAttributionPanel.tsx` | No output | PASS |
| StandingsSwingAttributionAgent imported and instantiated in timeseries.ts | `grep "StandingsSwingAttributionAgent" timeseries.ts` | Lines 7, 520 — import and instantiation both found | PASS |
| 400 guard for missing teamId in route | `grep "teamId is required" timeseries.ts` | Line 496 | PASS |

Note: 7 pre-existing ESPN adapter test failures in `espn.test.ts` (rate limiting, LRU cache, retry configuration) are unrelated to phase 80 and existed before this phase.

### Requirements Coverage

Phase 80 PLANs declare `requirements: []` for all three plans. REQUIREMENTS.md contains no swing/attribution/snapshot-delta requirement IDs. This phase added new feature capability with no traceability to existing REQUIREMENTS.md entries — consistent with "Requirements: TBD" in ROADMAP.md.

No orphaned requirements were found. No requirement IDs to cross-reference.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

Scanned: `standings-swing-attribution.ts`, `standings-swing-attribution.test.ts`, `SwingAttributionPanel.tsx`, `standings/page.tsx`, `timeseries.ts` (swing route block), `api.ts` (getStandingsSwing method). No TODOs, FIXMEs, placeholder returns, or hardcoded empty data detected in phase 80 code paths.

### Human Verification Required

#### 1. What Changed? Card Renders for Real Users

**Test:** Navigate to `/leagues/:id/standings`, click "Projected Standings" tab, select your team from the standings table.
**Expected:** If at least two snapshots exist for the league and the team's projected overall roto points changed by 0.5 or more between the two most recent snapshots, a "What Changed?" card appears below "Overall Projected Standings" with three labeled bucket rows (Actual Performance, Projection Change, Competitor Movement) and a category breakdown table showing per-category roto deltas.
**Why human:** Requires live DB with two recorded snapshots and a totalDelta >= 0.5 threshold being met. Cannot be verified without running the app against real data.

#### 2. Attribution Card Hidden When Single Snapshot

**Test:** On a newly connected league with only one snapshot, navigate to the same projected standings view and select a team.
**Expected:** The "What Changed?" card does not appear at all (no empty state, no error).
**Why human:** Requires a league in the DB that has exactly one snapshot to exercise the `attribution_available: false` guard.

### Gaps Summary

No gaps. All 11 truths are verified, all artifacts exist and are substantive, all key links are wired, data flows from DB through agent through API through frontend query to the component props, and 12 unit tests pass confirming the three-bucket attribution math is correct.

Two items are flagged for human verification (live UI rendering and single-snapshot guard) as they require a running app with real DB state.

---

_Verified: 2026-03-31T20:00:00Z_
_Verifier: Claude (gsd-verifier)_
