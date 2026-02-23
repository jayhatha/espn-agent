---
phase: quick
plan: 2
subsystem: trade-recommendations
tags: [positional-value, roster-construction, trade-scoring, scarcity]
completed: 2026-02-23T00:49:56Z
duration: 3min

dependency_graph:
  requires: [quick-01]
  provides: [positional-aware-trade-scoring]
  affects: [trade-candidate-generation, trade-suggestions-ui]

tech_stack:
  added: []
  patterns:
    - Positional scarcity scoring with constant multipliers
    - Roster depth analysis via depth ratios (count/slots)
    - Additive positional bonus to value delta for ranking
    - Optional positional context for backward compatibility

key_files:
  created: []
  modified:
    - packages/backend/src/agents/trade-recommendation.ts
    - packages/frontend/src/app/leagues/[id]/trades/page.tsx

decisions:
  - name: Positional scarcity values
    rationale: "C and RP are scarce (1.5, 1.3), OF is deep (0.8), based on typical fantasy baseball player pools"
    alternatives: ["Dynamic scarcity from league data", "No scarcity weighting"]

  - name: Depth threshold at 1.5x roster slots
    rationale: "Teams with fewer than 1.5 eligible players per slot are considered thin at that position"
    alternatives: ["2x threshold (more conservative)", "1x threshold (only unfillable slots)"]

  - name: Positional bonus capped at 3.0 points
    rationale: "Prevents positional value from overwhelming stat-based value, keeps trades balanced"
    alternatives: ["No cap (pure positional value)", "Lower cap at 2.0"]

  - name: Additive bonus in pre-filter sorting
    rationale: "Combines value delta + positional bonus for ranking, surfaces positional trades earlier"
    alternatives: ["Separate positional-only queue", "Multiply instead of add"]

metrics:
  tasks_completed: 2
  commits: 2
  files_modified: 2
---

# Quick Task 2: Add Positional Value to Trade Recommendations

**One-liner:** Trade recommendations now prioritize filling roster gaps and positional scarcity (C, RP valued higher), not just raw roto point deltas.

## Overview

Enhanced `TradeRecommendationAgent.generateTradeCandidates()` to incorporate roster construction awareness. Trades that address positional needs (e.g., acquiring a catcher when thin at C) or exploit positional scarcity now rank higher than equivalent pure-stat trades. Frontend surfaces this context via badges ("Fills need: C", "High positional value") and roster needs summary.

## Tasks Executed

### Task 1: Add positional value scoring to TradeRecommendationAgent

**What was done:**
- Added `POSITION_SCARCITY` constant map with multipliers (C: 1.5, SS: 1.2, OF: 0.8, etc.)
- Created `PositionalContext` interface with `positionGained`, `positionLost`, `fillsNeed`, `needPositions`, `positionalBonus`
- Implemented `analyzeRosterDepth()` to compute depth ratios (count/slots) for each position
- Implemented `computePositionalBonus()` to score trades based on need-filling and scarcity
- Modified `generateTradeCandidates()` to:
  - Fetch roster slots from league settings
  - Analyze user roster depth before candidate generation
  - Compute positional bonus for each trade pair
  - Sort by `valueDelta + positionalBonus` instead of pure value delta
  - Attach `positionalContext` to each `TradeCandidate`
- Enhanced `generateTradeExplanation()` to mention positional context ("Fills a need at C", "Trading from depth at OF")

**Verification:**
- Backend build passes with no TypeScript errors
- `TradeCandidate` interface now includes optional `positionalContext` field
- Positional bonus correctly computed and added to ranking

**Files modified:**
- `packages/backend/src/agents/trade-recommendation.ts` (+200 lines)

**Commit:** 78969c1

---

### Task 2: Surface positional context in trade suggestions UI

**What was done:**
- Added `PositionalContext` interface to frontend (matching backend)
- Extended `TradeCandidate` interface with optional `positionalContext` field
- Added roster needs summary above AI suggestions:
  - Shows "Positions of need: C, SS" if first candidate has need positions
  - Explains "Trades filling these positions are ranked higher"
- Added positional badges to each AI suggestion card:
  - "Fills need: {positions}" badge (blue) when trade addresses a thin position
  - "High positional value" badge (purple) when `positionalBonus >= 1.0`
- All changes additive and backward-compatible (UI degrades gracefully without context)

**Verification:**
- Frontend build passes with no TypeScript errors
- Positional badges render conditionally based on `positionalContext` presence
- Manual trade builder (Build & Analyze tab) unaffected

**Files modified:**
- `packages/frontend/src/app/leagues/[id]/trades/page.tsx` (+48 lines)

**Commit:** 846736e

---

## Deviations from Plan

None - plan executed exactly as written.

## Technical Notes

**Positional Scoring Logic:**
1. `analyzeRosterDepth()`: For each roster slot position (excluding BN, IL, UTIL), count eligible players and compute `depthRatio = count / slots`
2. Positions with `depthRatio < 1.5` are marked as "need positions"
3. For each trade candidate:
   - If received player fills a need position: add `POSITION_SCARCITY[pos] * 0.5`
   - If also trading from depth (`depthRatio > 2.5`): add another 0.5
   - Cap total bonus at 3.0 to prevent overwhelming stat-based value
4. Sort candidates by `valueDelta + positionalBonus` (combined score)

**Backward Compatibility:**
- `positionalContext` is optional on `TradeCandidate` interface
- Frontend checks for presence before rendering badges
- Manual trade builder path (`analyzeTradeImpact`) unchanged (no positional context added to `TradeImpactAnalysis`)

**Scarcity Multipliers Rationale:**
- **C: 1.5** — Very scarce, few quality catchers, often 1-2 slots
- **RP: 1.3** — Quality closers are rare, crucial for SV/HLD categories
- **SS: 1.2** — Moderately scarce premium position
- **2B: 1.1** — Slightly scarce
- **3B, SP, P: 1.0** — Average availability
- **1B: 0.9** — Deep position pool
- **OF: 0.8** — Very deep, many roster slots and eligible players
- **UTIL: 0.5** — Not position-specific, any player eligible

## Output Artifacts

**Created:**
- `.planning/quick/2-update-trade-recommendations-to-consider/2-SUMMARY.md` (this file)

**Modified:**
- `packages/backend/src/agents/trade-recommendation.ts` — positional scoring logic
- `packages/frontend/src/app/leagues/[id]/trades/page.tsx` — positional context UI

## Self-Check

Verifying claims:

### Backend Changes
- ✓ FOUND: packages/backend/src/agents/trade-recommendation.ts
- ✓ FOUND: PositionalContext interface
- ✓ FOUND: positionalContext field in TradeCandidate
- ✓ FOUND: POSITION_SCARCITY constant

### Frontend Changes
- ✓ FOUND: packages/frontend/src/app/leagues/[id]/trades/page.tsx

### Commits
- ✓ FOUND: 78969c1 (Task 1 commit)
- ✓ FOUND: 846736e (Task 2 commit)

### Build Verification
- ✓ Backend builds successfully with no TypeScript errors
- ✓ Frontend builds successfully with no TypeScript errors

## Self-Check: PASSED

All files created, all commits exist, all builds pass. Plan execution complete.
