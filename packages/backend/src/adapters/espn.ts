// Thin facade — delegates to focused sub-modules.
// All types re-exported for backward compatibility.
// Constants (ESPN_STAT_MAP, ESPN_LINEUP_SLOT_MAP, etc.) are NOT re-exported here;
// import them directly from "./espn/constants.js" if needed.
import type { BaseLogger } from "pino";
import { EspnHttpClient } from "./espn/http-client.js";
import { EspnDataNormalizer } from "./espn/normalizer.js";

// Re-export all types for backward compatibility
export type {
  ESPNAuthCookies,
  ESPNFetchOptions,
  ESPNRawResponse,
  ESPNScoringCategory,
  ESPNRosterEntry,
  ESPNTeamData,
  ESPNFreeAgent,
  ESPNGlobalDraftPlayer,
  ESPNTransactionItem,
  ESPNTransaction,
  ESPNLeagueData,
} from "./espn/types.js";

import type {
  ESPNFetchOptions,
  ESPNRawResponse,
  ESPNFreeAgent,
  ESPNGlobalDraftPlayer,
  ESPNTransaction,
  ESPNLeagueData,
} from "./espn/types.js";

export class ESPNAdapter {
  /** @internal exposed for testing only */
  readonly http: EspnHttpClient;
  private normalizer: EspnDataNormalizer;

  constructor(logger?: BaseLogger) {
    this.http = new EspnHttpClient(logger);
    this.normalizer = new EspnDataNormalizer(logger);
  }

  fetchLeague(options: ESPNFetchOptions): Promise<ESPNRawResponse> {
    return this.http.fetchLeague(options);
  }

  fetchFreeAgents(
    options: Parameters<EspnHttpClient["fetchFreeAgents"]>[0],
  ): Promise<ESPNFreeAgent[]> {
    return this.http.fetchFreeAgents(options);
  }

  fetchHistoricalWeek(
    options: Parameters<EspnHttpClient["fetchHistoricalWeek"]>[0],
  ): Promise<ESPNRawResponse> {
    return this.http.fetchHistoricalWeek(options);
  }

  getFinalScoringPeriod(season: number): Promise<number | undefined> {
    return this.http.getFinalScoringPeriod(season);
  }

  fetchTransactions(
    options: Parameters<EspnHttpClient["fetchTransactions"]>[0],
  ): Promise<ESPNTransaction[]> {
    return this.http.fetchTransactions(options);
  }

  fetchPreDraftAuctionValues(
    options: Parameters<EspnHttpClient["fetchPreDraftAuctionValues"]>[0],
  ) {
    return this.http.fetchPreDraftAuctionValues(options);
  }

  fetchGlobalDraftData(
    options: Parameters<EspnHttpClient["fetchGlobalDraftData"]>[0],
  ): Promise<ESPNGlobalDraftPlayer[]> {
    return this.http.fetchGlobalDraftData(options);
  }

  normalizeLeagueData(raw: Record<string, unknown>): ESPNLeagueData {
    return this.normalizer.normalizeLeagueData(raw);
  }

  /**
   * Parse per-player period stats from raw ESPN team roster data.
   * Returns ESPN player ID → component key → value.
   * OUTS are converted to IP (divide by 3).
   */
  parsePlayerPeriodComponents(
    rawTeams: any[],
    scoringPeriodId: number,
  ): Map<number, Record<string, number>> {
    return this.normalizer.parsePlayerPeriodComponents(
      rawTeams,
      scoringPeriodId,
    );
  }

  /**
   * Parse rosterForCurrentScoringPeriod from a response fetched with rosterForTeamId.
   * Returns ESPN stat ID → summed value for active lineup players only.
   */
  parseRosterCurrentScoringPeriod(
    raw: Record<string, unknown>,
  ): Record<number, number> {
    return this.normalizer.parseRosterCurrentScoringPeriod(raw);
  }

  clearCache(): void {
    this.http.clearCache();
  }
}
