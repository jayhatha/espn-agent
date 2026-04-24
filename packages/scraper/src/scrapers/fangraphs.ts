import axios from "axios";
import { load } from "cheerio";
import type { BaseLogger } from "pino";
import type { ExternalRankingEntry } from "@espn-fantasy/shared";
import { getCached, setCache } from "../lib/redis.js";

const ARCHIVE_URL = "https://fantasy.fangraphs.com/category/sp-chart/";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const CACHE_KEY = "scraper:fangraphs:latest";
const CACHE_TTL_EMPTY = 30 * 60; // 30 min when no results found

/** Seconds until 6 AM ET tomorrow. */
function ttlUntilMorning(): number {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const next6am = new Date(et);
  next6am.setDate(next6am.getDate() + 1);
  next6am.setHours(6, 0, 0, 0);
  return Math.max(3600, Math.floor((next6am.getTime() - et.getTime()) / 1000));
}

/**
 * Map FanGraphs league-size "x" marks to a verdict.
 *
 * - x in all three (10/12/15+) → "start" (universal start)
 * - x in 10 and 12 only       → "lean_start" (start in deeper leagues)
 * - x in 10 only              → "neutral" (streaming option)
 * - no x marks                → "sit" (not recommended)
 */
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

/**
 * Parse FanGraphs SP Chart article HTML into ExternalRankingEntry[].
 * Exported for testing.
 */
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

    // Find the SP chart table inside the article content.
    // It's the table with headers: RK, PITCHER, Tm, Opp, 10, 12, 15+, ...
    $("article table, .entry-content table").each((_i, table) => {
      const headers = $(table)
        .find("thead th")
        .map((_j, th) => $(th).text().trim().toLowerCase())
        .get();

      // Verify this is the right table by checking for expected columns
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

          const has10 = col10 >= 0 && cells.eq(col10).text().trim().toLowerCase() === "x";
          const has12 = col12 >= 0 && cells.eq(col12).text().trim().toLowerCase() === "x";
          const has15 = col15 >= 0 && cells.eq(col15).text().trim().toLowerCase() === "x";

          const verdict = leagueMarksToVerdict(has10, has12, has15);

          // Build a tier label from the league marks
          const marks = [has10 && "10", has12 && "12", has15 && "15+"].filter(Boolean);
          const tier = marks.length > 0 ? `Start (${marks.join("/")})` : "Sit";

          entries.push({
            playerName: name,
            source: "fangraphs" as ExternalRankingEntry["source"],
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

export async function scrapeFangraphs(
  logger?: BaseLogger,
  forceRefresh = false,
): Promise<ExternalRankingEntry[]> {
  if (!forceRefresh) {
    const cached = await getCached<ExternalRankingEntry[]>(CACHE_KEY);
    if (cached) {
      logger?.debug("FanGraphs SP chart served from Redis cache");
      return cached;
    }
  }

  try {
    // Step 1: Discover latest article from the archive page
    logger?.debug({ url: ARCHIVE_URL }, "Fetching FanGraphs SP Chart archive");
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
      logger?.warn("FanGraphs: could not discover latest SP Chart article URL");
      return [];
    }

    // Strip anchor fragments
    const cleanUrl = articleUrl.split("#")[0];

    // Step 2: Fetch and parse the article
    logger?.debug({ url: cleanUrl }, "Fetching FanGraphs SP Chart article");
    const articleResponse = await axios.get<string>(cleanUrl, {
      headers: { "User-Agent": USER_AGENT },
      timeout: 15000,
      responseType: "text",
    });

    const entries = parseFangraphsChart(articleResponse.data, cleanUrl);

    logger?.info(
      { count: entries.length, articleUrl: cleanUrl },
      "FanGraphs SP chart scraped",
    );

    await setCache(CACHE_KEY, entries, entries.length > 0 ? ttlUntilMorning() : CACHE_TTL_EMPTY);

    return entries;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger?.warn({ error: msg }, "FanGraphs scraping failed");
    return [];
  }
}
