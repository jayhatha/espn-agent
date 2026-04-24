---
name: Phase 75 enables GS tracking fix
description: Once active stats (per-team roster tenure) ships, GS pacing should use it instead of the rotation-cycle estimation hack
type: project
---

Phase 75 (active stats — player contributions by roster tenure) provides the data layer needed to fix GS pacing properly. Once we can query "this pitcher's stats during the dates they were on your team," GS counting becomes: sum each pitcher's GS stat filtered to their roster tenure dates. No more dividing rostered days by 5.

**Why:** The current GS pacing agent uses a rough heuristic (rostered days / 5) which is inaccurate early in the season. Active stats gives us exact per-team stat attribution.

**How to apply:** After Phase 75 ships, refactor `GsPacingAgent.countGsFromRosterAndStats()` to query the active stats endpoint/data layer instead of estimating.
