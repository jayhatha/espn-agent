---
phase: 78-streaming-picks
plan: "02"
subsystem: frontend
tags: [streaming, rotoballer, waiver-timing, badges, ui]
dependency_graph:
  requires:
    - packages/backend/src/api/streaming.ts (Plan 01 — rotoballerVerdict, rotoballerGrade, rotoballerSourceUrl, pickupDeadline, rotoballerSource fields)
  provides:
    - packages/frontend/src/app/leagues/[id]/streaming/page.tsx (verdict badges, claim-by dates, source attribution)
  affects:
    - Streaming tab visual presentation
tech_stack:
  added: []
  patterns:
    - Reuse existing getVerdictBadgeVariant() and formatVerdict() helpers (no duplication)
    - Conditional rendering for null-safe optional API fields
key_files:
  created: []
  modified:
    - packages/frontend/src/app/leagues/[id]/streaming/page.tsx
decisions:
  - Reused existing getVerdictBadgeVariant and formatVerdict — no new copies per D-06
  - Verdict badge and claim-by date placed inline in player info line (team/opponent/date row)
  - Rotoballer source attribution placed above candidate cards list as a link
metrics:
  duration_minutes: 3
  completed_date: "2026-03-27"
  tasks_completed: 1
  files_modified: 1
---

# Phase 78 Plan 02: Streaming Tab UI — Rotoballer Verdicts and Pickup Timing Summary

**One-liner:** Streaming candidate cards now display Rotoballer verdict badges with numeric grades, "Claim by" pickup deadline dates, and a Rotoballer source attribution link above the list.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend StreamingCandidate type and add verdict + claim-by display to candidate cards | f96a321 | packages/frontend/src/app/leagues/[id]/streaming/page.tsx |

## What Was Built

### StreamingCandidate Interface Extensions (streaming/page.tsx)

**New fields added to `StreamingCandidate` interface:**
- `rotoballerVerdict: "start" | "lean_start" | "neutral" | "lean_sit" | "sit" | null`
- `rotoballerGrade: number | null`
- `rotoballerSourceUrl: string | null`
- `pickupDeadline: string | null`

**New field added to `StreamingData` interface:**
- `rotoballerSource: { articleTitle: string; articleUrl: string; scrapedAt: string } | null`

### UI Additions

**Rotoballer source attribution:**
- Renders above the candidate cards list when `data.rotoballerSource` is non-null
- Displays as a styled `<a>` link: "Rotoballer: {articleTitle}" linking to the article URL

**Verdict badge per candidate card:**
- Rendered inline in the player info line (team / opponent / date row)
- Uses existing `getVerdictBadgeVariant()` for color-coding (positive/info/default/warning/negative)
- Uses existing `formatVerdict()` for label text (Start / Lean Start / Toss-Up / Lean Sit / Sit)
- Shows grade in parentheses: `Start (72)` when `rotoballerGrade` is non-null

**"Claim by" pickup deadline per candidate card:**
- Rendered inline after the verdict badge (or after date if no verdict)
- Formatted via existing `formatDate()`: "Claim by Mar 27"

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All fields are wired from the API response (Plan 01 backend) to the UI. No hardcoded or placeholder data.

## Self-Check: PASSED

Files verified:
- packages/frontend/src/app/leagues/[id]/streaming/page.tsx — FOUND

Commits verified:
- f96a321 — FOUND (feat(78-02): add Rotoballer verdict badges...)

TypeScript: zero errors (`npx tsc --noEmit --project packages/frontend/tsconfig.json`)

Grep confirms:
- `rotoballerVerdict:` in StreamingCandidate interface — line 38
- `pickupDeadline:` in StreamingCandidate interface — line 41
- `rotoballerSource:` in StreamingData interface — line 49
- `data.rotoballerSource` conditional with `<a>` tag — line 553
- `candidate.rotoballerVerdict` with `getVerdictBadgeVariant` — line 595/598
- `Claim by` text in JSX — line 610
- Only ONE definition of `getVerdictBadgeVariant` — confirmed
