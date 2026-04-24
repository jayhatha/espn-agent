import axios from "axios";
import { load } from "cheerio";
import { LRUCache } from "lru-cache";
import type { BaseLogger } from "pino";
import type { ExternalRankingEntry } from "../../../shared/dist/index.js";

/**
 * Rotoballer Adapter
 *
 * Delegates to the scraper microservice when SCRAPER_URL is set.
 * The scraper uses Playwright to render Rotoballer's JS-heavy pages.
 * Falls back to static HTML fetch (which typically returns empty) for local dev.
 */

const SCRAPER_URL = process.env.SCRAPER_URL;

const CATEGORY_URL =
  "https://www.rotoballer.com/tag/mlb-start-sit-series-for-fantasy-baseball";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

type CacheEntry = { data: ExternalRankingEntry[]; expiresAt: number };

function gradeToVerdict(grade: number): ExternalRankingEntry["verdict"] {
  if (grade >= 65) return "start";
  if (grade >= 55) return "lean_start";
  if (grade >= 45) return "neutral";
  if (grade >= 35) return "lean_sit";
  return "sit";
}

function parseRotoballerArticle(
  html: string,
  sourceUrl: string,
): ExternalRankingEntry[] {
  const $ = load(html);
  const entries: ExternalRankingEntry[] = [];
  const scrapedAt = new Date().toISOString();

  const tables = $("table");
  if (!tables.length) {
    return [];
  }

  const articleTitle =
    $("h1").first().text().trim() || "Start/Sit Pitchers — Rotoballer";

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
    // Prefer scraper microservice — it has a headless browser for JS-rendered content
    if (SCRAPER_URL) {
      return this.getRankingsFromScraper();
    }
    return this.getRankingsDirect();
  }

  private async getRankingsFromScraper(): Promise<ExternalRankingEntry[]> {
    try {
      this.logger?.debug("Fetching Rotoballer rankings from scraper service");
      const response = await axios.post<{
        entries: ExternalRankingEntry[];
        count: number;
      }>(`${SCRAPER_URL}/scrape/rotoballer`, {}, { timeout: 45000 });

      this.logger?.info(
        { count: response.data.count },
        "Rotoballer rankings from scraper",
      );
      return response.data.entries;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger?.warn(
        { error: msg },
        "Scraper service unavailable for Rotoballer — returning empty array",
      );
      return [];
    }
  }

  private async getRankingsDirect(): Promise<ExternalRankingEntry[]> {
    const cacheKey = "rotoballer:latest";

    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.logger?.debug("Rotoballer rankings served from cache");
      return cached.data;
    }

    try {
      this.logger?.debug(
        { url: CATEGORY_URL },
        "Fetching Rotoballer category page",
      );

      const categoryResponse = await axios.get<string>(CATEGORY_URL, {
        headers: { "User-Agent": USER_AGENT },
        timeout: 15000,
        responseType: "text",
        maxRedirects: 5,
      });

      const $category = load(categoryResponse.data);

      const articleLink =
        $category("a[href*='start-sit-pitchers']").first().attr("href") ||
        $category("a[href*='starts-and-sits-pitchers']").first().attr("href") ||
        $category("a[href*='start-sit-sp']").first().attr("href") ||
        $category("a[href*='pitcher-starts-sits']").first().attr("href") ||
        $category("a[href*='fantasy-baseball'][href*='start']").first().attr("href");

      if (!articleLink) {
        this.logger?.warn(
          "Rotoballer: no article links found (JS-rendered content — use scraper service)",
        );
        return [];
      }

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
          "Rotoballer: no pitcher data in HTML (JS-rendered — use scraper service)",
        );
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
