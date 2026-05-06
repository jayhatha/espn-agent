---
phase: 90-snapshot-repository
plan: "01"
subsystem: backend/db
tags: [repository-pattern, kysely, refactor]
dependency_graph:
  requires: []
  provides: [SnapshotRepository]
  affects:
    - packages/backend/src/agents/standings-projection.ts
    - packages/backend/src/agents/waiver-recommendation.ts
    - packages/backend/src/agents/trade-recommendation.ts
    - packages/backend/src/api/views/free-agent-view.ts
    - packages/backend/src/api/views/trade-view.ts
tech_stack:
  added: []
  patterns: [repository-pattern]
key_files:
  created:
    - packages/backend/src/db/snapshot-repository.ts
  modified:
    - packages/backend/src/agents/standings-projection.ts
    - packages/backend/src/agents/waiver-recommendation.ts
    - packages/backend/src/agents/trade-recommendation.ts
    - packages/backend/src/api/views/free-agent-view.ts
    - packages/backend/src/api/views/trade-view.ts
decisions:
  - team_roster_snapshot → player join centralized in SnapshotRepository; callers filter/sort results in JS rather than in query
  - getRosterForSnapshot returns active+bench+il superset; callers that need active+bench only filter in JS
  - generateTradeCandidates allTeamIds variable removed (repo fetches all-league roster without explicit team filter)
  - trade-view uses JS sort instead of DB orderBy("player.name") after migrating to repo
metrics:
  duration: ~15 minutes
  completed: "2026-05-06"
  tasks_completed: 2
  files_modified: 6
---

# Phase 90 Plan 01: SnapshotRepository Centralization Summary

SnapshotRepository with 5 query methods centralizes the duplicated `team_roster_snapshot → player` join and related patterns from 5 callers into a single tested interface.

## What Was Done

Created `SnapshotRepository` in `packages/backend/src/db/snapshot-repository.ts` with:
- `getRosterForSnapshot` — single `team_roster_snapshot` innerJoin `player` join in the entire codebase
- `getLeagueCategoryTotals` — shared category totals query
- `getPlayerProjections` — projection fetch with empty-array guard
- `getLeagueSettings` — snapshot → settings join
- `getLatestSnapshot` — latest snapshot by date

Migrated all 5 callers. Each agent received a `private readonly repo: SnapshotRepository` initialized in the constructor body (not as a field initializer, to avoid ES2022 field initialization order issue with constructor parameter properties).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Constructor field initialization order**
- **Found during:** Task 1 design
- **Issue:** TypeScript ES2022 target uses native class fields; field initializers run before constructor body, so `private repo = new SnapshotRepository(this.db)` would access `this.db` before it's assigned by the parameter property
- **Fix:** Declared `private readonly repo: SnapshotRepository;` as a typed field and assigned `this.repo = new SnapshotRepository(db)` at the start of the constructor body
- **Files modified:** standings-projection.ts, waiver-recommendation.ts, trade-recommendation.ts

**2. [Rule 1 - Bug] Stale `allTeamIds` variable in generateTradeCandidates**
- **Found during:** Task 2 TypeScript compile
- **Issue:** After replacing the allRosters query with `repo.getRosterForSnapshot` (which fetches the whole league), `allTeamIds` was declared but never used, causing `noUnusedLocals` error
- **Fix:** Removed the `allTeamIds` declaration
- **Commit:** a3f1ac8

**3. [Rule 1 - Bug] Syntax error from partial constructor replacement**
- **Found during:** Task 2 TypeScript compile
- **Issue:** `replace_string_in_file` matched only part of the original constructor, leaving a dangling `) {}` token
- **Fix:** Removed the orphaned `) {}` with a second targeted replacement
- **Commit:** a3f1ac8

## Self-Check: PASSED

- `packages/backend/src/db/snapshot-repository.ts` — FOUND
- `a3f1ac8` — FOUND in git log
- `selectFrom("team_roster_snapshot")` outside snapshot-repository.ts — NONE FOUND
- TypeScript compile exit code 0 — CONFIRMED
