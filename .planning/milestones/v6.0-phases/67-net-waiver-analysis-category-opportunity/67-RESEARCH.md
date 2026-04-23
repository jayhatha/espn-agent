# Research: Phase 67 — Net Waiver Analysis + Category Opportunity

## Phase Goal

Waiver recommendations show real roto-point delta (including the drop side) and a category opportunity map prioritizes which categories to target.

## Requirements

WAIVER-01, WAIVER-02, WAIVER-03, WAIVER-04, WAIVER-05, ROTO-04, ROTO-06

## Current State Analysis

### WaiverRecommendationAgent (HIGH confidence)

**File:** `packages/backend/src/agents/waiver-recommendation.ts`

The agent already has a functional `simulateSwap()` method that:
- Fetches all teams' projected category values
- Computes counting stat deltas (add - drop)
- Recomputes rate stats via `calculateFinalRate()` using component math
- Re-ranks all teams with the simulated new value
- Computes roto point delta per category
- Returns `deltaOverallPoints` as sum of per-category point changes

**Key finding:** The CLAUDE.md says `deltaOverallPoints` returns hardcoded 0.5, but the actual code does NOT have this hardcode. The `simulateSwap()` method performs real computation. However, the Known Issue #1 (free agent pool never fetched from ESPN) combined with the four-tier fallback strategy means the agent may produce incomplete results when no free agents are available.

The agent already supports:
- Per-category breakdown with `categoryImpacts` (deltaRank, deltaPoints)
- Rate stat component math via `calculateFinalRate()`
- Position eligibility validation
- Filtering by pitcher/batter type per category

### What's Missing (WAIVER-01 through WAIVER-05)

1. **WAIVER-04 (hardcoded 0.5):** The actual code computes real deltas, but CLAUDE.md/requirements still say "fix hardcoded 0.5." Need to verify the code path is exercised correctly and the requirement can be marked complete.

2. **WAIVER-03 (marginal analysis label):** The explanation string exists (`generateExplanation()`) but doesn't produce labels like "this move gets you +N roto points in category X." Need to enhance the explanation format.

3. **WAIVER-02 (per-category breakdown):** Already implemented in `categoryImpacts`. The frontend waivers page already renders this via `renderCategoryImpactTable()`. May need UI polish to show which categories improve AND which decline (currently filters to non-zero only).

4. **WAIVER-05 (rate stat component math):** Already implemented. `simulateSwap()` handles RATE categories with component-based recalculation.

5. **WAIVER-01 (net roto point delta):** Already accounts for both add and drop. The simulation subtracts drop components and adds add components.

### Category Opportunity Map (ROTO-04, ROTO-06)

**Existing foundation:** `computeMarginalGains()` in `packages/shared/src/formulas.ts`
- Already computes gap-to-next-rank per category
- Returns `MarginalGain[]` with gap, teamAbove, currentRank, potentialPointsGain
- Sorted by smallest gap first (cheapest improvement)

**What's missing for ROTO-04 (category opportunity map):**
- No "difficulty rating" — need to rate how hard it is to close each gap
- No +2 roto point analysis (only computes gap to next rank, not two ranks up)
- No dedicated UI section — the standings page has gap detail but not a standalone opportunity map

**What's missing for ROTO-06 (standings points at risk):**
- No analysis of categories where points could be LOST (teams closing from below)
- Need to check teams immediately below and compute their gap
- No UI for "at risk" summary

### Frontend State

**Waivers page** (`packages/frontend/src/app/leagues/[id]/waivers/page.tsx`):
- Full page with AI recommendations and manual evaluation modes
- Already shows per-category breakdown table
- Uses `groupByTopCategory()` to organize recommendations by most impactful category
- Already has dark mode styling applied (Phase 65)

**Standings page** (`packages/frontend/src/app/leagues/[id]/standings/page.tsx`):
- Already uses `computeMarginalGains()` from shared
- Has `GapDetailRow` component for expandable gap info
- Has `CategoryPaceBar` component

### API Layer

- `GET /api/leagues/:id/teams/:teamId/waivers/recommendations` — returns recommendations with categoryImpacts
- `POST /api/leagues/:id/teams/:teamId/waivers/evaluate` — evaluates specific add/drop
- `GET /api/leagues/:id/standings/projected` — returns projected standings by category

All API endpoints needed already exist. No new endpoints required.

## Architecture Decisions

### Backend Changes (Minimal)

1. **Enhance `generateExplanation()`** to produce WAIVER-03 format: "this move gets you +N roto points in category X"
2. **Add difficulty rating** to `computeMarginalGains()` return type — based on gap relative to average category spread
3. **Add "at risk" analysis** — compute teams below and their gap, flag categories where another team is close to overtaking
4. **No new endpoints needed** — all data flows through existing APIs

### Frontend Changes

1. **Waivers page:** Enhance recommendation cards to prominently show "this move gets you +N roto points in category X" label
2. **Standings page:** Add category opportunity map section and "points at risk" summary
3. **All UI already dark-mode styled** from Phase 65

## Pitfalls

1. **Free agent pool empty:** Known Issue #1. The four-tier fallback in WaiverRecommendationAgent handles this gracefully. Not blocking for Phase 67 — the math works when free agents exist.
2. **Component math edge cases:** Division by zero in rate stats already guarded in `calculateFinalRate()`.
3. **Performance:** `simulateSwap()` runs per free-agent × roster-player combination. Already O(n*m). No change needed.

## Scope Assessment

This phase is smaller than expected because:
- The backend waiver simulation is already implemented with real component math
- The hardcoded 0.5 noted in CLAUDE.md appears to have been fixed already
- The frontend already renders per-category breakdowns
- `computeMarginalGains()` already exists in shared

Primary work:
1. Backend: Enhance explanation labels, add difficulty rating, add at-risk analysis
2. Frontend: Category opportunity map UI, at-risk summary, enhanced waiver labels

## RESEARCH COMPLETE
