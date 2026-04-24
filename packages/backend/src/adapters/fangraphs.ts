import axios from "axios";
import { load } from "cheerio";
import { LRUCache } from "lru-cache";
import type { BaseLogger } from "pino";
import type { ExternalRankingEntry } from "../../../shared/dist/index.js";

/**
 * FanGraphs SP Chart Adapter
 *
 * Scrapes the daily "Starting Pitcher Chart" from fantasy.fangraphs.com.
 * Delegates to the scraper microservice when SCRAPER_URL is set.
 * Falls back to direct scraping for local dev.
 */

const SCRAPER_URL = process.env.SCRAPER_URL;

const ARCHIVE_URL = "https://fantasy.fangraphs.com/category/sp-chart/";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

type CacheEntry = { data: ExternalRankingEntry[]; expiresAt: number };

function leagueMarksToVerdict(
  has10: boolean,
  has12: boolean,
  has15: boolean,
): ExternalRankingEntry["verdict"] {
  const count = [has10, has12, has15].filter(Boolean).length;
  if (count === 3) return "start";
  if (count === 2) return "lean_start";
  if (count === 1) return "neutral";
  return "sit";
}

export function parseFangraphsChart(
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
      "Starting Pitcher Chart — FanGraphs";

    $("article table, .entry-content table").each((_i, table) => {
      const headers = $(table)
        .find("thead th")
        .map((_j, th) => $(th).text().trim().toLowerCase())
        .get();

      const pitcherIdx = headers.indexOf("pitcher");
      if (pitcherIdx === -1) return;

      const col10 = headers.indexOf("10");
      const col12 = headers.indexOf("12");
      const col15 = headers.findIndex((h) => h.startsWith("15"));

      $(table)
        .find("tbody tr")
        .each((_j, row) => {
          const cells = $(row).find("td");
          if (cells.length < 5) return;

          const name =
            cells.eq(pitcherIdx).find("a").text().trim() ||
            cells.eq(pitcherIdx).text().trim();

          if (!name || name.length <= 1 || seen.has(name)) return;
          seen.add(name);

          const has10 =
            col10 >= 0 && cells.eq(col10).text().trim().toLowerCase() === "x";
          const has12 =
            col12 >= 0 && cells.eq(col12).text().trim().toLowerCase() === "x";
          const has15 =
            col15 >= 0 && cells.eq(col15).text().trim().toLowerCase() === "x";

          const verdict = leagueMarksToVerdict(has10, has12, has15);
          const marks = [has10 && "10", has12 && "12", has15 && "15+"].filter(
            Boolean,
          );
          const tier =
            marks.length > 0 ? `Start (${marks.join("/")})` : "Sit";

          entries.push({
            playerName: name,
            source: "fangraphs",
            verdict,
            tier,
            sourceUrl,
            articleTitle,
            scrapedAt,
          });
        });
    });

    return entries;
  } catch {
    return [];
  }
}

export class FangraphsAdapter {
  private cache: LRUCache<string, CacheEntry>;

  constructor(private logger?: BaseLogger) {
    this.cache = new LRUCache<string, CacheEntry>({ max: 10 });
  }

  async getRankings(): Promise<ExternalRankingEntry[]> {
    if (SCRAPER_URL) {
      return this.getRankingsFromScraper();
    }
    return this.getRankingsDirect();
  }

  private async getRankingsFromScraper(): Promise<ExternalRankingEntry[]> {
    try {
      this.logger?.debug("Fetching FanGraphs rankings from scraper service");
      const response = await axios.post<{
        entries: ExternalRankingEntry[];
        count: number;
      }>(`${SCRAPER_URL}/scrape/fangraphs`, {}, { timeout: 20000 });

      this.logger?.info(
        { count: response.data.count },
        "FanGraphs rankings from scraper",
      );
      return response.data.entries;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger?.warn(
        { error: msg },
        "Scraper service unavailable for FanGraphs, falling back to direct scrape",
      );
      return this.getRankingsDirect();
    }
  }

  private async getRankingsDirect(): Promise<ExternalRankingEntry[]> {
    const cacheKey = "fangraphs:latest";

    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.logger?.debug("FanGraphs SP chart served from cache");
      return cached.data;
    }

    try {
      this.logger?.debug(
        { url: ARCHIVE_URL },
        "Fetching FanGraphs SP Chart archive",
      );

      const archiveResponse = await axios.get<string>(ARCHIVE_URL, {
        headers: { "User-Agent": USER_AGENT },
        timeout: 15000,
        responseType: "text",
      });

      const $archive = load(archiveResponse.data);
      const articleUrl = $archive(
        "a[href*='starting-pitcher-chart']",
      )
        .first()
        .attr("href");

      if (!articleUrl) {
        this.logger?.warn(
          "FanGraphs: could not discover latest SP Chart article",
        );
        return [];
      }

      const cleanUrl = articleUrl.split("#")[0];

      this.logger?.debug(
        { url: cleanUrl },
        "Fetching FanGraphs SP Chart article",
      );

      const articleResponse = await axios.get<string>(cleanUrl, {
        headers: { "User-Agent": USER_AGENT },
        timeout: 15000,
        responseType: "text",
      });

      const entries = parseFangraphsChart(articleResponse.data, cleanUrl);

      this.logger?.info(
        { count: entries.length, articleUrl: cleanUrl },
        "FanGraphs SP chart parsed",
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
        "FanGraphs scraping failed — returning empty array",
      );
      return [];
    }
  }
}
