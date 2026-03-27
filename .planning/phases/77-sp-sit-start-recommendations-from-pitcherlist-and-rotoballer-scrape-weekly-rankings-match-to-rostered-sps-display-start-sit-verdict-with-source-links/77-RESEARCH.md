# Phase 77: SP Sit/Start Recommendations — Research

**Researched:** 2026-03-26
**Domain:** Web scraping (Pitcherlist + Rotoballer), fantasy baseball SP recommendations, Fastify API, Next.js frontend
**Confidence:** MEDIUM (scraping targets confirmed static for Pitcherlist; Rotoballer content is JavaScript-rendered — discovery approach confirmed, parsing structure needs runtime validation)

---

## Summary

Phase 77 adds a "Sit/Start" tab to the existing Pitching Usage page (`/leagues/[id]/streaming`). The feature scrapes weekly SP rankings from Pitcherlist and Rotoballer, matches the listed pitchers against the user's rostered SPs, and displays a start/sit verdict with a direct link back to the source article.

Two data sources serve different purposes:

- **Pitcherlist** publishes a daily "SP Streamer Ranks" article (3 consecutive dates) with pitchers organized into four tiers: Auto-Start, Probably Start, Questionable Start, Do Not Start. Content is **static HTML** parseable with cheerio + axios. A category archive page (`pitcherlist.com/category/fantasy/starting-pitchers/sp-streamers/`) always lists the most recent article as the first `<a>` link, making URL discovery reliable.

- **Rotoballer** publishes a weekly "Start/Sit Pitchers" article covering a full week (Mon–Sun). It provides grades on a 0–100 scale and verdict labels (Start, Lean Start, Coin Flip, Lean Sit, Sit). The page is **JavaScript-rendered** — static HTML fetch returns only ad/tracking scripts, not pitcher data. The weekly article URL includes a numeric ID that cannot be constructed programmatically; it must be discovered by scraping the Rotoballer MLB news page or searching their category. This is a significant technical complication.

**Primary recommendation:** Implement Pitcherlist scraping first (cheerio + axios, static HTML, proven URL discovery). Use Rotoballer as a secondary source with a graceful-degradation path if URL discovery fails. Cache scraped results in LRU-cache (same pattern as ESPNAdapter) with a 6-hour TTL to avoid hammering the sites. Surface results via a new `GET /api/leagues/:leagueId/teams/:teamId/pitching/sit-start` endpoint that joins scraped external data against the team's rostered SP list.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| axios | ^1.6.5 | HTTP fetch of external pages | Already in `backend/package.json` |
| cheerio | ^1.2.0 | Static HTML parsing (jQuery-like API) | Industry standard for Node.js static scraping |
| lru-cache | ^11.2.6 | In-process TTL cache for scraped results | Already in `backend/package.json`, same pattern as ESPNAdapter |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node-cron | ^4.2.1 | Schedule daily scrape refresh | Already in `backend/package.json`; use to warm cache pre-game-day |
| axios-retry | ^4.5.0 | Retry on 5xx / network errors | Already in `backend/package.json` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| cheerio | puppeteer / playwright | Playwright handles JS-rendered Rotoballer pages but requires a Chrome instance — massive overhead for a single weekly article. Graceful-degrade approach is cheaper. |
| LRU-cache | Redis | Redis adds infrastructure complexity; LRU is sufficient for single-process scraping with 6-hour TTL |
| Manual URL discovery | Hardcoded URL | Hardcoded URL breaks every week — never hardcode Rotoballer article IDs |

**Installation (cheerio only — all others already present):**
```bash
cd packages/backend && pnpm add cheerio
```

**Version verification:**
```bash
npm view cheerio version  # 1.2.0
```

---

## Architecture Patterns

### Recommended Project Structure

```
packages/backend/src/
  adapters/
    pitcherlist.ts          # Scrapes pitcherlist.com — URL discovery + tier extraction
    rotoballer.ts           # Scrapes rotoballer.com — URL discovery + grade extraction
  agents/
    sit-start-advisor.ts    # Merges external rankings with rostered SP list
  api/
    pitching-usage.ts       # ADD: GET /pitching/sit-start route (alongside existing GS routes)

packages/frontend/src/app/leagues/[id]/streaming/
  page.tsx                  # ADD "Sit/Start" tab alongside existing gs-pacing, start-plan, streaming tabs
```

### Pattern 1: Adapter per external source

Each scraping site gets its own adapter class following the same shape as `MLBStatsAPIAdapter`. The adapter owns:
- URL discovery (fetch category/archive page, extract latest article link)
- Article HTML fetch
- HTML parsing into a normalized `ExternalRankingEntry[]`
- LRU-cache with TTL

**Why:** Decouples Pitcherlist scraping logic from Rotoballer scraping logic. If Rotoballer changes its HTML structure, only one file changes. Agent (`sit-start-advisor.ts`) always receives the same `ExternalRankingEntry[]` type regardless of source.

### Pattern 2: Normalized `ExternalRankingEntry` type

```typescript
// Source: project convention — matches shared types pattern in shared/src/types.ts
export interface ExternalRankingEntry {
  playerName: string;          // As spelled on source site
  source: "pitcherlist" | "rotoballer";
  verdict: "start" | "lean_start" | "neutral" | "lean_sit" | "sit";
  tier?: string;               // Pitcherlist: "Auto-Start", "Probably Start", etc.
  grade?: number;              // Rotoballer: 0–100
  sourceUrl: string;           // Direct link to the article — shown in UI
  articleTitle: string;        // e.g. "SP Streamer Ranks: 3/26 & 3/27 & 3/28"
  scrapedAt: string;           // ISO timestamp
}
```

**Verdict mapping:**
- Pitcherlist "Auto-Start" → `start`
- Pitcherlist "Probably Start" → `lean_start`
- Pitcherlist "Questionable Start" → `neutral`
- Pitcherlist "Do Not Start" → `sit`
- Rotoballer grade >= 65 → `start`, 55–64 → `lean_start`, 45–54 → `neutral`, 35–44 → `lean_sit`, < 35 → `sit`

### Pattern 3: SitStartAdvisor agent

The agent:
1. Fetches rostered SPs for the team (from `team_roster_snapshot`)
2. Fetches `ExternalRankingEntry[]` from both adapters (each returns empty array on failure — never throws to caller)
3. Fuzzy-matches player names (same normalize-and-compare pattern already in `StreamingPitcherAgent.findMatchingProjection`)
4. Returns per-pitcher verdict with source attribution and link

```typescript
// Pattern from packages/backend/src/agents/streaming-pitcher.ts
private findMatchingProjection(probablePitcherName: string, projections: ...) {
  const normalize = (name: string) =>
    name.toLowerCase().replace(/[^a-z]/g, "");
  const searchName = normalize(probablePitcherName);
  return projections.find(p => normalize(p.name) === searchName);
}
```

Use the same `normalize()` function for SP name matching against external rankings.

### Pattern 4: Pitcherlist URL discovery

```typescript
// Fetch the SP Streamers archive, extract first article link
const archiveUrl = "https://pitcherlist.com/category/fantasy/starting-pitchers/sp-streamers/";
const html = await axios.get(archiveUrl, { headers: { "User-Agent": "..." } });
const $ = cheerio.load(html.data);
// First <a> with an href matching the slug pattern is the latest article
const latestUrl = $("a[href*='starting-pitcher-streamer-rank']").first().attr("href");
```

**Confirmed:** The category page always shows the most recent article first. The slug pattern varies between `starting-pitcher-streamer-ranks-...` and `starting-pitcher-streamer-rankings-...` — use a contains-match on `starting-pitcher-streamer-rank` (without trailing 's') to catch both variants.

### Pattern 5: Rotoballer URL discovery (JavaScript-rendered — DEGRADED PATH)

Rotoballer's MLB page (`rotoballer.com/mlb`) is also JavaScript-rendered. The only reliable approach without a headless browser is a Google-indexed URL search as a fallback, or accepting that Rotoballer data will only be available after the article URL is manually configured or discovered via WebSearch.

**Recommended approach:** Accept degraded mode for Rotoballer. The adapter attempts to fetch and parse the weekly article if the URL is found in an in-memory cache from a previous successful scrape; otherwise it returns empty array. Log a warning when Rotoballer data is unavailable so the UI shows "Pitcherlist only" with no broken state.

An alternative: attempt a `GET https://www.rotoballer.com/category/mlb/fantasy-baseball-advice-analysis/starts-and-sits/` category page (if it exists) — needs runtime validation.

### Pattern 6: LRU cache in adapters

```typescript
// Source: packages/backend/src/adapters/espn.ts — same pattern
private cache: LRUCache<string, { data: ExternalRankingEntry[]; expiresAt: number }>;

constructor() {
  this.cache = new LRUCache({ max: 10 });
}

async getRankings(): Promise<ExternalRankingEntry[]> {
  const cacheKey = "pitcherlist:latest";
  const cached = this.cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  // ... fetch and parse ...
  this.cache.set(cacheKey, { data: results, expiresAt: Date.now() + 6 * 60 * 60 * 1000 });
  return results;
}
```

TTL = 6 hours. Pitcherlist posts daily by 10–12am ET; 6-hour TTL ensures freshness without hammering.

### Pattern 7: API endpoint structure

New route added to `packages/backend/src/api/pitching-usage.ts`:

```
GET /api/leagues/:leagueId/teams/:teamId/pitching/sit-start
```

Response shape:
```typescript
{
  recommendations: Array<{
    playerId: number;
    playerName: string;       // From our DB
    rosterSlot: string;       // "SP", "P"
    pitcherlistVerdict?: "start" | "lean_start" | "neutral" | "lean_sit" | "sit";
    rotoballerVerdict?: "start" | "lean_start" | "neutral" | "lean_sit" | "sit";
    rotoballerGrade?: number; // 0–100
    pitcherlistTier?: string; // "Auto-Start", "Probably Start", etc.
    sourceUrl: {
      pitcherlist?: string;   // Direct article link
      rotoballer?: string;    // Direct article link
    };
    consensus?: "start" | "lean_start" | "neutral" | "lean_sit" | "sit"; // averaged
  }>;
  sources: {
    pitcherlist?: { articleTitle: string; articleUrl: string; scrapedAt: string };
    rotoballer?: { articleTitle: string; articleUrl: string; scrapedAt: string; status: "ok" | "degraded" };
  };
}
```

### Pattern 8: Frontend tab integration

The streaming page (`packages/frontend/src/app/leagues/[id]/streaming/page.tsx`) already has a `PitchingTab` type and tab nav. Add `"sit-start"` as a fourth tab value. The tab renders a table of rostered SPs with verdict badges and source links.

```typescript
// Extend existing tab type in streaming/page.tsx
type PitchingTab = "gs-pacing" | "start-plan" | "streaming" | "sit-start";
```

### Anti-Patterns to Avoid

- **Hardcoding Rotoballer article URLs:** The numeric slug (e.g., `/1833281`) changes every week. Never hardcode it.
- **Blocking the API route on scrape latency:** Always return cached data. Cache miss should trigger async background refresh, not block the request. Or pre-warm via cron.
- **Failing silently when both sources are down:** If both return empty, respond with `{ recommendations: [], sources: {} }` and HTTP 200. Frontend shows "No external rankings available" — never 500.
- **Scraping on every API request:** Always use the LRU cache. Uncached requests should be rate-limited to at most once per 30 minutes per source.
- **Using `as any` to bypass cheerio typings:** cheerio 1.2.0 has full TypeScript types — use them.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTML parsing | Custom regex text extraction | cheerio | Regex against HTML breaks on whitespace/attribute changes; cheerio handles malformed HTML |
| HTTP retry | Manual try/catch loops | axios-retry (already installed) | Handles exponential backoff, status code filtering |
| Name fuzzy matching | Levenshtein distance | normalize-and-compare (existing pattern) | Already works in StreamingPitcherAgent; sufficient for pitcher names |
| URL freshness | Polling every N minutes | LRU TTL expiry | Simpler, no background thread needed |

**Key insight:** Both sites are editorial articles, not APIs. The content structure will change mid-season. Build the parsing to degrade gracefully (return empty array) rather than throw — the feature is additive, not load-bearing.

---

## Common Pitfalls

### Pitfall 1: Rotoballer JavaScript rendering
**What goes wrong:** `axios.get(rotoballerUrl)` returns JS bundles and ad config, not pitcher data. The pitcher table is rendered client-side.
**Why it happens:** Rotoballer uses a client-side React/Next.js app with dynamic data loading.
**How to avoid:** Accept Rotoballer as a best-effort source. Skip it gracefully if the rendered table cannot be extracted. Consider a future upgrade to Playwright if Rotoballer data is deemed essential.
**Warning signs:** Parsed HTML has no `<table>` elements or pitcher names.

### Pitfall 2: Pitcherlist article slug variation
**What goes wrong:** URL pattern switches between `starting-pitcher-streamer-ranks-...` and `starting-pitcher-streamer-rankings-...` (with/without trailing 's').
**Why it happens:** Pitcherlist has inconsistent slug naming across authors/years.
**How to avoid:** Use contains-match: `$("a[href*='starting-pitcher-streamer-rank']")` (not an exact prefix match).
**Warning signs:** URL discovery returns null for a known valid article.

### Pitfall 3: Player name mismatches
**What goes wrong:** Pitcherlist spells "Cristopher Sánchez" with accent; our DB has "Cristopher Sanchez". Exact match fails.
**Why it happens:** Diacritics in player names from external sources vs. ASCII in our DB.
**How to avoid:** Normalize name by: lowercasing, replacing diacritics with ASCII equivalents (`str.normalize("NFD").replace(/[\u0300-\u036f]/g, "")`), removing non-alpha characters.
**Warning signs:** Zero matches despite expected players being on Pitcherlist.

### Pitfall 4: Site anti-scraping blocks
**What goes wrong:** Pitcherlist returns 403 or bot-detection page after repeated requests.
**Why it happens:** Missing `User-Agent` header or too-frequent requests.
**How to avoid:** Set a realistic `User-Agent` header (desktop browser UA). Respect the 6-hour cache TTL — never request more than once per cache miss.
**Warning signs:** axios returns 403 or HTML contains "Access denied" or Cloudflare challenge page.

### Pitfall 5: Mid-season article structure changes
**What goes wrong:** Pitcherlist redesigns their rankings table mid-season; tier header CSS classes change.
**Why it happens:** Editorial sites iterate frequently on presentation.
**How to avoid:** Log raw scrape results at DEBUG level so breakage is visible. Build the parser to return empty array (not throw) on unexpected structure. Add a `parsedCount` metric to the API response so the frontend can show "No external data available" vs an error.
**Warning signs:** `parsedCount === 0` when a known article URL was successfully fetched.

### Pitfall 6: Pitcherlist streamer ranks are for streamers, not rostered starters
**What goes wrong:** Pitcherlist "Streamer Ranks" focuses on free agent streamers, not rostered SPs. Elite aces (Crochet, Skenes) appear as "Auto-Start" but most rostered SP2/SP3 pitchers are not listed at all.
**Why it happens:** The streamer ranks are specifically targeted at streaming decisions for players not rostered in most leagues.
**How to avoid:** Use Pitcherlist's **Top 100 SP Rankings** article (weekly) as the primary rostered-SP source, and the Streamer Ranks as the secondary. Both should be scraped and merged. Alternatively: use only Rotoballer's weekly start/sit (which covers ALL starters) and use Pitcherlist as supplemental.
**Warning signs:** Only 10-15 matches found despite team having 9 SPs.

---

## Code Examples

### Cheerio: Parse Pitcherlist tier-grouped table

```typescript
// Source: confirmed static HTML structure from pitcherlist.com
import * as cheerio from "cheerio";

function parsePitcherlistTiers(html: string, sourceUrl: string): ExternalRankingEntry[] {
  const $ = cheerio.load(html);
  const entries: ExternalRankingEntry[] = [];
  const articleTitle = $("h1.entry-title").first().text().trim();

  // Tiers appear as <h2> or <h3> headings followed by tables
  // Heading text contains: "Auto-Start", "Probably Start", "Questionable Start", "Do Not Start"
  const tierMap: Record<string, ExternalRankingEntry["verdict"]> = {
    "auto-start": "start",
    "probably start": "lean_start",
    "questionable start": "neutral",
    "do not start": "sit",
  };

  // Each tier section: heading + table with class "dataTableLazyLoad" or "dataTableLaunch"
  $("h2, h3").each((_i, heading) => {
    const headingText = $(heading).text().toLowerCase();
    const verdict = Object.entries(tierMap).find(([key]) => headingText.includes(key))?.[1];
    if (!verdict) return;

    // Find the next sibling table
    const table = $(heading).nextAll("table").first();
    table.find("tr").each((_j, row) => {
      const cells = $(row).find("td");
      const name = cells.first().find("a").text().trim() || cells.first().text().trim();
      if (name) {
        entries.push({
          playerName: name,
          source: "pitcherlist",
          verdict,
          tier: Object.keys(tierMap).find(k => headingText.includes(k)) ?? headingText,
          sourceUrl,
          articleTitle,
          scrapedAt: new Date().toISOString(),
        });
      }
    });
  });

  return entries;
}
```

Note: The exact heading/table selector relationship needs runtime validation — the tier headings may be `<h2>` inside a `<div>`, not direct siblings of the table.

### API endpoint (pitching-usage.ts addition)

```typescript
// Add to packages/backend/src/api/pitching-usage.ts
app.get<{ Params: { leagueId: string; teamId: string } }>(
  "/api/leagues/:leagueId/teams/:teamId/pitching/sit-start",
  {
    onRequest: [authenticate],
    preHandler: [requireLeagueAccess, requireTeamOwnership],
  },
  async (request, reply) => {
    const leagueId = parseInt(request.params.leagueId, 10);
    const teamId = parseInt(request.params.teamId, 10);
    try {
      const advisor = new SitStartAdvisor(db, request.log);
      return await advisor.getRecommendations(leagueId, teamId);
    } catch (error) {
      request.log.error({ error }, "Failed to generate sit/start recommendations");
      return reply.code(500).send({ error: "Failed to generate sit/start recommendations" });
    }
  },
);
```

### Frontend api.ts addition

```typescript
// Add to packages/frontend/src/lib/api.ts
async getSitStartRecommendations(leagueId: number, teamId: number) {
  return fetchAPI(`/api/leagues/${leagueId}/teams/${teamId}/pitching/sit-start`);
},
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-----------------|--------------|--------|
| Manual bookmarking of external sites | Automated scraping surfaced in-app | Phase 77 | Saves manager time, reduces context switching |
| Internal-only start/sit (GS pacing) | External expert rankings merged with internal data | Phase 77 | Higher quality signal — editorial expertise + league-specific roster context |

**Note on Rotoballer rendering:** Rotoballer appears to have moved to client-side rendering at some point. Earlier articles (2023) may have been statically rendered. In 2026, the page requires JavaScript execution to see pitcher data.

---

## Open Questions

1. **Rotoballer content accessibility**
   - What we know: Static HTML fetch returns no pitcher data (JS-rendered). The article URL format is known but includes an unpredictable numeric ID.
   - What's unclear: Is there a Rotoballer category/archive page (`rotoballer.com/category/mlb/fantasy-baseball-advice-analysis/starts-and-sits/`) that IS statically renderable and lists recent articles? This was not confirmed.
   - Recommendation: On Wave 0, manually probe `https://www.rotoballer.com/category/mlb/fantasy-baseball-advice-analysis/starts-and-sits/` with cheerio. If it yields article links, use it for URL discovery. If not, implement Pitcherlist-only for Phase 77 and mark Rotoballer as a Phase 78 enhancement.

2. **Pitcherlist Streamer Ranks vs. Top 100 SP Rankings coverage**
   - What we know: Streamer Ranks focus on streamers (free agents), not necessarily rostered SPs. Top 100 SP Rankings is published weekly and covers the full SP landscape including rostered aces.
   - What's unclear: Which article type gives better coverage for rostered SP decisions?
   - Recommendation: Scrape the weekly "Top 100 Starting Pitchers" article (category: `pitcherlist.com/category/fantasy/starting-pitchers/sp-rankings/`) as primary source, and Streamer Ranks as secondary. The Top 100 article also uses `dataTableLazyLoad` table class and has confirmed static HTML.

3. **Cheerio TypeScript ESM compatibility**
   - What we know: Backend uses `"type": "module"` (ESM). Cheerio 1.2.0 ships as ESM and CJS.
   - What's unclear: Whether `import * as cheerio from "cheerio"` or `import { load } from "cheerio"` is correct for this project's ESM config.
   - Recommendation: Use `import { load } from "cheerio"` (named export). This is the documented ESM pattern for cheerio 1.x.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| axios | HTTP scraping | Yes (installed) | ^1.6.5 | — |
| axios-retry | Retry on failure | Yes (installed) | ^4.5.0 | — |
| lru-cache | Result caching | Yes (installed) | ^11.2.6 | — |
| node-cron | Cache pre-warming | Yes (installed) | ^4.2.1 | Manual refresh on first request |
| cheerio | HTML parsing | Not yet installed | 1.2.0 available | — (must install) |
| Pitcherlist.com | Primary rankings | Confirmed accessible, static HTML | — | Degrade to no external rankings |
| Rotoballer.com | Secondary rankings | Accessible but JS-rendered | — | Skip gracefully, show Pitcherlist only |

**Missing dependencies with no fallback:**
- `cheerio` — must be installed (`pnpm add cheerio` in `packages/backend`)

**Missing dependencies with fallback:**
- `rotoballer.com` data — if JS-rendering blocks extraction, degrade to Pitcherlist-only

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 1.1.1 |
| Config file | vitest.config.ts (implicit) |
| Quick run command | `cd packages/backend && pnpm test -- --run agents/__tests__/sit-start-advisor.test.ts` |
| Full suite command | `cd packages/backend && pnpm test -- --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PITCH-04 (extended) | Rostered SPs matched to external rankings | unit | `pnpm test -- --run agents/__tests__/sit-start-advisor.test.ts` | Wave 0 |
| SCRAPE-01 | Pitcherlist HTML parsing extracts correct tiers | unit | `pnpm test -- --run adapters/__tests__/pitcherlist.test.ts` | Wave 0 |
| SCRAPE-02 | Name normalization handles diacritics | unit | (included in sit-start-advisor test) | Wave 0 |
| SCRAPE-03 | Adapter returns empty array on 404/parse failure | unit | (included in adapter tests) | Wave 0 |

### Wave 0 Gaps

- [ ] `packages/backend/src/agents/__tests__/sit-start-advisor.test.ts` — covers player matching, verdict merging
- [ ] `packages/backend/src/adapters/__tests__/pitcherlist.test.ts` — covers HTML parsing with fixture HTML
- [ ] `packages/backend/src/adapters/__tests__/rotoballer.test.ts` — covers graceful degradation
- [ ] Install cheerio: `cd packages/backend && pnpm add cheerio`

---

## Project Constraints (from CLAUDE.md)

- Agents must accept `Kysely db` + optional Pino `logger`. Never fabricate data — mark outputs as degraded when data is incomplete.
- Never log secrets. (Not applicable here — no secrets in scraping.)
- Empty array guard: always check `array.length > 0` before `WHERE col IN (array)`.
- Use component-based math for rate stats. (Not applicable — no rate stats in this phase.)
- Frontend team selection stored in `localStorage` key `league_${leagueId}_team`.
- Backend: Fastify 4, TypeScript, Kysely. Frontend: Next.js 14 App Router, TanStack Query v5, Tailwind CSS.
- Monorepo: Turbo + pnpm. New packages go in `packages/backend/` or `packages/frontend/`.
- `api.ts` client library SHOULD be used (CLAUDE.md Known Issue #3 — all pages currently hardcode localhost:3001; this phase should use `api.ts`).

---

## Sources

### Primary (HIGH confidence)

- Live fetch: `pitcherlist.com/starting-pitcher-streamer-ranks-fantasy-baseball-3-26-3-27-3-28/` — confirmed static HTML with tier structure (Auto-Start/Probably Start/Questionable Start/Do Not Start)
- Live fetch: `pitcherlist.com/category/fantasy/starting-pitchers/sp-streamers/` — confirmed latest article appears as first `<a>` link
- Live fetch: `pitcherlist.com/top-100-starting-pitchers-for-2026-fantasy-baseball-3-25-week-1-rankings/` — confirmed `dataTableLazyLoad` table class, static HTML, Top 5 pitcher names

### Secondary (MEDIUM confidence)

- WebSearch + live content: Rotoballer weekly article URL pattern confirmed (`start-sit-pitchers-fantasy-baseball-matchups-for-[dates]-[year]/[id]`) with consistent date format
- WebSearch: Rotoballer provides 0–100 grades and Start/Lean Start/Coin Flip/Lean Sit/Sit verdict labels (multiple 2025 article descriptions confirm)
- Live content analysis: Rotoballer pages are JavaScript-rendered; static HTML fetch yields only ad/tracking scripts

### Tertiary (LOW confidence)

- Rotoballer HTML structure for the pitcher table (CSS classes, column order) — NOT confirmed without headless browser. Any parsing implementation needs runtime validation against a real article.
- Rotoballer category/archive page URL for discovery — not confirmed accessible or statically renderable

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are already in the project except cheerio; versions verified
- Pitcherlist scraping: HIGH — confirmed static HTML, tier structure, URL discovery pattern, example pitcher data extracted
- Rotoballer scraping: LOW — JavaScript-rendered, no confirmed HTML table structure, URL discovery mechanism unconfirmed
- Architecture patterns: HIGH — follows existing agent/adapter patterns in the codebase
- Name matching: HIGH — existing pattern proven in `StreamingPitcherAgent`

**Research date:** 2026-03-26
**Valid until:** 2026-04-25 (scraping targets may change structure at any time — re-validate if parsedCount drops to 0)
