import type { BaseLogger } from "pino";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import { SnapshotRepository } from "../db/snapshot-repository.js";
import {
  type RosterValidationResult,
  type StatComponents,
} from "../../../shared/dist/index.js";
import type { RosteredPlayer, RosterGap } from "../projection/types.js";
import {
  canFillSlot,
  orderSlotsByConstraint,
} from "../projection/slot-eligibility.js";
import { RosterSimulator, type TradeSimContext } from "./roster-simulator.js";
// ASV (Average Season Value) is stored on player.espn_asv, populated by snapshot pipeline

/**
 * Trade Recommendation Agent
 *
 * Analyzes proposed trades and generates trade recommendations
 * - Impact analysis for proposed trades
 * - Candidate trade generation (1-for-1, 2-for-2)
 * - Fairness scoring based on projected standings impact
 */

const EQUIVALENT_VALUE_WEIGHTS = {
  asv: 0.8,
  draftCost: 0.2,
} as const;
const MIN_EQUIVALENT_VALUE_RATIO = 0.8;
const DRAFT_PRICE_CONTEXT_PATTERN = /(draft|auction|pick|bid)/i;
const DRAFT_PRICE_KEYS = [
  "bidAmount",
  "bid",
  "price",
  "cost",
  "salary",
  "auctionValue",
  "amount",
  "value",
];

function toPositiveNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function extractDraftPlayerId(entry: Record<string, unknown>): number | null {
  const directId = toPositiveNumber(entry.playerId ?? entry.player_id);
  if (directId != null) {
    return directId;
  }

  const nestedPlayer = toRecord(entry.player);
  if (!nestedPlayer) {
    return null;
  }

  return toPositiveNumber(
    nestedPlayer.id ?? nestedPlayer.playerId ?? nestedPlayer.player_id,
  );
}

function extractDraftPrice(entry: Record<string, unknown>): number | null {
  for (const key of DRAFT_PRICE_KEYS) {
    const direct = toPositiveNumber(entry[key]);
    if (direct != null) {
      return direct;
    }
  }

  for (const value of Object.values(entry)) {
    const nested = toRecord(value);
    if (!nested) {
      continue;
    }

    for (const key of DRAFT_PRICE_KEYS) {
      const nestedPrice = toPositiveNumber(nested[key]);
      if (nestedPrice != null) {
        return nestedPrice;
      }
    }
  }

  return null;
}

export function extractDraftCostsFromDraftDetail(
  draftDetail: unknown,
): Map<number, number> {
  const draftCosts = new Map<number, number>();

  const visit = (value: unknown, path: string[]): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, path);
      }
      return;
    }

    const entry = toRecord(value);
    if (!entry) {
      return;
    }

    const hasDraftContext =
      path.some((segment) => DRAFT_PRICE_CONTEXT_PATTERN.test(segment)) ||
      Object.keys(entry).some((key) => DRAFT_PRICE_CONTEXT_PATTERN.test(key));

    if (hasDraftContext) {
      const playerId = extractDraftPlayerId(entry);
      const draftCost = extractDraftPrice(entry);

      if (playerId != null && draftCost != null) {
        const current = draftCosts.get(playerId);
        if (current == null || draftCost > current) {
          draftCosts.set(playerId, draftCost);
        }
      }
    }

    for (const [key, nested] of Object.entries(entry)) {
      visit(nested, [...path, key]);
    }
  };

  visit(draftDetail, ["draftDetail"]);
  return draftCosts;
}

function calculateCompositeTradeValue(
  asv: number | null,
  draftCost: number | null,
): number | null {
  const weightedSignals: Array<{ value: number; weight: number }> = [];

  const safeAsv = toPositiveNumber(asv);
  if (safeAsv != null) {
    weightedSignals.push({
      value: safeAsv,
      weight: EQUIVALENT_VALUE_WEIGHTS.asv,
    });
  }

  const safeDraftCost = toPositiveNumber(draftCost);
  if (safeDraftCost != null) {
    weightedSignals.push({
      value: safeDraftCost,
      weight: EQUIVALENT_VALUE_WEIGHTS.draftCost,
    });
  }

  if (weightedSignals.length === 0) {
    return null;
  }

  const totalWeight = weightedSignals.reduce(
    (sum, signal) => sum + signal.weight,
    0,
  );

  return weightedSignals.reduce(
    (sum, signal) => sum + signal.value * (signal.weight / totalWeight),
    0,
  );
}

export function calculateEquivalentTradeValue(options: {
  giveAsv: number | null;
  receiveAsv: number | null;
  giveDraftCost: number | null;
  receiveDraftCost: number | null;
}): {
  giveCompositeValue: number | null;
  receiveCompositeValue: number | null;
  ratio: number | null;
  usesDraftCost: boolean;
} {
  const usesDraftCost =
    toPositiveNumber(options.giveDraftCost) != null &&
    toPositiveNumber(options.receiveDraftCost) != null;

  const giveCompositeValue = calculateCompositeTradeValue(
    options.giveAsv,
    usesDraftCost ? options.giveDraftCost : null,
  );
  const receiveCompositeValue = calculateCompositeTradeValue(
    options.receiveAsv,
    usesDraftCost ? options.receiveDraftCost : null,
  );

  if (giveCompositeValue == null || receiveCompositeValue == null) {
    return {
      giveCompositeValue,
      receiveCompositeValue,
      ratio: null,
      usesDraftCost,
    };
  }

  const expensiveValue = Math.max(giveCompositeValue, receiveCompositeValue);
  const cheaperValue = Math.min(giveCompositeValue, receiveCompositeValue);

  return {
    giveCompositeValue,
    receiveCompositeValue,
    ratio: expensiveValue > 0 ? cheaperValue / expensiveValue : null,
    usesDraftCost,
  };
}

export interface TradePlayer {
  playerId: number;
  playerName: string;
}

export interface ProposedTrade {
  givePlayers: TradePlayer[];
  receivePlayers: TradePlayer[];
}

export interface CategoryImpact {
  categoryId: string;
  categoryName: string;
  currentValue: number;
  projectedValue: number;
  currentRank: number;
  projectedRank: number;
  deltaRank: number;
  deltaPoints: number;
}

export interface TradeImpactAnalysis {
  trade: ProposedTrade;
  currentOverallPoints: number;
  projectedOverallPoints: number;
  deltaOverallPoints: number;
  categoryImpacts: CategoryImpact[];
  fairnessScore: number; // -1 (bad for you) to 1 (great for you)
  recommendation: "accept" | "decline" | "consider";
  explanation: string;
  rosterGaps?: RosterGap[]; // Gaps detected in post-trade roster via allocateProjections
  /** Delta roto points for the trade partner (Phase 108 — bilateral delta). */
  partnerDeltaOverallPoints?: number;
  /** Per-category roto delta for the trade partner (Phase 108). */
  partnerCategoryImpacts?: CategoryImpact[];
}

export interface PositionalContext {
  positionGained: string[]; // Primary positions of received player(s)
  positionLost: string[]; // Primary positions of given player(s)
  fillsNeed: boolean; // True if received player fills a thin position
  needPositions: string[]; // Positions where team has below-average depth
  positionalBonus: number; // Bonus points added to scoring (0 to ~3)
}

export interface TradeCandidate {
  trade: ProposedTrade;
  partnerTeamId: number;
  partnerTeamName: string;
  deltaOverallPoints: number;
  categoryImpacts: CategoryImpact[];
  fairnessScore: number;
  likelihood: "high" | "medium" | "low";
  explanation: string;
  positionalContext?: PositionalContext;
  givePlayerAsv?: number | null;
  receivePlayerAsv?: number | null;
  givePlayerDraftCost?: number | null;
  receivePlayerDraftCost?: number | null;
  equivalentValueRatio?: number | null;
  /** Delta roto points for the trade partner (Phase 108 — bilateral delta). */
  partnerDeltaOverallPoints?: number;
}

export class TradeRecommendationAgent {
  private readonly repo: SnapshotRepository;
  private readonly simulator = new RosterSimulator();

  constructor(
    private db: Kysely<Database>,
    private logger?: BaseLogger,
  ) {
    this.repo = new SnapshotRepository(db);
  }

  /**
   * Validate trade size (1-3 players per side)
   */
  static validateTradeSize(trade: ProposedTrade): {
    valid: boolean;
    error?: string;
  } {
    if (!trade.givePlayers || trade.givePlayers.length < 1) {
      return { valid: false, error: "Must give at least 1 player" };
    }
    if (!trade.receivePlayers || trade.receivePlayers.length < 1) {
      return { valid: false, error: "Must receive at least 1 player" };
    }
    if (trade.givePlayers.length > 3) {
      return {
        valid: false,
        error: "Cannot give more than 3 players in a single trade",
      };
    }
    if (trade.receivePlayers.length > 3) {
      return {
        valid: false,
        error: "Cannot receive more than 3 players in a single trade",
      };
    }
    return { valid: true };
  }

  /**
   * Validate that post-trade roster can fill all required position slots
   */
  async validateRosterSlots(
    leagueId: number,
    teamId: number,
    snapshotDate: string,
    trade: ProposedTrade,
  ): Promise<RosterValidationResult> {
    this.logger?.info(
      { leagueId, teamId, snapshotDate, trade },
      "Validating roster slots for trade",
    );

    // Get current roster
    const currentRoster = await this.getTeamRoster(
      leagueId,
      teamId,
      snapshotDate,
    );

    if (currentRoster.length === 0) {
      return {
        isLegal: false,
        issues: ["No roster data found for team"],
      };
    }

    // Get league settings to fetch roster slots
    const settingsVersion = await this.repo.getLeagueSettings(
      leagueId,
      snapshotDate,
    );

    if (!settingsVersion) {
      return {
        isLegal: false,
        issues: ["League settings not found"],
      };
    }

    const rosterSlots = settingsVersion.settings_json.roster_slots || {};

    // Build post-trade roster: remove givePlayers, add receivePlayers
    const givePlayerIds = trade.givePlayers.map((p) => p.playerId);
    const receivePlayerIds = trade.receivePlayers.map((p) => p.playerId);

    // Fetch positions for received players
    const receivedPlayers =
      receivePlayerIds.length > 0
        ? await this.db
            .selectFrom("player")
            .select(["id as player_id", "positions"])
            .where("id", "in", receivePlayerIds)
            .execute()
        : [];

    // Build post-trade roster
    const postTradeRoster = [
      ...currentRoster
        .filter((p) => !givePlayerIds.includes(p.player_id))
        .map((p) => ({ playerId: p.player_id, positions: p.positions })),
      ...receivedPlayers.map((p) => ({
        playerId: p.player_id,
        positions: p.positions,
      })),
    ];

    // Run greedy slot assignment using canonical slot ordering from slot-eligibility
    const issues: string[] = [];
    const assigned = new Set<number>();

    const slotOrder = orderSlotsByConstraint(Object.keys(rosterSlots));

    for (const slotType of slotOrder) {
      const count = rosterSlots[slotType] || 0;
      if (count === 0) continue;

      let filled = 0;

      for (const player of postTradeRoster) {
        if (assigned.has(player.playerId)) continue;

        const eligible = canFillSlot(player.positions, slotType);
        if (eligible && filled < count) {
          assigned.add(player.playerId);
          filled++;
        }
      }

      if (filled < count) {
        issues.push(
          `Cannot fill all ${slotType} slots (need ${count}, filled ${filled})`,
        );
      }
    }

    // Check for unassigned players (excluding IL)
    const unassignedCount = postTradeRoster.filter(
      (p) => !assigned.has(p.playerId),
    ).length;
    if (unassignedCount > 0) {
      issues.push(
        `${unassignedCount} players cannot be assigned to roster slots`,
      );
    }

    return {
      isLegal: issues.length === 0,
      issues,
    };
  }

  /**
   * Analyze the impact of a proposed trade for a specific team
   */
  async analyzeTradeImpact(
    leagueId: number,
    teamId: number,
    snapshotDate: string,
    trade: ProposedTrade,
  ): Promise<TradeImpactAnalysis> {
    this.logger?.info(
      { leagueId, teamId, snapshotDate, trade },
      "Analyzing trade impact",
    );

    // Verify snapshot exists
    const snapshot = await this.db
      .selectFrom("league_daily_snapshot")
      .selectAll()
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .executeTakeFirst();

    if (!snapshot) {
      throw new Error(
        `No snapshot found for league ${leagueId} on ${snapshotDate}. Please trigger a snapshot first.`,
      );
    }

    // Get current standings, roster, and player projections
    const currentStandings = await this.getCurrentStandings(
      leagueId,
      teamId,
      snapshotDate,
    );
    const roster = await this.getTeamRoster(leagueId, teamId, snapshotDate);

    if (roster.length === 0) {
      throw new Error(
        `No roster data found for team ${teamId}. Please ensure a snapshot has been run for this league.`,
      );
    }

    const allPlayerIds = [
      ...trade.givePlayers.map((p) => p.playerId),
      ...trade.receivePlayers.map((p) => p.playerId),
    ];
    const projections = await this.getPlayerProjections(
      allPlayerIds,
      snapshotDate,
      snapshot.projections_run_id ?? undefined,
    );

    // Fetch league settings and all team category projections for simulation
    const settingsVersion = await this.db
      .selectFrom("league_daily_snapshot")
      .innerJoin(
        "league_settings_version",
        "league_daily_snapshot.settings_version_id",
        "league_settings_version.id",
      )
      .select(["league_settings_version.settings_json"])
      .where("league_daily_snapshot.league_id", "=", leagueId)
      .where("league_daily_snapshot.snapshot_date", "=", snapshotDate)
      .executeTakeFirstOrThrow();

    const categories = settingsVersion.settings_json.categories || [];

    const allTeamProjections = await this.db
      .selectFrom("team_daily_projected_category")
      .selectAll()
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .execute();

    // Build teamCategoryMap: teamId → categoryId → { value, components }
    const teamCategoryMap = new Map<
      number,
      Map<string, { value: number; components?: any }>
    >();
    for (const proj of allTeamProjections) {
      if (!teamCategoryMap.has(proj.team_id)) {
        teamCategoryMap.set(proj.team_id, new Map());
      }
      teamCategoryMap.get(proj.team_id)!.set(proj.category_id, {
        value: Number(proj.projected_value),
        components: proj.projected_components_json,
      });
    }

    // Run trade simulation via RosterSimulator
    const tradeCtx: TradeSimContext = {
      categories,
      teamCategoryMap,
      teamId,
      currentCategoryImpacts: currentStandings.categoryImpacts,
    };
    const projectedStandings = this.simulator.simulateTrade(
      tradeCtx,
      trade,
      projections,
    );

    // Build post-trade roster for gap detection
    const rosterSlots =
      (settingsVersion.settings_json as any).roster_slots || {};
    const givePlayerIds = new Set(trade.givePlayers.map((p) => p.playerId));
    const postTradeRoster: Array<{
      player_id: number;
      positions: string[];
      roster_status: string;
    }> = roster.filter((p) => !givePlayerIds.has(p.player_id));

    if (trade.receivePlayers.length > 0) {
      const receiveIds = trade.receivePlayers.map((p) => p.playerId);
      const receivedPlayers = await this.db
        .selectFrom("player")
        .select(["id", "positions"])
        .where("id", "in", receiveIds)
        .execute();
      for (const rp of receivedPlayers) {
        postTradeRoster.push({
          player_id: rp.id,
          positions: rp.positions as string[],
          roster_status: "active",
        });
      }
    }

    // Fetch projections for post-trade players
    const postTradePlayerIds = postTradeRoster.map((p) => p.player_id);
    const projectionsByPlayerId = new Map<number, StatComponents>();
    if (snapshot.projections_run_id && postTradePlayerIds.length > 0) {
      const projs = await this.db
        .selectFrom("player_projection")
        .select(["player_id", "stat_components_json"])
        .where("projections_run_id", "=", snapshot.projections_run_id)
        .where("player_id", "in", postTradePlayerIds)
        .execute();
      for (const p of projs) {
        projectionsByPlayerId.set(
          p.player_id,
          p.stat_components_json as StatComponents,
        );
      }
    }

    // Get GS data and projection date
    const { gsUsed, gsCap } = await this.getGsData(leagueId, teamId);
    let projectionAsOfDate = snapshotDate;
    if (snapshot.projections_run_id) {
      const run = await this.db
        .selectFrom("projections_run")
        .select("as_of_date")
        .where("id", "=", snapshot.projections_run_id)
        .executeTakeFirst();
      if (run) projectionAsOfDate = run.as_of_date;
    }

    // Build allocation input and detect roster gaps
    const rosterPlayers: RosteredPlayer[] = postTradeRoster.map((r) => ({
      playerId: r.player_id,
      positions: (r.positions as string[]) || [],
      rosterStatus: (r.roster_status as "active" | "bench" | "il") || "active",
      rosterSlot: null,
      projectedComponents: null,
    }));

    const rosterGaps = this.simulator.detectGaps({
      roster: rosterPlayers,
      rosterSlots,
      projectionsByPlayerId,
      gsUsed,
      gsCap,
      projectionAsOfDate,
      snapshotDate,
    });

    // Calculate fairness score and recommendation
    const fairnessScore = this.calculateFairnessScore(
      currentStandings.overallPoints,
      projectedStandings.overallPoints,
    );

    const deltaPoints =
      projectedStandings.overallPoints - currentStandings.overallPoints;
    let recommendation: "accept" | "decline" | "consider";
    if (deltaPoints > 2) {
      recommendation = "accept";
    } else if (deltaPoints < -1) {
      recommendation = "decline";
    } else {
      recommendation = "consider";
    }

    const explanation = this.simulator.generateTradeExplanation(
      trade,
      deltaPoints,
      projectedStandings.categoryImpacts,
    );

    return {
      trade,
      currentOverallPoints: currentStandings.overallPoints,
      projectedOverallPoints: projectedStandings.overallPoints,
      deltaOverallPoints: deltaPoints,
      categoryImpacts: projectedStandings.categoryImpacts,
      fairnessScore,
      recommendation,
      explanation,
      rosterGaps,
    };
  }

  /**
   * Generate trade candidates for a team
   */
  async generateTradeCandidates(
    leagueId: number,
    teamId: number,
    snapshotDate: string,
    maxCandidates: number = 10,
  ): Promise<TradeCandidate[]> {
    const startTime = Date.now();
    this.logger?.info(
      { leagueId, teamId, snapshotDate, maxCandidates },
      "Generating trade candidates",
    );

    const snapshot = await this.db
      .selectFrom("league_daily_snapshot")
      .selectAll()
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .executeTakeFirst();

    if (!snapshot) {
      throw new Error(
        `No snapshot found for league ${leagueId} on ${snapshotDate}. Please trigger a snapshot first.`,
      );
    }

    // Fail fast with a clear error if projected standings haven't been computed yet.
    // Without them every analyzeTradeImpact call throws and candidates are silently skipped,
    // leaving the user with an unexplained blank list.
    const projectedStandingsExist = await this.db
      .selectFrom("team_daily_projected_overall")
      .select("team_id")
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .executeTakeFirst();

    if (!projectedStandingsExist) {
      throw new Error(
        `No projected standings found for league ${leagueId} on ${snapshotDate}. ` +
          `Please ensure projections have been uploaded and a snapshot has been run.`,
      );
    }

    const allTeams = await this.db
      .selectFrom("team")
      .selectAll()
      .where("league_id", "=", leagueId)
      .where("id", "!=", teamId)
      .execute();

    if (allTeams.length === 0) {
      this.logger?.warn({ leagueId }, "No other teams found in league");
      return [];
    }

    const allRosters = (
      await this.repo.getRosterForSnapshot(leagueId, snapshotDate)
    ).filter(
      (r) => r.roster_status === "active" || r.roster_status === "bench",
    );

    const rostersByTeam = new Map<number, typeof allRosters>();
    for (const player of allRosters) {
      if (!rostersByTeam.has(player.team_id)) {
        rostersByTeam.set(player.team_id, []);
      }
      rostersByTeam.get(player.team_id)!.push(player);
    }

    const userRoster = rostersByTeam.get(teamId) || [];
    if (userRoster.length === 0) {
      throw new Error(
        `No roster data found for team ${teamId}. Please ensure a snapshot has been run for this league.`,
      );
    }

    const settingsVersion = await this.repo.getLeagueSettings(
      leagueId,
      snapshotDate,
    );

    const rosterSlots =
      settingsVersion && settingsVersion.settings_json.roster_slots
        ? settingsVersion.settings_json.roster_slots
        : {};

    const userRosterForDepth = userRoster.map((p) => ({
      player_id: p.player_id,
      positions: p.positions,
    }));
    const depthMap = this.simulator.analyzeRosterDepth(
      userRosterForDepth,
      rosterSlots,
    );
    const draftCostsByPlayerId = await this.getLatestLeagueDraftCosts(leagueId);

    const allPlayerIds = allRosters.map((p) => p.player_id);
    const projectionsMap = new Map<number, Record<string, number>>();

    if (snapshot.projections_run_id && allPlayerIds.length > 0) {
      const projections = await this.db
        .selectFrom("player_projection")
        .select(["player_id", "stat_components_json"])
        .where("projections_run_id", "=", snapshot.projections_run_id)
        .where("player_id", "in", allPlayerIds)
        .execute();

      for (const proj of projections) {
        projectionsMap.set(
          proj.player_id,
          proj.stat_components_json as Record<string, number>,
        );
      }
    }

    const getPlayerValue = (playerId: number): number => {
      const proj = projectionsMap.get(playerId);
      if (!proj) return 0;

      const batterValue =
        (proj.HR || 0) + (proj.RBI || 0) + (proj.R || 0) + (proj.SB || 0);
      const pitcherValue =
        (proj.W || 0) + (proj.K || 0) / 10 + (proj.SV || 0) * 2;

      return Math.max(batterValue, pitcherValue);
    };

    const candidates: TradeCandidate[] = [];
    let simulationsRun = 0;
    const maxSimulations = 500;

    for (const partnerTeam of allTeams) {
      const partnerRoster = rostersByTeam.get(partnerTeam.id) || [];

      if (partnerRoster.length === 0) {
        this.logger?.warn(
          { partnerTeamId: partnerTeam.id },
          "Partner team has no roster data, skipping",
        );
        continue;
      }

      const tradePairs: Array<{
        give: (typeof userRoster)[0];
        receive: (typeof partnerRoster)[0];
        valueDelta: number;
        positionalBonus: number;
        positionalContext: PositionalContext;
        equivalentValueRatio: number | null;
        giveCompositeValue: number | null;
        receiveCompositeValue: number | null;
        giveDraftCost: number | null;
        receiveDraftCost: number | null;
        usesDraftCost: boolean;
      }> = [];

      for (const givePlayer of userRoster) {
        const giveAsv =
          givePlayer.espn_asv != null ? Number(givePlayer.espn_asv) : null;
        const giveDraftCost =
          draftCostsByPlayerId.get(givePlayer.player_id) ?? null;
        const giveValue = getPlayerValue(givePlayer.player_id);

        for (const receivePlayer of partnerRoster) {
          const receiveAsv =
            receivePlayer.espn_asv != null
              ? Number(receivePlayer.espn_asv)
              : null;
          const receiveDraftCost =
            draftCostsByPlayerId.get(receivePlayer.player_id) ?? null;

          if (giveAsv != null && giveAsv < 1) continue;
          if (receiveAsv != null && receiveAsv < 1) continue;

          const equivalentValue = calculateEquivalentTradeValue({
            giveAsv,
            receiveAsv,
            giveDraftCost,
            receiveDraftCost,
          });

          if (
            equivalentValue.ratio != null &&
            equivalentValue.ratio < MIN_EQUIVALENT_VALUE_RATIO
          ) {
            continue;
          }

          const receiveValue = getPlayerValue(receivePlayer.player_id);
          const valueDelta = receiveValue - giveValue;
          const positionalContext = this.simulator.computePositionalBonus(
            [givePlayer.positions],
            [receivePlayer.positions],
            depthMap,
          );

          tradePairs.push({
            give: givePlayer,
            receive: receivePlayer,
            valueDelta,
            positionalBonus: positionalContext.positionalBonus,
            positionalContext,
            equivalentValueRatio: equivalentValue.ratio,
            giveCompositeValue: equivalentValue.giveCompositeValue,
            receiveCompositeValue: equivalentValue.receiveCompositeValue,
            giveDraftCost,
            receiveDraftCost,
            usesDraftCost: equivalentValue.usesDraftCost,
          });
        }
      }

      tradePairs.sort(
        (a, b) =>
          (b.equivalentValueRatio ?? 0) - (a.equivalentValueRatio ?? 0) ||
          b.valueDelta + b.positionalBonus - (a.valueDelta + a.positionalBonus),
      );
      const topPairsForTeam = tradePairs.slice(0, 20);

      for (const {
        give: givePlayer,
        receive: receivePlayer,
        positionalContext,
        equivalentValueRatio,
        giveCompositeValue,
        receiveCompositeValue,
        giveDraftCost,
        receiveDraftCost,
        usesDraftCost,
      } of topPairsForTeam) {
        if (simulationsRun >= maxSimulations) {
          this.logger?.info(
            { simulationsRun },
            "Reached max simulations limit, stopping candidate generation",
          );
          break;
        }

        const trade: ProposedTrade = {
          givePlayers: [
            {
              playerId: givePlayer.player_id,
              playerName: givePlayer.player_name,
            },
          ],
          receivePlayers: [
            {
              playerId: receivePlayer.player_id,
              playerName: receivePlayer.player_name,
            },
          ],
        };

        try {
          simulationsRun++;

          const impact = await this.analyzeTradeImpact(
            leagueId,
            teamId,
            snapshotDate,
            trade,
          );

          if (impact.deltaOverallPoints > 0.5) {
            const giveAsvVal =
              givePlayer.espn_asv != null ? Number(givePlayer.espn_asv) : null;
            const receiveAsvVal =
              receivePlayer.espn_asv != null
                ? Number(receivePlayer.espn_asv)
                : null;
            const equivalentValueNote = this.generateEquivalentValueNote({
              giveAsv: giveAsvVal,
              receiveAsv: receiveAsvVal,
              giveDraftCost,
              receiveDraftCost,
              giveCompositeValue,
              receiveCompositeValue,
              equivalentValueRatio,
              usesDraftCost,
            });

            candidates.push({
              trade,
              partnerTeamId: partnerTeam.id,
              partnerTeamName: partnerTeam.name,
              deltaOverallPoints: impact.deltaOverallPoints,
              categoryImpacts: impact.categoryImpacts,
              fairnessScore: impact.fairnessScore,
              likelihood: this.simulator.assessTradeLikelihood(
                impact.fairnessScore,
                giveCompositeValue ?? undefined,
                receiveCompositeValue ?? undefined,
              ),
              explanation:
                this.simulator.generateTradeExplanation(
                  trade,
                  impact.deltaOverallPoints,
                  impact.categoryImpacts,
                  positionalContext,
                ) + equivalentValueNote,
              positionalContext,
              givePlayerAsv: giveAsvVal,
              receivePlayerAsv: receiveAsvVal,
              givePlayerDraftCost: giveDraftCost,
              receivePlayerDraftCost: receiveDraftCost,
              equivalentValueRatio,
            });

            if (candidates.length >= maxCandidates * 3) {
              this.logger?.info(
                { candidatesFound: candidates.length },
                "Found sufficient candidates, stopping early",
              );
              break;
            }
          }
        } catch (error) {
          this.logger?.warn(
            { trade, error },
            "Failed to analyze trade candidate, skipping",
          );
        }
      }

      if (simulationsRun >= maxSimulations) {
        break;
      }
    }

    const elapsed = Date.now() - startTime;
    this.logger?.info(
      {
        simulationsRun,
        candidatesFound: candidates.length,
        elapsedMs: elapsed,
      },
      "Trade candidate generation complete",
    );

    candidates.sort(
      (a, b) =>
        (b.equivalentValueRatio ?? 0) - (a.equivalentValueRatio ?? 0) ||
        b.deltaOverallPoints - a.deltaOverallPoints,
    );

    const MAX_PER_GIVE_PLAYER = 2;
    const givePlayerCounts = new Map<number, number>();
    const diversified: TradeCandidate[] = [];

    for (const c of candidates) {
      const giveId = c.trade.givePlayers[0]?.playerId;
      if (giveId == null) continue;
      const count = givePlayerCounts.get(giveId) || 0;
      if (count >= MAX_PER_GIVE_PLAYER) continue;
      givePlayerCounts.set(giveId, count + 1);
      diversified.push(c);
      if (diversified.length >= maxCandidates) break;
    }

    return diversified;
  }

  private async getCurrentStandings(
    leagueId: number,
    teamId: number,
    snapshotDate: string,
  ): Promise<{ overallPoints: number; categoryImpacts: CategoryImpact[] }> {
    // Get PROJECTED overall points (not current actual points)
    const overall = await this.db
      .selectFrom("team_daily_projected_overall")
      .select(["projected_overall_points"])
      .where("league_id", "=", leagueId)
      .where("team_id", "=", teamId)
      .where("snapshot_date", "=", snapshotDate)
      .executeTakeFirst();

    // Get PROJECTED category data (final season projections)
    const projectedCategories = await this.db
      .selectFrom("team_daily_projected_category")
      .select([
        "category_id",
        "projected_value",
        "projected_rank",
        "projected_roto_points",
      ])
      .where("league_id", "=", leagueId)
      .where("team_id", "=", teamId)
      .where("snapshot_date", "=", snapshotDate)
      .execute();

    if (!overall || projectedCategories.length === 0) {
      throw new Error(
        `No projected standings found for team ${teamId} on ${snapshotDate}. ` +
          `Please ensure projections have been uploaded and a snapshot has been run.`,
      );
    }

    // Get category metadata
    const settingsVersion = await this.db
      .selectFrom("league_daily_snapshot")
      .innerJoin(
        "league_settings_version",
        "league_daily_snapshot.settings_version_id",
        "league_settings_version.id",
      )
      .select(["league_settings_version.settings_json"])
      .where("league_daily_snapshot.league_id", "=", leagueId)
      .where("league_daily_snapshot.snapshot_date", "=", snapshotDate)
      .executeTakeFirstOrThrow();

    const categories = settingsVersion.settings_json.categories || [];

    const categoryImpacts: CategoryImpact[] = projectedCategories.map(
      (proj) => {
        const category = categories.find(
          (c: any) => c.category_id === proj.category_id,
        );
        return {
          categoryId: proj.category_id,
          categoryName: category?.name || proj.category_id,
          currentValue: Number(proj.projected_value),
          projectedValue: Number(proj.projected_value),
          currentRank: proj.projected_rank,
          projectedRank: proj.projected_rank,
          deltaRank: 0,
          deltaPoints: 0,
        };
      },
    );

    return {
      overallPoints: Number(overall?.projected_overall_points || 0),
      categoryImpacts,
    };
  }

  private async getTeamRoster(
    leagueId: number,
    teamId: number,
    snapshotDate: string,
  ) {
    const rows = await this.repo.getRosterForSnapshot(
      leagueId,
      snapshotDate,
      teamId,
    );
    return rows.filter(
      (r) => r.roster_status === "active" || r.roster_status === "bench",
    );
  }

  private async getPlayerProjections(
    playerIds: number[],
    asOfDate: string,
    projectionsRunId?: number,
  ): Promise<Map<number, any>> {
    /**
     * Fetch rest-of-season projections for players.
     *
     * When projectionsRunId is provided (from league_daily_snapshot.projections_run_id),
     * we filter to that specific run — the same run used to compute
     * team_daily_projected_category. This guarantees give/receive player deltas
     * are consistent with the team-level projections they're applied against.
     *
     * Falls back to the most-recent run <= asOfDate when no run ID is available
     * (e.g., legacy snapshots without a linked projections run).
     */
    if (playerIds.length === 0) {
      return new Map();
    }

    const filteredIds = playerIds.filter((id) => id != null);

    let projections: any[];
    if (projectionsRunId != null) {
      // Primary path: use the exact same run linked to the snapshot
      projections = (await this.repo.getPlayerProjections(
        projectionsRunId,
        filteredIds,
      )) as any[];
    } else {
      // Fallback path: most recent run <= asOfDate (legacy snapshots)
      const allRows = await this.db
        .selectFrom("player_projection as proj")
        .innerJoin(
          "projections_run as run",
          "run.id",
          "proj.projections_run_id",
        )
        .innerJoin("player", "player.id", "proj.player_id")
        .selectAll("proj")
        .where("run.as_of_date", "<=", asOfDate)
        .where("proj.player_id", "in", filteredIds)
        .orderBy("run.as_of_date", "desc")
        .execute();
      projections = allRows;
    }

    const projMap = new Map();
    for (const proj of projections) {
      if (!projMap.has(proj.player_id)) {
        projMap.set(proj.player_id, proj);
      }
    }

    return projMap;
  }

  private calculateFairnessScore(
    currentPoints: number,
    projectedPoints: number,
  ): number {
    const delta = projectedPoints - currentPoints;
    // Normalize to -1 to 1 range
    // A gain of 5+ points is considered a 1.0 fairness score
    return Math.max(-1, Math.min(1, delta / 5));
  }

  private async getLatestLeagueDraftCosts(
    leagueId: number,
  ): Promise<Map<number, number>> {
    const latestPayload = await this.db
      .selectFrom("league_raw_payload")
      .select("response_json")
      .where("league_id", "=", leagueId)
      .orderBy("fetched_at", "desc")
      .executeTakeFirst();

    const responseJson = latestPayload?.response_json;
    if (!responseJson || typeof responseJson !== "object") {
      return new Map();
    }

    const draftDetail = (responseJson as Record<string, unknown>).draftDetail;
    const draftCosts = extractDraftCostsFromDraftDetail(draftDetail);

    this.logger?.debug(
      { leagueId, draftCostCount: draftCosts.size },
      "Resolved draft costs from latest ESPN raw payload",
    );

    return draftCosts;
  }

  private generateEquivalentValueNote(options: {
    giveAsv: number | null;
    receiveAsv: number | null;
    giveDraftCost: number | null;
    receiveDraftCost: number | null;
    giveCompositeValue: number | null;
    receiveCompositeValue: number | null;
    equivalentValueRatio: number | null;
    usesDraftCost: boolean;
  }): string {
    if (
      options.giveCompositeValue == null ||
      options.receiveCompositeValue == null
    ) {
      return "";
    }

    const signalLabel = options.usesDraftCost
      ? "80/20 ESPN ASV + league draft cost"
      : "ESPN ASV";
    let note =
      ` Equivalent value match ${((options.equivalentValueRatio ?? 0) * 100).toFixed(0)}% using ${signalLabel}` +
      ` (${options.giveCompositeValue.toFixed(1)} vs ${options.receiveCompositeValue.toFixed(1)}).`;

    if (options.usesDraftCost) {
      note += ` Draft cost ${Math.round(options.giveDraftCost ?? 0)} vs ${Math.round(options.receiveDraftCost ?? 0)}.`;
    } else if (options.giveAsv != null && options.receiveAsv != null) {
      note += ` ASV ${Math.round(options.giveAsv)} vs ${Math.round(options.receiveAsv)}.`;
    }

    return note;
  }

  /**
   * Get GS used and GS cap for a team (used for allocateProjections)
   */
  private async getGsData(
    leagueId: number,
    teamId: number,
  ): Promise<{ gsUsed: number; gsCap: number }> {
    const DEFAULT_GS_CAP = 200;

    // Get GS cap from league settings
    const settings = await this.db
      .selectFrom("league_settings_version")
      .select("settings_json")
      .where("league_id", "=", leagueId)
      .orderBy("effective_date", "desc")
      .executeTakeFirst();

    let gsCap = DEFAULT_GS_CAP;
    if (settings?.settings_json) {
      const json = settings.settings_json as unknown as Record<string, unknown>;
      const rosterSlots = json.roster_slots as
        | Record<string, number>
        | undefined;
      if (rosterSlots?.GS_LIMIT !== undefined) {
        gsCap = rosterSlots.GS_LIMIT;
      }
    }

    // Get GS used from ESPN raw payload
    const team = await this.db
      .selectFrom("team")
      .select(["espn_team_id"])
      .where("id", "=", teamId)
      .executeTakeFirst();

    if (team) {
      const latestPayload = await this.db
        .selectFrom("league_raw_payload")
        .select(["response_json"])
        .where("league_id", "=", leagueId)
        .orderBy("fetched_at", "desc")
        .executeTakeFirst();

      if (latestPayload) {
        const raw = latestPayload.response_json as any;
        const espnTeam = raw?.teams?.find(
          (t: any) => t.id === team.espn_team_id,
        );
        const gsFromEspn = espnTeam?.valuesByStat?.[33];
        if (typeof gsFromEspn === "number" && gsFromEspn >= 0) {
          return { gsUsed: gsFromEspn, gsCap };
        }
      }
    }

    return { gsUsed: 0, gsCap };
  }
}
