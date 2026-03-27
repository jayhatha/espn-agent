import axios from "axios";
import { load } from "cheerio";
import { LRUCache } from "lru-cache";
import type { BaseLogger } from "pino";
import type { ExternalRankingEntry } from "../../../shared/dist/index.js";

/**
 * Rotoballer Adapter
 *
 * Attempts to scrape the weekly "Start/Sit Pitchers" article from rotoballer.com.
 * Rotoballer content is JavaScript-rendered — static HTML fetch typically returns
 * only ad/tracking scripts, not pitcher data.
 *
 * This adapter implements a graceful-degradation path:
 * - Attempt to fetch the category/archive page for URL discovery
 * - If static HTML contains article links, attempt to parse the first one
 * - If no pitcher data found (JS-rendered), log warning and return []
 * - On ANY failure, return [] — never throw to caller
 *
 * Rotoballer is a best-effort secondary source. Pitcherlist is the primary source.
 */

const CATEGORY_URL =
  "https://www.rotoballer.com/category/mlb/fantasy-baseball-advice-analysis/starts-and-sits/";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

type CacheEntry = { data: ExternalRankingEntry[]; expiresAt: number };

/**
 * Map Rotoballer grade (0-100) to normalized verdict.
 * >= 65 -> "start", 55-64 -> "lean_start", 45-54 -> "neutral", 35-44 -> "lean_sit", < 35 -> "sit"
 */
function gradeToVerdict(grade: number): ExternalRankingEntry["verdict"] {
  if (grade >= 65) return "start";
  if (grade >= 55) return "lean_start";
  if (grade >= 45) return "neutral";
  if (grade >= 35) return "lean_sit";
  return "sit";
}

/**
 * Attempt to parse pitcher data from a Rotoballer article HTML.
 * Returns empty array if no table elements found (JS-rendered content).
 */
function parseRotoballerArticle(
  html: string,
  sourceUrl: string,
): ExternalRankingEntry[] {
  const $ = load(html);
  const entries: ExternalRankingEntry[] = [];
  const scrapedAt = new Date().toISOString();

  // Check for table elements — if none exist, content is JS-rendered
  const tables = $("table");
  if (!tables.length) {
    return [];
  }

  const articleTitle =
    $("h1").first().text().trim() || "Start/Sit Pitchers — Rotoballer";

  // Try to parse pitcher data from tables
  // Rotoballer format (when statically renderable): pitcher name + grade columns
  tables.each((_i, table) => {
    $(table)
      .find("tr")
      .each((_j, row) => {
        const cells = $(row).find("td");
        if (cells.length < 2) return;

        const name = cells.first().find("a").text().trim() || cells.first().text().trim();
        const gradeText = cells.eq(1).text().trim();
        const grade = parseInt(gradeText, 10);

        if (name && name.length > 1 && !isNaN(grade) && grade >= 0 && grade <= 100) {
          entries.push({
            playerName: name,
            source: "rotoballer",
            verdict: gradeToVerdict(grade),
            grade,
            sourceUrl,
            articleTitle,
            scrapedAt,
          });
        }
      });
  });

  return entries;
}

export class RotoballerAdapter {
  private cache: LRUCache<string, CacheEntry>;

  constructor(private logger?: BaseLogger) {
    this.cache = new LRUCache<string, CacheEntry>({ max: 10 });
  }

  async getRankings(): Promise<ExternalRankingEntry[]> {
    const cacheKey = "rotoballer:latest";

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.logger?.debug("Rotoballer rankings served from cache");
      return cached.data;
    }

    try {
      // Step 1: Attempt to fetch the category/archive page
      this.logger?.debug(
        { url: CATEGORY_URL },
        "Fetching Rotoballer category page",
      );

      const categoryResponse = await axios.get<string>(CATEGORY_URL, {
        headers: { "User-Agent": USER_AGENT },
        timeout: 15000,
        responseType: "text",
      });

      const $category = load(categoryResponse.data);

      // Look for article links containing "starts-and-sits" or "start-sit"
      const articleLink = $category(
        "a[href*='start-sit-pitchers'], a[href*='starts-and-sits-pitchers'], a[href*='start-sit-sp']",
      )
        .first()
        .attr("href");

      if (!articleLink) {
        // Category page may be JS-rendered too
        this.logger?.warn(
          "Rotoballer data unavailable (JS-rendered content) — no article links found",
        );
        return [];
      }

      // Step 2: Attempt to fetch and parse the article
      this.logger?.debug(
        { url: articleLink },
        "Fetching Rotoballer article",
      );

      const articleResponse = await axios.get<string>(articleLink, {
        headers: { "User-Agent": USER_AGENT },
        timeout: 15000,
        responseType: "text",
      });

      const entries = parseRotoballerArticle(articleResponse.data, articleLink);

      if (!entries.length) {
        this.logger?.warn(
          { url: articleLink },
          "Rotoballer data unavailable (JS-rendered content) — no pitcher data in HTML",
        );
        // Cache empty result to avoid hammering on every request
        this.cache.set(cacheKey, {
          data: [],
          expiresAt: Date.now() + CACHE_TTL_MS,
        });
        return [];
      }

      this.logger?.info(
        { count: entries.length, articleLink },
        "Rotoballer rankings parsed",
      );

      // Cache the result
      this.cache.set(cacheKey, {
        data: entries,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });

      return entries;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger?.warn(
        { error: msg },
        "Rotoballer scraping failed — returning empty array",
      );
      return [];
    }
  }
}
