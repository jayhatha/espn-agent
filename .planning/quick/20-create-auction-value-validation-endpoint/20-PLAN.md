---
phase: quick-20
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/backend/src/adapters/espn.ts
  - packages/backend/src/api/draft.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "Admin can fetch ESPN's pre-draft auction values from their API"
    - "Admin can compare ESPN values vs our VBD values for the same players"
    - "Admin sees delta statistics showing how our values differ from ESPN's baseline"
  artifacts:
    - path: "packages/backend/src/adapters/espn.ts"
      provides: "fetchPreDraftAuctionValues method to get ESPN's default auction values"
      min_lines: 30
    - path: "packages/backend/src/api/draft.ts"
      provides: "GET /api/leagues/:leagueId/draft/auction/validate endpoint"
      exports: ["GET"]
  key_links:
    - from: "packages/backend/src/api/draft.ts"
      to: "packages/backend/src/adapters/espn.ts"
      via: "espnAdapter.fetchPreDraftAuctionValues()"
      pattern: "fetchPreDraftAuctionValues"
    - from: "packages/backend/src/api/draft.ts"
      to: "packages/backend/src/agents/auction-valuation.ts"
      via: "auctionAgent.getValuations()"
      pattern: "getValuations"
---

<objective>
Create validation endpoint comparing our VBD-based auction values against ESPN's pre-draft auction values

Purpose: Enable validation that our auction valuation logic produces competitive results against ESPN's baseline, helping diagnose potential issues and calibrate expectations for draft assistant users

Output: GET /api/leagues/:leagueId/draft/auction/validate endpoint returning side-by-side comparison with delta statistics
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md

# Prior work on auction valuation
@.planning/quick/8-research-and-fix-auction-valuation-issue/8-SUMMARY.md

# Current implementations
@packages/backend/src/adapters/espn.ts
@packages/backend/src/agents/auction-valuation.ts
@packages/backend/src/api/draft.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add ESPN pre-draft auction values fetch to ESPNAdapter</name>
  <files>packages/backend/src/adapters/espn.ts</files>
  <action>
Add fetchPreDraftAuctionValues method to ESPNAdapter class that retrieves ESPN's default pre-draft auction values.

ESPN API details:
- View: "kona_player_info" (same view used for free agents, already integrated)
- Response contains players array where each player has an `auctionValueAverage` field
- Only available players (positive auction value) should be returned
- Parse player ID, name, positions, and ESPN's auction value

Method signature:
```typescript
async fetchPreDraftAuctionValues(options: {
  leagueId: number;
  season: number;
  auth?: ESPNAuthCookies;
}): Promise<Array<{
  playerId: number;
  playerName: string;
  positions: string[];
  espnAuctionValue: number;
}>>
```

Implementation notes:
- Reuse existing fetchLeague() infrastructure with kona_player_info view
- Apply throttling via throttleEspnCall() (already in place for all ESPN methods)
- Use LRU cache with 1-hour TTL for pre-draft values (rarely change)
- Parse positions from eligibleSlots using ESPN_POSITION_MAP (existing pattern)
- Filter to players with auctionValueAverage > 0 (skip unranked players)
- Sort by espnAuctionValue descending for easier comparison
- Use existing schema validation pattern (graceful degradation on missing fields)

Return empty array if kona_player_info view unavailable or no auction values found.
  </action>
  <verify>
TypeScript compiles without errors:
```bash
cd packages/backend && npx tsc --noEmit
```

Method exists in ESPNAdapter class and follows existing patterns for throttling, caching, and parsing.
  </verify>
  <done>fetchPreDraftAuctionValues method exists, returns array of {playerId, playerName, positions, espnAuctionValue}, uses throttling and caching</done>
</task>

<task type="auto">
  <name>Task 2: Create auction value validation endpoint</name>
  <files>packages/backend/src/api/draft.ts</files>
  <action>
Add GET /api/leagues/:leagueId/draft/auction/validate endpoint to draft.ts that compares ESPN auction values vs our VBD values.

Endpoint logic:
1. Parse leagueId from params, optional limit query param (default 100)
2. Authenticate and validate league access (existing middleware)
3. Fetch ESPN pre-draft auction values via ESPNAdapter.fetchPreDraftAuctionValues()
4. Fetch our VBD auction values via AuctionValuationAgent.getValuations() (same league config)
5. Join on playerId, filter to players present in both datasets
6. Calculate deltas: absolute difference, percentage difference, our/ESPN ratio
7. Compute summary statistics: mean delta, median delta, RMSE, correlation coefficient
8. Return comparison array plus summary stats

Response format:
```typescript
{
  comparisons: Array<{
    playerId: number;
    playerName: string;
    positions: string[];
    espnValue: number;
    ourValue: number;
    absoluteDelta: number;  // ourValue - espnValue
    percentDelta: number;   // (ourValue - espnValue) / espnValue * 100
    ratio: number;          // ourValue / espnValue
  }>,
  summary: {
    totalCompared: number;
    meanDelta: number;
    medianDelta: number;
    rmse: number,           // Root mean squared error
    correlation: number,    // Pearson correlation coefficient
    ourTopPlayer: { name: string, value: number },
    espnTopPlayer: { name: string, value: number }
  },
  meta: {
    leagueId: number,
    totalTeams: number,
    budget: number,
    generatedAt: string
  }
}
```

Statistical calculations:
- Mean delta: average of all absoluteDelta values
- Median delta: middle value of sorted absoluteDeltas
- RMSE: sqrt(sum((ourValue - espnValue)^2) / n)
- Correlation: Pearson r using standard formula (cov(our, espn) / (stddev(our) * stddev(espn)))

Edge cases:
- If ESPN returns no values: return 400 error "ESPN pre-draft auction values not available for this league"
- If no overlapping players: return 400 error "No common players found between ESPN and our valuations"
- If fewer than 10 players overlap: include warning in response

Use existing error handling patterns from other draft.ts endpoints. Add to draftRoutes function (not a separate file).
  </action>
  <verify>
TypeScript compiles without errors:
```bash
cd packages/backend && npx tsc --noEmit
```

Endpoint registered in draftRoutes function with proper type annotations and middleware. Statistical calculations implemented correctly (correlation formula matches Pearson r definition).
  </verify>
  <done>GET /api/leagues/:leagueId/draft/auction/validate endpoint exists, returns comparisons array with deltas and summary statistics, handles edge cases gracefully</done>
</task>

<task type="auto">
  <name>Task 3: Manual validation test</name>
  <files>packages/backend/src/api/draft.ts</files>
  <action>
Start backend server and test the validation endpoint manually to verify output format and calculations.

Test procedure:
1. Start backend: `cd packages/backend && npm run dev`
2. Pick an existing league ID from database (use psql or check STATE.md for known league)
3. Call endpoint: `curl http://localhost:3001/api/leagues/{leagueId}/draft/auction/validate?limit=20`
4. Verify response structure matches documented format
5. Check summary statistics are reasonable (correlation should be 0.5-0.95 if both systems work)
6. Spot-check 3-5 players manually: do deltas make sense given projection differences?

If ESPN values not available (400 error), document in task output that validation requires ESPN to provide auctionValueAverage in their API response. This may require:
- Specific league settings (auction draft type enabled)
- Pre-draft timing (values may disappear after draft starts)
- League visibility (public vs private)

No code changes required in this task — purely manual verification. Document findings in commit message.
  </action>
  <verify>
Manual test completed with documented results. Either:
- Success: Response contains comparisons array with reasonable deltas and summary stats
- Known limitation: ESPN doesn't provide auction values for this league type/timing (document in commit)
  </verify>
  <done>Validation endpoint tested manually, results documented, edge cases identified if any</done>
</task>

</tasks>

<verification>
Overall validation checks:

1. **Code quality:**
   - TypeScript compiles without errors in packages/backend
   - New code follows existing patterns (throttling, caching, error handling)
   - No hardcoded values (use league config for teams/budget)

2. **Functionality:**
   - ESPNAdapter.fetchPreDraftAuctionValues returns player auction values from ESPN
   - Validation endpoint compares and computes deltas correctly
   - Statistical calculations are mathematically correct (mean, median, RMSE, correlation)

3. **Edge cases:**
   - Handles missing ESPN data gracefully (returns error, not crash)
   - Handles no overlapping players (returns error with explanation)
   - Handles small overlap (<10 players) with warning

4. **Integration:**
   - Uses existing AuctionValuationAgent (no duplication)
   - Uses existing ESPNAdapter infrastructure (throttling, caching, parsing)
   - Follows existing API patterns (middleware, error responses)
</verification>

<success_criteria>
**Measurable completion criteria:**

- [ ] ESPNAdapter has fetchPreDraftAuctionValues method that returns ESPN's auction values
- [ ] GET /api/leagues/:leagueId/draft/auction/validate endpoint exists and returns comparison data
- [ ] Response includes comparisons array with deltas (absolute, percent, ratio)
- [ ] Response includes summary statistics (mean, median, RMSE, correlation)
- [ ] TypeScript compiles without errors
- [ ] Manual test completed with results documented
- [ ] Edge cases handled (no ESPN data, no overlap, small overlap)
</success_criteria>

<output>
After completion, create `.planning/quick/20-create-auction-value-validation-endpoint/20-SUMMARY.md` documenting:
- Implementation approach (ESPN API details, calculation methods)
- Validation results (if ESPN data available, what were typical deltas?)
- Known limitations (if ESPN doesn't provide data for certain league configs)
- Usage instructions (when to use this endpoint, how to interpret results)
</output>
