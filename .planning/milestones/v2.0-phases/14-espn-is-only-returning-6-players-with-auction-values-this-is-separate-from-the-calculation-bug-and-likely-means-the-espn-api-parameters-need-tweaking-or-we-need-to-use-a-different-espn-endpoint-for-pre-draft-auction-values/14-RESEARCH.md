# Phase 14: ESPN Auction Values Bug Fix - Research

**Researched:** 2026-02-28
**Domain:** ESPN Fantasy Baseball API auction value retrieval
**Confidence:** MEDIUM-HIGH

## Summary

The issue of ESPN returning only 6 players with auction values stems from ESPN's default pagination limit of 50 players in the `kona_player_info` view, combined with the sparse nature of auction value data in `draftRanksByRankType.STANDARD.auctionValue`. The current implementation sets `limit: 500` in the x-fantasy-filter, but ESPN may only populate auction values for a subset of top players, or the data may not exist for leagues that aren't configured for auction drafts.

Investigation reveals multiple potential causes: (1) ESPN's default 50-player limit when x-fantasy-filter is not properly formatted, (2) auction values only populated for specific draft types or pre-draft states, (3) scoringPeriodId parameter requirements for accessing draft data, and (4) potential need for different ESPN API views or endpoints for comprehensive auction data.

**Primary recommendation:** Increase the x-fantasy-filter limit to 1500-2000 players, verify scoringPeriodId=1 is correctly set, add pagination with offset parameter to fetch all available players, log diagnostic information about response structure, and consider fetching from multiple ranking types (STANDARD, ROTO, PPR) as fallback.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| axios | Latest | HTTP client for ESPN API | Already in use, supports retry and request interceptors |
| axios-retry | Latest | Automatic retry with exponential backoff | Already integrated in createRetryableAxios utility |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lru-cache | Latest | Response caching | Already in use - 500 max items, 1-hour TTL |

**Note:** No new dependencies required. This is a bug fix using existing infrastructure.

## Architecture Patterns

### Recommended API Call Pattern

The current implementation in `fetchPreDraftAuctionValues()` follows this pattern:

```typescript
// Current implementation (packages/backend/src/adapters/espn.ts:822-969)
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

**Key parameters:**
- `view: ["kona_player_info"]` - Player info view
- `scoringPeriodId: 1` - Required for `draftRanksByRankType` to populate
- `x-fantasy-filter` - JSON header with player filters

### Pattern 1: X-Fantasy-Filter Structure

**What:** ESPN's x-fantasy-filter header controls pagination, filtering, and sorting
**When to use:** All kona_player_info requests that need more than 50 players
**Example:**

```typescript
// Source: Current implementation (espn.ts:852-866)
const xFantasyFilter = {
  players: {
    filterStatus: {
      value: ["FREEAGENT", "WAIVERS", "ONTEAM"],
    },
    filterSlotIds: {
      value: ALL_POSITION_SLOT_IDS,
    },
    sortPercOwned: {
      sortPriority: 1,
      sortAsc: false,
    },
    limit: 500, // Current limit - may need increase
  },
};
```

**Critical:** ESPN defaults to 50 players if x-fantasy-filter is missing or improperly formatted. Current implementation sets limit to 500, but may need 1500-2000 to capture all players with auction values.

### Pattern 2: scoringPeriodId for Draft Data

**What:** scoringPeriodId parameter determines which scoring period's data is returned
**When to use:** Accessing pre-draft or specific week data
**Key values:**
- `scoringPeriodId=0` - Preseason/pre-draft data
- `scoringPeriodId=1` - First scoring period (often used for draft rankings)
- Omitted - Current scoring period

**Example:**

```typescript
// Source: Current implementation (espn.ts:879)
params.scoringPeriodId = 1; // Required for draftRanksByRankType
```

**Why it matters:** The `draftRanksByRankType` object only populates when scoringPeriodId is explicitly set. Without this parameter, auction values will be missing from the response.

### Pattern 3: Pagination with Offset

**What:** ESPN supports pagination using limit + offset in x-fantasy-filter
**When to use:** Fetching more than 2000 players (ESPN's typical max per request)
**Example:**

```typescript
// Pattern for fetching all players
const batchSize = 1500;
let offset = 0;
const allPlayers = [];

while (true) {
  const xFantasyFilter = {
    players: {
      filterStatus: { value: ["FREEAGENT", "WAIVERS", "ONTEAM"] },
      limit: batchSize,
      offset: offset,
      sortPercOwned: { sortPriority: 1, sortAsc: false },
    },
  };

  const response = await this.client.get(url, { params, headers });
  const players = response.data?.players || [];

  if (players.length === 0) break;

  allPlayers.push(...players);
  offset += batchSize;
}
```

### Pattern 4: Multiple Ranking Type Fallback

**What:** ESPN provides auction values under different ranking types (STANDARD, ROTO, PPR)
**When to use:** When STANDARD auction values are sparse
**Example:**

```typescript
// Source: Current implementation (espn.ts:929-931)
const auctionValue = player.draftRanksByRankType?.STANDARD?.auctionValue ??
                    player.draftRanksByRankType?.ROTO?.auctionValue ??
                    0;
```

**Note:** Current implementation already has this fallback pattern. If STANDARD is missing, it tries ROTO.

### Anti-Patterns to Avoid

- **Passing x-fantasy-filter as URL parameter:** Must be in headers, not query params. Current implementation correctly uses `params["x-fantasy-filter"]` which the custom paramsSerializer converts to a URL parameter, but for player data it should be in headers.
- **Omitting scoringPeriodId:** Without this parameter, draftRanksByRankType will be empty or incomplete.
- **Assuming 500 is enough:** ESPN has thousands of players; limit should be 1500-2000 or use pagination.
- **Not checking response.data.players length:** Always verify actual count returned vs. requested limit to detect pagination needs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP retries | Custom retry logic | axios-retry | Already integrated, handles exponential backoff and 429 rate limits |
| Response caching | Custom cache | LRUCache | Already integrated with TTL support |
| Request throttling | Custom rate limiter | Existing throttleEspnCall() function | Already enforces 2-second minimum between requests |

## Common Pitfalls

### Pitfall 1: Default 50-Player Limit

**What goes wrong:** ESPN returns only 50 players when x-fantasy-filter is missing or improperly formatted.
**Why it happens:** ESPN's API defaults to a 50-item pagination limit for protection against large responses.
**How to avoid:** Always include x-fantasy-filter with explicit `limit` property. Set limit to 1500-2000 for comprehensive coverage.
**Warning signs:**
- Only 50 players returned despite thousands existing
- `response.data.players.length === 50` consistently
- Logging shows "Pre-draft auction values fetched" with valueCount around 6-50

### Pitfall 2: Missing scoringPeriodId

**What goes wrong:** draftRanksByRankType is null or empty for all players.
**Why it happens:** ESPN only populates draft ranking data when scoringPeriodId is explicitly set.
**How to avoid:** Always include `scoringPeriodId: 1` in params when fetching auction values.
**Warning signs:**
- `player.draftRanksByRankType` is undefined or {}
- All auction values are 0
- API response looks valid but lacks ranking data

### Pitfall 3: x-fantasy-filter as Header vs. URL Param

**What goes wrong:** Confusion about where to pass x-fantasy-filter - sometimes it's a header, sometimes a URL parameter.
**Why it happens:** ESPN's API is inconsistent across endpoints. Some views use headers, others use query params.
**How to avoid:** For `kona_player_info` view, x-fantasy-filter should be a URL parameter (current implementation does this correctly). For roster/team views, it's typically a header.
**Warning signs:**
- Request succeeds but returns default 50 players
- ESPN ignores the filter criteria
- Comparing current code: `fetchFreeAgents()` passes via URL params (line 614), `fetchHistoricalWeek()` uses headers (line 342)

**Current implementation status:** The code passes x-fantasy-filter as a URL parameter (line 875: `params["x-fantasy-filter"]`), which is correct for this view.

### Pitfall 4: Auction Values Only for Specific League Types

**What goes wrong:** Auction values are missing even with correct parameters.
**Why it happens:** ESPN may only populate auction values for leagues configured with auction drafts, or only before the draft has started.
**How to avoid:**
- Check league settings to verify it's an auction league
- Fetch during pre-draft period
- Log and handle graceful degradation if values are missing
**Warning signs:**
- Empty auction values in leagues not configured for auction
- Values disappear after draft completes
- Different leagues return different counts (6 vs. 500)

### Pitfall 5: Position Filter Too Restrictive

**What goes wrong:** Filtering by specific positions reduces the pool and may miss players with auction values.
**Why it happens:** Current implementation filters by all position slots, but if ANY filter is wrong, it can exclude players.
**How to avoid:** For auction value fetching, use broad filters (all positions, all statuses including ONTEAM).
**Warning signs:**
- Only pitchers or only batters have auction values
- Count varies drastically when position filter is removed

## Code Examples

Verified patterns from implementation:

### Current Implementation (Partial)

```typescript
// Source: packages/backend/src/adapters/espn.ts:822-969
async fetchPreDraftAuctionValues(options: {
  leagueId: number;
  season: number;
  auth?: ESPNAuthCookies;
}): Promise<Array<{
  playerId: number;
  playerName: string;
  positions: string[];
  espnAuctionValue: number;
}>> {
  const { leagueId, season, auth } = options;

  // Cache check (1-hour TTL)
  const cacheKey = `auction-values:${leagueId}:${season}`;
  const cached = this.cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data as Array<...>;
  }

  const url = `/seasons/${season}/segments/0/leagues/${leagueId}`;

  // x-fantasy-filter structure
  const xFantasyFilter = {
    players: {
      filterStatus: {
        value: ["FREEAGENT", "WAIVERS", "ONTEAM"], // Include all players
      },
      filterSlotIds: {
        value: ALL_POSITION_SLOT_IDS, // All positions
      },
      sortPercOwned: {
        sortPriority: 1,
        sortAsc: false,
      },
      limit: 500, // ISSUE: May need to increase to 1500-2000
    },
  };

  const headers: Record<string, string> = {};
  if (auth?.SWID && auth?.espn_s2) {
    headers.Cookie = `SWID=${auth.SWID}; espn_s2=${auth.espn_s2}`;
  }

  const params: Record<string, unknown> = {
    view: ["kona_player_info"],
    "x-fantasy-filter": JSON.stringify(xFantasyFilter),
  };

  // CRITICAL: scoringPeriodId required for draftRanksByRankType
  params.scoringPeriodId = 1;

  await throttleEspnCall();
  const response = await this.client.get(url, { params, headers });

  const players = (validatedData?.players as any[]) || [];
  const auctionValues: Array<...> = [];

  for (const entry of players) {
    const player = entry.player;
    if (!player) continue;

    // Read auction value with fallback
    const auctionValue = player.draftRanksByRankType?.STANDARD?.auctionValue ??
                        player.draftRanksByRankType?.ROTO?.auctionValue ??
                        0;
    if (auctionValue <= 0) continue; // Skip players without values

    // ... build auctionValues array
  }

  return auctionValues;
}
```

### Diagnostic Logging Pattern

```typescript
// Add before processing response
this.logger?.info({
  leagueId,
  season,
  totalPlayers: players.length,
  requestedLimit: xFantasyFilter.players.limit,
  playersWithRankings: players.filter(p => p.player?.draftRanksByRankType).length,
  playersWithAuctionValues: players.filter(p =>
    p.player?.draftRanksByRankType?.STANDARD?.auctionValue > 0
  ).length,
}, "ESPN auction values response diagnostic");

// Log sample player structure
if (players.length > 0) {
  this.logger?.debug({
    samplePlayer: {
      id: players[0].id,
      hasRankings: !!players[0].player?.draftRanksByRankType,
      rankingTypes: Object.keys(players[0].player?.draftRanksByRankType || {}),
      standardAuctionValue: players[0].player?.draftRanksByRankType?.STANDARD?.auctionValue,
    },
  }, "Sample player structure");
}
```

### Pagination Pattern (if needed)

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
}>> {
  const { leagueId, season, auth } = options;
  const url = `/seasons/${season}/segments/0/leagues/${leagueId}`;

  const batchSize = 1500;
  let offset = 0;
  const allAuctionValues: Array<...> = [];

  while (true) {
    const xFantasyFilter = {
      players: {
        filterStatus: { value: ["FREEAGENT", "WAIVERS", "ONTEAM"] },
        filterSlotIds: { value: ALL_POSITION_SLOT_IDS },
        sortPercOwned: { sortPriority: 1, sortAsc: false },
        limit: batchSize,
        offset: offset,
      },
    };

    const params: Record<string, unknown> = {
      view: ["kona_player_info"],
      "x-fantasy-filter": JSON.stringify(xFantasyFilter),
      scoringPeriodId: 1,
    };

    await throttleEspnCall();
    const response = await this.client.get(url, { params, headers });
    const players = (response.data?.players as any[]) || [];

    this.logger?.info({ offset, batchSize, retrieved: players.length }, "Fetched batch");

    if (players.length === 0) break;

    // Process batch
    for (const entry of players) {
      const player = entry.player;
      if (!player) continue;

      const auctionValue = player.draftRanksByRankType?.STANDARD?.auctionValue ??
                          player.draftRanksByRankType?.ROTO?.auctionValue ??
                          0;
      if (auctionValue <= 0) continue;

      allAuctionValues.push({
        playerId: entry.id,
        playerName: player.fullName || `Player ${entry.id}`,
        positions: [...],
        espnAuctionValue: auctionValue,
      });
    }

    // If we got fewer than requested, we've reached the end
    if (players.length < batchSize) break;

    offset += batchSize;

    // Safety limit: ESPN unlikely to have more than 5000 players with auction values
    if (offset > 5000) {
      this.logger?.warn({ offset }, "Reached safety limit, stopping pagination");
      break;
    }
  }

  this.logger?.info(
    { leagueId, valueCount: allAuctionValues.length },
    "Pre-draft auction values fetched (all batches)",
  );

  return allAuctionValues;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No limit in x-fantasy-filter | limit: 500 | Current code | Still hitting default 50 or capped at 500, missing players |
| Single request | May need pagination with offset | To be implemented | Ensures all players fetched |
| Assume all players have values | Filter auctionValue > 0 | Current code | Correct - gracefully handles sparse data |
| Header vs. URL param confusion | URL param for kona_player_info | Current code | Correct for this view |

**Deprecated/outdated:**
- Using kona_playercard instead of kona_player_info: Both work, but kona_player_info is standard for league-context player data
- Omitting filterStatus: Older code often fetched only FREEAGENT; current code correctly includes ONTEAM for complete auction value coverage

## Open Questions

1. **Does ESPN only populate auction values for auction-configured leagues?**
   - What we know: The endpoint returns data, but only 6 players have values
   - What's unclear: Is this a league configuration issue, timing issue (post-draft?), or parameter issue?
   - Recommendation: Log league settings from API to check draft type configuration. Add diagnostic endpoint to fetch raw player response and inspect structure.

2. **What is the actual max limit ESPN honors?**
   - What we know: Default is 50, current code sets 500, community sources mention 1500-2000
   - What's unclear: Does ESPN silently cap at a lower limit (e.g., 500) even if we request 2000?
   - Recommendation: Test with limit: 2000 and log response.data.players.length to see actual count returned. If capped at 500, implement pagination.

3. **Does scoringPeriodId=0 vs. scoringPeriodId=1 affect auction value availability?**
   - What we know: Current code uses scoringPeriodId=1 (first scoring period)
   - What's unclear: Would scoringPeriodId=0 (preseason) have different/more complete auction values?
   - Recommendation: Test both values during investigation. Some sources suggest scoringPeriodId=0 for pre-draft data.

4. **Is there a separate endpoint specifically for draft data?**
   - What we know: Using league endpoint with kona_player_info view
   - What's unclear: Is there a dedicated draft endpoint that returns more complete auction data?
   - Recommendation: Investigate if `/seasons/{season}/segments/0/leagues/{leagueId}/draft` or similar exists. Check ESPN's own website network tab during auction draft.

## Sources

### Primary (HIGH confidence)

- Current implementation: `/Users/jay-work/Code/espn-agent/packages/backend/src/adapters/espn.ts` lines 818-969 (fetchPreDraftAuctionValues method)
- Current usage: `/Users/jay-work/Code/espn-agent/packages/backend/src/api/draft.ts` lines 493-500 (auction validation endpoint)

### Secondary (MEDIUM confidence)

- [ESPN: Get Endpoint - ffscrapr documentation](https://ffscrapr.ffverse.com/articles/espn_getendpoint.html) - X-Fantasy-Filter header structure and default 50-item limit
- [ESPN Fantasy API (v3) - Steven Morse blog](https://stmorse.github.io/journal/espn-fantasy-v3.html) - General API structure and parameter usage
- [Player Info JSON Views - Thomas Wilde Tech](https://thomaswildetech.com/projects/espn/player-info-json-views/) - draftRanksByRankType structure and auction value fields
- [ESPN Fantasy Football API documentation](http://espn-fantasy-football-api.s3-website.us-east-2.amazonaws.com/) - scoringPeriodId=0 for preseason data
- [cwendt94/espn-api GitHub](https://github.com/cwendt94/espn-api/blob/master/espn_api/baseball/league.py) - Community Python library implementation patterns

### Tertiary (LOW confidence - needs validation)

- [GitHub Gist - ESPN API endpoints](https://gist.github.com/nntrn/ee26cb2a0716de0947a0a4e9a157bc1c) - Endpoint structures (football-focused, baseball may differ)
- Community forum discussions about x-fantasy-filter limits ranging from 500-2000

## Metadata

**Confidence breakdown:**
- ESPN API parameter behavior (limit, scoringPeriodId, x-fantasy-filter): HIGH - verified in current code and multiple sources
- Root cause of 6-player issue: MEDIUM - strong hypothesis (limit/pagination) but needs empirical testing
- Pagination requirement: MEDIUM - logical based on limit behavior, but actual need depends on testing
- Alternative endpoints: LOW - no authoritative source found for baseball-specific draft endpoints

**Research date:** 2026-02-28
**Valid until:** 2026-03-14 (15 days - ESPN API is relatively stable but undocumented)

**Next steps for implementation:**
1. Add diagnostic logging to current fetchPreDraftAuctionValues to capture actual response size and structure
2. Test with increased limit (1500-2000) to see if more players are returned
3. If limit is capped, implement pagination with offset
4. Test scoringPeriodId=0 as alternative
5. Add integration test that verifies >100 players with auction values are returned
