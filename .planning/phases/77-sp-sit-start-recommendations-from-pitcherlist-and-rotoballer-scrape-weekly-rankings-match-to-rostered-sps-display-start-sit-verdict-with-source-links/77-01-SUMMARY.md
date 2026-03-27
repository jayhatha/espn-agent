---
phase: 77-sp-sit-start
plan: 01
subsystem: backend
tags: [scraping, pitcherlist, rotoballer, sit-start, sp-recommendations, cheerio, tdd]
dependency_graph:
  requires: []
  provides:
    - PitcherlistAdapter
    - RotoballerAdapter
    - SitStartAdvisor
    - "GET /api/leagues/:leagueId/teams/:teamId/pitching/sit-start"
  affects:
    - packages/backend/src/api/pitching-usage.ts
tech_stack:
  added:
    - "cheerio ^1.2.0 — static HTML parsing"
  patterns:
    - "LRUCache with 6-hour TTL for scraped results (same as ESPNAdapter)"
    - "Diacritic-aware name normalization: NFD decomposition + strip combining marks"
    - "Graceful degradation: all failure modes return empty array, never throw to caller"
    - "TDD: RED (failing tests) -> GREEN (implementation) per task"
key_files:
  created:
    - packages/backend/src/adapters/pitcherlist.ts
    - packages/backend/src/adapters/rotoballer.ts
    - packages/backend/src/agents/sit-start-advisor.ts
    - packages/backend/src/adapters/__tests__/pitcherlist.test.ts
    - packages/backend/src/adapters/__tests__/rotoballer.test.ts
    - packages/backend/src/agents/__tests__/sit-start-advisor.test.ts
  modified:
    - packages/backend/src/api/pitching-usage.ts
    - packages/shared/src/types.ts
    - packages/backend/package.json
decisions:
  - "Rotoballer accepts graceful degradation path — returns [] when JS-rendered content blocks parsing"
  - "normalizeName uses NFD decomposition to handle diacritics (Sánchez -> Sanchez)"
  - "Verdict merging uses numeric average (start=5..sit=1), rounds to nearest integer"
  - "SitStartAdvisor creates singleton adapter instances in constructor (one per request)"
  - "roster_slot IN (SP, P, RP) to catch all pitcher roster positions"
metrics:
  duration: "~16 minutes"
  completed: "2026-03-26"
  tasks_completed: 2
  files_created: 6
  files_modified: 3
  tests_added: 27
---

# Phase 77 Plan 01: SP Sit/Start Backend Infrastructure Summary

**One-liner:** Pitcherlist + Rotoballer scraping adapters with cheerio, diacritic-aware name matching, and SitStartAdvisor agent merging external rankings with rostered SPs via GET /pitching/sit-start endpoint.

## What Was Built

### Task 1: Adapter Layer

**ExternalRankingEntry type** added to `packages/shared/src/types.ts` — normalized interface for both Pitcherlist and Rotoballer rankings.

**PitcherlistAdapter** (`packages/backend/src/adapters/pitcherlist.ts`):
- URL discovery from archive page using `a[href*='starting-pitcher-streamer-rank']` selector (handles slug variants)
- `parsePitcherlistTiers()` exported standalone for unit testing — finds h2/h3 tier headings, traverses to sibling tables, maps tier keywords to verdicts
- Tier mapping: "auto-start" -> "start", "probably start" -> "lean_start", "questionable start" -> "neutral", "do not start" -> "sit"
- LRUCache with 6-hour TTL (max 10 entries)
- Full try/catch — returns [] on any error

**RotoballerAdapter** (`packages/backend/src/adapters/rotoballer.ts`):
- Attempts category page URL discovery, then article fetch + parse
- Detects JS-rendered content (no table elements) and logs warning at warn level
- Returns [] on any failure — Rotoballer is best-effort secondary source
- Same LRU cache pattern as Pitcherlist

### Task 2: Agent + API Endpoint

**SitStartAdvisor** (`packages/backend/src/agents/sit-start-advisor.ts`):
- `normalizeName()` exported — NFD decomposition strips diacritics, removes non-alpha
- Fetches rostered SPs from `team_roster_snapshot` at latest snapshot_date
- Runs both adapter.getRankings() in parallel via Promise.all
- Matches external rankings to rostered SPs using normalizeName comparison
- Consensus verdict: numeric average (start=5..sit=1), rounds to nearest integer, maps back
- Unmatched SPs get no consensus — never fabricates data

**API endpoint** added to `packages/backend/src/api/pitching-usage.ts`:
- `GET /api/leagues/:leagueId/teams/:teamId/pitching/sit-start`
- Uses existing auth middleware (authenticate + requireLeagueAccess + requireTeamOwnership)
- Returns `{ recommendations[], sources{} }` shape

## Test Coverage

27 new tests added:
- 11 pitcherlist tests: tier extraction, verdict mapping, empty HTML, URL discovery
- 5 rotoballer tests: constructor, network failure, JS-rendered HTML, graceful returns
- 11 sit-start-advisor tests: name normalization, diacritics, verdict merging, unmatched players

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

**Rotoballer category page URL discovery** — The category page `https://www.rotoballer.com/category/mlb/fantasy-baseball-advice-analysis/starts-and-sits/` may also be JS-rendered. If it yields no article links, RotoballerAdapter returns [] (graceful degradation). The adapter implements the best-effort scraping per the research spec, which confirms Rotoballer data is expected to be unavailable in the initial implementation and returns Pitcherlist-only results.

This is **intentional** per the plan spec: "Rotoballer adapter returns empty array gracefully when JS-rendered content cannot be parsed."

## Self-Check: PASSED

All files verified:
- FOUND: packages/backend/src/adapters/pitcherlist.ts
- FOUND: packages/backend/src/adapters/rotoballer.ts
- FOUND: packages/backend/src/agents/sit-start-advisor.ts
- FOUND: packages/backend/src/adapters/__tests__/pitcherlist.test.ts
- FOUND: packages/backend/src/adapters/__tests__/rotoballer.test.ts
- FOUND: packages/backend/src/agents/__tests__/sit-start-advisor.test.ts

All commits verified:
- 562f08a: test(77-01): add failing tests for Pitcherlist and Rotoballer adapters
- 3fe96e0: feat(77-01): install cheerio + create Pitcherlist and Rotoballer adapters with ExternalRankingEntry type
- 7ee2855: test(77-01): add failing tests for SitStartAdvisor agent
- 8e666f9: feat(77-01): create SitStartAdvisor agent + sit-start API endpoint
