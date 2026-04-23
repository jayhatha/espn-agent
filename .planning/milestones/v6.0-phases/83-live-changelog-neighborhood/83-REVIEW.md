---
phase: 83
reviewed: 2026-04-23T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - packages/backend/src/api/timeseries.ts
  - packages/backend/src/agents/standings-change-log.ts
  - packages/frontend/src/app/leagues/[id]/changelog/page.tsx
  - packages/backend/src/utils/espn-env.ts
  - packages/backend/src/agents/live-poll.ts
  - packages/frontend/src/lib/api.ts
findings:
  p0: 0
  p1: 3
  p2: 2
  p3: 3
  total: 8
status: issues_found
---

# Phase 83: Code Review Report

**Reviewed:** 2026-04-23  
**Depth:** standard  
**Files Reviewed:** 6  
**Status:** issues_found

## Summary

Phase 83 delivers three related features: the standings neighborhood endpoint, proximate-cause enrichment in the change-log agent, and the my-team filter + neighborhood panel in the changelog page. The core logic is sound and the SSE wiring is correct. No data-corruption or broken-feature level issues were found.

Three P1 issues need attention before trusting the feature in production:

1. **Rank display in `EventCard` is wrong when categories have tied teams** — the back-calculation from roto points to rank is lossy.
2. **Neighborhood endpoint has no try/catch** — invalid params silently return 500 instead of 400.
3. **LivePollAgent hits ESPN without auth for private leagues when both credential sources are missing** — produces an opaque 500 instead of a clear early-exit.

Two P2 issues are robustness risks (time-zone mismatch on `isGameWindow`, N×M DB call storm in `buildProximateCause`). Three P3 items are cleanup / UX polish.

---

## P1 — Correctness Risk

### R-01: `EventCard` rank back-calculation is lossy for tied categories

**File:** `packages/frontend/src/app/leagues/[id]/changelog/page.tsx:93-96`

**Issue:**

```typescript
const catRank = Math.round(numTeams - event.curr_roto_pts + 1);
const prevRank = Math.round(
  numTeams - (event.curr_roto_pts - event.roto_delta) + 1,
);
```

`roto_points` are fractional when two teams share a rank. `assignRanksWithTies` awards the average of the shared positions, e.g. two teams tied at 4th/5th in a 12-team league each receive `(9 + 8) / 2 = 8.5` roto points. Back-calculating:

```
12 - 8.5 + 1 = 4.5 → Math.round → 5
```

The card would read "Now **5th** in HR" when the actual rank is **4th (tied)**. `Math.round` rounds 4.5 up to 5 (JS tie-break), which is consistently one rank worse than the actual tied position.

The same math applies to `prevRank`, so narrative lines like "moved from 4th to 3rd" can also be off by 1 on both ends.

**Fix:**  
Include the actual stored rank in the `standings_change_event` row (add `curr_rank` / `prev_rank` columns, or compute them in the REST history query by joining `team_daily_category_ranks`). Expose those fields in the `ChangeEvent` type and use them directly. As a quick patch while the backend change lands, replace `Math.round` with `Math.ceil` to consistently display the "worse" tied rank rather than alternating between the two:

```typescript
const catRank = Math.ceil(numTeams - event.curr_roto_pts + 1);
```

---

### R-02: Neighborhood endpoint has no try/catch — bad params return 500

**File:** `packages/backend/src/api/timeseries.ts:533-535`

**Issue:**

```typescript
async (request, reply) => {
  const leagueId = parseIntParam(request.params.leagueId, "leagueId");
  const teamId = parseIntParam(request.params.teamId, "teamId");
  // … DB queries follow, no try/catch
```

`parseIntParam` throws `Error` on non-numeric input. Without a `try/catch`, that error propagates to Fastify's default error handler and returns HTTP 500. The caller receives a server-error response instead of the correct 400. All DB errors in this handler are also uncaught, so any transient DB issue produces an uninformative 500 with no `error` body field.

Compare to the neighboring `standings/swing` handler at line ~631 which wraps its body in a try/catch.

**Fix:**

```typescript
async (request, reply) => {
  try {
    const leagueId = parseIntParam(request.params.leagueId, "leagueId");
    const teamId = parseIntParam(request.params.teamId, "teamId");
    // … existing logic …
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return reply.code(400).send({ error: msg });
  }
},
```

---

### R-03: `LivePollAgent` hits ESPN without auth when credentials are missing for a private league

**File:** `packages/backend/src/agents/live-poll.ts:57-63`

**Issue:**

```typescript
const auth = getEspnAuthFromEnv() ?? getEspnAuthFromLeague(league);
const espnData = await this.espnAdapter.fetchLeague({
  leagueId: league.espn_league_id,
  season: league.season,
  auth, // possibly undefined
  views: ["mSettings", "mTeam", "mStandings"],
});
```

When both `getEspnAuthFromEnv()` and `getEspnAuthFromLeague(league)` return `undefined` (e.g., `ENCRYPTION_KEY` is not set, or no credentials stored), `auth` is `undefined`. Passing that to `fetchLeague` for a private league causes ESPN to return a 401. That exception propagates up through `refresh()`, hits the route handler's `catch (err)`, and is returned as a generic `500 { error: "..." }`. There is no log line at the point of credential resolution, so diagnosing the cause from logs alone is difficult.

**Fix:**  
Add an early-exit guard with a descriptive log line:

```typescript
const auth = getEspnAuthFromEnv() ?? getEspnAuthFromLeague(league);
if (!auth) {
  log.warn(
    { leagueId },
    "LivePollAgent: no ESPN credentials available — skipping refresh. " +
      "Set ESPN_SWID + ESPN_S2 env vars or store credentials via /auth endpoint.",
  );
  return 0;
}
```

This converts a confusing 500 into a clean `{ eventCount: 0 }` response with a traceable log entry. Public leagues that pass `auth: undefined` to the adapter can be handled separately if needed.

---

## P2 — Robustness / Quality

### R-04: `isGameWindow()` uses local browser time; backend uses UTC — wrong polling window on non-ET clients

**File:** `packages/frontend/src/app/leagues/[id]/changelog/page.tsx:20-23`

**Issue:**

```typescript
// Frontend (local time):
function isGameWindow(): boolean {
  const h = new Date().getHours();
  return h >= 13;             // 1 pm *local*
}

// Backend (UTC):
static isGameWindow(): boolean {
  const h = new Date().getUTCHours();
  return h >= 17 || h < 4;   // 5 pm–4 am UTC (≈ 1 pm–midnight ET)
}
```

For a Pacific-time user (UTC−7):

- At 10 am PT (17:00 UTC) the **backend** considers games in window; the **frontend** does not (h=10 < 13) → neighborhood panel doesn't poll, "Games live" badge absent.
- At 1 pm PT (20:00 UTC) the **frontend** starts polling → `refetchInterval: 5 * 60 * 1000` activates, consistent with backend.
- At 4 pm PT (23:00 UTC) both agree.
- At midnight PT (07:00 UTC) the **frontend** shows "Games live" (h=0 < 13 → false). Consistent.

The main gap: Pacific users miss the first 3 hours of game polling entirely. The `refetchInterval` on `neighborhoodData` fires too late. The "Games live" badge is also absent during early games.

**Fix:**

```typescript
function isGameWindow(): boolean {
  const h = new Date().getUTCHours();
  return h >= 17 || h < 4;
}
```

---

### R-05: `buildProximateCause` is awaited in a nested per-team × per-category loop — N×M DB call storm per refresh

**File:** `packages/backend/src/agents/standings-change-log.ts` (inner loop)

**Issue:**

```typescript
for (const categoryId of allCategoryIds) {          // M categories
  for (const team of teams) {                        // N teams
    // …
    const proximateCause = await this.buildProximateCause(
      leagueId, team.id, categoryId, …
    );
```

Each `buildProximateCause` call issues 3–4 sequential DB queries (yesterday's category total, today's category total, `team_roster_snapshot` join, `projections_run`, `player_projection`). For a 12-team / 10-category league that passes the `Math.abs(rotoDelta) < 0.5` threshold for half the team-category pairs, this is ~60 invocations × ~4 queries = **~240 serial DB round-trips per poll cycle**. Under live-game conditions (every 15 min) this serialises the refresh for several hundred milliseconds to seconds.

**Fix — batch the reads before the loop:**

1. Fetch `team_daily_category_totals` for `currDate` and the previous date once (already partially done for rank computation — reuse it).
2. Fetch `team_roster_snapshot` for all teams on `currDate` in a single `WHERE team_id IN (...)` query.
3. Resolve `latestRun` once outside the loop.
4. Fetch `player_projection` for all player IDs across all roster snapshots in one query.

Then inside the loop, `buildProximateCause` becomes a pure in-memory computation with no DB calls.

---

## P3 — Cleanup

### R-06: `getEspnAuthFromLeague` `as Buffer` cast is unsafe but silently caught

**File:** `packages/backend/src/utils/espn-env.ts:42-45`

**Issue:**

```typescript
return {
  SWID: decryptToken(league.espn_swid_encrypted as Buffer),
  espn_s2: decryptToken(league.espn_s2_encrypted as Buffer),
};
```

The parameter type allows `string | Buffer | null`. After the null check, the value could legitimately be a `string` (some Kysely/pg-driver configurations return `bytea` as hex strings). The `as Buffer` cast tells TypeScript to ignore this. If `decryptToken` receives a string when it expects a Buffer, it will throw — which is caught by the outer `try/catch` and returns `undefined`. Safe but surprising.

**Fix:** Narrow the type before casting:

```typescript
const swid = league.espn_swid_encrypted;
const s2 = league.espn_s2_encrypted;
if (!Buffer.isBuffer(swid) || !Buffer.isBuffer(s2)) return undefined;
return {
  SWID: decryptToken(swid),
  espn_s2: decryptToken(s2),
};
```

---

### R-07: Refresh button silently swallows errors — user gets no feedback on failure

**File:** `packages/frontend/src/app/leagues/[id]/changelog/page.tsx:269-278`

**Issue:**

```typescript
} catch {
  // non-fatal — user can try again
}
```

When `api.triggerLiveRefresh` fails (500, network error, etc.) the button appears to succeed — no state change, no error indicator, nothing. The "Updated X ago" timestamp is not set. The user sees a stale "Refresh" button with no indication anything went wrong.

**Fix:** Set a brief error state (or at minimum don't update `lastPolledAt` and show a transient "Refresh failed" label):

```typescript
const [refreshError, setRefreshError] = useState(false);

const handleRefresh = useCallback(async () => {
  setRefreshError(false);
  try {
    await api.triggerLiveRefresh(leagueIdNum);
    setLastPolledAt(new Date());
    queryClient.invalidateQueries({
      queryKey: ["standings-neighborhood", leagueId],
    });
  } catch {
    setRefreshError(true);
  }
}, [leagueIdNum, leagueId, queryClient]);
```

---

### R-08: Empty state renders before `ourTeamId` loads from localStorage

**File:** `packages/frontend/src/app/leagues/[id]/changelog/page.tsx:453-459`

**Issue:**

```typescript
const myEvents = liveEvents.filter((e) => e.team_id === ourTeamId);
// …
{!isLoading && myEvents.length === 0 && (
  <div className="text-center py-16">
    <p>No changes affecting your team yet.</p>
  </div>
)}
```

`ourTeamId` is initialised to `null` and set in a `useEffect` after mount (localStorage read). On the first render, `ourTeamId` is `null` and `myEvents` is always empty. If the REST history has already resolved before the localStorage effect runs (common on fast connections), the empty state briefly flashes for the user's own team's events before the filter kicks in.

**Fix:** Gate the empty state on `ourTeamId` being resolved:

```typescript
{!isLoading && ourTeamId != null && myEvents.length === 0 && (
```

---

_Reviewed: 2026-04-23_  
_Reviewer: GitHub Copilot (Claude Sonnet 4.6)_  
_Depth: standard_
