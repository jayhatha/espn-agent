# Quick Task 106: Fix ASV Filter — Default Missing Players to $1

**Completed:** 2026-03-24
**Tasks:** 1/1

## Root Cause
The ASV file (tools/espn-predraft-values.json) only has 160 players. A league has ~364 rostered players. When either player in a trade pair was missing from the ASV file, `getAsvForPlayer` returned `null` and the entire ASV filter was skipped (line 573: "If either player has no ASV data, allow the trade"). Result: scrub-for-Ohtani trades still appeared.

## Fix
- Players not in the ASV file now default to $1 (minimum value) instead of null
- The ASV filter always runs — no more null-skip bypass
- A $1 player can only trade with players valued $1-$6 (within $5 absolute tolerance)
- Ohtani ($108) can only trade with players valued $76+ (within 30% relative tolerance)

## Files Changed
- `packages/backend/src/agents/trade-recommendation.ts` — defaulted null ASV to $1, removed null-skip bypass

## Note on Transaction Ingestion
Transaction ingestion is already implemented and wired into the snapshot pipeline (`fetchAndStoreTransactions` at line 1279). It runs on every snapshot. Pre-season there are simply no transactions to ingest. Once the season starts and FAAB claims happen, they'll be ingested automatically.
