import { load } from "cheerio";
import type { BaseLogger } from "pino";
import type { ExternalRankingEntry } from "../../../shared/dist/index.js";
import { normalizePlayerName } from "../../../shared/dist/index.js";
import { CachedHttpClient } from "../utils/cached-http-client.js";

/**
 * Canonical pitcher name normalizer — re-exported from shared for backward compat.
 * Callers should prefer importing `normalizePlayerName` from the shared package directly.
 */
export const normalizePitcherName = normalizePlayerName;

/**
 * Pitcherlist Adapter
 *
 * Delegates to the scraper microservice when SCRAPER_URL is set.
 * Falls back to direct scraping for local dev without the scraper service.
 */

const SCRAPER_URL = process.env.SCRAPER_URL;

const ARCHIVE_URL =
  "https://pitcherlist.com/category/fantasy/starting-pitchers/sp-streamers/";

const HOMEPAGE_URL = "https://pitcherlist.com";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const TIER_MAP: Record<string, ExternalRankingEntry["verdict"]> = {
  "auto-start": "start",
  "probably start": "lean_start",
  "questionable start": "neutral",
  "do not start": "sit",
};

const TIER_KEYS = [
  "questionable start",
  "do not start",
  "probably start",
  "auto-start",
];

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Parse tier-grouped HTML from a Pitcherlist article into ExternalRankingEntry[].
 * Exported for unit testing.
 *
 * Parsing strategy (matches actual Pitcherlist markup as of 2026):
 * - Tier labels appear as <p> tags with bold/large text: "Auto-Starts", "Probably Starts", etc.
 * - Pitcher entries follow as <p><strong><a class="player-tag">Name</a> @ TEAM -</strong>...</p>
 * - Walk all <p> elements: when we see a tier label, update current tier; when we see a player link, record it.
 */
export function parsePitcherlistTiers(
  html: string,
  sourceUrl: string,
): ExternalRankingEntry[] {
  try {
    const $ = load(html);
    const entries: ExternalRankingEntry[] = [];
    const scrapedAt = new Date().toISOString();
    const seen = new Set<string>();

    const articleTitle =
      $("h1.entry-title").first().text().trim() ||
      $("h1").first().text().trim() ||
      "SP Streamer Ranks";

    let currentTierKey: string | null = null;

    // Walk all <p> elements in document order
    $("p").each((_i, el) => {
      const text = $(el).text().trim().toLowerCase();

      // Check if this <p> is a tier label (bold/large text with tier keyword)
      const matchedTier = TIER_KEYS.find((key) => text.startsWith(key));
      if (matchedTier) {
        currentTierKey = matchedTier;
        return; // This <p> is just the label, not a player entry
      }

      // If no tier set yet, skip
      if (!currentTierKey) return;

      // Check if this <p> contains a player-tag link (pitcher entry)
      const playerLink = $(el).find("a.player-tag").first();
      if (!playerLink.length) return;

      const name = playerLink.text().trim();
      if (!name || name.length <= 1) return;

      // Deduplicate (same pitcher may appear on multiple days)
      const dedupKey = `${name}::${currentTierKey}`;
      if (seen.has(dedupKey)) return;
      seen.add(dedupKey);

      const verdict = TIER_MAP[currentTierKey];
      const tierLabel = currentTierKey
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");

      entries.push({
        playerName: name,
        source: "pitcherlist",
        verdict,
        tier: tierLabel,
        sourceUrl,
        articleTitle,
        scrapedAt,
      });
    });

    // Fallback: if paragraph-based parsing found nothing, try table-based parsing.
    // Some older articles use <table> with "Sit / Start" or tier columns.
    if (entries.length === 0) {
      $("table").each((_i, table) => {
        $(table)
          .find("tr")
          .each((_j, row) => {
            const cells = $(row).find("td");
            if (cells.length < 4) return;

            // Pitcherlist sit/start tables: columns include pitcher name + verdict
            // Pattern: Date | Game | Away Pitcher | Sit/Start | Home Pitcher | Sit/Start
            const awayName =
              cells.eq(2).find("a").text().trim() ||
              cells.eq(2).text().replace(/\*/g, "").trim();
            const awayVerdict = cells.eq(3).text().trim().toLowerCase();
            const homeName =
              cells.eq(4)?.find("a").text().trim() ||
              cells.eq(4)?.text().replace(/\*/g, "").trim();
            const homeVerdict = cells.eq(5)?.text().trim().toLowerCase();

            for (const [name, verdictText] of [
              [awayName, awayVerdict],
              [homeName, homeVerdict],
            ]) {
              if (!name || name.length <= 1) continue;
              if (seen.has(name)) continue;
              // Skip header rows — real verdicts have a score like "Start-8", "Sit-2", "Maybe-6"
              if (!verdictText.match(/(?:start|sit|maybe)-\d/i)) continue;

              let verdict: ExternalRankingEntry["verdict"] = "neutral";
              let tier = verdictText;
              if (
                verdictText.includes("start") &&
                !verdictText.includes("sit")
              ) {
                verdict = "start";
                tier = "Start";
              } else if (verdictText.includes("maybe")) {
                verdict = "lean_start";
                tier = "Maybe";
              } else if (verdictText.includes("sit")) {
                verdict = "sit";
                tier = "Sit";
              }

              seen.add(name);
              entries.push({
                playerName: name,
                source: "pitcherlist",
                verdict,
                tier,
                sourceUrl,
                articleTitle,
                scrapedAt,
              });
            }
          });
      });
    }

    return entries;
  } catch {
    return [];
  }
}

// ─── Top 100 SP Rankings ─────────────────────────────────────────────────────

export interface Top100Entry {
  rank: number;
  playerName: string;
  team: string;
  sourceUrl: string;
}

/**
 * Parse the Top 100 Starting Pitchers table from a Pitcherlist article.
 * Table structure: Rank | Pitcher (link) | Team | Badges | Change
 * The rankings table is identified by having a header row with "Rank" and "Pitcher" columns.
 */
export function parseTop100Rankings(
  html: string,
  sourceUrl: string,
): Top100Entry[] {
  try {
    const $ = load(html);
    const entries: Top100Entry[] = [];

    $("table").each((_i, table) => {
      const headerRow = $(table).find("tr").first();
      const headers = headerRow
        .find("td, th")
        .map((_j, cell) => $(cell).text().trim().toLowerCase())
        .get();

      // Identify the Top 100 table by its header columns
      if (!headers.includes("rank") || !headers.includes("pitcher")) return;

      const rankIdx = headers.indexOf("rank");
      const pitcherIdx = headers.indexOf("pitcher");
      const teamIdx = headers.indexOf("team");

      $(table)
        .find("tr")
        .slice(1)
        .each((_j, row) => {
          const cells = $(row).find("td");
          if (cells.length < 3) return;

          const rankText = cells.eq(rankIdx).text().trim();
          const rank = parseInt(rankText, 10);
          if (isNaN(rank) || rank < 1 || rank > 200) return;

          const playerLink = cells.eq(pitcherIdx).find("a").first();
          const playerName = playerLink.length
            ? playerLink.text().trim()
            : cells.eq(pitcherIdx).text().trim();
          if (!playerName || playerName.length <= 1) return;

          const team = teamIdx >= 0 ? cells.eq(teamIdx).text().trim() : "";

          entries.push({ rank, playerName, team, sourceUrl });
        });
    });

    return entries;
  } catch {
    return [];
  }
}

export class PitcherlistAdapter {
  private readonly httpClient: CachedHttpClient;

  constructor(
    private readonly logger?: BaseLogger,
    httpClient?: CachedHttpClient,
  ) {
    this.httpClient =
      httpClient ?? new CachedHttpClient({ maxEntries: 10, logger });
  }

  /**
   * Fetch the PitcherList Top 100 Starting Pitchers rankings.
   * Discovers the latest article URL from the homepage, then parses the ranked table.
   * Results are cached for 6 hours.
   */
  async getTop100Rankings(): Promise<Top100Entry[]> {
    try {
      // Discover latest Top 100 article from homepage (not cached — URL discovery)
      this.logger?.debug("Discovering PitcherList Top 100 article URL");
      const homepageHtml = await this.httpClient.get<string>(HOMEPAGE_URL, {
        headers: { "User-Agent": USER_AGENT },
        responseType: "text",
        ttlMs: 60 * 60 * 1000, // 1 hour for homepage
        cacheKey: "pitcherlist:homepage",
      });

      const $home = load(homepageHtml);
      const top100Url = $home("a[href*='top-100-starting-pitchers']")
        .first()
        .attr("href");

      if (!top100Url) {
        this.logger?.warn(
          "Could not find Top 100 article link on PitcherList homepage",
        );
        return [];
      }

      // Fetch and parse the article (cached for full TTL)
      this.logger?.debug(
        { url: top100Url },
        "Fetching PitcherList Top 100 article",
      );
      const articleHtml = await this.httpClient.get<string>(top100Url, {
        headers: { "User-Agent": USER_AGENT },
        responseType: "text",
        ttlMs: CACHE_TTL_MS,
        cacheKey: "pitcherlist:top100",
      });

      const entries = parseTop100Rankings(articleHtml, top100Url);
      this.logger?.info(
        { count: entries.length, url: top100Url },
        "PitcherList Top 100 parsed",
      );
      return entries;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger?.warn({ error: msg }, "PitcherList Top 100 fetch failed");
      return [];
    }
  }

  async getRankings(): Promise<ExternalRankingEntry[]> {
    // Prefer scraper microservice when available
    if (SCRAPER_URL) {
      return this.getRankingsFromScraper();
    }
    return this.getRankingsDirect();
  }

  private async getRankingsFromScraper(): Promise<ExternalRankingEntry[]> {
    try {
      this.logger?.debug("Fetching Pitcherlist rankings from scraper service");
      const data = await this.httpClient.post<{
        entries: ExternalRankingEntry[];
        count: number;
      }>(`${SCRAPER_URL}/scrape/pitcherlist`, {});

      this.logger?.info(
        { count: data.count },
        "Pitcherlist rankings from scraper",
      );
      return data.entries;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger?.warn(
        { error: msg },
        "Scraper service unavailable, falling back to direct scrape",
      );
      return this.getRankingsDirect();
    }
  }

  private async getRankingsDirect(): Promise<ExternalRankingEntry[]> {
    try {
      // Step 1: Discover the latest article URL from the archive page (short TTL)
      this.logger?.debug(
        { url: ARCHIVE_URL },
        "Fetching Pitcherlist archive page",
      );

      const archiveHtml = await this.httpClient.get<string>(ARCHIVE_URL, {
        headers: { "User-Agent": USER_AGENT },
        responseType: "text",
        ttlMs: 60 * 60 * 1000, // 1 hour for archive discovery
        cacheKey: "pitcherlist:archive",
      });

      const $archive = load(archiveHtml);
      const articleUrl =
        $archive("a[href*='starting-pitcher-streamer-rank']")
          .first()
          .attr("href") ||
        $archive("a[href*='sp-streamer-rank']").first().attr("href") ||
        $archive("a[href*='streamer-ranks-fantasy-baseball']")
          .first()
          .attr("href") ||
        $archive(".entry-title a, h2 a, h3 a").first().attr("href");

      if (!articleUrl) {
        this.logger?.warn(
          "Pitcherlist: could not discover latest article URL from archive",
        );
        return [];
      }

      // Step 2: Fetch and parse the article (full TTL cache)
      this.logger?.debug({ url: articleUrl }, "Fetching Pitcherlist article");

      const articleHtml = await this.httpClient.get<string>(articleUrl, {
        headers: { "User-Agent": USER_AGENT },
        responseType: "text",
        ttlMs: CACHE_TTL_MS,
        cacheKey: "pitcherlist:latest",
      });

      const entries = parsePitcherlistTiers(articleHtml, articleUrl);

      this.logger?.info(
        { count: entries.length, articleUrl },
        "Pitcherlist rankings parsed",
      );

      return entries;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger?.warn(
        { error: msg },
        "Pitcherlist scraping failed — returning empty array",
      );
      return [];
    }
  }
}
