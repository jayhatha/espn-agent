# Quick Task 77: Fix extension not re-scraping roster on reload

## Goal
On extension reload, picks that completed during the reload window are missed because
`skipInitialScan: true` prevents DOM scanning and the MutationObserver only catches
new mutations, not already-rendered picks.

## Root Cause
Same-draft reload flow:
1. Zustand persist restores `allPicks` from chrome.storage (stale)
2. `statePreserved = true` → `observeDraftBoard({ skipInitialScan: true })`
3. No initial scan, no periodic scan — only MutationObserver for new DOM mutations
4. Picks that completed during reload are already rendered → never trigger a mutation
5. `allPicks.length` unchanged → ideal roster and simulation caches never invalidate

## Fix
Added reconciliation scan after MutationObserver setup: scan DOM for all completed
picks, filter out any already in persisted `allPicks` (by playerId or normalized name),
process only the missed picks. Safe because:
- Only truly new picks are processed (no contamination from re-parsing old picks)
- `addPick()` also deduplicates as a second safety net
- `alreadyInRoster` check prevents double-adding to myRoster

## Status: EXECUTED
