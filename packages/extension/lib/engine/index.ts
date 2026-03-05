import type { DraftEngineInput, DraftEngineSignals } from "./types";
import { computeInflation } from "./inflation";
import { computeEnhancedScarcity } from "./scarcity";
import { computeCategoryGaps } from "./category-gap";
import { computeBudgetCurve } from "./budget-curve";
import { generateAlerts } from "./alerts";
import { computeBuildArchetype } from "./archetype";
import {
  fgLeaderboardHittersData,
  fgLeaderboardPitchersData,
  fgAuctionHittersData,
  fgAuctionPitchersData,
} from "../fangraphs-data";

export type { DraftEngineSignals, DraftEngineInput, DraftAlert, InflationSignal, EnhancedScarcitySignal, CategoryGapSignal, BudgetCurveSignal } from "./types";

export function computeDraftEngine(input: DraftEngineInput): DraftEngineSignals {
  const t0 = performance.now();

  // Build rankingsMap for O(1) lookups
  const rankingsMap = new Map(input.rankings.map(r => [r.playerId, r]));

  // 1. Inflation model
  const inflation = computeInflation(
    input.allPicks,
    input.auctionValues,
    input.allTeamBudgets,
    input.totalTeams,
    input.remainingBudget,
  );

  // 2. Enhanced scarcity model (uses external rankings + auction $ for tier drops)
  const scarcity = computeEnhancedScarcity(
    input.rankings,
    input.allPicks,
    input.teamRosters,
    input.totalTeams,
    input.myRoster,
    input.myTeamId,
    input.auctionValues,
  );

  // 3. Category gap engine
  const categoryGaps = computeCategoryGaps(
    input.myRoster,
    input.teamRosters,
    rankingsMap,
    input.leagueCategories,
  );

  // 4. Budget curve model
  // Find current nominated player's dollar value
  const currentPlayerValue = input.currentAuctionPlayerId
    ? (input.auctionValues.find(av => av.playerId === input.currentAuctionPlayerId)?.dollarValue ?? 0)
    : 0;

  const remainingRosterSpots = Math.max(0, input.rosterSize - input.myRoster.length);

  // Compute initial budget from remaining + spent
  const mySpent = input.myRoster.reduce((sum, p) => sum + (p.cost ?? 0), 0);
  const totalBudget = input.remainingBudget + mySpent;

  const budgetCurve = computeBudgetCurve(
    input.remainingBudget,
    remainingRosterSpots,
    totalBudget,
    input.rosterSize,
    inflation.inflationFactor,
    currentPlayerValue,
  );

  // 5. Generate alerts from all signals
  const alerts = generateAlerts(inflation, scarcity, categoryGaps, budgetCurve);

  // 6. Build archetype analysis (position-aware greedy fill + classification)
  const archetype = computeBuildArchetype(
    input.myRoster,
    input.remainingBudget,
    input.allPicks,
    fgLeaderboardHittersData,
    fgLeaderboardPitchersData,
    fgAuctionHittersData,
    fgAuctionPitchersData,
    input.leagueCategories,
    input.rosterSize,
    input.totalTeams,
  );

  const elapsed = performance.now() - t0;
  if (elapsed > 300) {
    console.warn(`[DraftEngine] Recompute took ${elapsed.toFixed(1)}ms -- exceeds 300ms budget`);
  }

  return {
    inflation,
    scarcity,
    categoryGaps,
    budgetCurve,
    alerts,
    computeTimeMs: Math.round(elapsed * 10) / 10,
    archetype: archetype.picksAnalyzed >= 3 ? archetype : null,
  };
}
