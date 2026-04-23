---
status: partial
phase: 80-standings-swing-attribution
source: [80-01-SUMMARY.md, 80-02-SUMMARY.md, 80-03-SUMMARY.md]
started: 2026-03-31T20:00:00Z
updated: 2026-03-31T20:00:00Z
---

## Current Test

number: completed
name: Testing complete — remaining tests skipped to prioritize fixes
awaiting: n/a

## Tests

### 1. Swing Attribution API Endpoint
expected: Hit GET /api/leagues/:id/standings/swing?teamId=YOUR_TEAM_ID in browser or curl. Response is JSON with attribution_available (boolean), totalDelta (number), buckets object (actual_performance, projection_change, competitor_movement), and categoryBreakdown array. If only one snapshot exists, attribution_available=false.
result: pass

### 2. API Missing teamId Returns 400
expected: Hit GET /api/leagues/:id/standings/swing without teamId query param. Response should be HTTP 400 with an error message about missing teamId.
result: [pending]

### 3. "What Changed?" Panel on Projected Standings
expected: Navigate to a league's standings page, select "Projected" tab, and select your team. Below the standings table, a "What Changed?" card should appear showing the total roto point delta and three labeled bucket bars (Actual Performance, Projection Change, Competitor Movement) with their point values.
result: [pending]

### 4. Category Breakdown Table
expected: Inside the "What Changed?" panel, a table shows per-category rows (e.g., HR, ERA, SB) with the roto delta for each category and which bucket drove it. Categories with zero delta are filtered out. Rows are sorted by absolute delta descending.
result: [pending]

### 5. Panel Hidden When Not Significant
expected: If the total roto point delta between snapshots is less than 0.5 points, the "What Changed?" panel should NOT appear at all — no empty state, no collapsed card, just absent from the page.
result: [pending]

### 6. Panel Hidden on Non-Projected Tab
expected: Switch to the "Current" standings tab. The "What Changed?" panel should disappear. Switch back to "Projected" — it should reappear (if significant delta exists).
result: [pending]

## Summary

total: 6
passed: 1
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps

[none yet]
