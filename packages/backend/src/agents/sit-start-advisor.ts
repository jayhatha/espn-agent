import type { Kysely } from "kysely";
import type { BaseLogger } from "pino";
import type { Database } from "../db/schema.js";
import type { ExternalRankingEntry } from "../../../shared/dist/index.js";
import { PitcherlistAdapter } from "../adapters/pitcherlist.js";
import { RotoballerAdapter } from "../adapters/rotoballer.js";

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
 * Normalize a pitcher name for matching:
 * - Strip diacritics (NFD decomposition + remove combining marks)
 * - Lowercase
 * - Remove non-alpha characters
 *
 * This handles cases like "Cristopher Sánchez" matching "Cristopher Sanchez".
 */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

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
  espn_player_id: number;
}

export interface SitStartRecommendation {
  playerId: number;
  playerName: string;
  pitcherlistVerdict?: Verdict;
  rotoballerVerdict?: Verdict;
  rotoballerGrade?: number;
  pitcherlistTier?: string;
  sourceUrl: {
    pitcherlist?: string;
    rotoballer?: string;
  };
  consensus?: Verdict;
}

export interface SitStartResult {
  recommendations: SitStartRecommendation[];
  sources: {
    pitcherlist?: {
      articleTitle: string;
      articleUrl: string;
      scrapedAt: string;
    };
    rotoballer?: {
      articleTitle: string;
      articleUrl: string;
      scrapedAt: string;
      status: "ok" | "degraded";
    };
  };
}

export class SitStartAdvisor {
  private pitcherlistAdapter: PitcherlistAdapter;
  private rotoballerAdapter: RotoballerAdapter;

  constructor(
    private db: Kysely<Database>,
    private logger?: BaseLogger,
  ) {
    this.pitcherlistAdapter = new PitcherlistAdapter(logger);
    this.rotoballerAdapter = new RotoballerAdapter(logger);
  }

  async getRecommendations(
    leagueId: number,
    teamId: number,
  ): Promise<SitStartResult> {
    // Step 1: Fetch rostered SPs for this team from the latest snapshot
    const rosteredSPs = await this.fetchRosteredSPs(leagueId, teamId);

    // Step 2: Fetch external rankings from both sources (in parallel)
    const [pitcherlistRankings, rotoballerRankings] = await Promise.all([
      this.pitcherlistAdapter.getRankings(),
      this.rotoballerAdapter.getRankings(),
    ]);

    this.logger?.debug(
      {
        leagueId,
        teamId,
        rosteredSPCount: rosteredSPs.length,
        pitcherlistCount: pitcherlistRankings.length,
        rotoballerCount: rotoballerRankings.length,
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
    } else if (pitcherlistRankings.length === 0 && rotoballerRankings.length === 0) {
      // Both sources degraded — no sources metadata
    }

    // Step 4: Match each rostered SP to external rankings
    const recommendations: SitStartRecommendation[] = rosteredSPs.map(
      (sp) => {
        const normalizedSpName = normalizeName(sp.name);

        // Find matching Pitcherlist entry
        const plMatch = pitcherlistRankings.find(
          (e) => normalizeName(e.playerName) === normalizedSpName,
        );

        // Find matching Rotoballer entry
        const rbMatch = rotoballerRankings.find(
          (e) => normalizeName(e.playerName) === normalizedSpName,
        );

        // Build verdict array for consensus
        const verdicts: Verdict[] = [];
        if (plMatch) verdicts.push(plMatch.verdict);
        if (rbMatch) verdicts.push(rbMatch.verdict);

        const recommendation: SitStartRecommendation = {
          playerId: sp.espn_player_id,
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

        const consensus = mergeVerdicts(verdicts);
        if (consensus !== undefined) {
          recommendation.consensus = consensus;
        }

        return recommendation;
      },
    );

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

    // Fetch rostered SP/P players at the latest snapshot date
    const rows = await this.db
      .selectFrom("team_roster_snapshot")
      .innerJoin("player", "player.id", "team_roster_snapshot.player_id")
      .where("team_roster_snapshot.league_id", "=", leagueId)
      .where("team_roster_snapshot.team_id", "=", teamId)
      .where("team_roster_snapshot.snapshot_date", "=", latestDate)
      .where("team_roster_snapshot.roster_slot", "in", ["SP", "P", "RP"])
      .select([
        "team_roster_snapshot.player_id",
        "player.name",
        "player.espn_player_id",
      ])
      .execute();

    return rows.map((row) => ({
      player_id: row.player_id,
      name: row.name,
      espn_player_id: row.espn_player_id,
    }));
  }
}
