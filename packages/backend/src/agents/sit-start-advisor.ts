import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { BaseLogger } from "pino";
import type { Database } from "../db/schema.js";
import { PitcherlistAdapter } from "../adapters/pitcherlist.js";
import { RotoballerAdapter } from "../adapters/rotoballer.js";
import { FangraphsAdapter } from "../adapters/fangraphs.js";
import { MLBStatsAPIAdapter } from "../adapters/mlb-statsapi.js";
import { normalizePlayerName } from "../../../shared/dist/index.js";

/**
 * Sit/Start Advisor Agent
 *
 * Merges external SP rankings from Pitcherlist and Rotoballer with the
 * team's rostered SPs to produce sit/start verdicts with source attribution.
 *
 * Name matching is diacritic-aware to handle accented characters from external sites.
 */

export type Verdict = "start" | "lean_start" | "neutral" | "lean_sit" | "sit";

/**
 * Normalize a pitcher name — delegates to shared normalizePlayerName.
 * Alias kept for local readability.
 */
export const normalizeName = normalizePlayerName;

const VERDICT_NUMERIC: Record<Verdict, number> = {
  start: 5,
  lean_start: 4,
  neutral: 3,
  lean_sit: 2,
  sit: 1,
};

const NUMERIC_VERDICT: Record<number, Verdict> = {
  5: "start",
  4: "lean_start",
  3: "neutral",
  2: "lean_sit",
  1: "sit",
};

function numericToVerdict(n: number): Verdict {
  const rounded = Math.round(n);
  const clamped = Math.max(1, Math.min(5, rounded));
  return NUMERIC_VERDICT[clamped] ?? "neutral";
}

/**
 * Merge verdicts from multiple sources by averaging their numeric values.
 * Returns undefined if no verdicts provided.
 */
function mergeVerdicts(verdicts: Verdict[]): Verdict | undefined {
  if (!verdicts.length) return undefined;
  const sum = verdicts.reduce((acc, v) => acc + VERDICT_NUMERIC[v], 0);
  return numericToVerdict(sum / verdicts.length);
}

interface RosteredSP {
  player_id: number;
  name: string;
}

export interface SitStartRecommendation {
  playerId: number;
  playerName: string;
  pitcherlistVerdict?: Verdict;
  rotoballerVerdict?: Verdict;
  rotoballerGrade?: number;
  fangraphsVerdict?: Verdict;
  fangraphsTier?: string;
  pitcherlistTier?: string;
  sourceUrl: {
    pitcherlist?: string;
    rotoballer?: string;
    fangraphs?: string;
  };
  consensus?: Verdict;
  gameDate?: string;
  opponent?: string;
}

interface SourceMeta {
  articleTitle: string;
  articleUrl: string;
  scrapedAt: string;
  status?: "ok" | "degraded";
}

export interface SitStartResult {
  recommendations: SitStartRecommendation[];
  sources: {
    pitcherlist?: SourceMeta;
    rotoballer?: SourceMeta;
    fangraphs?: SourceMeta;
  };
}

export class SitStartAdvisor {
  private pitcherlistAdapter: PitcherlistAdapter;
  private rotoballerAdapter: RotoballerAdapter;
  private fangraphsAdapter: FangraphsAdapter;
  private mlbAdapter: MLBStatsAPIAdapter;

  constructor(
    private db: Kysely<Database>,
    private logger?: BaseLogger,
  ) {
    this.pitcherlistAdapter = new PitcherlistAdapter(logger);
    this.rotoballerAdapter = new RotoballerAdapter(logger);
    this.fangraphsAdapter = new FangraphsAdapter(logger);
    this.mlbAdapter = new MLBStatsAPIAdapter(logger);
  }

  async getRecommendations(
    leagueId: number,
    teamId: number,
  ): Promise<SitStartResult> {
    // Step 1: Fetch rostered SPs for this team from the latest snapshot
    const rosteredSPs = await this.fetchRosteredSPs(leagueId, teamId);

    // Step 2: Fetch external rankings from all sources (in parallel)
    const [pitcherlistRankings, rotoballerRankings, fangraphsRankings] =
      await Promise.all([
        this.pitcherlistAdapter.getRankings(),
        this.rotoballerAdapter.getRankings(),
        this.fangraphsAdapter.getRankings(),
      ]);

    // Step 2b: Fetch probable pitchers for the next 7 days from MLB Stats API.
    // Use a single getSchedule() call for the date range (more efficient than 7 separate calls).
    // Graceful degradation: if the MLB API fails, scheduledStartMap stays empty and sit/start
    // verdicts still display without dates.
    const scheduledStartMap = new Map<
      string,
      { gameDate: string; opponent: string }
    >();
    try {
      const today = new Date();
      const startDate = today.toISOString().slice(0, 10);
      const endDate7 = new Date(today);
      endDate7.setDate(today.getDate() + 6);
      const endDate = endDate7.toISOString().slice(0, 10);

      const schedule = await this.mlbAdapter.getSchedule(startDate, endDate);

      for (const game of schedule) {
        // Away probable pitcher
        if (game.teams.away.probablePitcher) {
          const key = normalizeName(game.teams.away.probablePitcher.fullName);
          if (!scheduledStartMap.has(key)) {
            scheduledStartMap.set(key, {
              gameDate: game.gameDate,
              opponent: game.teams.home.team.name,
            });
          }
        }
        // Home probable pitcher
        if (game.teams.home.probablePitcher) {
          const key = normalizeName(game.teams.home.probablePitcher.fullName);
          if (!scheduledStartMap.has(key)) {
            scheduledStartMap.set(key, {
              gameDate: game.gameDate,
              opponent: game.teams.away.team.name,
            });
          }
        }
      }

      this.logger?.debug(
        { startDate, endDate, scheduledCount: scheduledStartMap.size },
        "SitStartAdvisor: fetched scheduled starts from MLB Stats API",
      );
    } catch (err: any) {
      this.logger?.warn(
        { error: err?.message },
        "SitStartAdvisor: failed to fetch probable pitchers from MLB Stats API — continuing without game dates",
      );
    }

    this.logger?.debug(
      {
        leagueId,
        teamId,
        rosteredSPCount: rosteredSPs.length,
        pitcherlistCount: pitcherlistRankings.length,
        rotoballerCount: rotoballerRankings.length,
        fangraphsCount: fangraphsRankings.length,
      },
      "SitStartAdvisor: matching rostered SPs to external rankings",
    );

    // Step 3: Build source metadata
    const sources: SitStartResult["sources"] = {};

    const pitcherlistEntry = pitcherlistRankings[0];
    if (pitcherlistEntry) {
      sources.pitcherlist = {
        articleTitle: pitcherlistEntry.articleTitle,
        articleUrl: pitcherlistEntry.sourceUrl,
        scrapedAt: pitcherlistEntry.scrapedAt,
      };
    }

    const rotoballerEntry = rotoballerRankings[0];
    if (rotoballerEntry) {
      sources.rotoballer = {
        articleTitle: rotoballerEntry.articleTitle,
        articleUrl: rotoballerEntry.sourceUrl,
        scrapedAt: rotoballerEntry.scrapedAt,
        status: "ok",
      };
    }

    const fangraphsEntry = fangraphsRankings[0];
    if (fangraphsEntry) {
      sources.fangraphs = {
        articleTitle: fangraphsEntry.articleTitle,
        articleUrl: fangraphsEntry.sourceUrl,
        scrapedAt: fangraphsEntry.scrapedAt,
      };
    }

    // Step 4: Match each rostered SP to external rankings
    const recommendations: SitStartRecommendation[] = rosteredSPs.map((sp) => {
      const normalizedSpName = normalizeName(sp.name);

      const plMatch = pitcherlistRankings.find(
        (e) => normalizeName(e.playerName) === normalizedSpName,
      );
      const rbMatch = rotoballerRankings.find(
        (e) => normalizeName(e.playerName) === normalizedSpName,
      );
      const fgMatch = fangraphsRankings.find(
        (e) => normalizeName(e.playerName) === normalizedSpName,
      );

      // Build verdict array for consensus
      const verdicts: Verdict[] = [];
      if (plMatch) verdicts.push(plMatch.verdict);
      if (rbMatch) verdicts.push(rbMatch.verdict);
      if (fgMatch) verdicts.push(fgMatch.verdict);

      const recommendation: SitStartRecommendation = {
        playerId: sp.player_id,
        playerName: sp.name,
        sourceUrl: {},
      };

      if (plMatch) {
        recommendation.pitcherlistVerdict = plMatch.verdict;
        recommendation.pitcherlistTier = plMatch.tier;
        recommendation.sourceUrl.pitcherlist = plMatch.sourceUrl;
      }

      if (rbMatch) {
        recommendation.rotoballerVerdict = rbMatch.verdict;
        recommendation.rotoballerGrade = rbMatch.grade;
        recommendation.sourceUrl.rotoballer = rbMatch.sourceUrl;
      }

      if (fgMatch) {
        recommendation.fangraphsVerdict = fgMatch.verdict;
        recommendation.fangraphsTier = fgMatch.tier;
        recommendation.sourceUrl.fangraphs = fgMatch.sourceUrl;
      }

      const consensus = mergeVerdicts(verdicts);
      if (consensus !== undefined) {
        recommendation.consensus = consensus;
      }

      const scheduled = scheduledStartMap.get(normalizedSpName);
      if (scheduled) {
        recommendation.gameDate = scheduled.gameDate;
        recommendation.opponent = scheduled.opponent;
      }

      return recommendation;
    });

    return { recommendations, sources };
  }

  private async fetchRosteredSPs(
    leagueId: number,
    teamId: number,
  ): Promise<RosteredSP[]> {
    // Get the latest snapshot date for this team
    const latestSnapshotRow = await this.db
      .selectFrom("team_roster_snapshot")
      .where("league_id", "=", leagueId)
      .where("team_id", "=", teamId)
      .select("snapshot_date")
      .orderBy("snapshot_date", "desc")
      .execute();

    if (!latestSnapshotRow.length) {
      return [];
    }

    const latestDate = latestSnapshotRow[0].snapshot_date;

    // Fetch rostered SP-eligible players at the latest snapshot date.
    // Include SP and P (generic pitcher) active slots, plus BE (bench) and IL
    // so that SPs who are currently benched or on the injury list still appear.
    // The positions guard (`'SP' = ANY(player.positions)`) ensures that bench
    // relievers (slot = 'BE') are excluded — only genuine SP-eligible players
    // are returned regardless of which slot they currently occupy.
    const rows = await this.db
      .selectFrom("team_roster_snapshot")
      .innerJoin("player", "player.id", "team_roster_snapshot.player_id")
      .where("team_roster_snapshot.league_id", "=", leagueId)
      .where("team_roster_snapshot.team_id", "=", teamId)
      .where("team_roster_snapshot.snapshot_date", "=", latestDate)
      .where("team_roster_snapshot.roster_slot", "in", ["SP", "P", "BE", "IL"])
      .where(sql<boolean>`'SP' = ANY(player.positions)`)
      .select(["team_roster_snapshot.player_id", "player.name"])
      .execute();

    return rows.map((row) => ({
      player_id: row.player_id,
      name: row.name,
    }));
  }
}
