---
status: resolved
trigger: "projections-stale-after-upload"
created: 2026-03-29T00:00:00Z
updated: 2026-03-29T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — snapshot orchestrator ignores projections_run.staleness field
test: read snapshot-orchestrator.ts isDegraded logic
expecting: confirmed that staleness field is never checked
next_action: DONE — fix applied

## Symptoms

expected: After uploading a FanGraphs projections CSV, the projections should show as "fresh" (not stale)
actual: Projections still show as "stale" even right after a successful upload
errors: No error messages — the upload succeeds but the staleness indicator remains
reproduction: Upload a FanGraphs projections CSV, then check the league dashboard or any page that shows projections staleness
started: User says "just uploaded them" so it was working at some point or this is a new observation

## Eliminated

- hypothesis: ingest() staleness marking logic is broken
  evidence: The ingest() method correctly checks for existing batters/pitchers in DB and sets staleness to "fresh" when both are present
  timestamp: 2026-03-29

- hypothesis: upload route fails to call ingest()
  evidence: Upload route correctly calls agent.ingest() and the result is used
  timestamp: 2026-03-29

## Evidence

- timestamp: 2026-03-29
  checked: snapshot-orchestrator.ts lines 166-173
  found: isDegraded computed as `!projectionsRun || projectionsRun.as_of_date !== snapshotDate` — never checks projections_run.staleness
  implication: When only one file (batters or pitchers) is uploaded, the projections_run.staleness is "stale" but the orchestrator ignores this and marks the snapshot as is_degraded=false (non-degraded)

- timestamp: 2026-03-29
  checked: projections.ts triggerDegradedLeagueResnapshots
  found: After first file upload triggers a re-snapshot with is_degraded=false, the second file upload finds no degraded leagues (because is_degraded was incorrectly cleared) and does NOT fire another re-snapshot
  implication: Even after both files are uploaded and staleness="fresh", projected standings are still computed from incomplete data (first-upload partial projections)

- timestamp: 2026-03-29
  checked: admin/page.tsx and projections-ingest.ts
  found: Admin page shows projections_run.staleness directly; after second upload sets staleness="fresh", admin page shows fresh correctly — but league dashboard still shows non-degraded because no re-snapshot fires to recompute projected standings
  implication: Admin page staleness indicator clears correctly, but projected standings data remains stale silently

- timestamp: 2026-03-29
  checked: frontend projections/page.tsx
  found: The per-league projections upload page only supports ONE file at a time; instructions tell users to "upload both files separately"
  implication: Common user flow is: upload batters → see stale → upload pitchers → still see stale (because re-snapshot incorrectly cleared degraded flag on first upload)

## Resolution

root_cause: Two compounding bugs:
  1. snapshot-orchestrator.ts isDegraded check ignores projections_run.staleness column — uses only as_of_date comparison. A partial upload (only batters or only pitchers) creates a projections_run for today with staleness="stale", but the orchestrator marks the snapshot as non-degraded because as_of_date===snapshotDate.
  2. triggerDegradedLeagueResnapshots only queries leagues with is_degraded=true. After the first partial upload triggers a re-snapshot that incorrectly clears is_degraded, the second upload (completing the data) finds no degraded leagues and skips the re-snapshot — leaving projected standings computed from only half the projections.

fix:
  1. Added `projections_run.staleness !== "fresh"` to the isDegraded check in snapshot-orchestrator.ts. Now a run with staleness="stale" (partial upload) correctly marks the snapshot as degraded with reason "projections_stale".
  2. Modified triggerDegradedLeagueResnapshots in projections.ts to accept a projectionsNowFresh boolean. When projections just became fully fresh (both files uploaded), re-snapshots ALL leagues with a snapshot for today (not just degraded ones), ensuring projected standings are recomputed with complete data. When projections are still partial, only re-snapshots degraded leagues (original behavior).
  3. Both upload endpoints (/api/projections/upload and /api/projections/upload-batch) now query the projections_run.staleness after ingest and pass projectionsNowFresh to triggerDegradedLeagueResnapshots.

verification: TypeScript compilation passes with no errors (pnpm --filter backend exec tsc --noEmit)
files_changed:
  - packages/backend/src/agents/snapshot-orchestrator.ts
  - packages/backend/src/api/projections.ts
