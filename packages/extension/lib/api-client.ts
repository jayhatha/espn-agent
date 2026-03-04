import pitcherlistRankings from "../assets/pitcherlist-rankings.json";
import fangraphsAuctionValues from "../assets/fangraphs-auction-values.json";
import { isPracticeDraft } from "./draft-config-detector";

/**
 * Throttle helper - limits function execution to once per wait period
 */
function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => ReturnType<T> | undefined {
  let timeout: NodeJS.Timeout | null = null;
  let lastRun = 0;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = wait - (now - lastRun);

    if (remaining <= 0) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      lastRun = now;
      return func(...args);
    }

    return undefined;
  };
}

/**
 * Request deduplication cache - prevents duplicate in-flight requests
 */
const inflightRequests = new Map<string, Promise<any>>();

function dedupedRequest<T>(
  key: string,
  requestFn: () => Promise<T>
): Promise<T> {
  const existing = inflightRequests.get(key);
  if (existing) {
    console.log(`[API Client] Deduping request: ${key}`);
    return existing as Promise<T>;
  }

  const promise = requestFn().finally(() => {
    inflightRequests.delete(key);
  });

  inflightRequests.set(key, promise);
  return promise;
}

// Export throttle for use in content script
export { throttle };

export interface PlayerRanking {
  playerId: number;
  playerName: string;
  positions: string[];
  primaryPosition: string;
  vbdScore: number;
  tier: number;
  projectedStats: Record<string, number>;
  tierName?: string;       // External tier name (e.g., "STUD", "Elite")
  externalRank?: number;   // External ranking number
  rankSource?: string;     // Source of external rank ("PL" = PitcherList, "CM" = CloserMonkey)
  espnAuctionValue?: number; // ESPN pre-draft auction dollar value
}

export interface AuctionValue {
  playerId: number;
  playerName: string;
  dollarValue: number;
  vbdScore: number;
  positions: string[];
}

export interface GetRankingsOptions {
  draftFormat?: "snake" | "auction";
  scoringType?: "roto" | "h2h";
  backendLeagueId?: string;
  position?: string;
}

export interface GetAuctionValuesOptions {
  budget?: number;
  rosterSize?: number;
  backendLeagueId?: string;
  position?: string;
}

export interface ProjectedStandingsResponse {
  snapshotDate: string;
  overallStandings: Array<{
    team_id: number;
    teamName: string;
    projected_overall_rank: number;
    projected_overall_points: number;
  }>;
  currentOverallStandings: Array<{
    team_id: number;
    teamName: string;
    overall_rank: number;
    overall_points: number;
  }>;
}

export interface BackendLeagueSummary {
  id: number;
  espnLeagueId: number;
  season?: number;
  name: string;
  created_at?: string;
  snapshotDate?: string;
}

interface BackendLeaguesResponse {
  leagues?: BackendLeagueSummary[];
}

interface RawLeagueSummary {
  id?: number;
  name?: string;
  season?: number;
  created_at?: string;
  espn_league_id?: number;
  espnLeagueId?: number;
  snapshotDate?: string;
}

const DEFAULT_BACKEND_URL = "http://localhost:3001";
const REQUEST_TIMEOUT_MS = 10000;

function normalizeBackendUrl(rawBackendUrl?: string): string {
  const value = (rawBackendUrl || "").trim();
  const backendUrl = value || DEFAULT_BACKEND_URL;
  return backendUrl.replace(/\/+$/, "");
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalize player name for PitcherList matching (same logic as draft board page).
 * Uses NFD (not NFKD) and strips everything except letters and spaces.
 * Kept separate from normalizeText which is used for league name matching.
 */
function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z\s]/g, "")
    .toLowerCase()
    .trim();
}

interface ESPNDraftPlayer {
  playerId: number;
  playerName: string;
  positions: string[];
  mlbTeam: string;
  espnAuctionValue: number;
  rotoAuctionValue: number;
  averageDraftPosition: number;
  averageAuctionValue: number;
  percentOwned: number;
  rank: number;
}

interface PitcherListRanking {
  rank: number;
  playerName: string;
  tier: number;
  tierName: string;
  handedness: string;
  team: string;
}

interface FangraphsPlayer {
  name: string;
  team: string;
  pos: string;
  dollars: number;
  mlbamId: number;
  fgId: string;
}

/**
 * Build rankings and auction values from bundled FanGraphs auction values + PitcherList tiers.
 * No backend or network calls required. Used as fallback when getDraftBoardData() fails.
 */
function buildBundledRankings(): {
  rankings: PlayerRanking[];
  auctionValues: AuctionValue[];
} {
  // Build FanGraphs dollar value lookup
  const fgLookup = new Map<string, FangraphsPlayer>();
  for (const p of fangraphsAuctionValues.hitters as FangraphsPlayer[]) {
    fgLookup.set(normalizeName(p.name), p);
  }
  for (const p of fangraphsAuctionValues.pitchers as FangraphsPlayer[]) {
    fgLookup.set(normalizeName(p.name), p);
  }

  // Build external ranking lookups (PitcherList for SP/hitters, CloserMonkey for RP)
  const relieverLookup = new Map<string, PitcherListRanking>();
  for (const p of pitcherlistRankings.relievers as PitcherListRanking[]) {
    relieverLookup.set(normalizeName(p.playerName), p);
  }
  const plLookup = new Map<string, PitcherListRanking>();
  for (const p of pitcherlistRankings.pitchers as PitcherListRanking[]) {
    plLookup.set(normalizeName(p.playerName), p);
  }
  for (const p of pitcherlistRankings.hitters as PitcherListRanking[]) {
    plLookup.set(normalizeName(p.playerName), p);
  }

  // Collect all unique players from both sources
  const seen = new Set<string>();
  const merged: Array<{
    name: string;
    pos: string;
    dollars: number;
    mlbamId: number;
    tier: number;
    tierName?: string;
    extRank?: number;
    rankSource?: string;
  }> = [];

  // FanGraphs players first (they have real dollar values)
  for (const [key, fg] of fgLookup) {
    seen.add(key);
    // Check relievers (CloserMonkey) first, then PitcherList
    const reliever = relieverLookup.get(key);
    const pl = reliever || plLookup.get(key);
    merged.push({
      name: fg.name,
      pos: fg.pos,
      dollars: fg.dollars,
      mlbamId: fg.mlbamId,
      tier: pl?.tier ?? 99,
      tierName: pl?.tierName,
      extRank: pl?.rank,
      rankSource: reliever ? "CM" : pl ? "PL" : undefined,
    });
  }

  // External-only players not in FanGraphs (assign $1 value)
  const allExternal = new Map<string, { ranking: PitcherListRanking; source: string }>();
  for (const [key, r] of relieverLookup) allExternal.set(key, { ranking: r, source: "CM" });
  for (const [key, r] of plLookup) {
    if (!allExternal.has(key)) allExternal.set(key, { ranking: r, source: "PL" });
  }
  for (const [key, { ranking: ext, source }] of allExternal) {
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({
      name: ext.playerName,
      pos: ext.handedness?.includes("P") ? "SP" : "UT",
      dollars: 1,
      mlbamId: 0,
      tier: ext.tier,
      tierName: ext.tierName,
      extRank: ext.rank,
      rankSource: source,
    });
  }

  // Sort by dollar value descending
  merged.sort((a, b) => b.dollars - a.dollars);

  const rankings: PlayerRanking[] = [];
  const auctionValues: AuctionValue[] = [];

  for (let i = 0; i < merged.length; i++) {
    const p = merged[i];
    const positions = p.pos ? p.pos.split("/").map(s => s.trim()) : ["UT"];
    const syntheticId = p.mlbamId || -(i + 1);

    rankings.push({
      playerId: syntheticId,
      playerName: p.name,
      positions,
      primaryPosition: positions[0],
      vbdScore: p.dollars,
      tier: p.tier,
      projectedStats: {},
      tierName: p.tierName,
      externalRank: p.extRank,
      rankSource: p.rankSource,
    });

    auctionValues.push({
      playerId: syntheticId,
      playerName: p.name,
      dollarValue: Math.round(p.dollars),
      vbdScore: p.dollars,
      positions,
    });
  }

  console.log("[API Client] Built bundled rankings:", rankings.length, "players (FG:", fgLookup.size, "+ PL-only:", merged.length - fgLookup.size, ")");
  return { rankings, auctionValues };
}

/**
 * Fetch draft data from /api/draft/espn and merge with bundled PitcherList rankings.
 * Uses the same data source as the admin draft board page for consistency.
 * Returns null if fetch fails or returns empty data.
 */
export async function getDraftBoardData(): Promise<{
  rankings: PlayerRanking[];
  auctionValues: AuctionValue[];
} | null> {
  return dedupedRequest("draftBoardData", async () => {
    try {
      const { backendUrl } = await chrome.storage.local.get(["backendUrl"]);
      const normalizedBackendUrl = normalizeBackendUrl(backendUrl);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(`${normalizedBackendUrl}/api/draft/espn?limit=500`, {
        signal: controller.signal,
        mode: "cors",
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn("[API Client] Draft board endpoint returned", response.status);
        return null;
      }

      const data = await parseJsonSafely(response);
      const players: ESPNDraftPlayer[] = data?.players || [];

      if (players.length === 0) {
        console.warn("[API Client] Draft board endpoint returned empty players list");
        return null;
      }

      // Build PitcherList lookup maps (same approach as draft board page matchPlayers)
      const pitcherMap = new Map<string, PitcherListRanking>();
      for (const ext of pitcherlistRankings.pitchers as PitcherListRanking[]) {
        pitcherMap.set(normalizeName(ext.playerName), ext);
      }
      const hitterMap = new Map<string, PitcherListRanking>();
      for (const ext of pitcherlistRankings.hitters as PitcherListRanking[]) {
        hitterMap.set(normalizeName(ext.playerName), ext);
      }
      const relieverMap = new Map<string, PitcherListRanking>();
      for (const ext of pitcherlistRankings.relievers as PitcherListRanking[]) {
        relieverMap.set(normalizeName(ext.playerName), ext);
      }

      const rankings: PlayerRanking[] = [];
      const auctionValues: AuctionValue[] = [];

      for (const player of players) {
        const normalized = normalizeName(player.playerName);

        // Try exact match first (SP > RP > Hitter priority)
        let match: PitcherListRanking | undefined;
        let matchSource: string | undefined;

        if (pitcherMap.has(normalized)) {
          match = pitcherMap.get(normalized);
          matchSource = "PL";
        } else if (relieverMap.has(normalized)) {
          match = relieverMap.get(normalized);
          matchSource = "CM";
        } else if (hitterMap.has(normalized)) {
          match = hitterMap.get(normalized);
          matchSource = "PL";
        }

        // Try last name fallback
        if (!match) {
          const lastName = normalized.split(" ").pop() || "";
          if (lastName.length > 3) {
            for (const [key, val] of pitcherMap) {
              if (key.endsWith(lastName) && !key.startsWith(lastName)) {
                match = val;
                matchSource = "PL";
                break;
              }
            }
            if (!match) {
              for (const [key, val] of relieverMap) {
                if (key.endsWith(lastName) && !key.startsWith(lastName)) {
                  match = val;
                  matchSource = "CM";
                  break;
                }
              }
            }
            if (!match) {
              for (const [key, val] of hitterMap) {
                if (key.endsWith(lastName) && !key.startsWith(lastName)) {
                  match = val;
                  matchSource = "PL";
                  break;
                }
              }
            }
          }
        }

        rankings.push({
          playerId: player.playerId,
          playerName: player.playerName,
          positions: player.positions,
          primaryPosition: player.positions[0] || "UT",
          vbdScore: player.espnAuctionValue,
          tier: match?.tier ?? 99,
          projectedStats: {},
          tierName: match?.tierName ?? undefined,
          externalRank: match?.rank ?? undefined,
          rankSource: matchSource,
          espnAuctionValue: player.espnAuctionValue,
        });

        auctionValues.push({
          playerId: player.playerId,
          playerName: player.playerName,
          dollarValue: player.espnAuctionValue,
          vbdScore: player.espnAuctionValue,
          positions: player.positions,
        });
      }

      console.log("[API Client] Using draft board data for rankings:", players.length, "players");
      return { rankings, auctionValues };
    } catch (error) {
      console.warn("[API Client] getDraftBoardData failed:", error);
      return null;
    }
  });
}

function extractPracticeDraftHints(titleText?: string): {
  targetName?: string;
  targetSeason?: number;
} {
  if (!titleText) {
    return {};
  }

  const normalizedTitle = titleText.replace(/\?/g, "").trim();
  console.log("[API Client] Extracting hints from title:", normalizedTitle);

  // Pattern 1: "Practice Draft for [League Name] in [Year]"
  const practiceMatch1 = normalizedTitle.match(
    /practice\s+draft\s+for\s+(.+?)\s+in\s+(\d{4})/i,
  );
  if (practiceMatch1) {
    console.log("[API Client] Matched pattern 1:", {
      name: practiceMatch1[1].trim(),
      season: practiceMatch1[2],
    });
    return {
      targetName: practiceMatch1[1].trim(),
      targetSeason: Number.parseInt(practiceMatch1[2], 10),
    };
  }

  // Pattern 2: "[League Name] Practice Draft - [Year]"
  const practiceMatch2 = normalizedTitle.match(
    /(.+?)\s+practice\s+draft\s*[-–—]\s*(\d{4})/i,
  );
  if (practiceMatch2) {
    console.log("[API Client] Matched pattern 2:", {
      name: practiceMatch2[1].trim(),
      season: practiceMatch2[2],
    });
    return {
      targetName: practiceMatch2[1].trim(),
      targetSeason: Number.parseInt(practiceMatch2[2], 10),
    };
  }

  // Pattern 3: "Draft [Year] - [League Name]"
  const practiceMatch3 = normalizedTitle.match(
    /draft\s+(\d{4})\s*[-–—]\s*(.+)/i,
  );
  if (practiceMatch3) {
    console.log("[API Client] Matched pattern 3:", {
      season: practiceMatch3[1],
      name: practiceMatch3[2].trim(),
    });
    return {
      targetSeason: Number.parseInt(practiceMatch3[1], 10),
      targetName: practiceMatch3[2].trim(),
    };
  }

  // Pattern 4: Just extract season year
  const seasonMatch = normalizedTitle.match(/(20\d{2})/);
  const result = {
    targetSeason: seasonMatch ? Number.parseInt(seasonMatch[1], 10) : undefined,
  };
  console.log("[API Client] Fallback season extraction:", result);
  return result;
}

function getLeagueNameScore(leagueName: string, targetName?: string): number {
  if (!targetName) {
    return 0;
  }

  const normalizedLeague = normalizeText(leagueName);
  const normalizedTarget = normalizeText(targetName);

  if (!normalizedTarget) {
    return 0;
  }

  if (normalizedLeague.includes(normalizedTarget)) {
    return 6;
  }

  const targetTokens = normalizedTarget
    .split(" ")
    .filter((token) => token.length > 2);
  if (targetTokens.length === 0) {
    return 0;
  }

  const overlap = targetTokens.filter((token) =>
    normalizedLeague.includes(token),
  ).length;
  if (overlap === 0) {
    return 0;
  }

  return Math.min(4, overlap);
}

async function fetchLeagues(
  normalizedBackendUrl: string,
  apiToken?: string,
): Promise<BackendLeagueSummary[]> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (apiToken?.trim()) {
    headers.Authorization = `Bearer ${apiToken.trim()}`;
  }

  const endpoints = ["/api/admin/leagues", "/api/leagues"];

  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${normalizedBackendUrl}${endpoint}`, {
        signal: controller.signal,
        credentials: "include",
        mode: "cors",
        headers,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        continue;
      }

      const payload = (await parseJsonSafely(
        response,
      )) as BackendLeaguesResponse | null;
      const rawLeagues = Array.isArray(payload?.leagues)
        ? (payload.leagues as RawLeagueSummary[])
        : [];

      const normalized = rawLeagues
        .map((league) => {
          const id = Number(league.id);
          const name = typeof league.name === "string" ? league.name : "";
          const espnLeagueId = Number(
            league.espn_league_id ?? league.espnLeagueId,
          );

          if (!Number.isFinite(id) || !name || !Number.isFinite(espnLeagueId)) {
            return null;
          }

          return {
            id,
            name,
            espnLeagueId,
            season:
              typeof league.season === "number" &&
              Number.isFinite(league.season)
                ? league.season
                : undefined,
            created_at:
              typeof league.created_at === "string"
                ? league.created_at
                : undefined,
            snapshotDate:
              typeof league.snapshotDate === "string"
                ? league.snapshotDate
                : undefined,
          } satisfies BackendLeagueSummary;
        })
        .filter((league): league is BackendLeagueSummary => Boolean(league));

      if (normalized.length > 0) {
        return normalized;
      }
    } catch {
      clearTimeout(timeoutId);
      continue;
    }
  }

  return [];
}

/**
 * Search for leagues by name using public endpoint (no auth required)
 */
async function searchLeaguesByName(
  normalizedBackendUrl: string,
  name: string,
  season?: number,
): Promise<BackendLeagueSummary[]> {
  const params = new URLSearchParams();
  params.set("name", name);
  if (season) params.set("season", season.toString());
  params.set("limit", "10");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${normalizedBackendUrl}/api/leagues/search?${params}`,
      {
        signal: controller.signal,
        mode: "cors",
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      return [];
    }

    const data = await parseJsonSafely(response);
    const results = data?.results || [];

    // Convert search results to BackendLeagueSummary format
    return results.map((league: any) => ({
      id: league.id,
      name: league.name,
      espnLeagueId: league.espnLeagueId,
      season: league.season,
      created_at: league.createdAt,
    }));
  } catch {
    clearTimeout(timeoutId);
    return [];
  }
}

/**
 * Clean up practice draft prefix from league name
 */
function cleanPracticeDraftName(name: string): string {
  // Remove common practice draft prefixes
  return name
    .replace(/^practice\s+draft\s+(for\s+)?/i, "")
    .replace(/\s+practice\s+draft$/i, "")
    .trim();
}

/**
 * Fetch league name from ESPN API
 */
async function fetchEspnLeagueName(
  espnLeagueId: string,
): Promise<string | null> {
  try {
    const currentYear = new Date().getFullYear();
    const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/flb/seasons/${currentYear}/segments/0/leagues/${espnLeagueId}?view=mSettings`;

    const response = await fetch(url, {
      credentials: "include",
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const rawName = data?.settings?.name;

    if (!rawName) {
      return null;
    }

    // Clean up practice draft prefixes
    return cleanPracticeDraftName(rawName);
  } catch (error) {
    console.warn("[API Client] Failed to fetch ESPN league name:", error);
    return null;
  }
}

export async function resolveBackendLeagueId(
  espnLeagueId: string,
  pageTitle?: string,
): Promise<string | null> {
  try {
    // For practice drafts, skip backend league resolution - use ESPN ID directly
    if (isPracticeDraft()) {
      console.log("[API Client] Practice draft detected - using ESPN league ID directly");
      return espnLeagueId;
    }

    const { backendUrl, apiToken } = await chrome.storage.local.get([
      "backendUrl",
      "apiToken",
    ]);

    const normalizedBackendUrl = normalizeBackendUrl(backendUrl);

    // Try to fetch leagues - if this fails due to auth, we'll fall back
    let leagues: BackendLeagueSummary[] = [];
    try {
      console.log("[API Client] Attempting to fetch leagues from backend...");
      leagues = await fetchLeagues(normalizedBackendUrl, apiToken);
      console.log(
        "[API Client] fetchLeagues returned",
        leagues.length,
        "leagues",
      );
    } catch (error) {
      console.warn(
        "[API Client] Could not fetch leagues (auth required or backend unavailable):",
        error,
      );

      // Try to get league name from ESPN API first
      console.log("[API Client] Fetching league name from ESPN API...");
      const espnLeagueName = await fetchEspnLeagueName(espnLeagueId);

      // Extract hints from page title as fallback
      const { targetName: pageTitleName, targetSeason } =
        extractPracticeDraftHints(pageTitle);

      // Prefer ESPN API name over page title
      const leagueNameForSearch = espnLeagueName || pageTitleName;

      if (leagueNameForSearch) {
        console.log(
          "[API Client] Trying public search endpoint for:",
          leagueNameForSearch,
          "(source:",
          espnLeagueName ? "ESPN API" : "page title",
          ")",
        );

        const searchResults = await searchLeaguesByName(
          normalizedBackendUrl,
          leagueNameForSearch,
          targetSeason,
        );

        if (searchResults.length > 0) {
          console.log(
            "[API Client] Found leagues via public search:",
            searchResults.length,
          );
          leagues = searchResults;
        } else {
          console.log(
            "[API Client] No results from public search, falling back to ESPN ID:",
            espnLeagueId,
          );
          return espnLeagueId;
        }
      } else {
        // No league name available from any source
        console.log(
          "[API Client] No league name available, falling back to ESPN league ID:",
          espnLeagueId,
        );
        return espnLeagueId;
      }
    }

    console.log("[API Client] Resolving league ID:", {
      espnLeagueId,
      pageTitle,
      availableLeagues: leagues.length,
    });

    // If no leagues found via auth, try public search
    if (leagues.length === 0) {
      console.log(
        "[API Client] No leagues found via auth, trying public search...",
      );

      // Try to get league name from ESPN API first
      const espnLeagueName = await fetchEspnLeagueName(espnLeagueId);

      // Extract hints from page title as fallback
      const { targetName: pageTitleName, targetSeason } =
        extractPracticeDraftHints(pageTitle);

      // Prefer ESPN API name over page title
      const leagueNameForSearch = espnLeagueName || pageTitleName;

      if (leagueNameForSearch) {
        console.log(
          "[API Client] Trying public search endpoint for:",
          leagueNameForSearch,
          "(source:",
          espnLeagueName ? "ESPN API" : "page title",
          ")",
        );

        const searchResults = await searchLeaguesByName(
          normalizedBackendUrl,
          leagueNameForSearch,
          targetSeason,
        );

        if (searchResults.length > 0) {
          console.log(
            "[API Client] Found leagues via public search:",
            searchResults.length,
          );
          leagues = searchResults;
        } else {
          console.log(
            "[API Client] No results from public search, falling back to ESPN ID:",
            espnLeagueId,
          );
          return espnLeagueId;
        }
      } else {
        console.warn(
          "[API Client] No league name available for search, using ESPN ID as fallback",
        );
        return espnLeagueId;
      }
    }

    // Re-check leagues length after potential search
    if (leagues.length === 0) {
      console.warn(
        "[API Client] Still no leagues found, using ESPN ID as fallback",
      );
      return espnLeagueId;
    }

    if (leagues.length === 1) {
      console.log(
        "[API Client] Only one league available, using it:",
        leagues[0],
      );
      return String(leagues[0].id);
    }

    const direct = leagues.find(
      (league) => String(league.espnLeagueId) === espnLeagueId,
    );
    if (direct) {
      console.log("[API Client] Found direct ESPN ID match:", direct);
      return String(direct.id);
    }

    // Get league name from ESPN API for better matching
    const espnLeagueName = await fetchEspnLeagueName(espnLeagueId);
    const { targetName: pageTitleName, targetSeason } =
      extractPracticeDraftHints(pageTitle);

    // Prefer ESPN API name for matching
    const targetName = espnLeagueName || pageTitleName;

    console.log("[API Client] Matching hints:", {
      espnLeagueName,
      pageTitleName,
      targetName,
      targetSeason,
    });

    const scoredCandidates = leagues.map((league) => {
      let score = 0;
      if (targetSeason && typeof league.season === "number") {
        if (league.season === targetSeason) {
          score += 4;
        } else if (Math.abs(league.season - targetSeason) === 1) {
          score += 2;
        }
      }

      score += getLeagueNameScore(league.name, targetName);

      return { league, score };
    });

    const sortedCandidates = scoredCandidates.sort(
      (left, right) => right.score - left.score,
    );

    console.log(
      "[API Client] Scored candidates:",
      sortedCandidates.map((c) => ({
        name: c.league.name,
        season: c.league.season,
        score: c.score,
      })),
    );

    const bestCandidate = sortedCandidates[0];

    if (bestCandidate && bestCandidate.score >= 3) {
      console.log(
        "[API Client] Using best-scored candidate:",
        bestCandidate.league,
      );
      return String(bestCandidate.league.id);
    }

    if (targetName) {
      const nameOnlyBest = leagues
        .map((league) => ({
          league,
          score: getLeagueNameScore(league.name, targetName),
        }))
        .sort((left, right) => right.score - left.score)[0];

      if (nameOnlyBest && nameOnlyBest.score >= 1) {
        console.log("[API Client] Using name-only match:", nameOnlyBest.league);
        return String(nameOnlyBest.league.id);
      }
    }

    if (targetSeason) {
      const seasonCandidates = leagues.filter(
        (league) =>
          typeof league.season === "number" && league.season === targetSeason,
      );

      console.log("[API Client] Season candidates:", seasonCandidates.length);

      if (seasonCandidates.length === 1) {
        console.log(
          "[API Client] Using single season match:",
          seasonCandidates[0],
        );
        return String(seasonCandidates[0].id);
      }

      if (seasonCandidates.length > 1) {
        const newest = seasonCandidates.sort((a, b) => {
          const leftDate = Date.parse(a.created_at || "");
          const rightDate = Date.parse(b.created_at || "");
          return Number.isFinite(rightDate) && Number.isFinite(leftDate)
            ? rightDate - leftDate
            : b.id - a.id;
        })[0];
        console.log("[API Client] Using newest season match:", newest);
        return String(newest.id);
      }
    }

    console.warn(
      "[API Client] Could not resolve backend league ID via matching, using ESPN ID as fallback",
    );
    return espnLeagueId;
  } catch (error) {
    console.error("[API Client] Error resolving backend league ID:", error);
    // Even on error, try to use ESPN league ID as fallback
    return espnLeagueId;
  }
}

function isNoDataStatus(statusCode: number): boolean {
  return statusCode === 204 || statusCode === 404;
}

async function parseJsonSafely(response: Response): Promise<any | null> {
  const contentLength = response.headers.get("content-length");
  if (contentLength === "0" || response.status === 204) {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Fetch draft rankings from backend API with fallback to bundled baseline rankings
 */
export async function getRankings(
  espnLeagueId: string,
  options: GetRankingsOptions = {}
): Promise<PlayerRanking[]> {
  const cacheKey = `rankings:${espnLeagueId}:${JSON.stringify(options)}`;

  return dedupedRequest(cacheKey, async () => {
    // Try draft board data first (ESPN ADP/auction merged with PitcherList)
    try {
      const draftBoardData = await getDraftBoardData();
      if (draftBoardData && draftBoardData.rankings.length > 0) {
        console.log("[API Client] Using draft board data for rankings");
        return draftBoardData.rankings;
      }
    } catch (error) {
      console.warn("[API Client] Draft board data unavailable:", error);
    }

    // Fallback: PitcherList-only rankings (no backend needed)
    console.log("[API Client] Using bundled PitcherList rankings (no backend required)");
    const pitcherListData = buildBundledRankings();
    return pitcherListData.rankings;
  });
}

/**
 * Fetch auction values from backend API with fallback to bundled baseline
 */
export async function getAuctionValues(
  espnLeagueId: string,
  options: GetAuctionValuesOptions = {}
): Promise<AuctionValue[]> {
  const cacheKey = `auction:${espnLeagueId}:${JSON.stringify(options)}`;

  return dedupedRequest(cacheKey, async () => {
    // Try draft board data first (ESPN ADP/auction merged with PitcherList)
    try {
      const draftBoardData = await getDraftBoardData();
      if (draftBoardData && draftBoardData.auctionValues.length > 0) {
        console.log("[API Client] Using draft board data for auction values");
        return draftBoardData.auctionValues;
      }
    } catch (error) {
      console.warn("[API Client] Draft board data unavailable:", error);
    }

    // Fallback: PitcherList-only auction values (no backend needed)
    console.log("[API Client] Using bundled PitcherList auction values (no backend required)");
    const pitcherListData = buildBundledRankings();
    return pitcherListData.auctionValues;
  });
}

export async function getProjectedStandings(
  leagueId: string,
  options: { backendLeagueId?: string } = {},
): Promise<ProjectedStandingsResponse | null> {
  try {
    const { backendUrl, apiToken } = await chrome.storage.local.get([
      "backendUrl",
      "apiToken",
    ]);

    const normalizedBackendUrl = normalizeBackendUrl(backendUrl);
    const backendLeagueId = options.backendLeagueId || leagueId;
    const url = `${normalizedBackendUrl}/api/leagues/${backendLeagueId}/standings/projected`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (apiToken?.trim()) {
      headers.Authorization = `Bearer ${apiToken.trim()}`;
    }

    const response = await fetch(url, {
      signal: controller.signal,
      credentials: "include",
      mode: "cors",
      headers,
    });

    clearTimeout(timeoutId);

    if (isNoDataStatus(response.status)) {
      return null;
    }

    if (!response.ok) {
      return null;
    }

    const data = (await parseJsonSafely(
      response,
    )) as ProjectedStandingsResponse | null;
    if (!data || !Array.isArray(data.overallStandings)) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

/**
 * Fetch rankings with single attempt - backend handles retries with circuit breaker
 * (Phase 12 P04: Backend circuit breaker opens after 5 failures for 60s)
 * Client retries fight the circuit breaker and create thundering herd on recovery
 */
export async function getRankingsWithRetry(
  espnLeagueId: string,
  options: GetRankingsOptions = {}
): Promise<PlayerRanking[]> {
  // Just call getRankings directly - backend handles retries
  return getRankings(espnLeagueId, options);
}

/**
 * Fetch auction values with single attempt - backend handles retries with circuit breaker
 */
export async function getAuctionValuesWithRetry(
  espnLeagueId: string,
  options: GetAuctionValuesOptions = {}
): Promise<AuctionValue[]> {
  // Just call getAuctionValues directly - backend handles retries
  return getAuctionValues(espnLeagueId, options);
}
