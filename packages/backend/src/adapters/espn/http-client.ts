import { type AxiosInstance } from "axios";
import type { BaseLogger } from "pino";
import { LRUCache } from "lru-cache";
import pLimit from "p-limit";
import { createRetryableAxios } from "../../utils/retry.js";
import {
  ESPNLeagueResponseSchema,
  ESPNFreeAgentsResponseSchema,
  ESPNTransactionsResponseSchema,
  validateEspnResponse,
  assertEspnCriticalShape,
  logUnexpectedFields,
} from "../../utils/espn-schemas.js";
import { EspnResponseValidator } from "./validator.js";
import type {
  ESPNAuthCookies,
  ESPNFetchOptions,
  ESPNRawResponse,
  ESPNFreeAgent,
  ESPNGlobalDraftPlayer,
  ESPNTransaction,
  ESPNTransactionItem,
} from "./types.js";
import {
  ESPN_LINEUP_SLOT_MAP,
  ESPN_PRO_TEAM_MAP,
  ESPN_POSITION_TO_SLOT,
  ALL_POSITION_SLOT_IDS,
  ESPN_TRANSACTION_TYPE_MAP,
  ESPN_STAT_MAP,
} from "./constants.js";

export class EspnHttpClient {
  private client: AxiosInstance;
  private cache: LRUCache<string, { data: unknown; expiresAt: number }>;
  private lastRequestTime: number = 0;
  // Serialize all ESPN API calls through a single-concurrency queue
  // to prevent concurrent callers from bypassing the 2-second throttle.
  // Instance-level so each adapter instance has isolated state (safe for tests).
  private espnThrottle = pLimit(1);
  private lastEspnCall = 0;

  private async throttledEspnCall<T>(fn: () => Promise<T>): Promise<T> {
    return this.espnThrottle(async () => {
      const now = Date.now();
      const timeSinceLastCall = now - this.lastEspnCall;
      if (timeSinceLastCall < 2000) {
        await new Promise((resolve) =>
          setTimeout(resolve, 2000 - timeSinceLastCall),
        );
      }
      this.lastEspnCall = Date.now();
      return fn();
    });
  }
  private validator: EspnResponseValidator;

  constructor(private logger?: BaseLogger) {
    this.client = createRetryableAxios(logger);
    this.client.defaults.baseURL =
      "https://lm-api-reads.fantasy.espn.com/apis/v3/games/flb";
    this.client.defaults.timeout = 30000;
    this.client.defaults.headers["User-Agent"] = "ESPN-Fantasy-Assistant/0.1.0";
    this.client.defaults.paramsSerializer = (params) => {
      const parts: string[] = [];
      for (const [key, value] of Object.entries(params)) {
        if (Array.isArray(value)) {
          for (const v of value) {
            parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
          }
        } else if (value !== undefined && value !== null) {
          parts.push(
            `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
          );
        }
      }
      return parts.join("&");
    };
    this.cache = new LRUCache<string, { data: unknown; expiresAt: number }>({
      max: 2000,
      ttl: 1000 * 60 * 60,
      updateAgeOnGet: true,
      updateAgeOnHas: false,
      dispose: (_value, key, reason) => {
        if (reason === "evict" || reason === "delete") {
          this.logger?.debug({ key, reason }, "Cache entry evicted");
        }
      },
    });
    this.validator = new EspnResponseValidator(logger);
  }

  async getFinalScoringPeriod(season: number): Promise<number | undefined> {
    try {
      const response = await this.client.get(`/seasons/${season}`);
      const data = response.data;
      if (
        response.status === 200 &&
        typeof data === "object" &&
        data !== null &&
        typeof data.currentScoringPeriod?.id === "number"
      ) {
        return data.currentScoringPeriod.id;
      }
      return undefined;
    } catch (error) {
      this.logger?.warn(
        { error, season },
        "Failed to fetch final scoring period",
      );
      return undefined;
    }
  }

  async fetchHistoricalWeek(options: {
    leagueId: number;
    season: number;
    scoringPeriodId: number;
    auth?: ESPNAuthCookies;
  }): Promise<ESPNRawResponse> {
    const { leagueId, season, scoringPeriodId, auth } = options;

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

      headers["x-fantasy-filter"] = JSON.stringify({
        players: {
          filterStatsForSplitTypeIds: { value: [5] },
          filterStatsForSourceIds: { value: [0, 1] },
          filterStatsForExternalIds: { value: [scoringPeriodId] },
          sortPercOwned: { sortAsc: false, sortPriority: 1 },
          limit: 1500,
          offset: 0,
        },
      });

      this.logger?.info(
        { leagueId, season, scoringPeriodId },
        "Fetching ESPN historical week",
      );

      this.lastRequestTime = Date.now();

      const response = await this.client.get(url, { params, headers });

      if (
        typeof response.data === "string" &&
        response.data.trim().startsWith("<")
      ) {
        throw new Error(
          "ESPN returned HTML instead of JSON. This usually means the league is private and requires authentication cookies (SWID and espn_s2).",
        );
      }

      if (response.status !== 200) {
        throw new Error(
          `ESPN API returned status ${response.status}: ${JSON.stringify(response.data)}`,
        );
      }

      if (typeof response.data !== "object" || response.data === null) {
        throw new Error(
          `ESPN returned unexpected data type: ${typeof response.data}`,
        );
      }

      const validatedData = validateEspnResponse(
        ESPNLeagueResponseSchema,
        response.data,
        `fetchHistoricalWeek(${leagueId}, ${season}, ${scoringPeriodId})`,
        this.logger,
      );

      assertEspnCriticalShape(
        validatedData,
        `fetchHistoricalWeek(period=${scoringPeriodId})`,
        this.logger,
      );

      const schemaFingerprint =
        this.validator.computeSchemaFingerprint(validatedData);
      return {
        data: validatedData,
        schemaFingerprint,
        fetchedAt: new Date(),
      };
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

      if (error instanceof Error) throw error;
      throw new Error(`Failed to fetch ESPN historical week: ${error}`);
    }
  }

  async fetchLeague(options: ESPNFetchOptions): Promise<ESPNRawResponse> {
    const {
      leagueId,
      season,
      auth,
      views = [
        "mSettings",
        "mTeam",
        "mRoster",
        "mStandings",
        "kona_player_info",
      ],
      scoringPeriodId,
      xFantasyFilter,
      rosterForTeamId,
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
      if (rosterForTeamId != null) {
        params.rosterForTeamId = rosterForTeamId;
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

      const response = await this.throttledEspnCall(() =>
        this.client.get(url, { params, headers }),
      );

      if (
        typeof response.data === "string" &&
        response.data.trim().startsWith("<")
      ) {
        throw new Error(
          "ESPN returned HTML instead of JSON. This usually means the league is private and requires authentication cookies (SWID and espn_s2).",
        );
      }

      if (response.status !== 200) {
        throw new Error(
          `ESPN API returned status ${response.status}: ${JSON.stringify(response.data)}`,
        );
      }

      if (typeof response.data !== "object" || response.data === null) {
        throw new Error(
          `ESPN returned unexpected data type: ${typeof response.data}`,
        );
      }

      const validatedData = validateEspnResponse(
        ESPNLeagueResponseSchema,
        response.data,
        `fetchLeague(${leagueId}, ${season})`,
        this.logger,
      );

      assertEspnCriticalShape(
        validatedData,
        `fetchLeague(${options.leagueId})`,
        this.logger,
      );
      logUnexpectedFields(
        validatedData as Record<string, unknown>,
        [
          "id",
          "settings",
          "teams",
          "schedule",
          "scoringPeriodId",
          "seasonId",
          "segmentId",
          "status",
          "members",
          "draftDetail",
        ],
        `fetchLeague(${options.leagueId})`,
        this.logger,
      );

      const schemaFingerprint =
        this.validator.computeSchemaFingerprint(validatedData);
      const result: ESPNRawResponse = {
        data: validatedData,
        schemaFingerprint,
        fetchedAt: new Date(),
      };

      this.setCache(cacheKey, result, 5 * 60 * 1000);

      return result;
    } catch (error) {
      const errorDetails: any = {
        message: error instanceof Error ? error.message : String(error),
        leagueId,
        season,
      };

      if ((error as any).response) {
        errorDetails.status = (error as any).response.status;
        errorDetails.statusText = (error as any).response.statusText;
        errorDetails.responseData = (error as any).response.data;
      } else if ((error as any).request) {
        errorDetails.networkError = "No response received from ESPN";
      }

      this.logger?.error(errorDetails, "ESPN fetch failed");

      if (error instanceof Error) throw error;
      throw new Error(`Failed to fetch ESPN league data: ${error}`);
    }
  }

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

      const filterSlotIds =
        positions && positions.length > 0
          ? positions
              .map((pos) => ESPN_POSITION_TO_SLOT[pos])
              .filter((id): id is number => id !== undefined)
          : ALL_POSITION_SLOT_IDS;

      const xFantasyFilter = {
        players: {
          filterStatus: { value: ["FREEAGENT", "WAIVERS"] },
          filterSlotIds: { value: filterSlotIds },
          sortPercOwned: { sortPriority: 1, sortAsc: false },
          limit,
        },
      };

      const headers: Record<string, string> = {};
      if (auth?.SWID && auth?.espn_s2) {
        headers.Cookie = `SWID=${auth.SWID}; espn_s2=${auth.espn_s2}`;
      }

      headers["x-fantasy-filter"] = JSON.stringify(xFantasyFilter);

      const params: Record<string, unknown> = {
        view: ["kona_player_info"],
      };

      this.logger?.info(
        { leagueId, season, limit, positions },
        "Fetching ESPN free agents",
      );

      const response = await this.throttledEspnCall(() =>
        this.client.get(url, { params, headers }),
      );

      if (response.status !== 200) {
        throw new Error(`ESPN API returned status ${response.status}`);
      }

      const validatedData = validateEspnResponse(
        ESPNFreeAgentsResponseSchema,
        response.data,
        `fetchFreeAgents(${leagueId}, ${season})`,
        this.logger,
      );

      const players = (validatedData?.players as any[]) || [];
      const freeAgents: ESPNFreeAgent[] = [];

      for (const entry of players) {
        const player = entry.player;
        if (!player) continue;

        const eligibleSlots = (player.eligibleSlots || [])
          .filter((s: number) => s <= 15 && s !== 12 && s !== 6 && s !== 7)
          .map((s: number) => ESPN_LINEUP_SLOT_MAP[s] || `slot_${s}`);

        const ownership = player.ownership || {};

        freeAgents.push({
          playerId: entry.id,
          name: player.fullName || `Player ${entry.id}`,
          positions: [...new Set(eligibleSlots)] as string[],
          mlbTeam:
            ESPN_PRO_TEAM_MAP[player.proTeamId] || `team_${player.proTeamId}`,
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
      this.logger?.error({ error, leagueId }, "Failed to fetch free agents");
      throw error;
    }
  }

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

      this.logger?.info({ leagueId, season }, "Fetching ESPN transactions");

      const response = await this.throttledEspnCall(() =>
        this.client.get(url, { params, headers }),
      );

      if (response.status !== 200) {
        throw new Error(`ESPN API returned status ${response.status}`);
      }

      const validatedData = validateEspnResponse(
        ESPNTransactionsResponseSchema,
        response.data,
        `fetchTransactions(${leagueId}, ${season})`,
        this.logger,
      );

      const rawTransactions = (validatedData?.transactions as any[]) || [];

      if (rawTransactions.length === 0) {
        this.logger?.info(
          { leagueId },
          "No transactions found in ESPN response",
        );
        return [];
      }

      const transactions: ESPNTransaction[] = [];

      for (const txn of rawTransactions) {
        const typeId = txn.type as number;
        const type = ESPN_TRANSACTION_TYPE_MAP[typeId] || "OTHER";
        const transactionId = String(txn.id);
        const timestamp =
          txn.proposedDate || txn.processDate || txn.acceptedDate || 0;
        const bidAmount = txn.bidAmount ?? undefined;

        const items: ESPNTransactionItem[] = [];
        const txnItems = (txn.items as any[]) || [];

        for (const item of txnItems) {
          const playerId = item.playerId as number;
          const playerName =
            item.player?.fullName ||
            item.player?.lastName ||
            `Player ${playerId}`;
          const fromTeamId =
            item.fromTeamId === 0 ? null : (item.fromTeamId as number | null);
          const toTeamId =
            item.toTeamId === 0 ? null : (item.toTeamId as number | null);

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

          items.push({ playerId, playerName, fromTeamId, toTeamId, action });
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
      this.logger?.error({ error, leagueId }, "Failed to fetch transactions");
      throw error;
    }
  }

  async fetchPreDraftAuctionValues(options: {
    leagueId: number;
    season: number;
    auth?: ESPNAuthCookies;
  }): Promise<
    Array<{
      playerId: number;
      playerName: string;
      positions: string[];
      espnAuctionValue: number;
      espnProjectedStats?: Record<string, number>;
    }>
  > {
    const { leagueId, season, auth } = options;

    const cacheKey = `auction-values:${leagueId}:${season}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.logger?.debug({ cacheKey }, "Using cached auction values");
      return cached.data as Array<{
        playerId: number;
        playerName: string;
        positions: string[];
        espnAuctionValue: number;
        espnProjectedStats?: Record<string, number>;
      }>;
    }

    const batchSize = 500;
    const MAX_ITERATIONS = 20;

    try {
      const url = `/seasons/${season}/segments/0/leagues/${leagueId}`;

      let offset = 0;
      const allPlayers: any[] = [];

      for (let i = 0; i < MAX_ITERATIONS; i++) {
        const headers: Record<string, string> = {};
        if (auth?.SWID && auth?.espn_s2) {
          headers.Cookie = `SWID=${auth.SWID}; espn_s2=${auth.espn_s2}`;
        }

        headers["x-fantasy-filter"] = JSON.stringify({
          players: {
            filterStatus: { value: ["FREEAGENT", "WAIVERS", "ONTEAM"] },
            filterSlotIds: { value: ALL_POSITION_SLOT_IDS },
            sortDraftRanks: {
              sortPriority: 100,
              sortAsc: true,
              value: "STANDARD",
            },
            limit: batchSize,
            offset,
          },
        });

        const params: Record<string, unknown> = {
          view: ["kona_player_info"],
          scoringPeriodId: 0,
        };

        this.logger?.info(
          { leagueId, season, offset, batchSize },
          "Fetching ESPN pre-draft auction values batch",
        );

        const response = await this.throttledEspnCall(() =>
          this.client.get(url, { params, headers }),
        );

        if (response.status !== 200) {
          throw new Error(`ESPN API returned status ${response.status}`);
        }

        const validatedData = validateEspnResponse(
          ESPNFreeAgentsResponseSchema,
          response.data,
          `fetchPreDraftAuctionValues(${leagueId}, ${season}, offset=${offset})`,
          this.logger,
        );

        const batch = (validatedData?.players as any[]) || [];

        this.logger?.info(
          {
            leagueId,
            season,
            offset,
            batchSize,
            received: batch.length,
            totalSoFar: allPlayers.length + batch.length,
          },
          "ESPN auction values batch fetched",
        );

        allPlayers.push(...batch);

        if (batch.length < batchSize) break;

        offset += batchSize;
      }

      this.logger?.info(
        {
          leagueId,
          season,
          totalFetched: allPlayers.length,
          playersWithRankings: allPlayers.filter(
            (p) => p.player?.draftRanksByRankType,
          ).length,
          playersWithStandardAuction: allPlayers.filter(
            (p) => p.player?.draftRanksByRankType?.STANDARD?.auctionValue > 0,
          ).length,
          playersWithRotoAuction: allPlayers.filter(
            (p) => p.player?.draftRanksByRankType?.ROTO?.auctionValue > 0,
          ).length,
        },
        "ESPN auction values response diagnostic",
      );

      if (allPlayers.length > 0 && allPlayers[0].player?.draftRanksByRankType) {
        this.logger?.debug(
          {
            samplePlayer: {
              id: allPlayers[0].id,
              name: allPlayers[0].player?.fullName,
              hasRankings: !!allPlayers[0].player?.draftRanksByRankType,
              rankingTypes: Object.keys(
                allPlayers[0].player?.draftRanksByRankType || {},
              ),
              standardAuctionValue:
                allPlayers[0].player?.draftRanksByRankType?.STANDARD
                  ?.auctionValue,
              rotoAuctionValue:
                allPlayers[0].player?.draftRanksByRankType?.ROTO?.auctionValue,
            },
          },
          "Sample player structure",
        );
      }

      const auctionValues: Array<{
        playerId: number;
        playerName: string;
        positions: string[];
        espnAuctionValue: number;
        espnProjectedStats?: Record<string, number>;
      }> = [];

      for (const entry of allPlayers) {
        const player = entry.player;
        if (!player) continue;

        const auctionValue =
          player.draftRanksByRankType?.STANDARD?.auctionValue ??
          player.draftRanksByRankType?.ROTO?.auctionValue ??
          0;
        if (auctionValue <= 0) continue;

        const eligibleSlots = (player.eligibleSlots || [])
          .filter((s: number) => s <= 15 && s !== 12 && s !== 6 && s !== 7)
          .map((s: number) => ESPN_LINEUP_SLOT_MAP[s] || `slot_${s}`);

        let espnProjectedStats: Record<string, number> | undefined;
        const statsArray = player.stats as any[] | undefined;
        if (statsArray) {
          const projEntry = statsArray.find(
            (s: any) => s.statSourceId === 1 && s.statSplitTypeId === 0,
          );
          if (projEntry?.stats) {
            espnProjectedStats = {};
            for (const [espnIdStr, value] of Object.entries(projEntry.stats)) {
              const espnId = parseInt(espnIdStr, 10);
              const mapping = ESPN_STAT_MAP[espnId];
              if (mapping && typeof value === "number") {
                espnProjectedStats[mapping.key] = value;
              }
            }
          }
        }

        auctionValues.push({
          playerId: entry.id,
          playerName: player.fullName || `Player ${entry.id}`,
          positions: [...new Set(eligibleSlots)] as string[],
          espnAuctionValue: auctionValue,
          espnProjectedStats,
        });
      }

      auctionValues.sort((a, b) => b.espnAuctionValue - a.espnAuctionValue);

      this.logger?.info(
        { leagueId, valueCount: auctionValues.length },
        "Pre-draft auction values fetched",
      );

      this.cache.set(cacheKey, {
        data: auctionValues,
        expiresAt: Date.now() + 1000 * 60 * 60,
      });

      return auctionValues;
    } catch (error) {
      this.logger?.error(
        { error, leagueId },
        "Failed to fetch pre-draft auction values",
      );
      return [];
    }
  }

  async fetchGlobalDraftData(options: {
    season: number;
    limit?: number;
  }): Promise<ESPNGlobalDraftPlayer[]> {
    const { season, limit: maxPlayers = 500 } = options;

    const cacheKey = `global-draft-data:${season}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.logger?.debug({ cacheKey }, "Using cached global draft data");
      return cached.data as ESPNGlobalDraftPlayer[];
    }

    const batchSize = 50;
    const maxIterations = Math.ceil(maxPlayers / batchSize);

    try {
      let offset = 0;
      const allPlayers: ESPNGlobalDraftPlayer[] = [];

      for (let i = 0; i < maxIterations; i++) {
        const headers: Record<string, string> = {
          "x-fantasy-filter": JSON.stringify({
            players: {
              limit: batchSize,
              offset,
              sortDraftRanks: {
                sortPriority: 100,
                sortAsc: true,
                value: "STANDARD",
              },
            },
          }),
        };

        const url = `/seasons/${season}/segments/0/leaguedefaults/1`;
        const params: Record<string, unknown> = {
          view: ["kona_player_info"],
          scoringPeriodId: 0,
        };

        this.logger?.info(
          { season, offset, batchSize, iteration: i + 1 },
          "Fetching global draft data batch",
        );

        const response = await this.throttledEspnCall(() =>
          this.client.get(url, { params, headers }),
        );

        if (response.status !== 200) {
          throw new Error(`ESPN API returned status ${response.status}`);
        }

        const validated = validateEspnResponse(
          ESPNFreeAgentsResponseSchema,
          response.data,
          `fetchGlobalDraftData(batch=${i + 1})`,
          this.logger,
        );
        const batch = validated.players || [];

        for (const entry of batch as any[]) {
          const player = entry.player;
          if (!player) continue;

          const ranks = player.draftRanksByRankType || {};
          const std = ranks.STANDARD || {};
          const roto = ranks.ROTO || {};
          const ownership = player.ownership || {};

          const auctionValue = std.auctionValue ?? roto.auctionValue ?? 0;
          const rank = std.rank ?? 9999;

          if (auctionValue <= 0 && rank >= 9999) continue;

          const eligibleSlots = (player.eligibleSlots || [])
            .filter((s: number) => s <= 15 && s !== 12 && s !== 6 && s !== 7)
            .map((s: number) => ESPN_LINEUP_SLOT_MAP[s] || `slot_${s}`);

          let espnProjectedStats: Record<string, number> | undefined;
          const statsArray = player.stats as any[] | undefined;
          if (statsArray) {
            const projEntry = statsArray.find(
              (s: any) => s.statSourceId === 1 && s.statSplitTypeId === 0,
            );
            if (projEntry?.stats) {
              espnProjectedStats = {};
              for (const [espnIdStr, value] of Object.entries(
                projEntry.stats,
              )) {
                const espnId = parseInt(espnIdStr, 10);
                const mapping = ESPN_STAT_MAP[espnId];
                if (mapping && typeof value === "number") {
                  espnProjectedStats[mapping.key] = value;
                }
              }
            }
          }

          allPlayers.push({
            playerId: entry.id,
            playerName: player.fullName || `Player ${entry.id}`,
            positions: [...new Set(eligibleSlots)] as string[],
            mlbTeam:
              ESPN_PRO_TEAM_MAP[player.proTeamId] || `team_${player.proTeamId}`,
            espnAuctionValue: std.auctionValue ?? 0,
            rotoAuctionValue: roto.auctionValue ?? 0,
            averageDraftPosition: ownership.averageDraftPosition ?? 0,
            averageAuctionValue: ownership.auctionValueAverage ?? 0,
            percentOwned: ownership.percentOwned ?? 0,
            percentStarted: ownership.percentStarted ?? 0,
            rank,
            espnProjectedStats,
          });
        }

        this.logger?.info(
          {
            season,
            offset,
            received: batch.length,
            totalSoFar: allPlayers.length,
          },
          "Global draft data batch fetched",
        );

        if (batch.length < batchSize) break;
        offset += batchSize;
      }

      allPlayers.sort((a, b) => a.rank - b.rank);

      this.logger?.info(
        { season, totalPlayers: allPlayers.length },
        "Global draft data fetched",
      );

      this.cache.set(cacheKey, {
        data: allPlayers,
        expiresAt: Date.now() + 1000 * 60 * 60,
      });

      return allPlayers;
    } catch (error) {
      this.logger?.error(
        { error, season },
        "Failed to fetch global draft data",
      );
      return [];
    }
  }

  clearCache(): void {
    this.cache.clear();
    this.logger?.info("ESPN adapter cache cleared");
  }

  private getCacheKey(options: ESPNFetchOptions): string {
    const { leagueId, season, views, scoringPeriodId } = options;
    return `espn:${leagueId}:${season}:${views?.join(",")}:${scoringPeriodId || "current"}`;
  }

  private getCached(key: string): unknown | null {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
    if (cached) {
      this.cache.delete(key);
    }
    return null;
  }

  private setCache(key: string, data: unknown, ttlMs: number): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }
}
