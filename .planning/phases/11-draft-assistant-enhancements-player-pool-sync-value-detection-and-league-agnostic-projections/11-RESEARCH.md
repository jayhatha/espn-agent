# Phase 11: Draft Assistant Enhancements - Research

**Researched:** 2026-02-23
**Domain:** Chrome extension draft assistance, player pool sync, league-agnostic API design
**Confidence:** MEDIUM

## Summary

Phase 11 enhances the draft assistant extension by implementing automated ESPN player pool sync, value-based recommendations, and league-agnostic projection endpoints. Research reveals existing infrastructure supports most requirements: BullMQ provides cron scheduling, MutationObserver enables pick detection and auto-refresh triggers, and generic `/api/draft/*` endpoints already exist. The primary gaps are: (1) adding current-season stats to the shared `player` table, (2) creating a daily sync job to populate it from ESPN, (3) detecting league configuration from ESPN DOM, and (4) implementing value detection UI with VBD vs ADP comparisons.

**Primary recommendation:** Extend the existing `player` table with current stats columns, create a new `PlayerPoolSyncAgent` using the proven `ESPNAdapter` pattern, schedule it via node-cron (not BullMQ repeatable jobs which are deprecated), and add league config detection to the extension's existing DOM parsing module.

## User Constraints

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Projection Architecture:**
- League config source: Auto-detect from ESPN draft page DOM (parse league settings, categories, roster slots)
- Detection fallback: Use standard 5x5 roto defaults + show warning banner if auto-detection fails

**UI Refresh Behavior:**
- Refresh scope: Rankings and projections only (keep league config cached, don't re-detect)
- Refresh trigger: Auto-refresh after each pick detection (not manual-only or time-based)
- Error handling: Automatic retry on failure (2-3 retries with exponential backoff), then keep stale data

**Value Detection Logic:**
- Value definition: Format-aware — snake drafts use ADP delta, auction drafts use price delta
- Thresholds: Moderate (clear value) — Snake: 10+ ADP positions better, Auction: 15%+ discount
- Display approach: Color-code players by value degree (how much of a steal or overpay)
- Color scheme: Red/yellow/green scale — red = overpay, yellow = fair value, green = steal

**Player Pool Sync Strategy:**
- Sync location: Backend cron job (not extension-side)
- Shared table: Non-league-specific data (stats, ESPN player ID, positions, rostered%)
- Sync frequency: Once daily at 4 AM (after ESPN updates, before draft times)
- Data synced: Core + current stats — ESPN ID, name, team, positions, rostered%, current season counting stats

### Claude's Discretion
- Exact API endpoint design for draft projected standings
- Parameter optimization (full config vs config ID pattern)
- Loading state UI implementation
- Player pool sync error handling and monitoring strategy

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope

</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| BullMQ | 5.16.0+ | Background job orchestration | Already used for snapshot-worker, proven Redis-backed queue system |
| node-cron | 3.x | Daily cron scheduling | Standard Node.js cron library, simpler than BullMQ repeatable jobs (deprecated) |
| MutationObserver | Native Web API | Real-time DOM change detection | Standard browser API, already used in `dom-observers.ts` |
| exponential-backoff | 3.x | Retry logic with backoff | Popular npm package for retry patterns |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| axios-retry | 4.x | HTTP retry on ESPN API failures | Already configured in `createRetryableAxios` utility |
| chrome.storage | Native Chrome API | Persist extension state | Already used for draft state persistence |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| node-cron | BullMQ repeatable jobs | BullMQ repeatable APIs deprecated as of v5.16.0, node-cron simpler for single daily job |
| exponential-backoff pkg | Custom implementation | Package handles jitter, thundering herd prevention, battle-tested |
| Shared player table | League-specific caching | Duplicates data across leagues, harder to update globally |

**Installation:**
```bash
# Backend (if not already installed)
pnpm add node-cron exponential-backoff --filter @espn-fantasy/backend

# Extension (already has chrome APIs, exponential-backoff for retry)
pnpm add exponential-backoff --filter @espn-fantasy/extension
```

## Architecture Patterns

### Recommended Project Structure (Extensions to Existing)
```
packages/
├── backend/src/
│   ├── agents/
│   │   └── player-pool-sync.ts          # NEW: Daily ESPN player pool sync
│   ├── workers/
│   │   └── player-pool-worker.ts        # NEW: Cron scheduler for player pool sync
│   └── api/
│       └── draft.ts                     # EXISTS: Already has generic endpoints
├── extension/
│   ├── lib/
│   │   ├── dom-observers.ts             # EXTEND: Add league config detection
│   │   ├── draft-config-detector.ts     # NEW: Extract league config from DOM
│   │   └── value-detection.ts           # NEW: VBD vs ADP/price comparison
│   └── components/
│       └── PlayerCard.tsx               # EXTEND: Add value color-coding
└── shared/src/
    └── types.ts                         # EXTEND: Add PlayerPoolData type
```

### Pattern 1: Player Pool Sync Agent

**What:** Agent that fetches ESPN player universe and updates shared `player` table with current stats

**When to use:** Daily cron job at 4 AM, triggered via node-cron

**Example:**
```typescript
// Source: Existing pattern from snapshot-orchestrator.ts
export class PlayerPoolSyncAgent {
  constructor(
    private db: Kysely<Database>,
    private espnAdapter: ESPNAdapter,
    private logger?: Logger,
  ) {}

  async syncPlayerPool(season: number): Promise<void> {
    // Use ESPNAdapter.fetchFreeAgents() across all leagues to build universe
    // Update player table with current stats: pct_owned, current_season_stats_json
    // Mark last_synced_at timestamp
  }
}
```

### Pattern 2: League Config Detection from DOM

**What:** Parse ESPN draft page to extract categories, roster slots, team count

**When to use:** Extension init, before first API call to `/api/draft/rankings`

**Example:**
```typescript
// NEW: extension/lib/draft-config-detector.ts
export function detectLeagueConfig(): DraftConfiguration | null {
  // Inspect ESPN draft page for:
  // 1. Scoring categories (look for stat columns in draft board header)
  // 2. Roster slots (check league settings sidebar or pre-draft roster editor)
  // 3. Total teams (count columns in draft board)

  const categories = parseCategories();
  const rosterSlots = parseRosterSlots();
  const totalTeams = parseTeamCount();

  if (!categories || !rosterSlots || !totalTeams) {
    return null; // Fallback to default 5x5 roto
  }

  return { categories, rosterSlots, totalTeams };
}
```

### Pattern 3: Auto-Refresh on Pick Detection

**What:** Trigger ranking/projection refresh when MutationObserver detects new pick

**When to use:** After each `onPick` callback in `observeDraftBoard`

**Example:**
```typescript
// EXTEND: extension/entrypoints/content.tsx
const processDetectedPick = async (pick: DraftPick) => {
  useDraftStore.getState().addPick(pick);

  // Auto-refresh rankings after each pick
  await refreshRankingsAndProjections();
};

async function refreshRankingsAndProjections() {
  const state = useDraftStore.getState();
  const config = getCachedLeagueConfig(); // Don't re-detect, use cached

  try {
    const [rankings, projectedStandings] = await Promise.all([
      getRankingsWithRetry(config),
      getProjectedStandingsWithRetry(config),
    ]);

    state.setRankings(rankings);
    state.setProjectedStandings(projectedStandings);
  } catch (error) {
    // Keep stale data on failure after retries
    console.warn("Failed to refresh after retries, keeping stale data");
  }
}
```

### Pattern 4: Value Detection (VBD vs ADP)

**What:** Calculate value as delta between VBD ranking and ADP/actual pick position

**When to use:** Display on each PlayerCard in recommendations list

**Example:**
```typescript
// NEW: extension/lib/value-detection.ts
export interface ValueIndicator {
  value: number;        // Positive = steal, negative = overpay
  label: string;        // "10-pick value" or "15% discount"
  color: "red" | "yellow" | "green";
}

export function calculateSnakeDraftValue(
  vbdRank: number,
  adp: number,
): ValueIndicator {
  const delta = adp - vbdRank; // ADP 50 vs VBD rank 40 = +10 value

  if (delta >= 10) {
    return { value: delta, label: `${delta}-pick value`, color: "green" };
  } else if (delta <= -10) {
    return { value: delta, label: `${Math.abs(delta)}-pick reach`, color: "red" };
  } else {
    return { value: delta, label: "Fair value", color: "yellow" };
  }
}

export function calculateAuctionValue(
  vbdPrice: number,
  actualPrice: number,
): ValueIndicator {
  const pctDiscount = ((vbdPrice - actualPrice) / vbdPrice) * 100;

  if (pctDiscount >= 15) {
    return { value: pctDiscount, label: `${pctDiscount.toFixed(0)}% discount`, color: "green" };
  } else if (pctDiscount <= -15) {
    return { value: pctDiscount, label: `${Math.abs(pctDiscount).toFixed(0)}% overpay`, color: "red" };
  } else {
    return { value: pctDiscount, label: "Fair value", color: "yellow" };
  }
}
```

### Anti-Patterns to Avoid

- **Detecting league config on every refresh:** Config is static during draft, cache it after initial detection
- **Using BullMQ repeatable jobs:** Deprecated in BullMQ 5.16.0+, use node-cron for simple daily jobs
- **Blocking UI on failed refresh:** Auto-retry with exponential backoff, then keep stale data (don't freeze UI)
- **Fetching full league data for player pool:** Use generic free agent endpoint across multiple leagues to build universe

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Retry with exponential backoff | Custom setTimeout loop | `exponential-backoff` npm package | Handles jitter, max attempts, thundering herd prevention |
| Cron scheduling | setInterval for daily job | `node-cron` library | Timezone support, cron expressions, handles DST |
| DOM change detection | Poll with setInterval | MutationObserver API | Native, efficient, already used in codebase |
| VBD calculation | Custom ranking math | Existing `DraftRankingsAgent` | Already implements SGP, replacement levels, VBD methodology |

**Key insight:** The codebase already has most primitives needed (MutationObserver, BullMQ for worker orchestration, generic draft endpoints). The work is wiring them together, not building from scratch.

## Common Pitfalls

### Pitfall 1: ESPN DOM Selectors Break

**What goes wrong:** ESPN updates their draft page markup, breaking category/roster slot detection

**Why it happens:** No stable data attributes, relying on CSS classes that change with redesigns

**How to avoid:**
- Use multiple selector strategies (CSS classes, semantic HTML structure, text pattern matching)
- Implement detection confidence scoring
- Show warning banner when detection fails (user constraint requirement)
- Provide manual config override UI as escape hatch

**Warning signs:** `detectLeagueConfig()` returns `null` consistently, user reports incorrect categories

### Pitfall 2: Race Condition on Draft Init

**What goes wrong:** Extension calls `/api/draft/rankings` before league config detection completes

**Why it happens:** Async DOM parsing vs immediate API call in `content.tsx`

**How to avoid:**
- Gate API calls on config detection promise
- Cache config in localStorage after first detection
- Provide loading state while config detection runs

**Warning signs:** 400 errors from API due to invalid config, rankings don't match league settings

### Pitfall 3: Player Pool Sync Contention

**What goes wrong:** Multiple cron instances run simultaneously if worker restarts during sync

**Why it happens:** No job locking mechanism on player pool sync

**How to avoid:**
- Use BullMQ job IDs for deduplication (similar to snapshot-worker.ts pattern)
- Check `last_synced_at` timestamp in player table before starting sync
- Implement advisory locks in PostgreSQL for sync operation

**Warning signs:** Duplicate player records, inconsistent `pct_owned` values, slow sync times

### Pitfall 4: Stale Rankings After Failed Refresh

**What goes wrong:** Auto-refresh after pick fails silently, user sees outdated recommendations

**Why it happens:** No visual indicator that data is stale, users assume it's current

**How to avoid:**
- Display timestamp of last successful refresh
- Show banner when operating on stale data
- Retry with exponential backoff (user constraint: 2-3 retries), then surface error

**Warning signs:** User drafts player already taken, recommendations don't reflect recent picks

### Pitfall 5: Value Detection Without ADP Data

**What goes wrong:** Snake draft value shows "Fair value" for all players when ADP is missing

**Why it happens:** ADP field is optional in `DraftRanking` type, no data source for ADP yet

**How to avoid:**
- Add ADP to player pool sync (ESPN provides `pctOwned`, use as ADP proxy initially)
- Fall back to VBD-only rankings when ADP unavailable
- Document data source and recency in UI

**Warning signs:** All players show yellow "Fair value" indicator, no steals/reaches highlighted

## Code Examples

Verified patterns from official sources and existing codebase:

### Daily Cron Job with node-cron

```typescript
// NEW: packages/backend/src/workers/player-pool-worker.ts
// Source: https://www.npmjs.com/package/node-cron (node-cron npm package)
import cron from 'node-cron';
import { getDb } from '../db/connection.js';
import { PlayerPoolSyncAgent } from '../agents/player-pool-sync.js';
import { ESPNAdapter } from '../adapters/espn.js';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// Schedule daily at 4:00 AM
cron.schedule('0 4 * * *', async () => {
  logger.info('Starting daily player pool sync');

  const db = getDb();
  const espnAdapter = new ESPNAdapter(logger);
  const syncAgent = new PlayerPoolSyncAgent(db, espnAdapter, logger);

  try {
    await syncAgent.syncPlayerPool(2025); // Current season
    logger.info('Player pool sync completed');
  } catch (error) {
    logger.error({ error }, 'Player pool sync failed');
  }
}, {
  timezone: 'America/New_York', // Adjust based on ESPN update schedule
});

logger.info('Player pool sync cron job scheduled');
```

### Exponential Backoff Retry

```typescript
// NEW: extension/lib/api-client.ts (extend existing)
// Source: https://www.npmjs.com/package/exponential-backoff
import { backOff } from 'exponential-backoff';

export async function getRankingsWithRetry(
  config: DraftConfiguration,
): Promise<DraftRanking[]> {
  return backOff(
    () => getRankings(config),
    {
      numOfAttempts: 3,
      startingDelay: 1000,    // 1 second
      timeMultiple: 2,        // Exponential: 1s, 2s, 4s
      maxDelay: 5000,         // Cap at 5 seconds
      jitter: 'full',         // Add randomness to prevent thundering herd
    }
  );
}
```

### MutationObserver for Pick Detection (Existing)

```typescript
// EXISTING: packages/extension/lib/dom-observers.ts
// Source: https://developer.chrome.com/blog/detect-dom-changes-with-mutation-observers
export function observeDraftBoard(
  onPick: (pick: DraftPick) => void,
): () => void {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        mutation.addedNodes.forEach((node) => {
          const pickElements = getPickCandidatesFromNode(node);
          pickElements.forEach((pickElement) => {
            const pick = parsePickElement(pickElement);
            if (pick) {
              onPick(pick); // Trigger auto-refresh here
            }
          });
        });
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  return () => observer.disconnect();
}
```

### Generic Draft Endpoint (Existing)

```typescript
// EXISTING: packages/backend/src/api/draft.ts
// Already implements league-agnostic ranking endpoint
app.get("/api/draft/rankings", async (request, reply) => {
  const validation = validateDraftConfig(request.query);
  if (!validation.valid) {
    return reply.code(400).send({ error: validation.error });
  }

  const config = validation.config!;
  const draftAgent = new DraftRankingsAgent(db, request.log as any);

  const rankings = await draftAgent.getRankingsWithConfig(config, {
    limit: 300,
  });

  return { rankings, meta: { totalTeams: config.totalTeams } };
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| BullMQ repeatable jobs | node-cron for daily jobs | BullMQ v5.16.0 (2024) | Simpler API for recurring tasks, deprecation warning in logs |
| Mutation Events (DOMNodeInserted) | MutationObserver API | Deprecated July 2024 | Must use MutationObserver (already done in codebase) |
| Manual VBD calculations | Shared package with formulas | Current codebase | Ensures consistency between app and extension |
| League-specific player caching | Shared player pool table | This phase | Avoids duplicate data, enables cross-league features |

**Deprecated/outdated:**
- **BullMQ repeatables:** As of v5.16.0, use Job Schedulers API or external cron (we choose node-cron)
- **Manual config passing:** Extension currently hardcodes `totalTeams: 12`, should auto-detect from DOM

## Open Questions

1. **ADP Data Source**
   - What we know: ESPN provides `pctOwned` (rostered percentage), could use as ADP proxy
   - What's unclear: Whether ESPN exposes true ADP data, or need third-party integration (FantasyPros, Yahoo)
   - Recommendation: Phase 1 use `pctOwned` as ADP proxy, Phase 2 integrate external ADP if needed

2. **Player Pool Sync Scope**
   - What we know: Need current season stats for value detection
   - What's unclear: Should sync all MLB players (~1000) or just rostered/top-300 by ownership?
   - Recommendation: Start with top 500 by ownership to minimize ESPN API calls, expand if needed

3. **League Config Detection Robustness**
   - What we know: ESPN DOM structure varies by sport (baseball vs football vs basketball)
   - What's unclear: Whether selectors need sport-specific branches or generic approach works
   - Recommendation: Implement baseball-specific detection first, document selector strategy for future sports

4. **Projected Standings Endpoint**
   - What we know: Extension needs projected final standings based on roster + projected stats
   - What's unclear: Whether to reuse `/api/leagues/:id/standings/projected` or create new generic endpoint
   - Recommendation: Create `/api/draft/projected-standings` with config in body (Claude's discretion per user constraints)

## Sources

### Primary (HIGH confidence)
- Existing codebase: `packages/backend/src/agents/draft-rankings.ts`, `packages/extension/lib/dom-observers.ts`, `packages/backend/src/api/draft.ts`
- Chrome Developer Docs: [Detect DOM changes with Mutation Observers](https://developer.chrome.com/blog/detect-dom-changes-with-mutation-observers)
- BullMQ Official Docs: [Job Schedulers](https://docs.bullmq.io/guide/job-schedulers)

### Secondary (MEDIUM confidence)
- [node-cron npm package](https://www.npmjs.com/package/node-cron) - Cron scheduling syntax and timezone support
- [exponential-backoff npm package](https://www.npmjs.com/package/exponential-backoff) - Retry pattern implementation
- [FantasyPros VBD Guide](https://www.fantasypros.com/2017/06/what-is-value-based-drafting/) - VBD methodology and ADP comparisons
- [BullMQ Task Scheduling Guide (Jan 2026)](https://oneuptime.com/blog/post/2026-01-26-task-scheduler-bullmq-nodejs/view) - Recent BullMQ patterns
- [Node.js Retry with Exponential Backoff (Jan 2026)](https://oneuptime.com/blog/post/2026-01-06-nodejs-retry-exponential-backoff/view) - Retry best practices
- [REST API Design Best Practices - Stack Overflow](https://stackoverflow.blog/2020/03/02/best-practices-for-rest-api-design/) - Parameter patterns for league-agnostic APIs

### Tertiary (LOW confidence)
- ESPN DOM structure: Not officially documented, requires reverse engineering from live pages
- PostgreSQL player data normalization: General principles from [Cybertec PostgreSQL Data Normalization](https://www.cybertec-postgresql.com/en/data-normalization-in-postgresql/)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already used or well-documented
- Architecture: MEDIUM - Patterns proven in codebase, but league config detection requires ESPN DOM reverse-engineering
- Pitfalls: MEDIUM - Based on common patterns in similar codebases, not ESPN-specific production experience

**Research date:** 2026-02-23
**Valid until:** 30 days (2026-03-25) - stable domain, but ESPN DOM changes unpredictably
