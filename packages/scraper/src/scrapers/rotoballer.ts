import { load } from "cheerio";
import type { BaseLogger } from "pino";
import type { ExternalRankingEntry } from "@espn-fantasy/shared";
import { getCached, setCache } from "../lib/redis.js";

/** Tag page listing all start/sit articles — scraper picks the latest one. */
const TAG_URL =
  "https://www.rotoballer.com/tag/mlb-start-sit-series-for-fantasy-baseball";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const CACHE_KEY = "scraper:rotoballer:latest";
const CACHE_TTL_EMPTY = 30 * 60; // 30 min when no results found

/** Seconds until 6 AM ET tomorrow — avoids re-scraping once we have results. */
function ttlUntilMorning(): number {
  const now = new Date();
  const et = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" }),
  );
  const next6am = new Date(et);
  next6am.setDate(next6am.getDate() + 1);
  next6am.setHours(6, 0, 0, 0);
  return Math.max(3600, Math.floor((next6am.getTime() - et.getTime()) / 1000));
}

function textToVerdict(text: string): ExternalRankingEntry["verdict"] {
  const t = text.toLowerCase().trim();
  if (t === "must start" || t === "start") return "start";
  if (t === "lean start") return "lean_start";
  if (t === "coin flip" || t === "neutral") return "neutral";
  if (t === "lean sit") return "lean_sit";
  if (t === "sit" || t === "bench" || t === "avoid") return "sit";
  return "neutral";
}

/**
 * Return a numeric score for how relevant a pitcher article URL is to today.
 * Higher score = more relevant.
 *
 * Priority order:
 *   1. Article whose week START date is in the future but within 7 days (upcoming week, already published)
 *   2. Article that covers today (today is within the week range)
 *   3. Article whose week END date is within 3 days in the past (just ended)
 *   4. No match (0)
 *
 * This lets us pick up newly-published next-week articles that RotoBaller
 * releases before the current week ends, which contain the most up-to-date grades.
 */
function articleRelevanceScore(href: string): number {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const d = today.getDate();

  const weekly = href.match(/for-(\d{1,2})-(\d{1,2})-(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (!weekly) return 0;

  const [, m1, d1, m2, d2, yr] = weekly.map(Number);
  if (yr !== y) return 0;

  const start = m1 * 100 + d1;
  const end = m2 * 100 + d2;
  const now = m * 100 + d;

  // Upcoming within 7 days: highest priority (newly published next-week article)
  if (start > now) {
    const daysUntilStart =
      (new Date(y, m1 - 1, d1).getTime() - new Date(y, m - 1, d).getTime()) /
      86400000;
    if (daysUntilStart <= 7) return 300 - daysUntilStart; // closer start = higher score
    return 0;
  }

  // Covers today
  if (now >= start && now <= end) return 200;

  // Recently ended (within 3 days)
  if (now > end) {
    const daysAfterEnd =
      (new Date(y, m - 1, d).getTime() - new Date(y, m2 - 1, d2).getTime()) /
      86400000;
    if (daysAfterEnd <= 3) return 100 - daysAfterEnd;
  }

  return 0;
}

/**
 * Find the latest pitcher article, then extract the Google Sheets CSV URL.
 *
 * Rotoballer embeds pitcher data in a published Google Sheet. We extract the
 * sheet ID from the article HTML and convert it to a CSV export URL.
 */
async function findSheetCsvUrl(
  logger?: BaseLogger,
): Promise<{ csvUrl: string; articleUrl: string } | null> {
  // Step 1: Find the current pitcher article from the tag page
  const tagResp = await fetch(TAG_URL, { headers: { "User-Agent": UA } });
  if (!tagResp.ok) {
    logger?.warn({ status: tagResp.status }, "Failed to fetch Rotoballer tag page");
    return null;
  }

  const tagHtml = await tagResp.text();
  const $tag = load(tagHtml);

  const links: { href: string; title: string }[] = [];

  // Featured article — #feat_content div with onclick handler
  $tag("#feat_content").each((_i, el) => {
    const onclick = $tag(el).attr("onclick") || "";
    const match = onclick.match(/location\.href='([^']+)'/);
    const title = $tag(el).find("p").text().trim();
    if (match?.[1]) {
      links.push({ href: match[1], title: title || "Featured Article" });
    }
  });

  // Article cards
  $tag(".mainSectionContentItem > a").each((_i, el) => {
    const href = $tag(el).attr("href");
    const title = $tag(el).find("h2").text().trim();
    if (href && title && !links.some((l) => l.href === href)) {
      links.push({ href, title });
    }
  });

  logger?.debug(
    { count: links.length },
    "Found article links on tag page",
  );

  // Find the most relevant pitcher article. We score each candidate and pick
  // the highest scorer — this lets a newly-published next-week article win
  // over the current-week article when RotoBaller publishes ahead of time.
  const pitcherLinks = links.filter(
    (l) => /pitcher/i.test(l.title) || /pitcher/i.test(l.href),
  );

  let chosen: (typeof links)[number] | undefined;
  let bestScore = 0;
  for (const link of pitcherLinks) {
    const score = articleRelevanceScore(link.href);
    if (score > bestScore) {
      bestScore = score;
      chosen = link;
    }
  }

  if (!chosen) {
    logger?.warn("No current pitcher start/sit article found on Rotoballer tag page");
    return null;
  }

  const articleUrl = chosen.href.startsWith("http")
    ? chosen.href
    : `https://www.rotoballer.com${chosen.href}`;

  logger?.info({ url: articleUrl, title: chosen.title }, "Found Rotoballer pitcher article");

  // Step 2: Fetch the article and extract the Google Sheets embed URL
  const artResp = await fetch(articleUrl, { headers: { "User-Agent": UA } });
  if (!artResp.ok) {
    logger?.warn({ status: artResp.status, url: articleUrl }, "Failed to fetch Rotoballer article");
    return null;
  }

  const artHtml = await artResp.text();

  // Match the published Google Sheets URL embedded in the article.
  // The article embeds a pubhtml URL that includes the correct gid for the
  // current week's tab — e.g. ?gid=56327054. We must extract that gid rather
  // than hardcoding gid=0, because RotoBaller rotates data to new sheet tabs
  // each week.
  //
  // Preferred: full pubhtml URL with gid param
  //   https://docs.google.com/spreadsheets/d/e/SHEET_ID/pubhtml?gid=GID&...
  // Fallback: bare pub URL without gid (fall back to gid=0)
  //   https://docs.google.com/spreadsheets/d/e/SHEET_ID/pub...
  const fullMatch = artHtml.match(
    /https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/([A-Za-z0-9_-]+)\/pubhtml\?(?:[^"'<>]*&(?:amp;)?)?gid=(\d+)/,
  );
  const bareMatch = artHtml.match(
    /https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/([A-Za-z0-9_-]+)\/pub/,
  );

  if (!fullMatch && !bareMatch) {
    logger?.warn({ url: articleUrl }, "No Google Sheets embed found in Rotoballer article");
    return null;
  }

  const sheetId = fullMatch ? fullMatch[1] : bareMatch![1];
  const gid = fullMatch ? fullMatch[2] : "0";
  const csvUrl = `https://docs.google.com/spreadsheets/d/e/${sheetId}/pub?gid=${gid}&single=true&output=csv`;

  logger?.debug({ gid }, "Resolved Google Sheets gid for Rotoballer");

  logger?.info({ csvUrl }, "Extracted Google Sheets CSV URL");
  return { csvUrl, articleUrl };
}

/**
 * Parse the Google Sheets CSV export.
 *
 * Columns: Date, Game, Team, Pitcher, Grade, Start/Sit, 2 Starts
 */
function parseCsv(
  csv: string,
  sourceUrl: string,
): ExternalRankingEntry[] {
  const lines = csv.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  // Parse header to find column indices
  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
  const pitcherCol = headers.findIndex((h) => h === "pitcher");
  const gradeCol = headers.findIndex((h) => h === "grade");
  const verdictCol = headers.findIndex((h) => h.includes("start") || h.includes("sit"));

  if (pitcherCol < 0 || verdictCol < 0) return [];

  const entries: ExternalRankingEntry[] = [];
  const seen = new Set<string>();
  const scrapedAt = new Date().toISOString();

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const name = cols[pitcherCol]?.trim();
    if (!name || name.length < 2) continue;
    if (seen.has(name)) continue;
    seen.add(name);

    const verdictText = cols[verdictCol]?.trim() || "";
    const grade =
      gradeCol >= 0 ? parseInt(cols[gradeCol]?.trim(), 10) || undefined : undefined;

    entries.push({
      playerName: name,
      source: "rotoballer",
      verdict: textToVerdict(verdictText),
      grade,
      sourceUrl,
      articleTitle: "Start/Sit — All Starting Pitcher Matchups (Rotoballer)",
      scrapedAt,
    });
  }

  return entries;
}

/** Simple CSV line parser that handles quoted fields. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

export async function scrapeRotoballer(
  logger?: BaseLogger,
  forceRefresh = false,
): Promise<ExternalRankingEntry[]> {
  if (!forceRefresh) {
    const cached = await getCached<ExternalRankingEntry[]>(CACHE_KEY);
    if (cached) {
      logger?.debug("Rotoballer rankings served from Redis cache");
      return cached;
    }
  }

  try {
    logger?.info("Scraping Rotoballer");

    const sheet = await findSheetCsvUrl(logger);
    if (!sheet) {
      await setCache(CACHE_KEY, [], CACHE_TTL_EMPTY);
      return [];
    }

    // Fetch the CSV — no auth needed for published sheets
    const resp = await fetch(sheet.csvUrl);
    if (!resp.ok) {
      logger?.warn({ status: resp.status }, "Failed to fetch Google Sheets CSV");
      return [];
    }

    const csv = await resp.text();
    const entries = parseCsv(csv, sheet.articleUrl);

    logger?.info(
      { count: entries.length, url: sheet.articleUrl },
      "Rotoballer pitcher rankings scraped",
    );

    await setCache(
      CACHE_KEY,
      entries,
      entries.length > 0 ? ttlUntilMorning() : CACHE_TTL_EMPTY,
    );

    return entries;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger?.warn({ error: msg }, "Rotoballer scraping failed");
    return [];
  }
}
