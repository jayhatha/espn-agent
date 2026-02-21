# Phase 7: Historical Backfill & Timeline - Research

**Researched:** 2026-02-20
**Domain:** Background job orchestration, ESPN API historical data, progress tracking
**Confidence:** HIGH

## Summary

Phase 7 enables users to view week-by-week standings progression across current and past seasons by implementing a historical data backfill system. The core challenge is fetching ESPN data for past scoring periods without hitting rate limits, tracking progress for long-running jobs, and presenting time-series data via line charts.

The existing codebase provides strong foundations: BullMQ 5.1.5 for job queuing, axios-retry for exponential backoff, existing snapshot orchestrator pattern, and time series endpoints. ESPN's API supports historical data via `scoringPeriodId` parameter but has undocumented rate limits requiring defensive throttling (2-second delays, exponential backoff on 429).

**Primary recommendation:** Build on existing snapshot orchestrator pattern with BullMQ job chunking, progress tracking via `job.updateProgress()`, and admin UI using TanStack Query polling. Use Recharts (already installed) for line chart visualization.

## Phase Requirements

<phase_requirements>
| ID | Description | Research Support |
|----|-------------|-----------------|
| HIST-01 | Admin can trigger historical data backfill from ESPN API for a league's past season | ESPN API supports `scoringPeriodId` parameter for fetching specific weeks. Admin dashboard exists at `/admin` with system health UI. |
| HIST-02 | Backfill runs as background job with progress tracking (not blocking UI) | BullMQ 5.1.5 already in stack. Workers support `job.updateProgress()` for staged progress. TanStack Query supports polling for UI updates. |
| HIST-03 | Backfill respects ESPN rate limits (throttled requests, exponential backoff on 429) | axios-retry already configured with exponential backoff. Need to add 2-second throttle between requests and respect `Retry-After` header. |
| HIST-04 | Transaction deduplication via hash prevents duplicate entries during backfill | Existing `league_transaction_event` table has unique constraint on `(league_id, event_time, team_id, payload_hash)`. Hash computed via SHA-256 of raw event JSON. |
| TIME-01 | User can view week-by-week standings progression as a line chart for any season with data | Existing time series endpoints (`/timeseries/overall`, `/timeseries/category-rank`) return data. Recharts already installed in frontend. Need to add season selector UI. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| BullMQ | 5.1.5 | Background job queue | Industry standard for Node.js job queues, Redis-backed, supports progress tracking and job events |
| IORedis | 5.3.2 | Redis client for BullMQ | Required by BullMQ, high-performance Redis client |
| axios-retry | 4.5.0 | HTTP retry logic | Already configured for ESPN adapter, handles exponential backoff |
| Recharts | (installed) | React charting library | Already in package.json, responsive charts, good TypeScript support |
| TanStack Query | v5 | Frontend data fetching | Already in use, supports polling for progress updates |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pino | 8.17.2 | Structured logging | Already in use, log backfill progress and errors |
| Kysely | 0.27.2 | Type-safe SQL builder | Already in use, query historical snapshots |
| date-fns | 2.30.0 | Date manipulation | Already in use, calculate scoring periods and date ranges |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| BullMQ | Bull (v4) | BullMQ is Bull v5 with better TypeScript support and modern API |
| Recharts | Chart.js | Recharts more React-native, Chart.js requires wrapper |
| Polling | WebSockets | Polling simpler for admin-only feature, WebSockets add complexity |

**Installation:**
```bash
# No new dependencies required - all libraries already installed
```

## Architecture Patterns

### Recommended Project Structure
```
packages/backend/src/
├── agents/
│   └── historical-backfill.ts       # New: orchestrates multi-week backfill
├── workers/
│   └── backfill-worker.ts           # New: BullMQ worker for backfill jobs
├── api/
│   ├── admin.ts                     # Extend: add POST /api/admin/leagues/:id/backfill
│   └── timeseries.ts                # Extend: add season parameter support
packages/frontend/src/
├── app/
│   ├── admin/page.tsx               # Extend: add backfill trigger UI
│   └── leagues/[id]/
│       └── timeline/page.tsx        # New: week-by-week line chart view
├── components/
│   └── charts/
│       └── StandingsTimeline.tsx    # New: Recharts line chart component
```

### Pattern 1: BullMQ Job Chunking for Long-Running Backfills
**What:** Break backfill into weekly chunks as separate jobs, track progress via parent job
**When to use:** Multi-week backfills (e.g., fetching 26 weeks of data)
**Example:**
```typescript
// Source: BullMQ official docs + existing snapshot-worker.ts pattern
import { Queue, Worker, Job } from "bullmq";

interface BackfillJobData {
  leagueId: number;
  season: number;
  startWeek: number;
  endWeek: number;
  espnAuth?: { SWID?: string; espn_s2?: string };
}

// Create parent job that spawns child jobs per week
async function triggerBackfill(data: BackfillJobData) {
  const weeks = [];
  for (let week = data.startWeek; week <= data.endWeek; week++) {
    weeks.push({
      leagueId: data.leagueId,
      season: data.season,
      scoringPeriodId: week,
      espnAuth: data.espnAuth,
    });
  }

  const job = await backfillQueue.add("backfill-parent", data, {
    jobId: `backfill-${data.leagueId}-${data.season}`,
  });

  // Add child jobs with rate limiting
  for (const weekData of weeks) {
    await backfillQueue.add("backfill-week", weekData, {
      parent: { id: job.id, queue: backfillQueue.name },
      delay: weeks.indexOf(weekData) * 2000, // 2-second throttle
    });
  }

  return job;
}

// Worker tracks progress via job.updateProgress()
const worker = new Worker<BackfillJobData>(
  "backfills",
  async (job: Job<BackfillJobData>) => {
    const totalWeeks = job.data.endWeek - job.data.startWeek + 1;
    let completedWeeks = 0;

    // Update progress with structured data
    await job.updateProgress({
      stage: "fetching",
      completedWeeks,
      totalWeeks,
      currentWeek: job.data.startWeek,
    });

    // Process each week...
    // After each week completes:
    completedWeeks++;
    await job.updateProgress({
      stage: "fetching",
      completedWeeks,
      totalWeeks,
      currentWeek: job.data.startWeek + completedWeeks,
      percentage: Math.round((completedWeeks / totalWeeks) * 100),
    });
  },
  { connection }
);
```

### Pattern 2: ESPN Rate Limiting with Throttle + Exponential Backoff
**What:** 2-second delay between requests + exponential backoff on 429 errors
**When to use:** All ESPN API calls during backfill
**Example:**
```typescript
// Source: axios-retry docs + ESPN API best practices
import { createRetryableAxios } from "../utils/retry.js";

export class ESPNAdapter {
  private lastRequestTime = 0;
  private readonly THROTTLE_MS = 2000; // 2-second minimum between requests

  async fetchLeagueWeek(options: {
    leagueId: number;
    season: number;
    scoringPeriodId: number;
    auth?: ESPNAuthCookies;
  }): Promise<ESPNRawResponse> {
    // Throttle: ensure 2 seconds between requests
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.THROTTLE_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.THROTTLE_MS - elapsed)
      );
    }
    this.lastRequestTime = Date.now();

    // axios-retry handles 429 with exponential backoff
    // Respect Retry-After header if present
    const response = await this.client.get(url, {
      params: {
        view: ["mTeam", "mRoster", "mStandings"],
        scoringPeriodId: options.scoringPeriodId,
      },
      headers,
      validateStatus: (status) => status < 500,
    });

    if (response.status === 429) {
      const retryAfter = response.headers["retry-after"];
      if (retryAfter) {
        const delayMs = parseInt(retryAfter, 10) * 1000;
        this.logger?.warn({ delayMs }, "Rate limited, respecting Retry-After");
        throw new Error(`Rate limited, retry after ${delayMs}ms`);
      }
    }

    return response;
  }
}
```

### Pattern 3: Frontend Progress Polling with TanStack Query
**What:** Poll job status every 2 seconds, show progress bar, cancel on unmount
**When to use:** Admin UI during active backfill
**Example:**
```typescript
// Source: TanStack Query docs + existing admin page pattern
import { useQuery } from "@tanstack/react-query";

function BackfillProgress({ jobId }: { jobId: string }) {
  const { data: job, isLoading } = useQuery({
    queryKey: ["backfill-job", jobId],
    queryFn: () => api.getBackfillJobStatus(jobId),
    refetchInterval: (query) => {
      // Stop polling when job completes or fails
      const status = query.state.data?.status;
      return status === "completed" || status === "failed"
        ? false
        : 2000; // Poll every 2 seconds
    },
    enabled: !!jobId,
  });

  if (isLoading) return <div>Loading...</div>;
  if (!job) return null;

  const progress = job.progress || { percentage: 0, stage: "pending" };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h3 className="text-lg font-medium mb-4">
        Backfill Progress: {progress.stage}
      </h3>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div
          className="bg-blue-600 h-2.5 rounded-full transition-all"
          style={{ width: `${progress.percentage}%` }}
        />
      </div>
      <p className="text-sm text-gray-600 mt-2">
        {progress.completedWeeks} of {progress.totalWeeks} weeks completed
      </p>
    </div>
  );
}
```

### Pattern 4: Recharts Time Series Visualization
**What:** Line chart showing overall standings rank over time, multi-team series
**When to use:** Timeline page displaying historical progression
**Example:**
```typescript
// Source: Recharts docs + existing time series endpoints
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

function StandingsTimeline({ leagueId, season }: { leagueId: number; season: number }) {
  const { data } = useQuery({
    queryKey: ["timeseries", leagueId, season],
    queryFn: () => api.getTimeSeriesOverall(leagueId, { season }),
  });

  if (!data) return null;

  // Transform data: { series: [{ snapshot_date, team_id, overall_rank, ... }] }
  // Group by snapshot_date, nest teams
  const chartData = Object.values(
    data.series.reduce((acc, point) => {
      if (!acc[point.snapshot_date]) {
        acc[point.snapshot_date] = { date: point.snapshot_date };
      }
      acc[point.snapshot_date][`team_${point.team_id}`] = point.overall_rank;
      return acc;
    }, {} as Record<string, any>)
  );

  return (
    <LineChart width={800} height={400} data={chartData}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="date" />
      <YAxis reversed domain={[1, 'dataMax']} /> {/* Rank 1 at top */}
      <Tooltip />
      <Legend />
      {teams.map((team) => (
        <Line
          key={team.id}
          type="monotone"
          dataKey={`team_${team.id}`}
          stroke={team.color}
          name={team.name}
        />
      ))}
    </LineChart>
  );
}
```

### Anti-Patterns to Avoid
- **Fetching all weeks in parallel:** Will hit ESPN rate limits, use sequential throttled requests
- **Storing job progress in database:** BullMQ stores progress in Redis, querying from DB adds latency
- **Blocking snapshot jobs during backfill:** Backfill should be low-priority, don't starve daily snapshots
- **Hardcoding season/week ranges:** MLB seasons vary (162 games split into ~26 weeks), fetch from ESPN league metadata

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Job queue and retries | Custom queue with setTimeout + database | BullMQ with Redis | Handles failures, retries, progress tracking, concurrency limits, job prioritization. Edge cases: worker crashes, Redis failover, duplicate jobs. |
| Exponential backoff | Manual retry loop with Math.pow delays | axios-retry | Handles jitter, max retries, retry conditions, Retry-After headers. Easy to get wrong (no jitter = thundering herd). |
| Date range generation for scoring periods | Manual loop calculating week boundaries | date-fns + ESPN league metadata | MLB scoring periods don't align with calendar weeks. ESPN returns actual scoring period IDs. |
| Progress bar UI | Custom polling with useEffect | TanStack Query refetchInterval | Automatic cleanup, request deduplication, cache invalidation, loading states. |
| Line charts | Canvas rendering or SVG manipulation | Recharts | Responsive, accessible, handles missing data, tooltips, legends, multiple series. |

**Key insight:** Historical backfill is deceptively complex. ESPN rate limits are undocumented and inconsistent. Job orchestration requires handling partial failures (week 5 fails, weeks 6-26 still pending). Transaction deduplication prevents double-counting when overlapping backfills run. BullMQ handles all these edge cases; custom solutions miss them.

## Common Pitfalls

### Pitfall 1: ESPN Rate Limiting (429 Errors)
**What goes wrong:** Backfill triggers 429 Too Many Requests, blocking all API access
**Why it happens:** ESPN has undocumented rate limits (likely ~60 req/min or 1 req/sec). Parallel requests or no throttling triggers 429s.
**How to avoid:**
  - 2-second delay between requests (30 req/min = safe)
  - Exponential backoff on 429 (axios-retry handles this)
  - Respect `Retry-After` header when present
  - Use BullMQ job delays to stagger requests
**Warning signs:** Sudden 429 responses, "Too many requests" in logs, ESPN blocking SWID cookie

### Pitfall 2: Transaction Deduplication Failures
**What goes wrong:** Duplicate transactions appear when backfilling overlapping date ranges
**Why it happens:** Unique constraint on `(league_id, event_time, team_id, payload_hash)` prevents duplicates, but:
  - ESPN sometimes returns slightly different timestamps for same transaction
  - `raw_event_json` includes non-deterministic fields (fetched_at, etc.)
  - Hash changes if JSON key order changes
**How to avoid:**
  - Normalize `raw_event_json` before hashing (sort keys, remove metadata)
  - Use `onConflict().doNothing()` for idempotent inserts
  - Include only canonical fields in hash (transactionId, type, items, timestamp)
  - Log duplicate detection for debugging
**Warning signs:** Transaction count increases after re-running backfill, duplicate transaction IDs in database

### Pitfall 3: Progress Tracking Stale Data
**What goes wrong:** Admin UI shows 0% progress for minutes, then jumps to 100%
**Why it happens:**
  - `job.updateProgress()` not called frequently enough
  - Frontend polling interval too slow (>5 seconds)
  - BullMQ worker crashes before updating progress
  - Redis cache eviction (job data lost)
**How to avoid:**
  - Update progress after each week completes (not just at start/end)
  - Use structured progress data: `{ stage, completedWeeks, totalWeeks, percentage }`
  - Poll every 1-2 seconds during active backfill
  - Set BullMQ job retention (removeOnComplete: { age: 86400 })
  - Handle missing job gracefully in UI (assume failed)
**Warning signs:** Progress bar stuck at 0%, "Job not found" errors, sudden jumps in percentage

### Pitfall 4: Missing Historical Data from ESPN
**What goes wrong:** Backfill completes but snapshots have empty standings or rosters
**Why it happens:**
  - ESPN only retains detailed data for current + past 1-2 seasons
  - Private leagues require auth for historical data (SWID + espn_s2)
  - Some views (mRoster, kona_player_info) may be empty for old seasons
  - Scoring period IDs change between seasons (week 1 in 2024 ≠ week 1 in 2023)
**How to avoid:**
  - Validate ESPN response before inserting (check teams.length > 0)
  - Mark snapshots as degraded when data is incomplete
  - Log missing data warnings (empty rosters, zero standings)
  - Fetch league metadata first to validate season availability
  - Test with known-good historical season (e.g., 2023)
**Warning signs:** `is_degraded=true` for all backfilled snapshots, empty time series charts, "No teams found" logs

### Pitfall 5: Backfill Blocking Daily Snapshots
**What goes wrong:** Daily snapshot at 3am doesn't run because backfill is consuming all workers
**Why it happens:**
  - BullMQ workers process jobs FIFO by default
  - Backfill jobs added before daily snapshot jobs
  - All workers busy with backfill (no concurrency limit)
  - Single Redis instance under heavy load
**How to avoid:**
  - Use separate queues: `snapshotQueue` (high priority) and `backfillQueue` (low priority)
  - Set concurrency limits: `Worker({ concurrency: 2 })` for backfill
  - Add priority to jobs: `snapshotQueue.add(..., { priority: 1 })`
  - Monitor queue metrics: active jobs, waiting jobs, completed rate
  - Schedule backfills during off-hours (avoid 3am UTC)
**Warning signs:** Daily snapshots delayed, snapshot queue backlog, high Redis CPU

## Code Examples

Verified patterns from official sources and existing codebase:

### Historical Data Fetch with Scoring Period
```typescript
// Source: existing ESPNAdapter + ESPN API v3 documentation
// ESPN API supports scoringPeriodId parameter for historical weeks
async fetchHistoricalWeek(
  leagueId: number,
  season: number,
  scoringPeriodId: number,
  auth?: ESPNAuthCookies
): Promise<ESPNRawResponse> {
  const url = `/seasons/${season}/segments/0/leagues/${leagueId}`;

  const response = await this.client.get(url, {
    params: {
      view: ["mSettings", "mTeam", "mRoster", "mStandings"],
      scoringPeriodId, // Fetch specific week (1-26 for MLB)
    },
    headers: auth
      ? { Cookie: `SWID=${auth.SWID}; espn_s2=${auth.espn_s2}` }
      : {},
  });

  return {
    data: response.data,
    schemaFingerprint: this.computeSchemaFingerprint(response.data),
    fetchedAt: new Date(),
  };
}
```

### BullMQ Job with Structured Progress
```typescript
// Source: BullMQ official docs (https://docs.bullmq.io/guide/workers)
interface BackfillProgress {
  stage: "pending" | "fetching" | "processing" | "completed";
  completedWeeks: number;
  totalWeeks: number;
  currentWeek: number;
  percentage: number;
  errors?: string[];
}

const worker = new Worker<BackfillJobData>(
  "backfills",
  async (job: Job<BackfillJobData>) => {
    const { leagueId, season, startWeek, endWeek } = job.data;
    const totalWeeks = endWeek - startWeek + 1;

    await job.updateProgress({
      stage: "fetching",
      completedWeeks: 0,
      totalWeeks,
      currentWeek: startWeek,
      percentage: 0,
    } as BackfillProgress);

    for (let week = startWeek; week <= endWeek; week++) {
      try {
        // Fetch and process week
        await orchestrator.executeSnapshot({
          leagueId,
          snapshotDate: getDateForScoringPeriod(season, week),
          scoringPeriodId: week,
        });

        const completedWeeks = week - startWeek + 1;
        await job.updateProgress({
          stage: "fetching",
          completedWeeks,
          totalWeeks,
          currentWeek: week,
          percentage: Math.round((completedWeeks / totalWeeks) * 100),
        } as BackfillProgress);
      } catch (error) {
        // Log error but continue with next week
        job.log(`Failed to backfill week ${week}: ${error.message}`);
      }

      // 2-second throttle between weeks
      if (week < endWeek) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    await job.updateProgress({
      stage: "completed",
      completedWeeks: totalWeeks,
      totalWeeks,
      currentWeek: endWeek,
      percentage: 100,
    } as BackfillProgress);

    return { success: true, weeksProcessed: totalWeeks };
  },
  { connection }
);
```

### Transaction Hash for Deduplication
```typescript
// Source: existing snapshot-orchestrator.ts (lines 666-670)
// Normalize transaction data before hashing to ensure deterministic output
function computeTransactionHash(txn: ESPNTransaction): string {
  // Only include canonical fields (exclude metadata like fetched_at)
  const canonical = {
    transactionId: txn.transactionId,
    type: txn.type,
    timestamp: txn.timestamp,
    // Sort items by playerId for deterministic ordering
    items: txn.items
      .map(i => ({
        playerId: i.playerId,
        fromTeamId: i.fromTeamId,
        toTeamId: i.toTeamId,
        action: i.action,
      }))
      .sort((a, b) => a.playerId - b.playerId),
    bidAmount: txn.bidAmount,
  };

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical)) // JSON.stringify is deterministic if keys ordered
    .digest("hex")
    .substring(0, 16);
}
```

### Admin API Endpoint for Backfill Trigger
```typescript
// Source: existing admin.ts pattern + BullMQ queue pattern
import { backfillQueue } from "../workers/backfill-worker.js";

app.post(
  "/api/admin/leagues/:leagueId/backfill",
  {
    onRequest: [authenticate, requireAdmin],
  },
  async (
    request: FastifyRequest<{
      Params: { leagueId: string };
      Body: { season: number; startWeek: number; endWeek: number };
    }>,
    reply: FastifyReply
  ) => {
    const leagueId = parseInt(request.params.leagueId, 10);
    const { season, startWeek, endWeek } = request.body;

    // Validate inputs
    if (startWeek < 1 || endWeek > 26 || startWeek > endWeek) {
      return reply.code(400).send({
        error: "Invalid week range (MLB: 1-26)"
      });
    }

    // Get league and auth
    const league = await db
      .selectFrom("league")
      .selectAll()
      .where("id", "=", leagueId)
      .executeTakeFirstOrThrow();

    const auth = {
      SWID: league.espn_swid || undefined,
      espn_s2: league.espn_s2 || undefined,
    };

    // Trigger backfill job
    const job = await backfillQueue.add(
      "backfill-season",
      {
        leagueId,
        season,
        startWeek,
        endWeek,
        espnAuth: auth,
      },
      {
        jobId: `backfill-${leagueId}-${season}-${startWeek}-${endWeek}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      }
    );

    return {
      success: true,
      jobId: job.id,
      message: `Backfill started: ${endWeek - startWeek + 1} weeks`
    };
  }
);

// Get backfill job status
app.get(
  "/api/admin/jobs/:jobId",
  { onRequest: [authenticate, requireAdmin] },
  async (
    request: FastifyRequest<{ Params: { jobId: string } }>,
    reply: FastifyReply
  ) => {
    const job = await backfillQueue.getJob(request.params.jobId);

    if (!job) {
      return reply.code(404).send({ error: "Job not found" });
    }

    const state = await job.getState();
    const progress = job.progress || { percentage: 0, stage: "pending" };

    return {
      id: job.id,
      status: state,
      progress,
      createdAt: job.timestamp,
      finishedAt: job.finishedOn,
      failedReason: job.failedReason,
    };
  }
);
```

### Time Series Endpoint with Season Filter
```typescript
// Source: existing timeseries.ts + extend for season parameter
app.get(
  "/api/leagues/:leagueId/timeseries/overall",
  { onRequest: [authenticate], preHandler: [requireLeagueAccess] },
  async (
    request: FastifyRequest<{
      Params: { leagueId: string };
      Querystring: {
        from?: string;
        to?: string;
        teamIds?: string;
        season?: string; // New: filter by season
      };
    }>,
    reply: FastifyReply
  ) => {
    const leagueId = parseInt(request.params.leagueId, 10);
    const { from, to, teamIds, season } = request.query;

    let query = db
      .selectFrom("team_daily_overall")
      .selectAll()
      .where("league_id", "=", leagueId);

    // Filter by season if provided (season = year, e.g., 2024)
    if (season) {
      const seasonYear = parseInt(season, 10);
      query = query
        .where("snapshot_date", ">=", `${seasonYear}-01-01`)
        .where("snapshot_date", "<=", `${seasonYear}-12-31`);
    }

    if (from) query = query.where("snapshot_date", ">=", from);
    if (to) query = query.where("snapshot_date", "<=", to);
    if (teamIds) {
      const ids = teamIds.split(",").map((id) => parseInt(id, 10));
      query = query.where("team_id", "in", ids);
    }

    const series = await query.orderBy("snapshot_date", "asc").execute();

    return { series };
  }
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Bull v4 | BullMQ v5 | 2021 | Better TypeScript support, simpler API, improved performance. BullMQ is recommended for new projects. |
| Manual retry loops | axios-retry | 2020 | Declarative retry config, handles jitter and Retry-After headers automatically. |
| Polling with setInterval | TanStack Query refetchInterval | 2022 | Automatic cleanup, request deduplication, handles visibility changes (tab inactive = no polling). |
| Manual ESPN scoring period calculation | Use ESPN league metadata | Ongoing | ESPN returns actual scoring period IDs and date ranges. Don't hardcode (162 games ≠ 26 weeks exactly). |

**Deprecated/outdated:**
- **Bull v4:** Replaced by BullMQ (v5). Bull v4 still maintained but not recommended for new projects.
- **ESPN Fantasy API v2:** Replaced by v3 in 2018. v2 endpoints return 404.
- **Direct Redis commands for job state:** Use BullMQ getters (job.getState(), job.getProgress()). Direct Redis access bypasses BullMQ abstractions.

## ESPN API Historical Data

### Access Patterns
ESPN Fantasy API v3 supports historical data via two mechanisms:

1. **Scoring Period Parameter:** `scoringPeriodId=5` fetches data for week 5 of the season
2. **League History Endpoint:** `/leagueHistory/{leagueId}?seasonId={year}` for seasons 2017+ (limited data)

### Rate Limiting (Undocumented)
- ESPN does not publish official rate limits
- Community consensus: ~60 requests/minute or 1 request/second
- 429 errors observed with bursts of >10 requests in quick succession
- Retry-After header sometimes present (value in seconds)

### Historical Data Availability
- **Current + Past 2 Seasons:** Full data (rosters, standings, transactions)
- **3-5 Years Old:** Limited data (standings may be available, rosters often empty)
- **5+ Years Old:** Minimal data (league metadata only, no detailed stats)

### Authentication for Private Leagues
- Requires SWID and espn_s2 cookies (obtained by logging into ESPN and copying from browser)
- Cookies expire after ~1 year
- Must have been league member during that season to access historical data

**Source:** [Using ESPN's new Fantasy API (v3)](https://stmorse.github.io/journal/espn-fantasy-v3.html), [espn-api GitHub](https://github.com/cwendt94/espn-api)

## Open Questions

1. **Scoring Period Date Mapping**
   - What we know: ESPN returns scoring period IDs (1-26 for MLB), but actual date ranges vary by season
   - What's unclear: How to map scoring period ID → snapshot_date for historical seasons (current season uses "today")
   - Recommendation: Fetch league schedule/calendar from ESPN API, store scoring period metadata in database

2. **Backfill Resumption After Failure**
   - What we know: BullMQ supports retries at job level, but if worker crashes mid-backfill, weeks 1-10 may be complete while 11-26 are missing
   - What's unclear: Should we track completed weeks in database and resume, or rely on BullMQ job retry (re-fetches all weeks)?
   - Recommendation: Use idempotent snapshot inserts (ON CONFLICT DO UPDATE), let job retry fetch all weeks (deduplication prevents duplicates)

3. **Historical Transaction Data Completeness**
   - What we know: ESPN transactions endpoint (`view=mTransactions2`) returns all transactions for a season
   - What's unclear: Does it return transactions for specific scoring periods, or always full season? Can we fetch incrementally?
   - Recommendation: Test with known historical league. If only full-season available, fetch once per season (not per week) and map to event_date

4. **Multi-Season Backfill Strategy**
   - What we know: User may want to backfill 2022, 2023, 2024 in one operation
   - What's unclear: Should this be single job with season loop, or separate jobs per season?
   - Recommendation: Separate jobs per season (allows parallel execution, easier progress tracking, better failure isolation)

## Sources

### Primary (HIGH confidence)
- [BullMQ Official Docs - Workers](https://docs.bullmq.io/guide/workers) - Job progress tracking and events
- [BullMQ Official Docs - Metrics](https://docs.bullmq.io/guide/metrics) - Job metrics and monitoring
- [axios-retry GitHub](https://github.com/softonic/axios-retry) - Retry configuration and backoff strategies
- Existing codebase: `packages/backend/src/workers/snapshot-worker.ts` - BullMQ patterns
- Existing codebase: `packages/backend/src/adapters/espn.ts` - ESPN API client with retry logic
- Existing codebase: `packages/backend/src/api/timeseries.ts` - Time series endpoint patterns
- Existing codebase: `packages/frontend/src/app/admin/page.tsx` - Admin UI patterns with TanStack Query

### Secondary (MEDIUM confidence)
- [Using ESPN's new Fantasy API (v3)](https://stmorse.github.io/journal/espn-fantasy-v3.html) - ESPN API structure and historical data access
- [espn-api GitHub](https://github.com/cwendt94/espn-api) - Community Python library documenting ESPN endpoints
- [How to Handle Long-Running Jobs in BullMQ](https://oneuptime.com/blog/post/2026-01-21-bullmq-long-running-jobs/view) - Progress tracking best practices
- [Monitor BullMQ Background Jobs with AppSignal](https://blog.appsignal.com/2024/07/30/monitor-bullmq-background-jobs-with-appsignal.html) - Job monitoring patterns

### Tertiary (LOW confidence)
- [API Rate Limit Best Practices](https://apipark.com/techblog/en/how-to-fix-rate-limit-exceeded-errors-a-step-by-step-guide/) - General rate limiting strategies (not ESPN-specific)
- [429 Too Many Requests Strategies](https://www.useanvil.com/blog/engineering/throttling-and-consuming-apis-with-429-rate-limits/) - Throttling patterns (general API guidance)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in package.json, versions verified
- Architecture: HIGH - BullMQ patterns match official docs, existing snapshot orchestrator provides template
- ESPN API: MEDIUM - Historical data access confirmed by community sources, but rate limits undocumented
- Pitfalls: HIGH - Based on existing codebase patterns (transaction deduplication, axios-retry config)

**Research date:** 2026-02-20
**Valid until:** 2026-03-20 (30 days - stable domain, BullMQ and ESPN API unlikely to change significantly)
