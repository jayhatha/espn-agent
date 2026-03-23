import type { FastifyInstance } from "fastify";
import { getDb } from "../db/connection.js";
import { authenticate, requireLeagueAccess } from "../middleware/auth.js";
import { parseIntParam } from "../utils/validation.js";
import {
  calculateOBP,
  calculateSLG,
  calculateERA,
  calculateWHIP,
} from "../../../shared/dist/index.js";

/**
 * Trends API Routes
 * Phase 70: Hot/cold player trends and lineup efficiency tracking
 */

interface TrendsQuery {
  days?: string;
  season?: string;
}

interface ComponentsJson {
  [key: string]: number;
}

function sumComponents(rows: Array<{ components_json: unknown }>): ComponentsJson {
  const totals: ComponentsJson = {};
  for (const row of rows) {
    const comps = row.components_json as ComponentsJson | null;
    if (!comps) continue;
    for (const [key, val] of Object.entries(comps)) {
      const num = Number(val);
      if (!isNaN(num)) {
        totals[key] = (totals[key] || 0) + num;
      }
    }
  }
  return totals;
}

function computeOPS(comps: ComponentsJson): number | null {
  const ab = comps.AB || 0;
  if (ab === 0) return null;
  const obp = calculateOBP({
    AB: ab,
    H: comps.H || 0,
    BB: comps.BB || 0,
    HBP: comps.HBP || 0,
    SF: comps.SF || 0,
  });
  const slg = calculateSLG({ AB: ab, TB: comps.TB || 0 });
  return obp + slg;
}

function computeERA(comps: ComponentsJson): number | null {
  const ip = comps.IP || 0;
  if (ip === 0) return null;
  return calculateERA({ IP: ip, ER: comps.ER || 0 });
}

function computeWHIP(comps: ComponentsJson): number | null {
  const ip = comps.IP || 0;
  if (ip === 0) return null;
  return calculateWHIP({
    IP: ip,
    HA: comps.HA ?? comps.H,
    BBA: comps.BBA ?? comps.BB,
    H: comps.H || 0,
    BB: comps.BB || 0,
  });
}

function computeKRate(comps: ComponentsJson): number | null {
  const ip = comps.IP || 0;
  if (ip === 0) return null;
  return (comps.K || 0) / ip;
}

function isHitter(comps: ComponentsJson): boolean {
  return (comps.AB || 0) > 0;
}

function isPitcher(comps: ComponentsJson): boolean {
  return (comps.IP || 0) > 0;
}

export async function trendsRoutes(app: FastifyInstance) {
  const db = getDb();

  // ── Hot/Cold Trends ──────────────────────────────────────────────
  app.get<{
    Params: { leagueId: string; teamId: string };
    Querystring: TrendsQuery;
  }>(
    "/api/leagues/:leagueId/teams/:teamId/trends/hot-cold",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess],
    },
    async (request, reply) => {
      try {
        const leagueId = parseIntParam(request.params.leagueId, "leagueId");
        const teamId = parseIntParam(request.params.teamId, "teamId");
        const days = parseInt(request.query.days || "7", 10);

        // 1. Get latest snapshot date
        const latestSnapshot = await db
          .selectFrom("league_daily_snapshot")
          .select("snapshot_date")
          .where("league_id", "=", leagueId)
          .orderBy("snapshot_date", "desc")
          .executeTakeFirst();

        if (!latestSnapshot) {
          return { dataAvailable: false, snapshotDate: null, windowDays: days, players: [] };
        }

        const snapshotDate = latestSnapshot.snapshot_date;

        // 2. Get team's current roster
        const rosterRows = await db
          .selectFrom("team_roster_snapshot as trs")
          .innerJoin("player as p", "p.id", "trs.player_id")
          .select([
            "trs.player_id",
            "p.name as player_name",
            "trs.roster_slot",
            "trs.roster_status",
          ])
          .where("trs.league_id", "=", leagueId)
          .where("trs.team_id", "=", teamId)
          .where("trs.snapshot_date", "=", snapshotDate)
          .where("trs.roster_status", "in", ["active", "bench"])
          .execute();

        if (rosterRows.length === 0) {
          return { dataAvailable: false, snapshotDate, windowDays: days, players: [] };
        }

        const playerIds = rosterRows.map((r) => r.player_id);

        // 3. Compute cutoff date for rolling window
        const cutoffDate = new Date(snapshotDate);
        cutoffDate.setDate(cutoffDate.getDate() - days);
        const cutoffDateStr = cutoffDate.toISOString().split("T")[0];

        // 4. Query player_period_stats for rolling window
        const recentStats = playerIds.length > 0
          ? await db
              .selectFrom("player_period_stats")
              .select(["player_id", "components_json", "snapshot_date"])
              .where("league_id", "=", leagueId)
              .where("player_id", "in", playerIds)
              .where("snapshot_date", ">=", cutoffDateStr)
              .where("snapshot_date", "<=", snapshotDate)
              .execute()
          : [];

        // 5. Query full season stats
        const seasonStats = playerIds.length > 0
          ? await db
              .selectFrom("player_period_stats")
              .select(["player_id", "components_json"])
              .where("league_id", "=", leagueId)
              .where("player_id", "in", playerIds)
              .execute()
          : [];

        if (recentStats.length === 0) {
          return { dataAvailable: false, snapshotDate, windowDays: days, players: [] };
        }

        // 6. Group stats by player
        const recentByPlayer = new Map<number, Array<{ components_json: unknown }>>();
        for (const row of recentStats) {
          if (!recentByPlayer.has(row.player_id)) recentByPlayer.set(row.player_id, []);
          recentByPlayer.get(row.player_id)!.push(row);
        }

        const seasonByPlayer = new Map<number, Array<{ components_json: unknown }>>();
        for (const row of seasonStats) {
          if (!seasonByPlayer.has(row.player_id)) seasonByPlayer.set(row.player_id, []);
          seasonByPlayer.get(row.player_id)!.push(row);
        }

        // 7. Compute trends for each player
        const players = rosterRows.map((roster) => {
          const recentRows = recentByPlayer.get(roster.player_id) || [];
          const seasonRows = seasonByPlayer.get(roster.player_id) || [];

          const recentComps = sumComponents(recentRows);
          const seasonComps = sumComponents(seasonRows);

          // Determine player type
          const playerIsHitter = isHitter(recentComps) || isHitter(seasonComps);
          const playerIsPitcher = isPitcher(recentComps) || isPitcher(seasonComps);
          const playerType: "hitter" | "pitcher" = playerIsPitcher && !playerIsHitter ? "pitcher" : "hitter";

          let trend: "hot" | "cold" | "neutral" | "insufficient" = "neutral";
          let drivingStat: string | null = null;
          const sevenDay: Record<string, number | undefined> = {};
          const season: Record<string, number | undefined> = {};
          const ratios: Record<string, number | null> = {};

          if (playerType === "hitter") {
            const recentAB = recentComps.AB || 0;
            const seasonAB = seasonComps.AB || 0;

            sevenDay.ops = computeOPS(recentComps) ?? undefined;
            sevenDay.hr = recentComps.HR || 0;
            sevenDay.sb = recentComps.SB || 0;
            sevenDay.ab = recentAB;

            season.ops = computeOPS(seasonComps) ?? undefined;
            season.hr = seasonComps.HR || 0;
            season.sb = seasonComps.SB || 0;
            season.ab = seasonAB;

            // Insufficient data check
            if (recentAB < 5) {
              trend = "insufficient";
            } else {
              const opsRatio = (sevenDay.ops != null && season.ops != null && season.ops > 0)
                ? sevenDay.ops / season.ops
                : null;
              ratios.opsRatio = seasonAB >= 20 ? opsRatio : null;

              const seasonHRRate = seasonAB > 0 ? (seasonComps.HR || 0) / seasonAB : 0;
              const recentHRRate = recentAB > 0 ? (recentComps.HR || 0) / recentAB : 0;
              const hrBurst = (recentComps.HR || 0) >= 3 && seasonHRRate > 0 && recentHRRate > 2 * seasonHRRate;

              if (hrBurst) {
                trend = "hot";
                drivingStat = "HR burst";
              } else if (opsRatio != null && opsRatio > 1.25) {
                trend = "hot";
                drivingStat = "OPS surge";
              } else if (opsRatio != null && opsRatio < 0.75 && seasonAB >= 50) {
                trend = "cold";
                drivingStat = "OPS decline";
              }
            }
          } else {
            // Pitcher
            const recentIP = recentComps.IP || 0;
            const seasonIP = seasonComps.IP || 0;

            sevenDay.era = computeERA(recentComps) ?? undefined;
            sevenDay.whip = computeWHIP(recentComps) ?? undefined;
            sevenDay.kRate = computeKRate(recentComps) ?? undefined;
            sevenDay.ip = recentIP;

            season.era = computeERA(seasonComps) ?? undefined;
            season.whip = computeWHIP(seasonComps) ?? undefined;
            season.kRate = computeKRate(seasonComps) ?? undefined;
            season.ip = seasonIP;

            // Insufficient data check
            if (recentIP < 3) {
              trend = "insufficient";
            } else {
              const seasonKRate = season.kRate ?? 0;
              const recentKRate = sevenDay.kRate ?? 0;
              const kSpike = recentIP >= 5 && seasonKRate > 0 && recentKRate > 1.25 * seasonKRate;

              const eraRatio = (sevenDay.era != null && season.era != null && season.era > 0)
                ? sevenDay.era / season.era
                : null;
              ratios.eraRatio = seasonIP >= 20 ? eraRatio : null;
              ratios.kRateRatio = (seasonKRate > 0 && recentKRate > 0)
                ? recentKRate / seasonKRate
                : null;

              if (kSpike) {
                trend = "hot";
                drivingStat = "K spike";
              } else if (eraRatio != null && eraRatio < 0.75) {
                trend = "hot";
                drivingStat = "ERA drop";
              } else if (eraRatio != null && eraRatio > 1.5 && seasonIP >= 20) {
                trend = "cold";
                drivingStat = "ERA spike";
              }
            }
          }

          return {
            playerId: roster.player_id,
            playerName: roster.player_name,
            rosterSlot: roster.roster_slot,
            rosterStatus: roster.roster_status,
            playerType,
            trend,
            drivingStat,
            sevenDay,
            season,
            ratios,
          };
        });

        return { dataAvailable: true, snapshotDate, windowDays: days, players };
      } catch (err) {
        return reply.code(400).send({ error: err instanceof Error ? err.message : "Invalid request" });
      }
    },
  );

  // ── Lineup Efficiency ────────────────────────────────────────────
  app.get<{
    Params: { leagueId: string; teamId: string };
    Querystring: TrendsQuery;
  }>(
    "/api/leagues/:leagueId/teams/:teamId/trends/lineup-efficiency",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess],
    },
    async (request, reply) => {
      try {
        const leagueId = parseIntParam(request.params.leagueId, "leagueId");
        const teamId = parseIntParam(request.params.teamId, "teamId");
        const days = parseInt(request.query.days || "7", 10);

        // 1. Get latest snapshot date
        const latestSnapshot = await db
          .selectFrom("league_daily_snapshot")
          .select("snapshot_date")
          .where("league_id", "=", leagueId)
          .orderBy("snapshot_date", "desc")
          .executeTakeFirst();

        if (!latestSnapshot) {
          return { dataAvailable: false, days: [] };
        }

        const snapshotDate = latestSnapshot.snapshot_date;
        const cutoffDate = new Date(snapshotDate);
        cutoffDate.setDate(cutoffDate.getDate() - days);
        const cutoffDateStr = cutoffDate.toISOString().split("T")[0];

        // 2. Query player_period_stats with lineup_slot_id
        const periodStats = await db
          .selectFrom("player_period_stats as pps")
          .innerJoin("player as p", "p.id", "pps.player_id")
          .select([
            "pps.player_id",
            "p.name as player_name",
            "pps.snapshot_date",
            "pps.lineup_slot_id",
            "pps.components_json",
          ])
          .where("pps.league_id", "=", leagueId)
          .where("pps.team_id", "=", teamId)
          .where("pps.snapshot_date", ">=", cutoffDateStr)
          .where("pps.snapshot_date", "<=", snapshotDate)
          .execute();

        if (periodStats.length === 0) {
          return { dataAvailable: false, days: [] };
        }

        // 3. Get roster snapshots for position mapping over the date range
        const rosterSnapshots = await db
          .selectFrom("team_roster_snapshot")
          .select(["snapshot_date", "player_id", "roster_slot", "roster_status"])
          .where("league_id", "=", leagueId)
          .where("team_id", "=", teamId)
          .where("snapshot_date", ">=", cutoffDateStr)
          .where("snapshot_date", "<=", snapshotDate)
          .execute();

        // Build roster slot map: date -> player_id -> { roster_slot, roster_status }
        const rosterByDate = new Map<string, Map<number, { roster_slot: string | null; roster_status: string }>>();
        for (const row of rosterSnapshots) {
          if (!rosterByDate.has(row.snapshot_date)) rosterByDate.set(row.snapshot_date, new Map());
          rosterByDate.get(row.snapshot_date)!.set(row.player_id, {
            roster_slot: row.roster_slot,
            roster_status: row.roster_status,
          });
        }

        // 4. Group period stats by date
        const statsByDate = new Map<string, typeof periodStats>();
        for (const row of periodStats) {
          if (!statsByDate.has(row.snapshot_date)) statsByDate.set(row.snapshot_date, []);
          statsByDate.get(row.snapshot_date)!.push(row);
        }

        // 5. Process each day
        const dayResults: Array<{
          date: string;
          benchProduction: {
            totalHR: number;
            totalSB: number;
            totalOPS: number | null;
            totalAB: number;
          };
          warnings: Array<{
            benchPlayerId: number;
            benchPlayerName: string;
            starterId: number;
            starterName: string;
            position: string;
            benchStat: { hr: number; ops: number | null };
            starterStat: { hr: number; ops: number | null };
            reason: string;
          }>;
        }> = [];

        const sortedDates = Array.from(statsByDate.keys()).sort();

        for (const date of sortedDates) {
          const dayStats = statsByDate.get(date)!;
          const dayRoster = rosterByDate.get(date);

          // Partition into active vs bench by lineup_slot_id
          const benchPlayers = dayStats.filter(
            (s) => s.lineup_slot_id !== null && s.lineup_slot_id >= 20,
          );
          const activePlayers = dayStats.filter(
            (s) => s.lineup_slot_id !== null && s.lineup_slot_id < 20,
          );

          // Bench production totals
          let totalHR = 0;
          let totalSB = 0;
          let totalABBench = 0;
          const benchCompsAll: ComponentsJson = {};

          for (const bp of benchPlayers) {
            const comps = bp.components_json as ComponentsJson | null;
            if (!comps) continue;
            totalHR += comps.HR || 0;
            totalSB += comps.SB || 0;
            totalABBench += comps.AB || 0;
            for (const [key, val] of Object.entries(comps)) {
              const num = Number(val);
              if (!isNaN(num)) {
                benchCompsAll[key] = (benchCompsAll[key] || 0) + num;
              }
            }
          }

          const totalOPS = computeOPS(benchCompsAll);

          // Warnings: bench player outproduced starter at same position
          const warnings: typeof dayResults[0]["warnings"] = [];

          for (const bp of benchPlayers) {
            const bpComps = bp.components_json as ComponentsJson | null;
            if (!bpComps) continue;

            // Find bench player's natural position from roster snapshot
            const bpRosterInfo = dayRoster?.get(bp.player_id);
            const bpPosition = bpRosterInfo?.roster_slot;
            if (!bpPosition) continue;

            // Find the active player in the same position slot
            for (const ap of activePlayers) {
              const apRosterInfo = dayRoster?.get(ap.player_id);
              if (!apRosterInfo || apRosterInfo.roster_slot !== bpPosition) continue;

              const apComps = ap.components_json as ComponentsJson | null;
              if (!apComps) continue;

              const benchHR = bpComps.HR || 0;
              const starterHR = apComps.HR || 0;
              const benchOPS = computeOPS(bpComps);
              const starterOPS = computeOPS(apComps);

              const reasons: string[] = [];
              if (benchHR > starterHR) {
                reasons.push(`Bench HR: ${benchHR} vs Starter HR: ${starterHR}`);
              }
              if (benchOPS != null && starterOPS != null && benchOPS > starterOPS && (bpComps.AB || 0) >= 2) {
                reasons.push(`Bench OPS: ${benchOPS.toFixed(3)} vs Starter OPS: ${starterOPS.toFixed(3)}`);
              }

              if (reasons.length > 0) {
                warnings.push({
                  benchPlayerId: bp.player_id,
                  benchPlayerName: bp.player_name,
                  starterId: ap.player_id,
                  starterName: ap.player_name,
                  position: bpPosition,
                  benchStat: { hr: benchHR, ops: benchOPS },
                  starterStat: { hr: starterHR, ops: starterOPS },
                  reason: reasons.join("; "),
                });
              }
              break; // Only compare to first starter at same position
            }
          }

          dayResults.push({
            date,
            benchProduction: {
              totalHR,
              totalSB,
              totalOPS,
              totalAB: totalABBench,
            },
            warnings,
          });
        }

        return { dataAvailable: true, days: dayResults };
      } catch (err) {
        return reply.code(400).send({ error: err instanceof Error ? err.message : "Invalid request" });
      }
    },
  );
}
