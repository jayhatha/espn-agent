import axios from "axios";
import { load } from "cheerio";
import { LRUCache } from "lru-cache";
import type { BaseLogger } from "pino";
import type { ExternalRankingEntry } from "../../../shared/dist/index.js";

/**
 * Pitcherlist Adapter
 *
 * Scrapes the weekly "SP Streamer Ranks" article from pitcherlist.com.
 * Extracts tier-grouped pitcher names and maps tiers to normalized verdicts.
 *
 * Gracefully degrades — always returns [] on any error, never throws to caller.
 * Caches results with 6-hour TTL to avoid repeated scraping.
 */

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

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

type CacheEntry = { data: ExternalRankingEntry[]; expiresAt: number };

/**
 * Normalize a name for matching: strip diacritics, lowercase, remove non-alpha.
 * Enhanced over the StreamingPitcherAgent pattern to handle accented characters.
 */
export function normalizePitcherName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/**
 * Parse tier-grouped HTML from a Pitcherlist article into ExternalRankingEntry[].
 * Exported for unit testing.
 *
 * Parsing strategy:
 * - Find h2/h3 headings containing known tier keywords
 * - For each tier heading, traverse siblings until we find a table
 * - Extract player names from first td cell (prefer <a> tag text, fall back to td text)
 */
export function parsePitcherlistTiers(
  html: string,
  sourceUrl: string,
): ExternalRankingEntry[] {
  try {
    const $ = load(html);
    const entries: ExternalRankingEntry[] = [];
    const scrapedAt = new Date().toISOString();

    // Article title from h1.entry-title or fallback to first h1
    const articleTitle =
      $("h1.entry-title").first().text().trim() ||
      $("h1").first().text().trim() ||
      "SP Streamer Ranks";

    // Find tier headings (h2 or h3) that contain known tier keywords
    $("h2, h3").each((_i, heading) => {
      const headingText = $(heading).text().toLowerCase();

      // Find matching tier
      const tierKey = Object.keys(TIER_MAP).find((key) =>
        headingText.includes(key),
      );
      if (!tierKey) return;

      const verdict = TIER_MAP[tierKey];
      const tierLabel = Object.keys(TIER_MAP).find((k) =>
        headingText.includes(k),
      );

      // Find the next sibling table (may be adjacent or a few elements away)
      let table = $(heading).next("table");
      if (!table.length) {
        table = $(heading).nextAll("table").first();
      }

      if (!table.length) return;

      table.find("tr").each((_j, row) => {
        const cells = $(row).find("td");
        if (!cells.length) return; // Skip header rows

        const firstCell = cells.first();
        // Prefer link text, fall back to cell text
        const name =
          firstCell.find("a").first().text().trim() ||
          firstCell.text().trim();

        if (name && name.length > 1) {
          entries.push({
            playerName: name,
            source: "pitcherlist",
            verdict,
            tier: tierLabel
              ? tierLabel
                  .split(" ")
                  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                  .join(" ")
              : headingText,
            sourceUrl,
            articleTitle,
            scrapedAt,
          });
        }
      });
    });

    return entries;
  } catch {
    // Never throw — return empty array on any parse error
    return [];
  }
}

export class PitcherlistAdapter {
  private cache: LRUCache<string, CacheEntry>;

  constructor(private logger?: BaseLogger) {
    this.cache = new LRUCache<string, CacheEntry>({ max: 10 });
  }

  async getRankings(): Promise<ExternalRankingEntry[]> {
    const cacheKey = "pitcherlist:latest";

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.logger?.debug("Pitcherlist rankings served from cache");
      return cached.data;
    }

    try {
      // Step 1: Discover the latest article URL from the archive page
      this.logger?.debug(
        { url: ARCHIVE_URL },
        "Fetching Pitcherlist archive page",
      );

      const archiveResponse = await axios.get<string>(ARCHIVE_URL, {
        headers: { "User-Agent": USER_AGENT },
        timeout: 15000,
        responseType: "text",
      });

      const $archive = load(archiveResponse.data);
      const articleUrl = $archive(
        "a[href*='starting-pitcher-streamer-rank']",
      )
        .first()
        .attr("href");

      if (!articleUrl) {
        this.logger?.warn(
          "Pitcherlist: could not discover latest article URL from archive",
        );
        return [];
      }

      // Step 2: Fetch and parse the article
      this.logger?.debug(
        { url: articleUrl },
        "Fetching Pitcherlist article",
      );

      const articleResponse = await axios.get<string>(articleUrl, {
        headers: { "User-Agent": USER_AGENT },
        timeout: 15000,
        responseType: "text",
      });

      const entries = parsePitcherlistTiers(articleResponse.data, articleUrl);

      this.logger?.info(
        { count: entries.length, articleUrl },
        "Pitcherlist rankings parsed",
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
        "Pitcherlist scraping failed — returning empty array",
      );
      return [];
    }
  }
}
