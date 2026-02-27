# Quick Task 20: Auction Value Validation Endpoint

**Status:** ✅ Complete
**Date:** 2026-02-27
**Type:** New Feature

## Objective

Create a league-agnostic auction value validation endpoint that compares our VBD-based auction values against ESPN's pre-draft auction values and reports statistical differences.

## Changes Made

### 1. Added Generic Auction Validation Endpoint

**File:** `packages/backend/src/api/draft.ts`

Added `GET /api/draft/auction/validate` endpoint that:
- Takes draft configuration as query parameters (following the pattern of `/api/draft/rankings` and `/api/draft/auction`)
- Accepts ESPN league context (`espnLeagueId`, `espnSeason`, optional `espnSwid`/`espnS2` for auth)
- Fetches ESPN's pre-draft auction values using existing `ESPNAdapter.fetchPreDraftAuctionValues()`
- Generates our VBD-based valuations using `AuctionValuationAgent.getValuationsWithConfig()`
- Matches players between the two systems by `playerId`
- Computes comparison statistics:
  - Absolute delta (ourValue - espnValue)
  - Percent delta ((delta / espnValue) * 100)
  - Ratio (ourValue / espnValue)
- Returns summary statistics:
  - Mean/median delta
  - RMSE (Root Mean Squared Error)
  - Pearson correlation coefficient
  - Top players in each system
  - Warning if fewer than 10 overlapping players found

**Query Parameters:**
- `numTeams` (required): Number of teams in the league
- `categories` (required): JSON array of scoring categories
- `rosterSlots` (required): JSON object of roster slot counts
- `budget` (optional, default 260): Auction budget
- `minBid` (optional, default 1): Minimum bid amount
- `projectionsRunId` (optional): Specific projections run to use
- `limit` (optional, default 100): Max number of comparisons to return (sorted by largest absolute delta)
- `espnLeagueId` (required): ESPN league ID to fetch baseline values from
- `espnSeason` (required): ESPN season year
- `espnSwid` (optional): ESPN SWID cookie for private league auth
- `espnS2` (optional): ESPN espn_s2 cookie for private league auth

**Response Format:**
```json
{
  "comparisons": [
    {
      "playerId": 123,
      "playerName": "Player Name",
      "positions": ["OF"],
      "espnValue": 25,
      "ourValue": 28,
      "absoluteDelta": 3,
      "percentDelta": 12.0,
      "ratio": 1.12
    }
  ],
  "summary": {
    "totalCompared": 150,
    "meanDelta": 2.5,
    "medianDelta": 1.8,
    "rmse": 4.2,
    "correlation": 0.92,
    "ourTopPlayer": { "name": "Player A", "value": 45 },
    "espnTopPlayer": { "name": "Player B", "value": 42 }
  },
  "meta": {
    "totalTeams": 12,
    "budget": 260,
    "minBid": 1,
    "espnLeagueId": 456789,
    "espnSeason": 2025,
    "generatedAt": "2026-02-27T23:30:00.000Z"
  },
  "warning": "..."  // Optional, if fewer than 10 overlapping players
}
```

## Design Decisions

### Why League-Agnostic?

Following the established pattern in `draft.ts`:
- Existing endpoints: `/api/draft/rankings` and `/api/draft/auction` are league-agnostic
- They take draft configuration as query parameters instead of pulling from a stored league
- This allows validation without requiring a connected league in our database
- Consistent API design across all draft-related endpoints

### Why ESPN Context Required?

ESPN's pre-draft auction values are league-specific (they vary based on league settings and player pool). To fetch ESPN's baseline values, we need:
- `espnLeagueId`: To identify which ESPN league to query
- `espnSeason`: To specify which season's values
- Optional auth cookies: For private leagues

This allows users to:
1. Validate against their actual ESPN league's values
2. Compare different draft configurations against the same ESPN baseline
3. Test "what-if" scenarios with different team counts, categories, or budgets

### Comparison Sorting

Comparisons are sorted by **largest absolute delta** (descending) before applying the limit. This highlights:
- Players where our valuations differ most from ESPN's
- Potential overvalues and undervalues in our VBD methodology
- Edge cases that may need investigation

## Use Cases

1. **Calibration**: Verify our VBD calculations produce reasonable values compared to industry-standard ESPN baseline
2. **Debugging**: Identify systematic biases (e.g., "do we consistently overvalue power hitters?")
3. **Confidence**: Build trust in our valuations by showing correlation with ESPN's established system
4. **Discovery**: Find market inefficiencies where our analysis differs significantly from consensus

## Testing

### Build Verification
✅ Backend compiles without errors: `cd packages/backend && npm run build`

### Expected Behavior

**Valid Request:**
```bash
GET /api/draft/auction/validate?numTeams=12&categories=[...]&rosterSlots={...}&espnLeagueId=456789&espnSeason=2025
```
→ Returns comparison data with summary statistics

**Edge Cases:**
- No ESPN values available → 400 error with helpful message
- No overlapping players → 400 error
- Small overlap (<10 players) → Success with warning
- Missing ESPN context → 400 error "espnLeagueId and espnSeason required"
- Invalid budget/minBid → 400 error with validation message

## Future Enhancements

- **Position-specific validation**: Compare deltas by position group (SP vs RP, OF vs IF)
- **Tier analysis**: Show how our tiers align with ESPN's value clusters
- **Historical tracking**: Store validation results over time to monitor calibration drift
- **Visualization endpoint**: Return data formatted for charting (scatter plot of ESPN vs our values)
- **Batch validation**: Accept multiple ESPN leagues to aggregate correlation across different settings

## Verification

- [x] Backend builds successfully
- [x] Endpoint follows league-agnostic pattern from existing draft endpoints
- [x] Reuses `ESPNAdapter.fetchPreDraftAuctionValues()` (no duplicate logic)
- [x] Reuses `AuctionValuationAgent.getValuationsWithConfig()` (no duplicate logic)
- [x] Returns comprehensive comparison statistics (deltas, RMSE, correlation)
- [x] Handles edge cases (no ESPN data, no overlap, small sample)
- [x] Rate limited (50 requests/minute) to protect ESPN API
- [x] Consistent error handling with other draft endpoints

## Related Files

- **New endpoint:** `packages/backend/src/api/draft.ts` (lines 684-956)
- **Existing adapter method:** `packages/backend/src/adapters/espn.ts` (`fetchPreDraftAuctionValues()`)
- **Existing agent:** `packages/backend/src/agents/auction-valuation.ts`
- **Related endpoints:**
  - `/api/leagues/:leagueId/draft/auction/validate` (league-specific version, lines 419-682)
  - `/api/draft/rankings` (generic snake draft rankings)
  - `/api/draft/auction` (generic auction valuations)

## Commits

- Implementation: Backend auction validation endpoint
