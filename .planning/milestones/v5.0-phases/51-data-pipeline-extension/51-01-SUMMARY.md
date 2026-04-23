---
phase: "51"
plan: "01"
name: "Data Pipeline for Extension"
subsystem: extension
tags: [csv-parser, popup-ui, data-import]
dependency-graph:
  requires: []
  provides: [csv-import, fangraphs-csv-parser]
  affects: [extension-popup, draft-state]
tech-stack:
  added: []
  patterns: [client-side-csv-parsing, popup-tab-ui]
key-files:
  created:
    - packages/extension/lib/csv-parser.ts
  modified:
    - packages/extension/entrypoints/popup/index.tsx
decisions:
  - Client-side CSV parsing (no backend needed for data import)
  - Merge hitter/pitcher data separately to allow incremental loading
  - Use normalizeName for auction value matching to existing rankings
metrics:
  duration: 171s
  completed: "2026-03-15T23:33:36Z"
---

# Phase 51 Plan 01: Data Pipeline for Extension Summary

Client-side FanGraphs CSV parser with Data tab in extension popup for loading projections without backend.

## What Was Built

### CSV Parser (`packages/extension/lib/csv-parser.ts`)
- `parseFanGraphsBatterCSV()` -- parses FanGraphs Depth Charts RoS hitter CSV with columns like Name, AB, H, HR, R, RBI, SB, BB, AVG, OBP, SLG, OPS, WAR, playerid
- `parseFanGraphsPitcherCSV()` -- parses FanGraphs pitcher CSV with W, SV, ERA, IP, SO, WHIP, K/9 columns
- `parseESPNAuctionCSV()` -- parses any Name + Value CSV with auto-detection of value column names
- Handles quoted fields, various FanGraphs column capitalizations, and auto-detects pitcher positions from GS/SV stats
- Maps parsed data to `PlayerRanking[]` and `AuctionValue[]` formats for Zustand store

### Data Tab in Popup (`packages/extension/entrypoints/popup/index.tsx`)
- Added third tab (Data) alongside Settings and Rankings
- Three textarea + button sections: hitter CSV, pitcher CSV, auction values CSV
- Shows current data counts (rankings and auction values loaded)
- Status messages (success/error) after each load operation
- Intelligently merges data: loading hitters preserves existing pitcher data and vice versa
- Auction values matched to rankings by normalized player name

## Commits

| Task | Description | Commit |
|------|------------|--------|
| 1 | CSV parser utility | 886e20c |
| 2-3 | Data tab + build verification | 24e1eb5 |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- [x] `pnpm --filter extension build` succeeds (1.25 MB total, 3.2s)
- [x] CSV parser handles FanGraphs CSV format correctly
- [x] Popup has 3 tabs: Settings, Rankings, Data
- [x] Pasting CSV and clicking Load stores data in Zustand

## Self-Check: PASSED
