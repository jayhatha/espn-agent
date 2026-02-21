import { type AxiosInstance } from "axios";
import crypto from "crypto";
import type { Logger } from "pino";
import { createRetryableAxios } from "../utils/retry.js";

/**
 * ESPN Adapter Agent
 * Per AGENTS.md §1
 *
 * Fetches and normalizes ESPN league data, handles auth cookies,
 * caches responses, and detects schema drift
 */

export interface ESPNAuthCookies {
  SWID?: string;
  espn_s2?: string;
}

export interface ESPNFetchOptions {
  leagueId: number;
  season: number;
  auth?: ESPNAuthCookies;
  views?: string[];
  scoringPeriodId?: number;
  xFantasyFilter?: Record<string, unknown>;
}

export interface ESPNRawResponse {
  data: Record<string, unknown>;
  schemaFingerprint: string;
  fetchedAt: Date;
}

export interface ESPNScoringCategory {
  espnStatId: number;
  statKey: string;
  name: string;
  type: "COUNTING" | "RATE";
  direction: "HIGHER_BETTER" | "LOWER_BETTER";
  formulaId?: string;
  requiredComponents?: string[];
}

export interface ESPNRosterEntry {
  espnPlayerId: number;
  name: string;
  mlbTeam: string;
  positions: string[];
  lineupSlotId: number;
  rosterStatus: "active" | "bench" | "il" | "na" | "unknown";
  rosterSlot: string;
  acquisitionType: string;
}

export interface ESPNTeamData {
  id: number;
  name: string;
  abbrev: string;
  statValues: Record<number, number>;
  roster: ESPNRosterEntry[];
  primaryOwner?: string; // SWID of primary owner
  owners?: string[]; // Array of SWIDs
}

export interface ESPNFreeAgent {
  playerId: number;
  name: string;
  positions: string[];
  mlbTeam: string;
  pctOwned: number;
  pctStarted: number;
}

export interface ESPNTransactionItem {
  playerId: number;
  playerName: string;
  fromTeamId: number | null;
  toTeamId: number | null;
  action: "ADD" | "DROP" | "TRADE_IN" | "TRADE_OUT";
}

export interface ESPNTransaction {
  transactionId: string;
  type: "ADD" | "DROP" | "TRADE" | "WAIVER" | "OTHER";
  timestamp: number; // Unix ms
  items: ESPNTransactionItem[];
  bidAmount?: number;
}

export interface ESPNLeagueData {
  settings: {
    name: string;
    scoringFormat: string;
    categories: ESPNScoringCategory[];
    rosterSlots: unknown[];
    acquisitionRules: unknown;
  };
  teams: ESPNTeamData[];
  standings: Array<{
    teamId: number;
    stats: unknown[];
  }>;
  freeAgents?: Array<{
    playerId: number;
    name: string;
    positions: string[];
  }>;
  transactions?: Array<{
    id: string;
    type: string;
    timestamp: number;
  }>;
}

/**
 * ESPN Baseball stat ID → canonical stat key mapping
 * Source: https://github.com/cwendt94/espn-api/blob/master/espn_api/baseball/constant.py
 */
const ESPN_STAT_MAP: Record<number, { key: string; name: string; type: "COUNTING" | "RATE"; formulaId?: string; requiredComponents?: string[] }> = {
  // Batting
  0: { key: "AB", name: "At Bats", type: "COUNTING" },
  1: { key: "H", name: "Hits", type: "COUNTING" },
  2: { key: "AVG", name: "Batting Average", type: "RATE", formulaId: "avg", requiredComponents: ["H", "AB"] },
  3: { key: "2B", name: "Doubles", type: "COUNTING" },
  4: { key: "3B", name: "Triples", type: "COUNTING" },
  5: { key: "HR", name: "Home Runs", type: "COUNTING" },
  6: { key: "XBH", name: "Extra Base Hits", type: "COUNTING" },
  7: { key: "1B", name: "Singles", type: "COUNTING" },
  8: { key: "TB", name: "Total Bases", type: "COUNTING" },
  9: { key: "SLG", name: "Slugging Pct", type: "RATE", formulaId: "slg", requiredComponents: ["TB", "AB"] },
  10: { key: "BB", name: "Walks", type: "COUNTING" },
  11: { key: "IBB", name: "Intentional Walks", type: "COUNTING" },
  12: { key: "HBP", name: "Hit By Pitch", type: "COUNTING" },
  13: { key: "SF", name: "Sacrifice Flies", type: "COUNTING" },
  14: { key: "SH", name: "Sacrifice Hits", type: "COUNTING" },
  16: { key: "PA", name: "Plate Appearances", type: "COUNTING" },
  17: { key: "OBP", name: "On Base Pct", type: "RATE", formulaId: "obp", requiredComponents: ["H", "BB", "HBP", "AB", "SF"] },
  18: { key: "OPS", name: "OPS", type: "RATE", formulaId: "ops", requiredComponents: ["H", "BB", "HBP", "AB", "SF", "TB"] },
  20: { key: "R", name: "Runs", type: "COUNTING" },
  21: { key: "RBI", name: "RBI", type: "COUNTING" },
  23: { key: "SB", name: "Stolen Bases", type: "COUNTING" },
  24: { key: "CS", name: "Caught Stealing", type: "COUNTING" },
  27: { key: "SO", name: "Strikeouts", type: "COUNTING" },
  // Pitching
  34: { key: "OUTS", name: "Outs", type: "COUNTING" },
  37: { key: "HA", name: "Hits Allowed", type: "COUNTING" },
  39: { key: "BBA", name: "Walks Allowed", type: "COUNTING" },
  41: { key: "WHIP", name: "WHIP", type: "RATE", formulaId: "whip", requiredComponents: ["H", "BB", "IP"] },
  45: { key: "ER", name: "Earned Runs", type: "COUNTING" },
  46: { key: "HRA", name: "Home Runs Allowed", type: "COUNTING" },
  47: { key: "ERA", name: "ERA", type: "RATE", formulaId: "era", requiredComponents: ["ER", "IP"] },
  48: { key: "K", name: "Strikeouts", type: "COUNTING" },
  49: { key: "K9", name: "K/9", type: "RATE", formulaId: "k9", requiredComponents: ["K", "IP"] },
  53: { key: "W", name: "Wins", type: "COUNTING" },
  54: { key: "L", name: "Losses", type: "COUNTING" },
  55: { key: "WPCT", name: "Win Pct", type: "RATE" },
  56: { key: "SVO", name: "Save Opportunities", type: "COUNTING" },
  57: { key: "SV", name: "Saves", type: "COUNTING" },
  58: { key: "BLSV", name: "Blown Saves", type: "COUNTING" },
  60: { key: "HLD", name: "Holds", type: "COUNTING" },
  62: { key: "CG", name: "Complete Games", type: "COUNTING" },
  63: { key: "QS", name: "Quality Starts", type: "COUNTING" },
};

/** ESPN lineup slot ID → position label */
const ESPN_LINEUP_SLOT_MAP: Record<number, string> = {
  0: "C", 1: "1B", 2: "2B", 3: "3B", 4: "SS",
  5: "OF", 6: "LF", 7: "CF", 8: "RF", 9: "DH",
  10: "DH", 11: "IF", 12: "UTIL", 13: "P",
  14: "SP", 15: "RP", 16: "BE", 17: "IL", 19: "NA",
};

/** ESPN eligible position slot ID → position label (for player eligibility) */
const ESPN_POSITION_MAP: Record<number, string> = {
  0: "C",
  1: "1B",
  2: "2B",
  3: "3B",
  4: "SS",
  5: "OF",
  6: "LF",
  7: "CF",
  8: "RF",
  9: "DH",
  10: "DH",
  11: "IF",
  12: "UTIL",
  13: "P",
  14: "SP",
  15: "RP",
  16: "BE",
  17: "IL",
  19: "NA",
};

/** ESPN pro team ID → MLB team abbreviation */
const ESPN_PRO_TEAM_MAP: Record<number, string> = {
  1: "BAL", 2: "BOS", 3: "LAA", 4: "CWS", 5: "CLE",
  6: "DET", 7: "KC", 8: "MIL", 9: "MIN", 10: "NYY",
  11: "OAK", 12: "SEA", 13: "TEX", 14: "TOR", 15: "ATL",
  16: "CHC", 17: "CIN", 18: "HOU", 19: "LAD", 20: "WSH",
  21: "NYM", 22: "PHI", 23: "PIT", 24: "STL", 25: "SD",
  26: "SF", 27: "COL", 28: "MIA", 29: "ARI", 30: "TB",
};

/** Position name → ESPN slot ID (for free agent filtering) */
const ESPN_POSITION_TO_SLOT: Record<string, number> = {
  C: 0, "1B": 1, "2B": 2, "3B": 3, SS: 4,
  LF: 5, CF: 6, RF: 7, OF: 5, DH: 9,
  UTIL: 12, SP: 13, RP: 14, P: 13,
};

/** All position slot IDs for unfiltered free agent queries */
const ALL_POSITION_SLOT_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 23, 24];

/** ESPN transaction type ID → canonical type */
const ESPN_TRANSACTION_TYPE_MAP: Record<number, ESPNTransaction["type"]> = {
  1: "ADD",
  2: "DROP",
  3: "TRADE",
  4: "WAIVER",
};

export class ESPNAdapter {
  private client: AxiosInstance;
  private logger?: Logger;
  private cache?: Map<string, { data: unknown; expiresAt: number }>;
  private lastRequestTime: number = 0;

  constructor(logger?: Logger) {
    this.client = createRetryableAxios(logger);
    // Configure ESPN-specific settings
    this.client.defaults.baseURL = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/flb";
    this.client.defaults.timeout = 30000;
    this.client.defaults.headers["User-Agent"] = "ESPN-Fantasy-Assistant/0.1.0";
    // ESPN expects repeated params: view=mTeam&view=mRoster (not view[]=...)
    this.client.defaults.paramsSerializer = (params) => {
      const parts: string[] = [];
      for (const [key, value] of Object.entries(params)) {
        if (Array.isArray(value)) {
          for (const v of value) {
            parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
          }
        } else if (value !== undefined && value !== null) {
          parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
        }
      }
      return parts.join("&");
    };
    this.logger = logger;
    this.cache = new Map();
  }

  /**
   * Fetch historical league data for a specific scoring period (week)
   * Includes instance-level throttle: enforces minimum 2000ms between requests
   */
  async fetchHistoricalWeek(options: {
    leagueId: number;
    season: number;
    scoringPeriodId: number;
    auth?: ESPNAuthCookies;
  }): Promise<ESPNRawResponse> {
    const { leagueId, season, scoringPeriodId, auth } = options;

    // Enforce 2-second throttle
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < 2000) {
      const delay = 2000 - timeSinceLastRequest;
      this.logger?.debug(
        { delay, scoringPeriodId },
        "Throttling historical fetch",
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    try {
      const url = `/seasons/${season}/segments/0/leagues/${leagueId}`;
      const params: Record<string, unknown> = {
        view: ["mSettings", "mTeam", "mRoster", "mStandings"],
        scoringPeriodId,
      };

      const headers: Record<string, string> = {};
      if (auth?.SWID && auth?.espn_s2) {
        headers.Cookie = `SWID=${auth.SWID}; espn_s2=${auth.espn_s2}`;
      }

      this.logger?.info(
        { leagueId, season, scoringPeriodId },
        "Fetching ESPN historical week",
      );

      this.lastRequestTime = Date.now();

      const response = await this.client.get(url, {
        params,
        headers,
        validateStatus: (status) => status < 500,
      });

      // Check for 429 rate limit
      if (response.status === 429) {
        const retryAfter = response.headers["retry-after"];
        this.logger?.warn(
          { scoringPeriodId, retryAfter },
          "ESPN rate limit hit (429), axios-retry will handle exponential backoff",
        );
        throw new Error(`ESPN rate limit exceeded (429). Retry-After: ${retryAfter}`);
      }

      // Check if ESPN returned HTML instead of JSON (auth issue)
      if (
        typeof response.data === "string" &&
        response.data.trim().startsWith("<")
      ) {
        throw new Error(
          "ESPN returned HTML instead of JSON. This usually means the league is private and requires authentication cookies (SWID and espn_s2).",
        );
      }

      // Check for non-200 responses
      if (response.status !== 200) {
        throw new Error(
          `ESPN API returned status ${response.status}: ${JSON.stringify(response.data)}`,
        );
      }

      // Validate that we got an object response
      if (typeof response.data !== "object" || response.data === null) {
        throw new Error(
          `ESPN returned unexpected data type: ${typeof response.data}`,
        );
      }

      const schemaFingerprint = this.computeSchemaFingerprint(response.data);
      const result: ESPNRawResponse = {
        data: response.data,
        schemaFingerprint,
        fetchedAt: new Date(),
      };

      return result;
    } catch (error) {
      const errorDetails: any = {
        message: error instanceof Error ? error.message : String(error),
        leagueId,
        season,
        scoringPeriodId,
      };

      if ((error as any).response) {
        errorDetails.status = (error as any).response.status;
        errorDetails.statusText = (error as any).response.statusText;
        errorDetails.responseData = (error as any).response.data;
      } else if ((error as any).request) {
        errorDetails.networkError = "No response received from ESPN";
      }

      this.logger?.error(errorDetails, "ESPN historical fetch failed");

      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to fetch ESPN historical week: ${error}`);
    }
  }

  /**
   * Fetch league data with specified views
   */
  async fetchLeague(options: ESPNFetchOptions): Promise<ESPNRawResponse> {
    const {
      leagueId,
      season,
      auth,
      views = ["mSettings", "mTeam", "mRoster", "mStandings", "kona_player_info"],
      scoringPeriodId,
      xFantasyFilter,
    } = options;

    const cacheKey = this.getCacheKey(options);
    const cached = this.getCached(cacheKey);
    if (cached) {
      this.logger?.debug({ cacheKey }, "Cache hit for ESPN request");
      return cached as ESPNRawResponse;
    }

    try {
      const url = `/seasons/${season}/segments/0/leagues/${leagueId}`;
      const params: Record<string, unknown> = {};

      if (views.length > 0) {
        params.view = views;
      }
      if (scoringPeriodId) {
        params.scoringPeriodId = scoringPeriodId;
      }

      const headers: Record<string, string> = {};
      if (auth?.SWID && auth?.espn_s2) {
        headers.Cookie = `SWID=${auth.SWID}; espn_s2=${auth.espn_s2}`;
      }
      if (xFantasyFilter) {
        headers["x-fantasy-filter"] = JSON.stringify(xFantasyFilter);
      }

      this.logger?.info(
        { leagueId, season, views },
        "Fetching ESPN league data",
      );

      const response = await this.client.get(url, {
        params,
        headers,
        validateStatus: (status) => status < 500, // Don't throw on 4xx errors
      });

      // Check if ESPN returned HTML instead of JSON (auth issue)
      if (
        typeof response.data === "string" &&
        response.data.trim().startsWith("<")
      ) {
        throw new Error(
          "ESPN returned HTML instead of JSON. This usually means the league is private and requires authentication cookies (SWID and espn_s2).",
        );
      }

      // Check for non-200 responses
      if (response.status !== 200) {
        throw new Error(
          `ESPN API returned status ${response.status}: ${JSON.stringify(response.data)}`,
        );
      }

      // Validate that we got an object response
      if (typeof response.data !== "object" || response.data === null) {
        throw new Error(
          `ESPN returned unexpected data type: ${typeof response.data}`,
        );
      }

      const schemaFingerprint = this.computeSchemaFingerprint(response.data);
      const result: ESPNRawResponse = {
        data: response.data,
        schemaFingerprint,
        fetchedAt: new Date(),
      };

      // Cache for 5 minutes
      this.setCache(cacheKey, result, 5 * 60 * 1000);

      return result;
    } catch (error) {
      // Better error logging for axios errors
      const errorDetails: any = {
        message: error instanceof Error ? error.message : String(error),
        leagueId,
        season,
      };

      if ((error as any).response) {
        // Axios error with response
        errorDetails.status = (error as any).response.status;
        errorDetails.statusText = (error as any).response.statusText;
        errorDetails.responseData = (error as any).response.data;
      } else if ((error as any).request) {
        // Axios error without response (network error)
        errorDetails.networkError = "No response received from ESPN";
      }

      this.logger?.error(errorDetails, "ESPN fetch failed");

      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to fetch ESPN league data: ${error}`);
    }
  }

  /**
   * Fetch free agents from ESPN with ownership data
   * Uses x-fantasy-filter with filterStatus FREEAGENT/WAIVERS and filterSlotIds
   */
  async fetchFreeAgents(options: {
    leagueId: number;
    season: number;
    auth?: ESPNAuthCookies;
    limit?: number;
    positions?: string[];
  }): Promise<ESPNFreeAgent[]> {
    const { leagueId, season, auth, limit = 300, positions } = options;

    try {
      const url = `/seasons/${season}/segments/0/leagues/${leagueId}`;

      // Determine slot IDs from position filter, or use all positions
      const filterSlotIds = positions && positions.length > 0
        ? positions.map((pos) => ESPN_POSITION_TO_SLOT[pos]).filter((id): id is number => id !== undefined)
        : ALL_POSITION_SLOT_IDS;

      const xFantasyFilter = {
        players: {
          filterStatus: {
            value: ["FREEAGENT", "WAIVERS"],
          },
          filterSlotIds: {
            value: filterSlotIds,
          },
          sortPercOwned: {
            sortPriority: 1,
            sortAsc: false,
          },
          limit,
        },
      };

      const headers: Record<string, string> = {};
      if (auth?.SWID && auth?.espn_s2) {
        headers.Cookie = `SWID=${auth.SWID}; espn_s2=${auth.espn_s2}`;
      }

      // Pass filter as x-fantasy-filter URL parameter (JSON stringified)
      const params: Record<string, unknown> = {
        view: ["kona_player_info"],
        "x-fantasy-filter": JSON.stringify(xFantasyFilter),
      };

      this.logger?.info(
        { leagueId, season, limit, positions },
        "Fetching ESPN free agents",
      );

      const response = await this.client.get(url, {
        params,
        headers,
        validateStatus: (status) => status < 500,
      });

      if (response.status !== 200) {
        throw new Error(
          `ESPN API returned status ${response.status}`,
        );
      }

      const players = (response.data?.players as any[]) || [];
      const freeAgents: ESPNFreeAgent[] = [];

      for (const entry of players) {
        const player = entry.player;
        if (!player) continue;

        const eligibleSlots = (player.eligibleSlots || [])
          .filter((s: number) => s <= 15 && s !== 12)
          .map((s: number) => ESPN_LINEUP_SLOT_MAP[s] || `slot_${s}`);

        const ownership = player.ownership || {};

        freeAgents.push({
          playerId: entry.id,
          name: player.fullName || `Player ${entry.id}`,
          positions: [...new Set(eligibleSlots)] as string[],
          mlbTeam: ESPN_PRO_TEAM_MAP[player.proTeamId] || `team_${player.proTeamId}`,
          pctOwned: ownership.percentOwned ?? 0,
          pctStarted: ownership.percentStarted ?? 0,
        });
      }

      this.logger?.info(
        { leagueId, freeAgentCount: freeAgents.length },
        "Free agents fetched",
      );

      return freeAgents;
    } catch (error) {
      this.logger?.error(
        { error, leagueId },
        "Failed to fetch free agents",
      );
      throw error;
    }
  }

  /**
   * Fetch league transactions (adds, drops, trades, waivers) from ESPN activity feed
   */
  async fetchTransactions(options: {
    leagueId: number;
    season: number;
    auth?: ESPNAuthCookies;
  }): Promise<ESPNTransaction[]> {
    const { leagueId, season, auth } = options;

    try {
      const url = `/seasons/${season}/segments/0/leagues/${leagueId}`;
      const params: Record<string, unknown> = {
        view: ["mTransactions2"],
      };

      const headers: Record<string, string> = {};
      if (auth?.SWID && auth?.espn_s2) {
        headers.Cookie = `SWID=${auth.SWID}; espn_s2=${auth.espn_s2}`;
      }

      this.logger?.info(
        { leagueId, season },
        "Fetching ESPN transactions",
      );

      const response = await this.client.get(url, {
        params,
        headers,
        validateStatus: (status) => status < 500,
      });

      if (response.status !== 200) {
        throw new Error(
          `ESPN API returned status ${response.status}`,
        );
      }

      const rawTransactions = (response.data?.transactions as any[]) || [];

      if (rawTransactions.length === 0) {
        this.logger?.info({ leagueId }, "No transactions found in ESPN response");
        return [];
      }

      const transactions: ESPNTransaction[] = [];

      for (const txn of rawTransactions) {
        const typeId = txn.type as number;
        const type = ESPN_TRANSACTION_TYPE_MAP[typeId] || "OTHER";
        const transactionId = String(txn.id);
        const timestamp = txn.proposedDate || txn.processDate || txn.acceptedDate || 0;
        const bidAmount = txn.bidAmount ?? undefined;

        const items: ESPNTransactionItem[] = [];
        const txnItems = (txn.items as any[]) || [];

        for (const item of txnItems) {
          const playerId = item.playerId as number;
          const playerName = item.player?.fullName || item.player?.lastName || `Player ${playerId}`;
          const fromTeamId = item.fromTeamId === 0 ? null : (item.fromTeamId as number | null);
          const toTeamId = item.toTeamId === 0 ? null : (item.toTeamId as number | null);

          // Determine action based on from/to team and transaction type
          let action: ESPNTransactionItem["action"];
          if (type === "TRADE") {
            action = toTeamId ? "TRADE_IN" : "TRADE_OUT";
          } else if (fromTeamId === null && toTeamId !== null) {
            action = "ADD";
          } else if (fromTeamId !== null && toTeamId === null) {
            action = "DROP";
          } else {
            action = "ADD";
          }

          items.push({
            playerId,
            playerName,
            fromTeamId,
            toTeamId,
            action,
          });
        }

        if (items.length > 0) {
          transactions.push({
            transactionId,
            type,
            timestamp,
            items,
            bidAmount,
          });
        }
      }

      this.logger?.info(
        { leagueId, transactionCount: transactions.length },
        "Transactions fetched",
      );

      return transactions;
    } catch (error) {
      this.logger?.error(
        { error, leagueId },
        "Failed to fetch transactions",
      );
      throw error;
    }
  }

  /**
   * Normalize ESPN response to canonical league data
   */
  normalizeLeagueData(raw: Record<string, unknown>): ESPNLeagueData {
    const settings = raw.settings as any;
    const teams = (raw.teams as any[]) || [];
    const schedule = (raw.schedule as any[]) || [];

    // Parse scoring categories from scoringItems
    const scoringItems = settings?.scoringSettings?.scoringItems || [];
    const categories: ESPNScoringCategory[] = scoringItems.map((item: any) => {
      const mapped = ESPN_STAT_MAP[item.statId];
      return {
        espnStatId: item.statId,
        statKey: mapped?.key || `stat_${item.statId}`,
        name: mapped?.name || `Stat ${item.statId}`,
        type: mapped?.type || "COUNTING",
        direction: item.isReverseItem ? "LOWER_BETTER" : "HIGHER_BETTER",
        formulaId: mapped?.formulaId,
        requiredComponents: mapped?.requiredComponents,
      };
    });

    return {
      settings: {
        name: settings?.name || "Unknown League",
        scoringFormat: settings?.scoringType || "roto",
        categories,
        rosterSlots: settings?.rosterSettings?.lineupSlotCounts || [],
        acquisitionRules: {
          waiverType: settings?.acquisitionSettings?.waiverProcessDays,
          acquisitionLimit: settings?.acquisitionSettings?.acquisitionLimit,
          tradeDeadline: settings?.tradeSettings?.deadlineDate,
        },
      },
      teams: teams.map((t: any) => {
        // Handle both minimal team data (from mSettings) and full team data (from mTeam/mRoster)
        let teamName: string;
        if (t.location && t.nickname) {
          teamName = `${t.location} ${t.nickname}`;
        } else if (t.name) {
          teamName = t.name;
        } else if (t.abbrev) {
          teamName = t.abbrev;
        } else {
          teamName = `Team ${t.id}`;
        }

        // Extract roster entries
        const rosterEntries: ESPNRosterEntry[] = [];
        const espnRoster = t.roster?.entries || [];
        for (const entry of espnRoster) {
          const player = entry.playerPoolEntry?.player;
          if (!player) continue;

          const lineupSlotId = entry.lineupSlotId ?? -1;
          let rosterStatus: ESPNRosterEntry["rosterStatus"] = "unknown";
          if (lineupSlotId === 16) rosterStatus = "bench";
          else if (lineupSlotId === 17) rosterStatus = "il";
          else if (lineupSlotId >= 0 && lineupSlotId <= 15) rosterStatus = "active";

          rosterEntries.push({
            espnPlayerId: entry.playerId,
            name: player.fullName || `Player ${entry.playerId}`,
            mlbTeam: ESPN_PRO_TEAM_MAP[player.proTeamId] || `team_${player.proTeamId}`,
            positions: (player.eligibleSlots || [])
              .filter((s: number) => s <= 15 && s !== 12)
              .map((s: number) => ESPN_LINEUP_SLOT_MAP[s] || `slot_${s}`),
            lineupSlotId,
            rosterStatus,
            rosterSlot: ESPN_LINEUP_SLOT_MAP[lineupSlotId] || `slot_${lineupSlotId}`,
            acquisitionType: entry.acquisitionType || "UNKNOWN",
          });
        }

        return {
          id: t.id,
          name: teamName,
          abbrev: t.abbrev || `T${t.id}`,
          statValues: t.valuesByStat || {},
          roster: rosterEntries,
          primaryOwner: t.primaryOwner,
          owners: t.owners || [],
        };
      }),
      standings: teams.map((t: any) => ({
        teamId: t.id,
        stats: t.valuesByStat || [],
      })),
      freeAgents: this.parseFreeAgentsFromPlayers(raw),
      transactions: schedule.filter((s: any) => s.winner === "UNDECIDED"),
    };
  }

  /**
   * Parse free agents from ESPN teams data
   * Free agents are players with onTeamId: 0
   */
  private parseFreeAgents(teams: any[]): Array<{ playerId: number; name: string }> {
    // ESPN doesn't include a team roster for free agents (teamId 0)
    // Instead, free agents must be fetched via kona_player_info view
    // This method is a placeholder - actual free agent data comes from raw.players
    return [];
  }

  /**
   * Parse free agents from players array (kona_player_info view)
   * Free agents have onTeamId: 0
   */
  private parseFreeAgentsFromPlayers(raw: Record<string, unknown>): Array<{ playerId: number; name: string; positions: string[] }> {
    const players = (raw.players as any[]) || [];
    const freeAgents: Array<{ playerId: number; name: string; positions: string[] }> = [];

    for (const player of players) {
      // Free agents are identified by onTeamId: 0
      if (player.onTeamId === 0) {
        const eligibleSlots = player.player?.eligibleSlots || player.eligibleSlots || [];
        const positions = eligibleSlots
          .map((slotId: number) => ESPN_POSITION_MAP[slotId])
          .filter((pos: string | undefined) => pos && pos !== "UTIL" && pos !== "BE");

        freeAgents.push({
          playerId: player.id,
          name: player.player?.fullName || player.fullName || `Player ${player.id}`,
          positions: [...new Set(positions)] as string[], // Deduplicate positions
        });
      }
    }

    return freeAgents;
  }

  /**
   * Compute schema fingerprint for drift detection
   */
  private computeSchemaFingerprint(data: Record<string, unknown>): string {
    // Extract top-level keys and nested structure
    const structure = this.extractStructure(data);
    const hash = crypto.createHash("sha256");
    hash.update(JSON.stringify(structure));
    return hash.digest("hex").substring(0, 16);
  }

  private extractStructure(obj: unknown, depth = 0): unknown {
    if (depth > 3) return typeof obj;
    if (obj === null || obj === undefined) return null;
    if (Array.isArray(obj)) {
      return obj.length > 0 ? [this.extractStructure(obj[0], depth + 1)] : [];
    }
    if (typeof obj === "object") {
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(obj)) {
        result[key] = this.extractStructure((obj as any)[key], depth + 1);
      }
      return result;
    }
    return typeof obj;
  }

  private getCacheKey(options: ESPNFetchOptions): string {
    const { leagueId, season, views, scoringPeriodId } = options;
    return `espn:${leagueId}:${season}:${views?.join(",")}:${scoringPeriodId || "current"}`;
  }

  private getCached(key: string): unknown | null {
    const cached = this.cache?.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
    if (cached) {
      this.cache?.delete(key);
    }
    return null;
  }

  private setCache(key: string, data: unknown, ttlMs: number): void {
    this.cache?.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }
}
