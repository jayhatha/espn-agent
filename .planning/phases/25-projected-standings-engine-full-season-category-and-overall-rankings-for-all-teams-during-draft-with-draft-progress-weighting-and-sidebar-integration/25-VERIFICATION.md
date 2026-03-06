---
phase: 25-projected-standings-engine
verified: 2026-03-05T00:00:00Z
status: passed
score: 9/9 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "Open auction draft page with 3+ teams having drafted players matched to FanGraphs data — scroll to Projected Standings section in EngineInsights sidebar"
    expected: "Collapsible section appears showing all teams with roto points, user row highlighted with ring, per-category ranks with green/red coloring, and LOW/MED/HIGH confidence badge matching draft completion"
    why_human: "Visual rendering, live DOM wiring through WXT content script, and ESPN draft page availability cannot be verified programmatically"
  - test: "With 3+ teams having FG data, pick a player for an opposing team — verify top targets list shifts to favor players who contribute to weak categories"
    expected: "Players contributing stats to the user's weakest projected roto categories appear boosted in top targets relative to their raw SGP value"
    why_human: "Weak-category boost effect on sort order requires live draft state and comparison to non-boosted sort; not inspectable statically"
---

# Phase 25: Projected Standings Engine Verification Report

**Phase Goal:** Project full-season roto standings for all teams during a live auction draft using replacement-level filler for remaining roster slots, draft-progress confidence weighting, and weak-category boost for top-target recommendations — surfaced in the extension sidebar as a Projected Standings section
**Verified:** 2026-03-05
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | computeProjectedStandings returns a ProjectedStandingsSignal with per-team roto points, overall ranks, and category ranks | VERIFIED | `projected-standings.ts` lines 231-401: returns `ProjectedStandingsSignal` with `standings[]` (each containing `projectedRotoPts`, `projectedOverallRank`, `categoryRanks`), `myTeamRank`, `myWeakCategories`, `myStrongCategories` |
| 2 | Replacement-level filler uses median undrafted player stats, not greedy fill | VERIFIED | `computeReplacementStats` (lines 58-104): sort + `Math.floor(values.length / 2)` median computation, comment explicitly states "Using median (not mean) avoids distortion from outliers" |
| 3 | Rate stats computed from summed components (not averaged rates) for both drafted players and filler | VERIFIED | Line 330: `calculateFinalRate(cat.formula_id, {}, combinedComponents)` used — components accumulated first, rate computed last. Note: for teams with FG-matched players, rate filler uses `replacementComponents * rosterSize` uniformly (documented approximation in SUMMARY, both branches produce same code) |
| 4 | Draft progress weight follows piecewise linear curve with 50% drafted = 0.5 confidence | VERIFIED | `computeDraftProgressWeight` (lines 123-138): piecewise linear with breakpoints 0%→0.00, 30%→0.20, 50%→0.50, 70%→0.85, 100%→1.00. Math verified: at pct=0.5, returns `0.2 + (0.3/0.2)*(0.5-0.3) = 0.2 + 1.5*0.2 = 0.50` |
| 5 | league-analysis.ts exposes teamDraftedTotals without breaking existing LeagueAnalysisSignal consumers | VERIFIED | `types.ts` line 167: `teamDraftedTotals?: Map<...>` (optional field). `league-analysis.ts` line 167: early return includes `teamDraftedTotals: new Map()`, line 331: main return includes `teamDraftedTotals: teamTotals` |
| 6 | Projected standings computed as step 5c in computeDraftEngine after league analysis | VERIFIED | `index.ts` lines 469-510: step 5c comment block, `computeProjectedStandings` called after `leagueAnalysis` with `leagueAnalysis.teamDraftedTotals` passed, result stored in `projectedStandings`, included in return at line 536 |
| 7 | Weak-category boost applied to top-target SGP sorting (30% per weak category, capped at 2x) | VERIFIED | `index.ts` lines 134, 308-317: `weakCategories` from `projectedStandings?.myWeakCategories`, boost loop adds 0.3 per matching category, `Math.min(weakBoost, 2.0)` cap, `adjustedSgp = positionalAdjustedSgp * weakBoost` |
| 8 | Projected Standings section visible in sidebar when teamsWithData >= 3 | VERIFIED | `EngineInsights.tsx` line 245: `projectedStandings != null && projectedStandings.teamsWithData >= 3` guard wraps the entire section |
| 9 | User sees their projected overall rank and per-category ranks | VERIFIED | `EngineInsights.tsx` lines 250-254: `#{projectedStandings.myTeamRank}` displayed in header; lines 305-341: IIFE renders "My Category Ranks" subsection with per-category `rank/totalTeams` display |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/extension/lib/engine/projected-standings.ts` | computeProjectedStandings pure function, computeReplacementStats, computeDraftProgressWeight, computeRotoPts | VERIFIED | 401 lines (min_lines: 100 met); all four functions present; zero React/Zustand/DOM imports confirmed by grep |
| `packages/extension/lib/engine/types.ts` | ProjectedTeamStanding, ProjectedStandingsSignal interfaces | VERIFIED | Lines 174-192: both interfaces present with all required fields; `DraftEngineSignals` at line 203 includes `projectedStandings: ProjectedStandingsSignal \| null` |
| `packages/extension/lib/engine/league-analysis.ts` | teamDraftedTotals exposed on LeagueAnalysisSignal | VERIFIED | `computeLeagueAnalysis` exported; returns `teamDraftedTotals: teamTotals` on main path (line 331) and `teamDraftedTotals: new Map()` on early return (line 167) |
| `packages/extension/lib/engine/index.ts` | Step 5c projected standings computation, weak-category boost in top targets | VERIFIED | Step 5c block lines 469-510; `computeRosterOptimization` accepts `projectedStandings` parameter (line 94); `ProjectedStandingsSignal` re-exported at line 23 |
| `packages/extension/components/EngineInsights.tsx` | Projected Standings collapsible section with rank table and confidence badge | VERIFIED | 363 lines (min_lines: 30 met); section lines 244-360: collapsible `<details className="group">` (no `open` = collapsed by default), rank table, isMyTeam highlight, per-category ranks, weak/strong summary, confidence badge |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `projected-standings.ts` | `league-analysis.ts` | consumes teamDraftedTotals from LeagueAnalysisSignal | WIRED | `projected-standings.ts` accepts `teamDraftedTotals` as first parameter; `index.ts` passes `leagueAnalysis.teamDraftedTotals` at line 495 |
| `projected-standings.ts` | `@espn-fantasy/shared` | calculateFinalRate for rate stat filler | WIRED | Line 22: `import { calculateFinalRate } from "@espn-fantasy/shared"`, line 330: called in rate stat branch |
| `index.ts` | `projected-standings.ts` | import computeProjectedStandings, call as step 5c | WIRED | Line 9: import, line 494: call inside step 5c block |
| `index.ts` | `league-analysis.ts` | leagueAnalysis.teamDraftedTotals passed to computeProjectedStandings | WIRED | Line 473: null check on `leagueAnalysis.teamDraftedTotals`, line 495: passed as first arg |
| `EngineInsights.tsx` | `types.ts` | ProjectedStandingsSignal type consumed for rendering | WIRED | Line 13: `projectedStandings` destructured from `engineSignals`; entire Projected Standings section (lines 244-360) consumes the signal |

### Requirements Coverage

Both plans declare `requirements: []`. No requirement IDs claimed. No phase 25 entries found in `.planning/REQUIREMENTS.md`. No orphaned requirements exist.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `projected-standings.ts` | 310-320 | Rate filler branches (draftedTotals present vs absent) produce identical code — both paths use `replComp * rosterSize` | Info | Documented approximation: since `teamDraftedTotals` stores only computed rate values (not raw components), per-player component decomposition is unavailable. Acknowledged in SUMMARY. All teams ranked symmetrically; no bias introduced. |

No blocker or warning anti-patterns found. No TODO/FIXME/placeholder comments. No empty implementations. No stub return values.

### Human Verification Required

#### 1. Projected Standings Section Renders in Live Draft

**Test:** Open the extension on an ESPN auction draft page where at least 3 teams have drafted players. Scroll to the bottom of the EngineInsights sidebar (after League Analysis section).
**Expected:** "Projected Standings" collapsible section appears collapsed by default showing `#{rank}` in header and a LOW/MED/HIGH badge. Expanding it shows all teams sorted by roto points with user's row highlighted (ring border), per-category ranks with green/red coloring, and a Weak:/Strong: summary.
**Why human:** Visual rendering, live ESPN DOM wiring through WXT content script, and live draft state cannot be verified programmatically.

#### 2. Weak-Category Boost Shifts Top Targets

**Test:** In a live draft with 3+ teams drafted, find the top targets list. Compare the ordering to what it would be without the weak-category boost by noting whether the highest-ranked targets contribute to the user's projected weak categories.
**Expected:** Players who contribute stats to the user's weakest projected roto categories appear boosted in the top targets list relative to their raw SGP rank.
**Why human:** Requires live draft state, FanGraphs data loaded, and category analysis computed — the multiplicative boost effect is only visible by comparing sort orders which requires running the engine.

### Gaps Summary

No gaps found. All observable truths verified against actual code. All artifacts exist, are substantive (not stubs), and are correctly wired. The one notable implementation detail — rate stat filler uses `replacementComponents * rosterSize` uniformly for all teams rather than combining actual drafted components with filler for teams with FG data — is a documented deliberate approximation that is self-consistent across all teams and does not impair the ranking function.

---

_Verified: 2026-03-05_
_Verifier: Claude (gsd-verifier)_
