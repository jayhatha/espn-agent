---
phase: quick-11
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/entrypoints/content.tsx
  - packages/extension/lib/api-client.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "Extension makes at most 1 API request per 3 seconds during active draft"
    - "Auto-refresh after picks is throttled to prevent 429 errors"
    - "Format stabilizer does not trigger repeated API calls"
  artifacts:
    - path: "packages/extension/lib/api-client.ts"
      provides: "Request throttling and deduplication utilities"
      min_lines: 50
    - path: "packages/extension/entrypoints/content.tsx"
      provides: "Throttled refresh handlers"
      exports: ["refreshRankingsAndProjections", "refreshAssistantData"]
  key_links:
    - from: "packages/extension/entrypoints/content.tsx"
      to: "throttled refresh functions"
      via: "debounced/throttled wrappers"
      pattern: "throttle|debounce"
---

<objective>
Fix excessive API calls in Chrome extension causing 429 rate limit errors

Purpose: Extension is making too many API calls for auction valuations and rankings during drafts, triggering backend 429 rate limit errors. Users see "failed to fetch" errors and stale data.

Output: Throttled API request pattern with deduplication, preventing 429 errors while maintaining real-time updates
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md

Problem identified in extension code:
- `refreshRankingsAndProjections()` called after EVERY pick (line 301)
- `formatStabilizer` interval runs every 1.5s and can trigger `getAuctionValues()` (lines 509-543)
- No throttling or deduplication on API calls
- Retry logic (3 attempts) amplifies the problem
- Backend rate limit: 50 requests/minute (from Phase 11 decisions)

Backend already has rate limiting (Phase 11: 50 req/min). Extension needs client-side throttling.
</context>

<tasks>

<task type="auto">
  <name>Add request throttling and deduplication to api-client</name>
  <files>packages/extension/lib/api-client.ts</files>
  <action>
Add throttling utilities at the top of api-client.ts after imports:

1. **Throttle helper** (lodash-style throttle):
```typescript
function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => ReturnType<T> | undefined {
  let timeout: NodeJS.Timeout | null = null;
  let lastRun = 0;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = wait - (now - lastRun);

    if (remaining <= 0) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      lastRun = now;
      return func(...args);
    }

    return undefined;
  };
}
```

2. **Request deduplication cache** (prevents duplicate in-flight requests):
```typescript
const inflightRequests = new Map<string, Promise<any>>();

function dedupedRequest<T>(
  key: string,
  requestFn: () => Promise<T>
): Promise<T> {
  const existing = inflightRequests.get(key);
  if (existing) {
    console.log(`[API Client] Deduping request: ${key}`);
    return existing as Promise<T>;
  }

  const promise = requestFn().finally(() => {
    inflightRequests.delete(key);
  });

  inflightRequests.set(key, promise);
  return promise;
}
```

3. **Wrap getRankings and getAuctionValues** with deduplication:
```typescript
// In getRankings, wrap the fetch logic:
const cacheKey = `rankings:${espnLeagueId}:${JSON.stringify(options)}`;
return dedupedRequest(cacheKey, async () => {
  // existing fetch logic
});

// In getAuctionValues, wrap the fetch logic:
const cacheKey = `auction:${espnLeagueId}:${JSON.stringify(options)}`;
return dedupedRequest(cacheKey, async () => {
  // existing fetch logic
});
```

4. **Remove retry logic from getRankingsWithRetry and getAuctionValuesWithRetry**:
Backend already has retry logic with circuit breaker (Phase 12 P04). Client-side retries amplify 429 errors.

Change to single attempt with fast failure:
```typescript
export async function getRankingsWithRetry(
  espnLeagueId: string,
  options: GetRankingsOptions = {}
): Promise<PlayerRanking[]> {
  // Just call getRankings directly - backend handles retries
  return getRankings(espnLeagueId, options);
}
```

Why: Backend circuit breaker opens after 5 failures for 60s (Phase 12 P04 decision). Client retries fight the circuit breaker and create thundering herd on recovery.
  </action>
  <verify>grep -n "throttle\|dedupedRequest" packages/extension/lib/api-client.ts</verify>
  <done>api-client.ts has throttle function, dedupedRequest function, getRankings/getAuctionValues wrapped with dedup, retry functions simplified to single attempt</done>
</task>

<task type="auto">
  <name>Throttle refresh handlers in content script</name>
  <files>packages/extension/entrypoints/content.tsx</files>
  <action>
1. **Import throttle from api-client** (move throttle to api-client so content.tsx can import it):
```typescript
import { getRankings, getAuctionValues, getProjectedStandings, resolveBackendLeagueId, getRankingsWithRetry, getAuctionValuesWithRetry, throttle } from "../lib/api-client";
```

2. **Throttle refreshRankingsAndProjections** (line 46):
Change to 3-second minimum between calls (backend limit: 50/min = 1.2s per request, use 3s for safety):
```typescript
const refreshRankingsAndProjections = throttle(
  async (espnLeagueId: string) => {
    const state = useDraftStore.getState();
    // existing logic
  },
  3000 // 3 seconds minimum between refreshes
);
```

3. **Throttle refreshAssistantData** (line 304):
```typescript
const refreshAssistantData = throttle(
  async () => {
    // existing logic
  },
  3000
);
```

4. **Remove formatStabilizer interval** (lines 509-543):
Replace with one-time check after 2 seconds:
```typescript
// Check format once after page stabilizes (not every 1.5s)
setTimeout(() => {
  const latestDetection = detectDraftFormat();
  if (latestDetection !== "auction") return;

  const latestState = useDraftStore.getState();
  if (latestState.draftFormat === "auction") return;

  latestState.initializeDraft({
    leagueId,
    draftFormat: "auction",
    totalTeams: latestState.totalTeams,
    rosterSize: latestState.rosterSize,
    myTeamId: latestState.myTeamId || teamId || "user",
    budget: latestState.remainingBudget || 260,
  });

  refreshAssistantData(); // Throttled, will respect 3s minimum
}, 2000);
```

5. **Update cleanup** (line 592):
Remove formatStabilizer cleanup since it's now a setTimeout not setInterval

Why: Pick detection can fire rapidly (5+ picks in quick succession). Without throttling, each pick triggers 2 API calls (rankings + auction values), quickly hitting 50/min limit. Throttling to 3s means max 20 refreshes/min, well under limit.
  </action>
  <verify>grep -n "throttle(" packages/extension/entrypoints/content.tsx && ! grep -n "formatStabilizer" packages/extension/entrypoints/content.tsx</verify>
  <done>refreshRankingsAndProjections and refreshAssistantData are throttled to 3s minimum, formatStabilizer interval replaced with one-time setTimeout, cleanup updated</done>
</task>

</tasks>

<verification>
Manual verification steps:

1. **Build extension**: `cd packages/extension && pnpm build`
2. **Load unpacked extension** in Chrome (chrome://extensions)
3. **Open ESPN draft page** with Network tab open
4. **Filter network requests** to backend API (`localhost:3001` or production URL)
5. **Observe request rate**:
   - Initial page load: 1-2 requests (rankings, auction values if auction)
   - After first pick detected: 1 refresh (throttled)
   - After rapid picks (5 in 10 seconds): Only 1-2 refreshes (throttled to 3s intervals)
   - No repeated requests for same parameters (deduplication working)
6. **Check console** for deduplication logs: `"Deduping request: rankings:..."`
7. **Verify no 429 errors** in Network tab responses
</verification>

<success_criteria>
- Extension makes at most 1 API request per 3 seconds during active draft
- Rapid pick detection (5+ picks quickly) does not trigger 5+ API calls
- Network tab shows no 429 responses from backend
- Console logs show deduplication working ("Deduping request: ...")
- Rankings and auction values still update after picks (just throttled)
</success_criteria>

<output>
After completion, create `.planning/quick/11-fix-excessive-api-calls-causing-429-erro/11-SUMMARY.md`
</output>
