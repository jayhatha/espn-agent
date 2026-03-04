---
phase: quick-28
plan: "01"
subsystem: extension
tags: [extension, draft, api-client, pitcherlist, espn]
dependency_graph:
  requires: []
  provides: [getDraftBoardData, pitcherlist-rankings.json]
  affects: [getRankings, getAuctionValues]
tech_stack:
  added: []
  patterns: [bundled-json-assets, request-deduplication, name-normalization]
key_files:
  created:
    - packages/extension/assets/pitcherlist-rankings.json
  modified:
    - packages/extension/lib/api-client.ts
decisions:
  - "pitcherlist-rankings.json bundled as static JSON asset — same pattern as baseline-rankings.json, enables offline PitcherList tier matching without build-time TS import"
  - "normalizeName() uses NFD (not NFKD) matching draft board page behavior — NFD strips diacritics while preserving letter characters; NFKD does additional compatibility decomposition that changes behavior for name matching"
  - "getDraftBoardData() wrapped in dedupedRequest with key 'draftBoardData' — prevents duplicate in-flight requests when getRankings and getAuctionValues are called simultaneously"
  - "tier: 99 for unmatched players — sentinel value distinguishes ranked-but-no-tier-match from explicitly ranked players; 99 is visually distinct in UI"
  - "fallback chain: draft board -> VBD endpoints -> baseline JSON (rankings) / empty (auction) — preserves existing fallback behavior while adding better primary data source"
metrics:
  duration: 8min
  completed: "2026-03-04T06:52:20Z"
  tasks: 1
  files_created: 1
  files_modified: 1
---

# Quick Task 28: Update Extension to Rely on Draft Board Summary

Extension now fetches draft data from /api/draft/espn and merges with bundled PitcherList tier rankings as primary data source, with fallback to VBD endpoints and baseline JSON.

## What Was Built

**pitcherlist-rankings.json** — Bundled static JSON asset containing all PitcherList ranking data extracted from the frontend's rankings-data.ts:
- 429 starting pitchers (SP) with tier, tierName, handedness, team
- 150 hitters with tier and tierName
- 300 relievers (RP) with tier and tierName

**getDraftBoardData()** — New exported function in api-client.ts that:
1. Fetches `/api/draft/espn?limit=500` from backend (same endpoint as admin draft board page)
2. Builds lookup maps for SP/Hitter/RP from bundled PitcherList rankings using `normalizeName()`
3. Matches each ESPN player against PitcherList via exact normalized name, then lastName fallback
4. Returns `{ rankings: PlayerRanking[], auctionValues: AuctionValue[] }` or null on failure

**normalizeName()** — New helper using NFD normalization (matches draft board page logic):
```typescript
function normalizeName(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z\s]/g, "").toLowerCase().trim();
}
```

**Updated getRankings()** — Now tries `getDraftBoardData()` first:
- On success: returns rankings with PitcherList tier data merged in
- On failure/null: logs "[API Client] Draft board data unavailable, falling back to VBD" and continues with existing VBD endpoint logic
- Last resort: baseline-rankings.json

**Updated getAuctionValues()** — Same pattern:
- On success: returns ESPN pre-draft auction values from draft board data
- On failure/null: falls back to VBD /api/draft/auction endpoint

## Key Decisions Made

1. **NFD vs NFKD normalization**: Used NFD to match the draft board page's `normalizeName()` function exactly. The existing `normalizeText()` uses NFKD and is kept for league name matching (different purpose).

2. **tier: 99 for unmatched players**: Players not found in any PitcherList map get tier 99 as a sentinel value indicating "unranked by PitcherList" rather than tier 0 which could be confused with a valid tier.

3. **dedupedRequest key "draftBoardData"**: Single shared dedup key since both getRankings and getAuctionValues call getDraftBoardData — prevents double fetch when called in rapid succession during draft initialization.

4. **vbdScore: espnAuctionValue**: For the PlayerRanking's vbdScore field, ESPN's pre-draft auction value is used as a proxy score. This is reasonable since auction value correlates with projected performance value.

## Verification Results

- pitcherlist-rankings.json: 429 SP, 150 Hitters, 300 RP - all entries from rankings-data.ts
- getDraftBoardData exported and called in both getRankings() and getAuctionValues()
- TypeScript compilation: pre-existing errors only (all from existing code, none from new code)
- Fallback chain confirmed: draft board -> VBD endpoints -> baseline JSON / empty

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- pitcherlist-rankings.json: FOUND
- api-client.ts: FOUND
- Commit d0ac457: FOUND
