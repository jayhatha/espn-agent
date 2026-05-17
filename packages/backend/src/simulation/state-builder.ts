import type { Kysely } from "kysely";
import type { BaseLogger } from "pino";
import type { Category, StatComponents } from "../../../shared/dist/index.js";
import type { Database } from "../db/schema.js";
import { SnapshotRepository } from "../db/snapshot-repository.js";
import type { RosteredPlayer } from "../projection/types.js";
import type { SimulationState, TeamSimInput } from "./types.js";
import { DEFAULT_SEASON_END } from "./types.js";

const DEFAULT_GS_CAP = 200;

/**
 * Compute days between snapshotDate and the season end date.
 * Reproducible: uses snapshotDate, never wall-clock time.
 */
function daysFromSnapshotDate(snapshotDate: string, endDate: string): number {
  const start = new Date(snapshotDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  return Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
  );
}

/**
 * Phase 103: Build canonical simulation state from DB (SIM-01).
 *
 * Single function that materialises all data needed for simulation:
 * current standings, team rosters, RoS projections, league settings, GS cap.
 *
 * - Re-running with the same inputs returns an identical state
 * - Records degradedReasons when inputs are incomplete
 * - isViable = false only when the snapshot or settings are missing
 */
export async function buildSimulationState(
  db: Kysely<Database>,
  leagueId: number,
  snapshotDate: string,
  projectionsRunId: number,
  logger?: BaseLogger,
): Promise<SimulationState> {
  const repo = new SnapshotRepository(db);
  const degradedReasons: string[] = [];

  // ── Snapshot + settings ───────────────────────────────────────────────────
  const snapshot = await db
    .selectFrom("league_daily_snapshot")
    .selectAll()
    .where("league_id", "=", leagueId)
    .where("snapshot_date", "=", snapshotDate)
    .executeTakeFirst();

  if (!snapshot) degradedReasons.push("snapshot_missing");

  const settings = snapshot?.settings_version_id
    ? await db
        .selectFrom("league_settings_version")
        .selectAll()
        .where("id", "=", snapshot.settings_version_id)
        .executeTakeFirst()
    : undefined;

  const categories = (settings?.settings_json?.categories ?? []) as Category[];
  const rosterSlots = ((settings?.settings_json as any)?.roster_slots ??
    {}) as Record<string, number>;

  if (categories.length === 0) degradedReasons.push("settings_missing");

  const gsCap: number = (() => {
    const acq = (settings?.settings_json as any)?.acquisition_rules;
    const cap = acq?.max_starts ?? acq?.gs_cap ?? DEFAULT_GS_CAP;
    return typeof cap === "number" ? cap : DEFAULT_GS_CAP;
  })();

  // ── Projection run metadata ───────────────────────────────────────────────
  const projectionsRun = await db
    .selectFrom("projections_run")
    .select(["id", "as_of_date"])
    .where("id", "=", projectionsRunId)
    .executeTakeFirst();

  const projectionAsOfDate: string =
    (projectionsRun as any)?.as_of_date ?? snapshotDate;

  if (!projectionsRun) degradedReasons.push("projections_missing");

  const daysRemaining = daysFromSnapshotDate(snapshotDate, DEFAULT_SEASON_END);

  // ── Teams ─────────────────────────────────────────────────────────────────
  const teams = await db
    .selectFrom("team")
    .selectAll()
    .where("league_id", "=", leagueId)
    .execute();

  // ── Parallel data load ────────────────────────────────────────────────────
  const [
    allCategoryTotals,
    allRosterEntries,
    allProjections,
    teamEspnIds,
    latestPayload,
  ] = await Promise.all([
    repo.getLeagueCategoryTotals(leagueId, snapshotDate),
    repo.getRosterForSnapshot(leagueId, snapshotDate),
    repo.getPlayerProjections(projectionsRunId),
    db
      .selectFrom("team")
      .select(["id", "espn_team_id"])
      .where("league_id", "=", leagueId)
      .execute(),
    repo.getHistoricalRawPayload(leagueId, snapshotDate),
  ]);

  if (allRosterEntries.length === 0) degradedReasons.push("rosters_missing");
  if (allProjections.length === 0) degradedReasons.push("projections_empty");

  // ── Index by team ─────────────────────────────────────────────────────────
  const categoryTotalsByTeam = new Map<number, typeof allCategoryTotals>();
  for (const row of allCategoryTotals) {
    const arr = categoryTotalsByTeam.get(row.team_id) ?? [];
    arr.push(row);
    categoryTotalsByTeam.set(row.team_id, arr);
  }

  const rosterByTeam = new Map<number, typeof allRosterEntries>();
  for (const row of allRosterEntries) {
    const arr = rosterByTeam.get(row.team_id) ?? [];
    arr.push(row);
    rosterByTeam.set(row.team_id, arr);
  }

  const projectionsByPlayerId = new Map<number, StatComponents>();
  for (const proj of allProjections) {
    projectionsByPlayerId.set(
      proj.player_id,
      proj.stat_components_json as StatComponents,
    );
  }

  // ── GS used from ESPN raw payload ─────────────────────────────────────────
  const espnIdMap = new Map(teamEspnIds.map((t) => [t.id, t.espn_team_id]));
  const gsUsedByTeam = new Map<number, number>();
  const rawPayload = latestPayload?.response_json as any;
  for (const team of teams) {
    const espnTeamId = espnIdMap.get(team.id);
    const espnTeam = rawPayload?.teams?.find((t: any) => t.id === espnTeamId);
    const gs = espnTeam?.valuesByStat?.[33];
    gsUsedByTeam.set(team.id, typeof gs === "number" && gs >= 0 ? gs : 0);
  }

  // ── Build per-team input ──────────────────────────────────────────────────
  const teamInputs: TeamSimInput[] = teams.map((team) => {
    const catTotals = categoryTotalsByTeam.get(team.id) ?? [];
    const roster = rosterByTeam.get(team.id) ?? [];

    // Aggregate current batter + pitcher components from category totals
    const currentBatterComponents: StatComponents = {};
    const currentPitcherComponents: StatComponents = {};
    for (const cat of catTotals) {
      const components = (cat.components_json ?? {}) as StatComponents;
      const isPitcherCat =
        "IP" in components || "ER" in components || "HA" in components;
      const target = isPitcherCat
        ? currentPitcherComponents
        : currentBatterComponents;
      for (const [key, val] of Object.entries(components)) {
        if (typeof val === "number") {
          (target as Record<string, number>)[key] =
            ((target as Record<string, number>)[key] ?? 0) + val;
        }
      }
    }

    const rosterPlayers: RosteredPlayer[] = roster.map((r) => ({
      playerId: r.player_id,
      positions: (r.positions as string[]) || [],
      rosterStatus: (r.roster_status as "active" | "bench" | "il") || "active",
      rosterSlot: r.roster_slot || null,
      projectedComponents: null,
    }));

    const teamProjections = new Map<number, StatComponents>();
    for (const r of roster) {
      const proj = projectionsByPlayerId.get(r.player_id);
      if (proj) teamProjections.set(r.player_id, proj);
    }

    return {
      teamId: team.id,
      teamName: team.name,
      currentBatterComponents,
      currentPitcherComponents,
      roster: rosterPlayers,
      playerProjections: teamProjections,
      gsUsed: gsUsedByTeam.get(team.id) ?? 0,
    };
  });

  const isViable =
    categories.length > 0 &&
    teams.length > 0 &&
    !degradedReasons.includes("snapshot_missing") &&
    !degradedReasons.includes("settings_missing");

  logger?.debug(
    { leagueId, snapshotDate, degradedReasons, isViable },
    "SimulationState built",
  );

  return {
    leagueId,
    snapshotDate,
    projectionsRunId,
    categories,
    rosterSlots,
    gsCap,
    projectionAsOfDate,
    daysRemaining,
    teams: teamInputs,
    degradedReasons,
    isViable,
  };
}
