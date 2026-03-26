import type { BaseLogger } from "pino";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import type { ResolutionMethod } from "../../../shared/dist/index.js";

/**
 * Player Identity Resolution Agent
 * Per AGENTS.md §3
 *
 * Matches ESPN players to projection rows robustly
 */

interface PlayerMatchCandidate {
  playerId: number;
  confidence: number;
  method: ResolutionMethod;
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export class PlayerIdentityResolutionAgent {
  constructor(
    private db: Kysely<Database>,
    private logger?: BaseLogger,
  ) {}

  /**
   * Resolve player identity by matching name, team, position
   */
  async resolvePlayer(
    espnPlayerId: number,
    fangraphsKey: string,
    options?: {
      playerName?: string;
      team?: string;
      positions?: string[];
    },
  ): Promise<void> {
    // Find player in our database
    const player = await this.db
      .selectFrom("player")
      .selectAll()
      .where("id", "=", espnPlayerId)
      .executeTakeFirst();

    if (!player) {
      this.logger?.warn({ espnPlayerId }, "Player not found for resolution");
      return;
    }

    // Compute confidence based on matching factors
    let confidence = 1.0;
    let method: ResolutionMethod = "exact_match";

    if (options?.playerName) {
      const nameMatch = this.fuzzyNameMatch(player.name, options.playerName);
      if (nameMatch < 0.9) {
        confidence *= nameMatch;
        method = "fuzzy_match";
      }
    }

    if (options?.team && player.mlb_team) {
      if (player.mlb_team.toLowerCase() !== options.team.toLowerCase()) {
        confidence *= 0.8;
      }
    }

    // Store identity mapping
    await this.db
      .insertInto("player_identity_map")
      .values({
        player_id: player.id,
        fangraphs_key: fangraphsKey,
        confidence,
        resolution_method: method,
        updated_at: new Date(),
      })
      .onConflict((oc) =>
        oc.column("player_id").doUpdateSet({
          fangraphs_key: fangraphsKey,
          confidence,
          resolution_method: method,
          updated_at: new Date(),
        }),
      )
      .execute();

    this.logger?.info(
      { playerId: player.id, fangraphsKey, confidence, method },
      "Player identity resolved",
    );
  }

  /**
   * Find best match for a FanGraphs player
   */
  async findBestMatch(
    _fangraphsKey: string,
    playerName: string,
    team?: string,
    positions?: string[],
  ): Promise<PlayerMatchCandidate | null> {
    // Query potential matches
    let query = this.db.selectFrom("player").selectAll();

    if (team) {
      query = query.where("mlb_team", "=", team);
    }

    const candidates = await query.execute();

    let bestMatch: PlayerMatchCandidate | null = null;
    let bestConfidence = 0;

    for (const candidate of candidates) {
      let confidence = this.fuzzyNameMatch(candidate.name, playerName);

      // Boost confidence if team matches
      if (team && candidate.mlb_team?.toLowerCase() === team.toLowerCase()) {
        confidence *= 1.1;
      }

      // Boost confidence if positions overlap
      if (positions && candidate.positions.length > 0) {
        const overlap = candidate.positions.some((p) => positions.includes(p));
        if (overlap) {
          confidence *= 1.05;
        }
      }

      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestMatch = {
          playerId: candidate.id,
          confidence: Math.min(confidence, 1.0),
          method: confidence >= 0.95 ? "exact_match" : "fuzzy_match",
        };
      }
    }

    // Only return if confidence is above threshold
    if (bestMatch && bestConfidence >= 0.7) {
      return bestMatch;
    }

    return null;
  }

  /**
   * Manual override for identity resolution
   */
  async manualOverride(playerId: number, fangraphsKey: string): Promise<void> {
    await this.db
      .insertInto("player_identity_map")
      .values({
        player_id: playerId,
        fangraphs_key: fangraphsKey,
        confidence: 1.0,
        resolution_method: "manual_override",
        updated_at: new Date(),
      })
      .onConflict((oc) =>
        oc.column("player_id").doUpdateSet({
          fangraphs_key: fangraphsKey,
          confidence: 1.0,
          resolution_method: "manual_override",
          updated_at: new Date(),
        }),
      )
      .execute();

    this.logger?.info(
      { playerId, fangraphsKey },
      "Manual identity override applied",
    );
  }

  /**
   * Fuzzy name matching using Levenshtein distance
   */
  private fuzzyNameMatch(name1: string, name2: string): number {
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z]/g, "")
        .trim();

    const n1 = normalize(name1);
    const n2 = normalize(name2);

    if (n1 === n2) return 1.0;
    if (n1.length === 0 || n2.length === 0) return 0;

    const distance = levenshteinDistance(n1, n2);
    return 1 - distance / Math.max(n1.length, n2.length);
  }
}
