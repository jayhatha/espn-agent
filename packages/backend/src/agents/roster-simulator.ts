import {
  type Category,
  type StatComponents,
} from "../../../shared/dist/index.js";
import { allocateProjections } from "../projection/allocator.js";
import { canFillSlot } from "../projection/slot-eligibility.js";
import type {
  AllocationInput,
  RosteredPlayer,
  RosterGap,
} from "../projection/types.js";
import { assignRanksWithTies } from "../utils/roto-ranking.js";
import { computeCategoryProjections } from "./standings-projection.js";
import type {
  CategoryImpact,
  ProposedTrade,
  PositionalContext,
} from "./trade-recommendation.js";

// ─── Context types ────────────────────────────────────────────────────────────

export interface TradeSimContext {
  categories: Category[];
  /** Map from teamId → categoryId → stored baseline projection. */
  teamCategoryMap: Map<
    number,
    Map<
      string,
      {
        value: number;
        components?: StatComponents;
        rank?: number;
        rotoPoints?: number;
      }
    >
  >;
  teamId: number;
  /** Current projected category impacts — retained for API compatibility. */
  currentCategoryImpacts: CategoryImpact[];
  allocationInput: AllocationInput;
  currentTotals: CurrentCategoryTotal[];
  incomingPlayersById: Map<number, RosteredPlayer>;
}

export interface AddDropSimContext {
  categories: Category[];
  /** Team's per-category projected data rows */
  currentProjections: any[];
  /** All teams' per-category projected data rows */
  allTeamsProjections: any[];
  numTeams: number;
  teamId: number;
  allocationInput: AllocationInput;
  currentTotals: CurrentCategoryTotal[];
  playersById: Map<number, RosteredPlayer>;
}

interface CurrentCategoryTotal {
  category_id: string;
  value: unknown;
  components_json: unknown;
}

export type GapDetectionInput = AllocationInput;

// ─── Result types ─────────────────────────────────────────────────────────────

export interface TradeSimResult {
  overallPoints: number;
  categoryImpacts: CategoryImpact[];
}

export interface AddDropSimResult {
  deltaOverallPoints: number;
  categoryImpacts: Array<{
    categoryId: string;
    categoryName: string;
    deltaRank: number;
    deltaPoints: number;
  }>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const POSITION_SCARCITY: Record<string, number> = {
  C: 1.5,
  SS: 1.2,
  "2B": 1.1,
  "3B": 1.0,
  "1B": 0.9,
  OF: 0.8,
  SP: 1.0,
  RP: 1.3,
  P: 1.0,
  UTIL: 0.5,
};

// ─── RosterSimulator ─────────────────────────────────────────────────────────

/**
 * Pure simulation math: no DB access, no ESPN adapter.
 * Shared by TradeRecommendationAgent and WaiverRecommendationAgent.
 */
export class RosterSimulator {
  /**
   * Simulate a trade using pre-fetched team category data.
   * Replicates the math from TradeRecommendationAgent.simulateTradeImpact.
   */
  simulateTrade(
    ctx: TradeSimContext,
    trade: ProposedTrade,
    _projections: Map<number, any>,
  ): TradeSimResult {
    const { categories, teamCategoryMap, teamId } = ctx;
    const giveIds = new Set(trade.givePlayers.map((p) => p.playerId));
    const rosterIds = new Set(
      ctx.allocationInput.roster.map((player) => player.playerId),
    );
    const mutationPlayerIds = new Set([
      ...trade.givePlayers
        .map((player) => player.playerId)
        .filter((playerId) => rosterIds.has(playerId)),
      ...trade.receivePlayers.map((player) => player.playerId),
    ]);
    const missingProjectionIds = [...mutationPlayerIds].filter(
      (playerId) =>
        ctx.allocationInput.projectionsByPlayerId.get(playerId) == null,
    );
    if (missingProjectionIds.length > 0) {
      throw new Error(
        `Trade simulation degraded: missing projection for player(s) ${missingProjectionIds.join(", ")}`,
      );
    }

    const mutatedRoster = ctx.allocationInput.roster.filter(
      (player) => !giveIds.has(player.playerId),
    );
    for (const player of trade.receivePlayers) {
      const incoming = ctx.incomingPlayersById.get(player.playerId);
      if (!incoming) {
        throw new Error(
          `Trade simulation degraded: missing roster metadata for incoming player ${player.playerId}`,
        );
      }
      mutatedRoster.push({ ...incoming });
    }

    const allocation = allocateProjections({
      ...ctx.allocationInput,
      roster: mutatedRoster,
    });
    const mutatedCategories = computeCategoryProjections(
      allocation,
      ctx.currentTotals,
      categories,
    );

    // Re-rank all teams in each category and build CategoryImpact[]
    const newCategoryImpacts: CategoryImpact[] = [];
    let projectedOverallPoints = 0;

    for (const category of categories) {
      const catId = category.category_id;

      const teamValues: Array<{ teamId: number; value: number }> = [];
      for (const [tId, catMap] of teamCategoryMap.entries()) {
        teamValues.push({
          teamId: tId,
          value:
            tId === teamId
              ? (mutatedCategories.get(catId)?.value ?? 0)
              : (catMap.get(catId)?.value ?? 0),
        });
      }

      const lowerBetter = this.isLowerBetter(category);
      teamValues.sort((a, b) =>
        lowerBetter ? a.value - b.value : b.value - a.value,
      );

      const numTeams = teamValues.length;
      const ranked = assignRanksWithTies(teamValues, numTeams);
      const projected = ranked.find((row) => row.teamId === teamId);
      const baseline = teamCategoryMap.get(teamId)?.get(catId);
      const currentRank = baseline?.rank ?? numTeams;
      const projectedRank = projected?.rank ?? numTeams;
      const currentPoints = baseline?.rotoPoints ?? 0;
      const projectedPoints = projected?.rotoPoints ?? 0;

      newCategoryImpacts.push({
        categoryId: catId,
        categoryName: category.name,
        currentValue: baseline?.value ?? 0,
        projectedValue: mutatedCategories.get(catId)?.value ?? 0,
        currentRank,
        projectedRank,
        deltaRank: projectedRank - currentRank,
        deltaPoints: projectedPoints - currentPoints,
      });

      projectedOverallPoints += projectedPoints;
    }

    return {
      overallPoints: projectedOverallPoints,
      categoryImpacts: newCategoryImpacts,
    };
  }

  /**
   * Simulate an add/drop swap using pre-fetched data.
   * Replicates the math from WaiverRecommendationAgent.simulateSwapFromCache.
   */
  simulateAddDrop(
    ctx: AddDropSimContext,
    addPlayerId: number,
    dropPlayerId: number,
    projectionMap: Map<number, any>,
  ): AddDropSimResult | null {
    const {
      categories,
      currentProjections,
      allTeamsProjections,
      numTeams,
      teamId,
    } = ctx;

    const addProjection = projectionMap.get(addPlayerId);
    const addedPlayer = ctx.playersById.get(addPlayerId);
    if (!addProjection || !addedPlayer) return null;

    const mutatedRoster = ctx.allocationInput.roster
      .filter((player) => player.playerId !== dropPlayerId)
      .concat({ ...addedPlayer });
    const projectionsByPlayerId = new Map(
      ctx.allocationInput.projectionsByPlayerId,
    );
    projectionsByPlayerId.delete(dropPlayerId);
    projectionsByPlayerId.set(
      addPlayerId,
      addProjection.stat_components_json as StatComponents,
    );
    const allocation = allocateProjections({
      ...ctx.allocationInput,
      roster: mutatedRoster,
      projectionsByPlayerId,
    });
    const mutatedCategories = computeCategoryProjections(
      allocation,
      ctx.currentTotals,
      categories,
    );

    const categoryImpacts: AddDropSimResult["categoryImpacts"] = [];
    let totalDeltaPoints = 0;

    for (const category of categories) {
      const currentProj = currentProjections.find(
        (p) => p.category_id === category.category_id,
      );
      if (!currentProj) continue;

      const newValue = mutatedCategories.get(category.category_id)?.value;
      if (newValue === undefined) continue;

      const categoryValues = allTeamsProjections
        .filter((p) => p.category_id === category.category_id)
        .map((p) => ({
          teamId: p.team_id,
          value: p.team_id === teamId ? newValue : Number(p.projected_value),
        }));

      categoryValues.sort((a, b) =>
        category.direction === "HIGHER_BETTER"
          ? b.value - a.value
          : a.value - b.value,
      );

      const ranked = assignRanksWithTies(categoryValues, numTeams);
      const newStanding = ranked.find((row) => row.teamId === teamId);
      const oldRank = currentProj.projected_rank;
      const newRank = newStanding?.rank ?? numTeams;
      const oldPoints = Number(currentProj.projected_roto_points);
      const newPoints = newStanding?.rotoPoints ?? 0;
      const deltaPoints = newPoints - oldPoints;

      totalDeltaPoints += deltaPoints;
      categoryImpacts.push({
        categoryId: category.category_id,
        categoryName: category.name,
        deltaRank: newRank - oldRank,
        deltaPoints,
      });
    }

    return { deltaOverallPoints: totalDeltaPoints, categoryImpacts };
  }

  /**
   * Detect roster gaps from a pre-built AllocationInput.
   */
  detectGaps(input: GapDetectionInput): RosterGap[] {
    return allocateProjections(input).gaps;
  }

  /**
   * Generate explanation for a trade simulation result.
   */
  generateTradeExplanation(
    trade: ProposedTrade,
    deltaPoints: number,
    categoryImpacts: CategoryImpact[],
    positionalContext?: PositionalContext,
  ): string {
    const giveNames = trade.givePlayers.map((p) => p.playerName).join(", ");
    const receiveNames = trade.receivePlayers
      .map((p) => p.playerName)
      .join(", ");

    const significantImpacts = categoryImpacts
      .filter((impact) => Math.abs(impact.deltaPoints) >= 1)
      .sort((a, b) => Math.abs(b.deltaPoints) - Math.abs(a.deltaPoints))
      .slice(0, 3);

    let explanation = "";

    if (positionalContext?.fillsNeed) {
      const needsFilledByTrade = positionalContext.needPositions.filter((pos) =>
        positionalContext.positionGained.includes(pos),
      );
      if (needsFilledByTrade.length > 0) {
        explanation += `Fills a need at ${needsFilledByTrade.join(", ")}. `;
      }
    }

    explanation += `Trading ${giveNames} for ${receiveNames} would result in a ${deltaPoints > 0 ? "gain" : "loss"} of ${Math.abs(deltaPoints).toFixed(1)} overall roto points. `;

    if (significantImpacts.length > 0) {
      explanation += `Significant impacts: `;
      explanation += significantImpacts
        .map(
          (impact) =>
            `${impact.categoryName} (${impact.deltaPoints > 0 ? "+" : ""}${impact.deltaPoints.toFixed(1)} pts)`,
        )
        .join(", ");
      explanation += ".";
    }

    return explanation;
  }

  /**
   * Generate explanation for an add/drop simulation result.
   */
  generateAddDropExplanation(delta: AddDropSimResult): string {
    const sorted = delta.categoryImpacts
      .filter((i) => Math.abs(i.deltaPoints) > 0)
      .sort((a, b) => Math.abs(b.deltaPoints) - Math.abs(a.deltaPoints));

    if (sorted.length === 0) {
      return `Net ${delta.deltaOverallPoints.toFixed(1)} projected roto points. Minimal category changes.`;
    }

    const top = sorted[0];
    const sign = top.deltaPoints > 0 ? "+" : "";
    const plural = Math.abs(top.deltaPoints) !== 1 ? "s" : "";
    const topLabel = `This move gets you ${sign}${top.deltaPoints.toFixed(0)} roto point${plural} in ${top.categoryName}.`;

    const others = sorted.slice(1, 3);
    const othersLabel =
      others.length > 0
        ? " Also impacts: " +
          others
            .map(
              (i) =>
                `${i.categoryName} (${i.deltaPoints > 0 ? "+" : ""}${i.deltaPoints.toFixed(1)})`,
            )
            .join(", ") +
          "."
        : "";

    const netSign = delta.deltaOverallPoints > 0 ? "+" : "";
    return `${topLabel}${othersLabel} Net ${netSign}${delta.deltaOverallPoints.toFixed(1)} projected roto points overall.`;
  }

  /**
   * Generate a top-category label for an add/drop.
   */
  generateTopCategoryLabel(
    categoryImpacts: Array<{
      categoryId: string;
      categoryName: string;
      deltaRank: number;
      deltaPoints: number;
    }>,
  ): string | undefined {
    const top = categoryImpacts
      .filter((i) => Math.abs(i.deltaPoints) > 0)
      .sort((a, b) => Math.abs(b.deltaPoints) - Math.abs(a.deltaPoints))[0];

    if (!top) return undefined;

    const sign = top.deltaPoints > 0 ? "+" : "";
    const plural = Math.abs(top.deltaPoints) !== 1 ? "s" : "";
    return `This move gets you ${sign}${top.deltaPoints.toFixed(0)} roto point${plural} in ${top.categoryName}`;
  }

  /**
   * Assess trade likelihood from partner's perspective.
   */
  assessTradeLikelihood(
    fairnessScore: number,
    giveMarketValue?: number,
    receiveMarketValue?: number,
  ): "high" | "medium" | "low" {
    const youOverpayMarket =
      giveMarketValue != null &&
      receiveMarketValue != null &&
      giveMarketValue > receiveMarketValue;

    if (youOverpayMarket) {
      return fairnessScore > 0.8 ? "medium" : "high";
    }

    if (fairnessScore > 0.6 || fairnessScore < -0.3) return "low";
    if (fairnessScore > 0.3) return "medium";
    return "high";
  }

  /**
   * Analyze roster depth per position slot.
   */
  analyzeRosterDepth(
    roster: Array<{ player_id: number; positions: string[] }>,
    rosterSlots: Record<string, number>,
  ): Map<string, { count: number; slots: number; depthRatio: number }> {
    const depthMap = new Map<
      string,
      { count: number; slots: number; depthRatio: number }
    >();

    for (const [position, slots] of Object.entries(rosterSlots)) {
      if (position === "BN" || position === "IL" || position === "UTIL")
        continue;

      let count = 0;
      for (const player of roster) {
        if (canFillSlot(player.positions, position)) count++;
      }

      depthMap.set(position, {
        count,
        slots,
        depthRatio: slots > 0 ? count / slots : 0,
      });
    }

    return depthMap;
  }

  /**
   * Compute positional need bonus for trade candidates.
   */
  computePositionalBonus(
    givePositions: string[][],
    receivePositions: string[][],
    depthMap: Map<string, { count: number; slots: number; depthRatio: number }>,
  ): PositionalContext {
    const needPositions: string[] = [];
    for (const [position, depth] of depthMap.entries()) {
      if (depth.depthRatio < 1.5) needPositions.push(position);
    }

    const positionGained = receivePositions.map(
      (positions) => positions[0] ?? "UTIL",
    );
    const positionLost = givePositions.map(
      (positions) => positions[0] ?? "UTIL",
    );

    let fillsNeed = false;
    outer: for (const positions of receivePositions) {
      for (const position of positions) {
        if (needPositions.includes(position)) {
          fillsNeed = true;
          break outer;
        }
      }
    }

    let positionalBonus = 0;
    for (let i = 0; i < receivePositions.length; i++) {
      const receivePrimary = receivePositions[i][0];
      if (!receivePrimary) continue;

      const receiveFillsNeed = receivePositions[i].some((pos) =>
        needPositions.includes(pos),
      );
      if (receiveFillsNeed) {
        positionalBonus += (POSITION_SCARCITY[receivePrimary] ?? 1.0) * 0.5;

        if (i < givePositions.length) {
          const givePrimary = givePositions[i][0];
          if (givePrimary) {
            const giveDepth = depthMap.get(givePrimary);
            if (giveDepth && giveDepth.depthRatio > 2.5) positionalBonus += 0.5;
          }
        }
      }
    }

    return {
      positionGained,
      positionLost,
      fillsNeed,
      needPositions,
      positionalBonus: Math.min(positionalBonus, 3.0),
    };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private isLowerBetter(category: any): boolean {
    return category.direction === "LOWER_BETTER";
  }
}
