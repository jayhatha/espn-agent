---
phase: 85-waiver-page-advanced-stats-columns
verified: 2026-05-04T00:00:00Z
status: human_needed
score: 6/6 code checks verified
human_verification:
  - test: "Waiver manual-eval free-agent table shows advanced hitter columns"
    expected: "When a hitter position or All Positions is selected, the free-agent table includes BABIP, xBA, xSLG, xwOBA, and ISO columns with numeric values or --."
    why_human: "Requires browser rendering and real player data."
  - test: "Waiver manual-eval free-agent table shows advanced pitcher columns"
    expected: "When a pitcher position or All Positions is selected, the free-agent table includes K-BB%, K/9, FIP, xFIP, xERA, and SIERA columns with values or --."
    why_human: "Requires browser rendering and real player data."
  - test: "Roster drop table mirrors advanced columns"
    expected: "The roster-side manual-eval table shows the same advanced columns and formatting as the free-agent table."
    why_human: "Requires UI inspection."
---

# Phase 85: Waiver Page Advanced Stats Columns — Verification Report

## Observable Truths

| #   | Truth                                                                             | Status   | Evidence                                                                                    |
| --- | --------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------- |
| 1   | Backend has a dedicated advanced stats adapter                                    | VERIFIED | `packages/backend/src/adapters/advanced-stats.ts` exists and exports `AdvancedStatsAdapter` |
| 2   | Free-agent waiver responses now include `currentStats` and `advancedStats`        | VERIFIED | `packages/backend/src/api/recommendations.ts` enriches free agents with both fields         |
| 3   | Roster waiver responses now include `advancedStats`                               | VERIFIED | `packages/backend/src/api/recommendations.ts` adds `advancedStats` to `enrichedRoster`      |
| 4   | Waiver page types consume `advancedStats` for both free agents and roster players | VERIFIED | `packages/frontend/src/app/leagues/[id]/waivers/page.tsx` interfaces define `advancedStats` |
| 5   | Waiver page renders all requested advanced-stat headers                           | VERIFIED | `renderStatHeaders()` includes hitter and pitcher advanced stat headers                     |
| 6   | Unavailable metrics degrade to `--` instead of fabricated numbers                 | VERIFIED | `fmtRate`/`fmtPercent` return `--` for null; backend returns `null` for unavailable fields  |

## Automated Checks

| Check                                                                     | Result |
| ------------------------------------------------------------------------- | ------ |
| `get_errors` on `packages/backend/src/adapters/advanced-stats.ts`         | PASS   |
| `get_errors` on `packages/backend/src/api/recommendations.ts`             | PASS   |
| `get_errors` on `packages/frontend/src/app/leagues/[id]/waivers/page.tsx` | PASS   |

## Notes

- Baseball Savant expected-stat exports provide exact `xBA`, `xSLG`, `xwOBA`, and `xERA`
- `xFIP` and `SIERA` remain intentionally null because no reliable backend-available public source was confirmed in this environment

---

_Verified: 2026-05-04_
