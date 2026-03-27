---
phase: 78-streaming-picks
plan: "01"
subsystem: backend
tags: [streaming, rotoballer, waiver-timing, pitching]
dependency_graph:
  requires:
    - packages/backend/src/adapters/rotoballer.ts
    - packages/backend/src/agents/sit-start-advisor.ts (normalizeName)
  provides:
    - packages/backend/src/agents/streaming-pitcher.ts (extended with Rotoballer + waiver timing)
    - packages/backend/src/api/streaming.ts (new fields in response)
  affects:
    - Streaming pitcher recommendations endpoint response shape
tech_stack:
  added: []
  patterns:
    - Optional dependency injection for RotoballerAdapter in StreamingPitcherAgent constructor
    - Graceful degradation when Rotoballer returns empty (skip verdict filter)
    - NFD diacritic-aware name normalization (normalizeName from sit-start-advisor)
    - Waiver window logic: find latest Tue/Fri strictly before game date
key_files:
  created: []
  modified:
    - packages/backend/src/agents/streaming-pitcher.ts
    - packages/backend/src/api/streaming.ts
decisions:
  - Pickup deadline uses Tue/Fri (days 2 and 5) hardcoded per D-02 spec
  - Graceful degradation: when Rotoballer returns empty array, skip verdict filter entirely (D-05)
  - normalizeName reused from sit-start-advisor.ts (NFD decomposition) replacing inline normalize()
  - RotoballerAdapter passed as optional 4th constructor param (no breaking change to existing call sites)
  - totalCandidates in StreamingResult now reflects post-filter count (not pre-filter)
metrics:
  duration_minutes: 2
  completed_date: "2026-03-27"
  tasks_completed: 2
  files_modified: 2
---

# Phase 78 Plan 01: Streaming Pitcher Rotoballer Integration Summary

**One-liner:** Rotoballer verdict filtering (start/lean_start only) + Tue/Fri waiver pickup deadline logic added to StreamingPitcherAgent, with all new fields passed through to the API response.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend StreamingPitcherAgent with Rotoballer verdicts and waiver day filtering | 3bc4a55 | packages/backend/src/agents/streaming-pitcher.ts |
| 2 | Wire RotoballerAdapter into API route and pass new fields to frontend | 1957c00 | packages/backend/src/api/streaming.ts |

## What Was Built

### StreamingPitcherAgent Extensions (streaming-pitcher.ts)

**New StreamingCandidate fields:**
- `rotoballerVerdict?` — start/lean_start/neutral/lean_sit/sit from Rotoballer
- `rotoballerGrade?` — numeric grade (0-100) from Rotoballer
- `rotoballerSourceUrl?` — source URL for attribution
- `pickupDeadline?` — ISO date string of latest Tue/Fri before game date

**New StreamingResult field:**
- `rotoballerSource?` — article title, URL, and scraped-at timestamp

**New constructor parameter:**
- `private rotoballerAdapter?: RotoballerAdapter` — optional, no breaking change

**`getPickupDeadline(gameDate)` helper:**
- Walks backwards from day before game date, up to 7 days
- Returns latest Tuesday (dow=2) or Friday (dow=5) found
- Returns `undefined` if none found in window

**Filtering pipeline (after candidate building):**
1. Keep only candidates with a valid `pickupDeadline` (Tue/Fri window exists)
2. If Rotoballer rankings available: keep only `start` or `lean_start` verdicts
3. If Rotoballer returns empty: skip verdict filter entirely (graceful degradation)

**Name matching:**
- Replaced inline `normalize = (name) => name.toLowerCase().replace(/[^a-z]/g, "")`
- Now uses `normalizeName` from sit-start-advisor.ts (NFD decomposition, strips diacritics)

### API Route Updates (streaming.ts)

- Imports and instantiates `RotoballerAdapter(request.log)`
- Passes adapter as 4th arg: `new StreamingPitcherAgent(db, mlbAdapter, request.log, rotoballerAdapter)`
- Maps new fields to response: `rotoballerVerdict`, `rotoballerGrade`, `rotoballerSourceUrl`, `pickupDeadline`
- Includes `rotoballerSource` metadata at top level of response

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The streaming endpoint now fully passes Rotoballer verdict and pickup deadline data. The frontend rendering of these new fields is handled in plan 02.

## Self-Check: PASSED

Files verified:
- packages/backend/src/agents/streaming-pitcher.ts — FOUND
- packages/backend/src/api/streaming.ts — FOUND

Commits verified:
- 3bc4a55 — FOUND (feat(78-01): extend StreamingPitcherAgent...)
- 1957c00 — FOUND (feat(78-01): wire RotoballerAdapter...)

TypeScript: zero errors (`npx tsc --noEmit --project packages/backend/tsconfig.json`)
