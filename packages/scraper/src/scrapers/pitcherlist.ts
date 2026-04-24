import axios from "axios";
import { load } from "cheerio";
import type { BaseLogger } from "pino";
import type { ExternalRankingEntry } from "@espn-fantasy/shared";
import { getCached, setCache } from "../lib/redis.js";

const ARCHIVE_URL =
  "https://pitcherlist.com/category/fantasy/starting-pitchers/sp-streamers/";

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

const CACHE_KEY = "scraper:pitcherlist:latest";
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

    // Walk all <p> elements — tier labels are bold/large text, pitcher entries have a.player-tag
    $("p").each((_i, el) => {
      const text = $(el).text().trim().toLowerCase();

      const matchedTier = TIER_KEYS.find((key) => text.startsWith(key));
      if (matchedTier) {
        currentTierKey = matchedTier;
        return;
      }

      if (!currentTierKey) return;

      const playerLink = $(el).find("a.player-tag").first();
      if (!playerLink.length) return;

      const name = playerLink.text().trim();
      if (!name || name.length <= 1) return;

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

    // Fallback: table-based parsing for "Sit or Start" column format
    if (entries.length === 0) {
      $("table").each((_i, table) => {
        $(table)
          .find("tr")
          .each((_j, row) => {
            const cells = $(row).find("td");
            if (cells.length < 4) return;

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

export async function scrapePitcherlist(
  logger?: BaseLogger,
  forceRefresh = false,
): Promise<ExternalRankingEntry[]> {
  if (!forceRefresh) {
    const cached = await getCached<ExternalRankingEntry[]>(CACHE_KEY);
    if (cached) {
      logger?.debug("Pitcherlist rankings served from Redis cache");
      return cached;
    }
  }

  try {
    // Step 1: Discover latest article URL
    logger?.debug({ url: ARCHIVE_URL }, "Fetching Pitcherlist archive page");
    const archiveResponse = await axios.get<string>(ARCHIVE_URL, {
      headers: { "User-Agent": USER_AGENT },
      timeout: 15000,
      responseType: "text",
    });

    const $archive = load(archiveResponse.data);
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
      logger?.warn("Pitcherlist: could not discover latest article URL");
      return [];
    }

    // Step 2: Fetch and parse article (static HTML is sufficient for Pitcherlist)
    logger?.debug({ url: articleUrl }, "Fetching Pitcherlist article");
    const articleResponse = await axios.get<string>(articleUrl, {
      headers: { "User-Agent": USER_AGENT },
      timeout: 15000,
      responseType: "text",
    });

    const entries = parsePitcherlistTiers(articleResponse.data, articleUrl);

    logger?.info(
      { count: entries.length, articleUrl },
      "Pitcherlist rankings scraped",
    );

    await setCache(CACHE_KEY, entries, entries.length > 0 ? ttlUntilMorning() : CACHE_TTL_EMPTY);

    return entries;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger?.warn({ error: msg }, "Pitcherlist scraping failed");
    return [];
  }
}
