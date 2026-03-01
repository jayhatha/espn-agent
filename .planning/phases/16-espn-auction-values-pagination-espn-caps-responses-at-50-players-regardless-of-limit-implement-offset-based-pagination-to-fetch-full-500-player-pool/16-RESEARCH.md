# Phase 16: ESPN Auction Values Pagination - Research

**Researched:** 2026-02-28
**Domain:** ESPN Fantasy Baseball API - x-fantasy-filter, pagination, kona_player_info view
**Confidence:** HIGH (root cause confirmed by code audit + cross-verified with multiple sources)

## Summary

The root cause of ESPN returning exactly 50 players despite `limit: 2000` in the filter is confirmed: **`fetchPreDraftAuctionValues` sends `x-fantasy-filter` as a URL query parameter instead of an HTTP header.** When ESPN receives the filter as a URL param, it ignores the limit specification and falls back to its default 50-item cap. This is distinct from `fetchHistoricalWeek` (which correctly sends it as a header at line 342) and consistent with the code comment on line 611 which reads "Pass filter as x-fantasy-filter URL parameter" — a deliberate but incorrect choice in the free agents / auction methods.

The fix has two components: (1) move x-fantasy-filter from `params` to `headers` in both `fetchFreeAgents` and `fetchPreDraftAuctionValues`, and (2) implement offset-based pagination to handle the case where ESPN caps individual page sizes (the community Python library shows ESPN accepts offsets and the cwendt94/espn-api library confirms this pattern works). A single request with a large limit in the header appears to work up to 1500-2000 players, but pagination ensures correctness for full pools.

The `fetchFreeAgents` method has the same URL-param bug and should be fixed in the same pass. The `fetchHistoricalWeek` method is already correct and serves as the reference implementation.

**Primary recommendation:** Move x-fantasy-filter to HTTP header in `fetchFreeAgents` and `fetchPreDraftAuctionValues`. Add `sortDraftRanks` with `value: "STANDARD"` to the auction filter. Implement offset-based pagination with a batch size of 500-1000 players per request, looping until a partial page is returned. Update the LRU cache key to not include offset (cache the aggregated result).

## Root Cause Analysis

### Confirmed Bug: x-fantasy-filter as URL Param vs. Header

**Evidence from code:**

```typescript
// fetchHistoricalWeek (line 342) - CORRECT: sends as header
headers["x-fantasy-filter"] = JSON.stringify({ ... });
// ...
response = await this.client.get(url, { params, headers });

// fetchFreeAgents (lines 611-615) - WRONG: sends as URL param
// Comment reads: "Pass filter as x-fantasy-filter URL parameter (JSON stringified)"
const params: Record<string, unknown> = {
  view: ["kona_player_info"],
  "x-fantasy-filter": JSON.stringify(xFantasyFilter),  // <-- BUG
};

// fetchPreDraftAuctionValues (lines 873-876) - WRONG: sends as URL param
const params: Record<string, unknown> = {
  view: ["kona_player_info"],
  "x-fantasy-filter": JSON.stringify(xFantasyFilter),  // <-- BUG
};
```

**Evidence from external sources:**

Multiple authoritative sources confirm x-fantasy-filter must be an HTTP header:
- cwendt94/espn-api Python library: `headers = {'x-fantasy-filter': json.dumps(filters)}` then `league_get(params=params, headers=headers)`
- ffscrapr R library: `xff <- httr::add_headers('X-Fantasy-Filter' = x_fantasy_filter)` — explicitly states "espn_getendpoint_raw requires that the object is converted into an HTTP header first"
- ESPN NFL API gist: "X-Fantasy-Filter header is required in requests to retrieve all active players; omitting this returns only 50 items"

**Diagnostic log evidence from Phase 14:**
```json
{"totalPlayers":50,"requestedLimit":2000,"msg":"ESPN returned fewer players than requested - may need pagination"}
```
ESPN returned exactly 50 players despite `limit: 2000` in the params — this matches the "header omitted → default 50" behavior exactly.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| axios | (already in use) | HTTP client | Supports headers dict per-request |
| lru-cache | (already in use) | Response caching | Cache aggregated paginated result |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| throttleEspnCall() | (already in use) | 2-second throttle between requests | Must call before EACH paginated request |

**Installation:** No new dependencies required. This is a bug fix + enhancement using existing infrastructure.

## Architecture Patterns

### Pattern 1: x-fantasy-filter as HTTP Header (Reference: fetchHistoricalWeek)

**What:** ESPN requires x-fantasy-filter in the HTTP `headers` dict, not in URL `params`
**When to use:** All ESPN API calls using kona_player_info or player-data views
**Example:**

```typescript
// Source: espn.ts line 342 - fetchHistoricalWeek (CORRECT reference implementation)
const headers: Record<string, string> = {};
if (auth?.SWID && auth?.espn_s2) {
  headers.Cookie = `SWID=${auth.SWID}; espn_s2=${auth.espn_s2}`;
}
headers["x-fantasy-filter"] = JSON.stringify({
  players: {
    filterStatus: { value: ["FREEAGENT", "WAIVERS", "ONTEAM"] },
    filterSlotIds: { value: ALL_POSITION_SLOT_IDS },
    sortDraftRanks: { sortPriority: 100, sortAsc: true, value: "STANDARD" },
    limit: 500,
    offset: 0,
  },
});

const params: Record<string, unknown> = {
  view: ["kona_player_info"],
  scoringPeriodId: 1,
  // NOTE: x-fantasy-filter is NOT in params - it's in headers above
};

const response = await this.client.get(url, { params, headers });
```

### Pattern 2: Offset-Based Pagination Loop

**What:** Incrementing offset by batchSize until a partial page (< batchSize) is returned
**When to use:** Fetching 500+ players where a single request may not return all results
**Batch size recommendation:** 500 players per request (safe; ESPN confirmed to return up to 1000+ per request in community implementations)

```typescript
// Source: Pattern from cwendt94/espn-api (Python) and codebase's existing fetchHistoricalWeek structure
const batchSize = 500;
let offset = 0;
const allPlayers: any[] = [];
const MAX_ITERATIONS = 20; // Safety cap: 20 x 500 = 10,000 players max

for (let i = 0; i < MAX_ITERATIONS; i++) {
  const headers: Record<string, string> = {};
  if (auth?.SWID && auth?.espn_s2) {
    headers.Cookie = `SWID=${auth.SWID}; espn_s2=${auth.espn_s2}`;
  }
  headers["x-fantasy-filter"] = JSON.stringify({
    players: {
      filterStatus: { value: ["FREEAGENT", "WAIVERS", "ONTEAM"] },
      filterSlotIds: { value: ALL_POSITION_SLOT_IDS },
      sortDraftRanks: { sortPriority: 100, sortAsc: true, value: "STANDARD" },
      limit: batchSize,
      offset,
    },
  });

  const params: Record<string, unknown> = {
    view: ["kona_player_info"],
    scoringPeriodId: 1,
  };

  await throttleEspnCall();
  const response = await this.client.get(url, { params, headers });
  const batch = (response.data?.players as any[]) || [];

  this.logger?.info({ offset, batchSize, received: batch.length }, "Auction values batch fetched");

  allPlayers.push(...batch);

  // Partial page = we've reached the end
  if (batch.length < batchSize) break;

  offset += batchSize;
}
```

### Pattern 3: sortDraftRanks Filter for Auction Values

**What:** Adding `sortDraftRanks` to the filter ensures results are sorted by draft rank (STANDARD), which surfaces players with auction values at the top
**When to use:** Auction value fetching specifically
**Source:** cwendt94/espn-api Python library (verified implementation)

```typescript
// Add to x-fantasy-filter players object
sortDraftRanks: {
  sortPriority: 100,
  sortAsc: true,
  value: "STANDARD",  // or "ROTO" for roto leagues
},
```

**Why this matters:** Without `sortDraftRanks`, results are sorted by `sortPercOwned` (ownership %). Top-owned players are not necessarily the ones with auction values. Sorting by draft ranks prioritizes players ESPN has ranked for auction drafts.

### Pattern 4: Cache Aggregated Result, Not Individual Pages

**What:** Cache the final merged array of all auction values (post-pagination), not individual page responses
**When to use:** Always with paginated fetching
**Cache key:** `auction-values:${leagueId}:${season}` (existing key, unchanged)

```typescript
// Cache AFTER pagination loop completes
this.cache.set(cacheKey, {
  data: auctionValues,
  expiresAt: Date.now() + 1000 * 60 * 60, // 1 hour TTL (existing)
});
```

### Anti-Patterns to Avoid

- **Sending x-fantasy-filter in `params`:** ESPN ignores it, defaults to 50 players. Must be in `headers`.
- **Large batch sizes (> 1000):** Unknown behavior at the high end; 500 is safe and verified by community implementations.
- **Unlimited pagination loops:** Always include MAX_ITERATIONS or offset cap to prevent infinite loops on API quirks.
- **Caching per page:** Cache the aggregated result only; per-page caching with different cache keys defeats the 1-hour TTL.
- **Separate cache for fetchFreeAgents pagination:** Fix fetchFreeAgents in the same pass (same bug) but its existing cache behavior (no caching in current implementation) doesn't need to change.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP retries | Custom retry logic | axios-retry (createRetryableAxios) | Already integrated |
| Rate limiting | Custom throttle | throttleEspnCall() | Already enforces 2s minimum between requests |
| Response caching | Custom cache | LRUCache (this.cache) | Already integrated with TTL |

**Key insight:** The throttle must be called before EACH paginated request, not just once. With batch size 500 and a 500-player pool, that's 1-2 requests total. The 2-second throttle is acceptable.

## Common Pitfalls

### Pitfall 1: x-fantasy-filter in params vs headers
**What goes wrong:** ESPN returns exactly 50 players regardless of the `limit` in the filter JSON.
**Why it happens:** ESPN's backend reads x-fantasy-filter only from the HTTP header; URL query params are silently ignored for this field.
**How to avoid:** Always put x-fantasy-filter in `headers["x-fantasy-filter"]`, not in `params["x-fantasy-filter"]`.
**Warning signs:** `totalPlayers === 50` in diagnostic logs despite setting `limit: 2000`.

### Pitfall 2: Forgetting throttleEspnCall() per page
**What goes wrong:** Rate limit (429) errors on the second paginated request.
**Why it happens:** The throttle is per-call; pagination requires it before each request.
**How to avoid:** Call `await throttleEspnCall()` inside the pagination loop, not before it.
**Warning signs:** 429 error on 2nd request; first page succeeds, second fails.

### Pitfall 3: fetchFreeAgents has the same URL-param bug
**What goes wrong:** fetchFreeAgents also sends x-fantasy-filter as a URL param (line 614), so it also returns only 50 players regardless of the `limit` parameter.
**Why it happens:** Same bug pattern as fetchPreDraftAuctionValues.
**How to avoid:** Fix both methods in the same pass. fetchFreeAgents doesn't need pagination (free agents are a smaller set) but does need the header fix to respect the `limit` parameter.

### Pitfall 4: sortPercOwned vs sortDraftRanks for auction values
**What goes wrong:** Sorting by ownership % (`sortPercOwned`) returns highly-owned players first, many of whom may be rostered with no auction value in the pre-draft data.
**Why it happens:** The current implementation uses `sortPercOwned` for auction value fetching, which is appropriate for free agent queries but not for pre-draft auction value fetching.
**How to avoid:** Use `sortDraftRanks: { sortPriority: 100, sortAsc: true, value: "STANDARD" }` for auction value fetching. Keep `sortPercOwned` for free agents.
**Warning signs:** Top players in the response have low or zero auction values; players with high values appear at the bottom.

### Pitfall 5: Auction values only exist pre-draft (league timing)
**What goes wrong:** ESPN only populates `draftRanksByRankType.STANDARD.auctionValue` during the pre-draft window.
**Why it happens:** ESPN's API is draft-lifecycle aware; post-draft, these fields are cleared or missing.
**How to avoid:** Graceful degradation is already in place (return empty array on no values). Document this behavior in API response.
**Warning signs:** Zero auction values for all players even after the header fix. Check if draft has completed.

## Code Examples

### Fixed fetchPreDraftAuctionValues (Core Change)

```typescript
// Source: packages/backend/src/adapters/espn.ts
// Change: x-fantasy-filter moved from params to headers; added sortDraftRanks; pagination loop added

async fetchPreDraftAuctionValues(options: {
  leagueId: number;
  season: number;
  auth?: ESPNAuthCookies;
}): Promise<Array<{ playerId: number; playerName: string; positions: string[]; espnAuctionValue: number; }>> {
  const { leagueId, season, auth } = options;

  const cacheKey = `auction-values:${leagueId}:${season}`;
  const cached = this.cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data as Array<{ playerId: number; playerName: string; positions: string[]; espnAuctionValue: number; }>;
  }

  const url = `/seasons/${season}/segments/0/leagues/${leagueId}`;
  const batchSize = 500;
  let offset = 0;
  const allPlayers: any[] = [];
  const MAX_ITERATIONS = 20;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const headers: Record<string, string> = {};
    if (auth?.SWID && auth?.espn_s2) {
      headers.Cookie = `SWID=${auth.SWID}; espn_s2=${auth.espn_s2}`;
    }

    // KEY FIX: x-fantasy-filter sent as HTTP header, not URL param
    headers["x-fantasy-filter"] = JSON.stringify({
      players: {
        filterStatus: { value: ["FREEAGENT", "WAIVERS", "ONTEAM"] },
        filterSlotIds: { value: ALL_POSITION_SLOT_IDS },
        sortDraftRanks: { sortPriority: 100, sortAsc: true, value: "STANDARD" },
        limit: batchSize,
        offset,
      },
    });

    const params: Record<string, unknown> = {
      view: ["kona_player_info"],
      scoringPeriodId: 1,
      // x-fantasy-filter is NOT here anymore
    };

    await throttleEspnCall();
    const response = await this.client.get(url, { params, headers });
    const batch = (response.data?.players as any[]) || [];

    this.logger?.info({ offset, batchSize, received: batch.length }, "Auction values batch");
    allPlayers.push(...batch);

    if (batch.length < batchSize) break;
    offset += batchSize;
  }

  // Process all players into auctionValues array (existing logic unchanged)
  // ...
  // Cache aggregated result
  this.cache.set(cacheKey, { data: auctionValues, expiresAt: Date.now() + 3600000 });
  return auctionValues;
}
```

### Fixed fetchFreeAgents (Same Bug, Same Fix)

```typescript
// Change: x-fantasy-filter moved from params to headers
// No pagination needed (free agents are a smaller set, limit 300 is sufficient once header is fixed)

const headers: Record<string, string> = {};
if (auth?.SWID && auth?.espn_s2) {
  headers.Cookie = `SWID=${auth.SWID}; espn_s2=${auth.espn_s2}`;
}
// KEY FIX: Move from params to headers
headers["x-fantasy-filter"] = JSON.stringify({
  players: {
    filterStatus: { value: ["FREEAGENT", "WAIVERS"] },
    filterSlotIds: { value: filterSlotIds },
    sortPercOwned: { sortPriority: 1, sortAsc: false },
    limit,
  },
});

const params: Record<string, unknown> = {
  view: ["kona_player_info"],
  // x-fantasy-filter is NOT here anymore
};
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| x-fantasy-filter in URL params | x-fantasy-filter in HTTP header | ESPN respects limit; breaks out of 50-player cap |
| Single request with limit: 2000 in params | Pagination loop with offset, header-based | Gets full 500+ player pool |
| sortPercOwned only | sortPercOwned for free agents, sortDraftRanks for auction | Surfaces auction-ranked players first |

**Deprecated/outdated:**
- `params["x-fantasy-filter"]`: This pattern works for some non-player ESPN endpoints but NOT for kona_player_info. The comment at line 611 ("Pass filter as x-fantasy-filter URL parameter") is incorrect for this use case.

## Open Questions

1. **What is ESPN's actual per-page limit when using the header?**
   - What we know: Default is 50 without header; community sources show 1500-2000 per request is possible with header
   - What's unclear: Is there a hard cap (e.g., 1000 per page) that requires pagination regardless?
   - Recommendation: Start with batchSize=500 (conservative, verified safe), log actual returned counts. If ESPN consistently returns 500 when 500 requested, try a single request with limit=2000 to see if pagination is even needed.

2. **Does sortDraftRanks with "STANDARD" cover auction leagues specifically, or is a league type check needed?**
   - What we know: "STANDARD" is the ranking type used by the cwendt94 library for all free agent fetches
   - What's unclear: Whether roto-configured auction leagues use "ROTO" instead of "STANDARD" for auction values
   - Recommendation: Keep existing fallback: `STANDARD?.auctionValue ?? ROTO?.auctionValue ?? 0`. This handles both cases.

3. **Does fetching with filterStatus ONTEAM cause issues for leagues where the draft is in progress?**
   - What we know: Including ONTEAM gives the full player pool pre-draft; post-draft it's how we get rostered player values
   - What's unclear: Whether ONTEAM causes issues on auth-required private leagues with partial data
   - Recommendation: Keep ONTEAM in the filter — it's needed for a complete auction pool. Handle auth errors gracefully (already done via try/catch).

## Sources

### Primary (HIGH confidence)
- `/Users/jay-work/Code/espn-agent/packages/backend/src/adapters/espn.ts` lines 302-437 (`fetchHistoricalWeek` — correct reference implementation using header)
- `/Users/jay-work/Code/espn-agent/packages/backend/src/adapters/espn.ts` lines 570-688 (`fetchFreeAgents` — confirmed URL-param bug at line 614)
- `/Users/jay-work/Code/espn-agent/packages/backend/src/adapters/espn.ts` lines 818-1008 (`fetchPreDraftAuctionValues` — confirmed URL-param bug at line 875)
- Phase 14 diagnostic logs: `{"totalPlayers":50,"requestedLimit":2000}` — confirms ESPN ignores limit when sent as URL param

### Secondary (MEDIUM confidence)
- [cwendt94/espn-api - espn_requests.py](https://github.com/cwendt94/espn-api/blob/master/espn_api/requests/espn_requests.py) — `headers = {'x-fantasy-filter': json.dumps(filters)}` pattern
- [cwendt94/espn-api - football/league.py](https://github.com/cwendt94/espn-api/blob/master/espn_api/football/league.py) — offset pagination pattern with `limitPerMessageSet` and `offset` in filter
- [ffscrapr R library - espn_api.R](https://rdrr.io/cran/ffscrapr/src/R/espn_api.R) — `httr::add_headers('X-Fantasy-Filter' = ...)` as header
- [ESPN API gist by nntrn](https://gist.github.com/nntrn/ee26cb2a0716de0947a0a4e9a157bc1c) — "X-Fantasy-Filter header is required; omitting returns only 50 items"
- [ESPN: Get Endpoint - ffscrapr](https://ffscrapr.ffverse.com/articles/espn_getendpoint.html) — confirms header-only usage
- [cwendt94/espn-api - baseball/league.py](https://github.com/cwendt94/espn-api/blob/master/espn_api/baseball/league.py) — baseball free agents filter with `sortDraftRanks`

### Tertiary (LOW confidence — needs validation via actual API call)
- ESPN max page size with header (1500-2000 per request): reported in community discussions but not verified in this codebase
- Whether `sortDraftRanks` with "STANDARD" is required vs. optional for auction value retrieval

## Metadata

**Confidence breakdown:**
- Root cause (URL param vs header): HIGH — confirmed by code audit + 3 independent external sources + diagnostic log evidence
- Pagination mechanism (offset in header filter): MEDIUM-HIGH — confirmed by cwendt94 library; exact behavior for baseball pre-draft data needs live validation
- sortDraftRanks filter improvement: MEDIUM — confirmed by cwendt94 library; the existing fallback already handles missing values
- Actual player count after fix (500+ with auction values): LOW — needs live API call to verify; fix may reveal that only 50-100 players have ESPN auction values pre-draft regardless of limit

**Research date:** 2026-02-28
**Valid until:** 2026-03-28 (30 days — ESPN API is stable but undocumented; changes are rare)
