import {
  calculateFinalRate,
  PITCHING_STAT_KEYS,
  isPitcherProjection,
  type Category,
  type StatComponents,
} from "../../../shared/dist/index.js";
import { allocateProjections } from "../projection/allocator.js";
import { canFillSlot } from "../projection/slot-eligibility.js";
import type { AllocationInput, RosterGap } from "../projection/types.js";
import type {
  CategoryImpact,
  ProposedTrade,
  PositionalContext,
} from "./trade-recommendation.js";

// ─── Context types ────────────────────────────────────────────────────────────

export interface TradeSimContext {
  categories: Category[];
  /** Map from teamId → categoryId → { value, components } */
  teamCategoryMap: Map<
    number,
    Map<string, { value: number; components?: any }>
  >;
  teamId: number;
  /** Current projected category impacts — used for old rank lookup */
  currentCategoryImpacts: CategoryImpact[];
}

export interface AddDropSimContext {
  categories: Category[];
  /** Team's per-category projected data rows */
  currentProjections: any[];
  /** All teams' per-category projected data rows */
  allTeamsProjections: any[];
  numTeams: number;
  teamId: number;
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
    projections: Map<number, any>,
  ): TradeSimResult {
    const { categories, teamCategoryMap, teamId, currentCategoryImpacts } = ctx;

    // Deep-copy the user team's category map so we do not mutate the original
    const userTeamCategories = new Map<
      string,
      { value: number; components?: any }
    >();
    const originalTeamMap =
      teamCategoryMap.get(teamId) ??
      new Map<string, { value: number; components?: any }>();
    for (const [k, v] of originalTeamMap.entries()) {
      userTeamCategories.set(k, {
        value: v.value,
        components: v.components ? { ...v.components } : undefined,
      });
    }

    // Snapshot original values for CategoryImpact.currentValue
    const originalValues = new Map<string, number>();
    for (const category of categories) {
      originalValues.set(
        category.category_id,
        userTeamCategories.get(category.category_id)?.value ?? 0,
      );
    }

    // Build working team map with user team replaced by mutable copy
    const workingTeamMap = new Map<
      number,
      Map<string, { value: number; components?: any }>
    >();
    for (const [tid, catMap] of teamCategoryMap.entries()) {
      workingTeamMap.set(tid, tid === teamId ? userTeamCategories : catMap);
    }

    // Apply trade adjustments to user team's projected category values
    for (const category of categories) {
      const catId = category.category_id;
      const current = userTeamCategories.get(catId) ?? {
        value: 0,
        components: null,
      };

      if (category.type === "RATE") {
        const adjustedComponents: Record<string, number> = current.components
          ? { ...current.components }
          : {};

        for (const givePlayer of trade.givePlayers) {
          const proj = projections.get(givePlayer.playerId);
          if (proj && this.isCategoryRelevant(category, proj)) {
            const playerComponents =
              proj.stat_components_json as StatComponents;
            for (const [key, value] of Object.entries(playerComponents)) {
              adjustedComponents[key] =
                (adjustedComponents[key] ?? 0) - (Number(value) || 0);
            }
          }
        }

        for (const receivePlayer of trade.receivePlayers) {
          const proj = projections.get(receivePlayer.playerId);
          if (proj && this.isCategoryRelevant(category, proj)) {
            const playerComponents =
              proj.stat_components_json as StatComponents;
            for (const [key, value] of Object.entries(playerComponents)) {
              adjustedComponents[key] =
                (adjustedComponents[key] ?? 0) + (Number(value) || 0);
            }
          }
        }

        let projectedValue: number;
        try {
          projectedValue = calculateFinalRate(
            category.formula_id!,
            {},
            adjustedComponents,
          );
        } catch {
          projectedValue = current.value;
        }

        userTeamCategories.set(catId, {
          value: projectedValue,
          components: adjustedComponents,
        });
      } else {
        // Counting stats
        let giveDelta = 0;
        for (const givePlayer of trade.givePlayers) {
          const proj = projections.get(givePlayer.playerId);
          if (proj && this.isCategoryRelevant(category, proj)) {
            giveDelta += this.getProjectedCategoryValue(category, proj);
          }
        }

        let receiveDelta = 0;
        for (const receivePlayer of trade.receivePlayers) {
          const proj = projections.get(receivePlayer.playerId);
          if (proj && this.isCategoryRelevant(category, proj)) {
            receiveDelta += this.getProjectedCategoryValue(category, proj);
          }
        }

        userTeamCategories.set(catId, {
          value: current.value + receiveDelta - giveDelta,
          components: current.components,
        });
      }
    }

    // Re-rank all teams in each category and build CategoryImpact[]
    const newCategoryImpacts: CategoryImpact[] = [];
    let projectedOverallPoints = 0;

    for (const category of categories) {
      const catId = category.category_id;

      const teamValues: Array<{ teamId: number; value: number }> = [];
      for (const [tId, catMap] of workingTeamMap.entries()) {
        teamValues.push({ teamId: tId, value: catMap.get(catId)?.value ?? 0 });
      }

      const lowerBetter = this.isLowerBetter(category);
      teamValues.sort((a, b) =>
        lowerBetter ? a.value - b.value : b.value - a.value,
      );

      const numTeams = teamValues.length;
      const teamRanks = new Map<number, number>();
      teamValues.forEach((tv, idx) => teamRanks.set(tv.teamId, idx + 1));

      const currentRank =
        currentCategoryImpacts.find((ci) => ci.categoryId === catId)
          ?.currentRank ?? numTeams;
      const projectedRank = teamRanks.get(teamId) ?? numTeams;

      const currentPoints = Math.max(0, numTeams - currentRank + 1);
      const projectedPoints = Math.max(0, numTeams - projectedRank + 1);

      newCategoryImpacts.push({
        categoryId: catId,
        categoryName: category.name,
        currentValue: originalValues.get(catId) ?? 0,
        projectedValue: userTeamCategories.get(catId)?.value ?? 0,
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
    const dropProjection = projectionMap.get(dropPlayerId);
    if (!addProjection || !dropProjection) return null;

    const addComponents = addProjection.stat_components_json as StatComponents;
    const dropComponents =
      dropProjection.stat_components_json as StatComponents;

    const addIsPitcher = isPitcherProjection(addComponents);
    const dropIsPitcher = isPitcherProjection(dropComponents);

    const categoryImpacts: AddDropSimResult["categoryImpacts"] = [];
    let totalDeltaPoints = 0;

    for (const category of categories) {
      const currentProj = currentProjections.find(
        (p) => p.category_id === category.category_id,
      );
      if (!currentProj) continue;

      const isPitchingCat = PITCHING_STAT_KEYS.has(category.stat_key);
      const categoryMatchesAdd = isPitchingCat ? addIsPitcher : !addIsPitcher;
      const categoryMatchesDrop = isPitchingCat
        ? dropIsPitcher
        : !dropIsPitcher;

      if (!categoryMatchesAdd && !categoryMatchesDrop) {
        categoryImpacts.push({
          categoryId: category.category_id,
          categoryName: category.name,
          deltaRank: 0,
          deltaPoints: 0,
        });
        continue;
      }

      let newValue: number;

      if (category.type === "COUNTING") {
        const delta =
          (addComponents[category.stat_key] || 0) -
          (dropComponents[category.stat_key] || 0);
        newValue = Number(currentProj.projected_value) + delta;
      } else if (category.type === "RATE" && category.formula_id) {
        const currentComponents = (currentProj.projected_components_json ||
          {}) as StatComponents;

        const withoutDrop: StatComponents = {};
        for (const key of Object.keys(currentComponents)) {
          withoutDrop[key] =
            (currentComponents[key] || 0) - (dropComponents[key] || 0);
        }

        const withAdd: StatComponents = {};
        const allKeys = new Set([
          ...Object.keys(withoutDrop),
          ...Object.keys(addComponents),
        ]);
        for (const key of allKeys) {
          withAdd[key] = (withoutDrop[key] || 0) + (addComponents[key] || 0);
        }

        try {
          newValue = calculateFinalRate(category.formula_id, {}, withAdd);
        } catch {
          continue;
        }
      } else {
        continue;
      }

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

      const oldRank = currentProj.projected_rank;
      const newRank = categoryValues.findIndex((v) => v.teamId === teamId) + 1;
      const oldPoints = numTeams - oldRank + 1;
      const newPoints = numTeams - newRank + 1;
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

  private isCategoryRelevant(category: any, projection: any): boolean {
    const components = projection.stat_components_json as StatComponents;
    const isPitchingCat = PITCHING_STAT_KEYS.has(category.stat_key);
    return isPitchingCat
      ? (components.IP ?? 0) > 0 || components.ER !== undefined
      : (components.AB ?? 0) > 0;
  }

  private getProjectedCategoryValue(category: any, projection: any): number {
    const components = projection.stat_components_json as StatComponents;
    if (category.type === "RATE" && category.formula_id) {
      try {
        return calculateFinalRate(category.formula_id, {}, components);
      } catch {
        return 0;
      }
    }
    return components[category.stat_key] ?? 0;
  }

  private isLowerBetter(category: any): boolean {
    return category.direction === "LOWER_BETTER";
  }
}
