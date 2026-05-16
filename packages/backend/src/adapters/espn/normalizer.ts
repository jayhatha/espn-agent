import type { BaseLogger } from "pino";
import {
  ESPN_STAT_MAP,
  ESPN_LINEUP_SLOT_MAP,
  ESPN_PRO_TEAM_MAP,
  ESPN_POSITION_MAP,
  ESPN_PERIOD_STAT_MAP,
} from "./constants.js";
import type {
  ESPNLeagueData,
  ESPNScoringCategory,
  ESPNRosterEntry,
} from "./types.js";

export class EspnDataNormalizer {
  private logger?: BaseLogger;
  constructor(logger?: BaseLogger) {
    this.logger = logger;
  }

  normalizeLeagueData(raw: Record<string, unknown>): ESPNLeagueData {
    this.logger?.debug("Normalizing ESPN league data");
    const settings = raw.settings as Record<string, any>;
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
        rosterSlots: this.mapRosterSlotIds(
          settings?.rosterSettings?.lineupSlotCounts || {},
        ),
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
          // Slot 19 = IF utility — treated as active roster slot
          else if (
            (lineupSlotId >= 0 && lineupSlotId <= 15) ||
            lineupSlotId === 19
          )
            rosterStatus = "active";

          const injuryStatus = player.injuryStatus || null;

          rosterEntries.push({
            espnPlayerId: entry.playerId,
            name: player.fullName || `Player ${entry.playerId}`,
            mlbTeam:
              ESPN_PRO_TEAM_MAP[player.proTeamId] || `team_${player.proTeamId}`,
            positions: (player.eligibleSlots || [])
              .filter((s: number) => s <= 15 && s !== 12 && s !== 6 && s !== 7)
              .map((s: number) => ESPN_LINEUP_SLOT_MAP[s] || `slot_${s}`),
            lineupSlotId,
            rosterStatus,
            rosterSlot:
              ESPN_LINEUP_SLOT_MAP[lineupSlotId] || `slot_${lineupSlotId}`,
            acquisitionType: entry.acquisitionType || "UNKNOWN",
            injuryStatus,
          });
        }

        // Extract FAAB spent from ESPN transactionCounter
        const faabSpent: number | undefined =
          t.transactionCounter?.acquisitionBudgetSpent ??
          t.transactionCounter?.spent ??
          undefined;

        return {
          id: t.id,
          name: teamName,
          abbrev: t.abbrev || `T${t.id}`,
          statValues: t.valuesByStat || {},
          roster: rosterEntries,
          primaryOwner: t.primaryOwner,
          owners: t.owners || [],
          faabSpent: typeof faabSpent === "number" ? faabSpent : undefined,
          espnPoints: typeof t.points === "number" ? t.points : undefined,
          espnPointsDelta:
            typeof t.pointsDelta === "number" ? t.pointsDelta : undefined,
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

  parseFreeAgentsFromPlayers(
    raw: Record<string, unknown>,
  ): Array<{ playerId: number; name: string; positions: string[] }> {
    const players = (raw.players as any[]) || [];
    const freeAgents: Array<{
      playerId: number;
      name: string;
      positions: string[];
    }> = [];

    for (const player of players) {
      if (player.onTeamId === 0) {
        const eligibleSlots =
          player.player?.eligibleSlots || player.eligibleSlots || [];
        const positions = eligibleSlots
          .map((slotId: number) => ESPN_POSITION_MAP[slotId])
          .filter(
            (pos: string | undefined) =>
              pos && !["UTIL", "BE", "IL", "MI", "CI", "IF"].includes(pos),
          );

        freeAgents.push({
          playerId: player.id,
          name:
            player.player?.fullName || player.fullName || `Player ${player.id}`,
          positions: [...new Set(positions)] as string[],
        });
      }
    }

    return freeAgents;
  }

  mapRosterSlotIds(slotCounts: Record<string, number>): Record<string, number> {
    const mapped: Record<string, number> = {};
    for (const [slotIdStr, count] of Object.entries(slotCounts)) {
      if (count <= 0) continue;
      const slotId = parseInt(slotIdStr, 10);
      const posName = ESPN_LINEUP_SLOT_MAP[slotId];
      if (posName) {
        mapped[posName] = (mapped[posName] || 0) + count;
      }
    }
    return mapped;
  }

  /**
   * Parse per-player period stats from raw ESPN team data.
   *
   * Returns a map of ESPN player ID → component key → value.
   * Handles OUTS → IP conversion (divide by 3).
   * Skips IL (lineupSlotId=17) and NA (lineupSlotId=19) players.
   * Uses statSplitTypeId=5 for current scoring period stats.
   */
  parsePlayerPeriodComponents(
    rawTeams: any[],
    scoringPeriodId: number,
  ): Map<number, Record<string, number>> {
    const result = new Map<number, Record<string, number>>();

    for (const rawTeam of rawTeams) {
      const entries = rawTeam.roster?.entries || [];
      for (const entry of entries) {
        const lineupSlotId = entry.lineupSlotId ?? -1;
        // Skip IL (17) and NA (19)
        if (lineupSlotId === 17 || lineupSlotId === 19) continue;

        const espnPlayerId =
          entry.playerId ?? entry.playerPoolEntry?.player?.id;
        if (!espnPlayerId) continue;

        const playerStats = entry.playerPoolEntry?.player?.stats || [];
        const periodStats = playerStats.find(
          (s: any) =>
            s.statSplitTypeId === 5 && s.scoringPeriodId === scoringPeriodId,
        );
        if (!periodStats?.stats) continue;

        const components: Record<string, number> = {};
        for (const [statIdStr, value] of Object.entries(
          periodStats.stats as Record<string, number>,
        )) {
          const statId = parseInt(statIdStr, 10);
          const componentKey = ESPN_PERIOD_STAT_MAP[statId];
          if (!componentKey || typeof value !== "number" || value === 0)
            continue;

          if (componentKey === "OUTS") {
            components["IP"] = (components["IP"] || 0) + value / 3;
          } else {
            components[componentKey] = (components[componentKey] || 0) + value;
          }
        }

        if (Object.keys(components).length > 0) {
          result.set(espnPlayerId, components);
        }
      }
    }

    return result;
  }

  /**
   * Parse rosterForCurrentScoringPeriod from an ESPN response fetched with rosterForTeamId.
   *
   * Sums per-player stats (statSplitTypeId=5, statSourceId=0) for ACTIVE lineup slots only
   * (lineupSlotId < 16, i.e. not bench/IL). Returns a map of ESPN stat ID → total value.
   */
  parseRosterCurrentScoringPeriod(
    raw: Record<string, unknown>,
  ): Record<number, number> {
    const rosterData = raw.rosterForCurrentScoringPeriod as any;
    if (!rosterData?.entries || !Array.isArray(rosterData.entries)) {
      return {};
    }

    const totals: Record<number, number> = {};

    for (const entry of rosterData.entries) {
      // Skip bench (16) and IL (17) slots
      const lineupSlotId =
        typeof entry.lineupSlotId === "number" ? entry.lineupSlotId : 99;
      if (lineupSlotId >= 16) continue;

      // Navigate nested playerPoolEntry structure
      const outerPool = entry.playerPoolEntry;
      if (!outerPool) continue;

      // Stats can be on the outer or inner playerPoolEntry depending on ESPN's response shape
      const statsSource = outerPool.playerPoolEntry ?? outerPool;
      const stats: any[] = Array.isArray(statsSource?.stats)
        ? statsSource.stats
        : [];

      for (const statEntry of stats) {
        // Only use actual (not projected) stats for current scoring period
        if (statEntry.statSourceId !== 0 || statEntry.statSplitTypeId !== 5)
          continue;

        const statMap = statEntry.stats as Record<string, number> | undefined;
        if (!statMap) continue;

        for (const [statIdStr, value] of Object.entries(statMap)) {
          const statId = parseInt(statIdStr, 10);
          if (isNaN(statId) || typeof value !== "number") continue;
          totals[statId] = (totals[statId] ?? 0) + value;
        }
      }
    }

    this.logger?.debug(
      { statCount: Object.keys(totals).length },
      "Parsed rosterForCurrentScoringPeriod",
    );

    return totals;
  }
}
