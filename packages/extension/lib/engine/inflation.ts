import type { DraftPick, AuctionValue } from "@espn-fantasy/shared";
import type { InflationSignal } from "./types";

export function computeInflation(
  allPicks: DraftPick[],
  auctionValues: AuctionValue[],
  allTeamBudgets: Array<{ teamName: string; remainingBudget: number }>,
  totalTeams: number,
  myRemainingBudget: number,
): InflationSignal {
  // Build set of drafted player IDs
  const draftedIds = new Set(allPicks.map(p => p.playerId));

  // Remaining players with value > $1 (exclude min-bid filler players from denominator)
  const remainingPlayers = auctionValues.filter(
    av => !draftedIds.has(av.playerId) && av.dollarValue > 1
  );
  const totalRemainingValue = remainingPlayers.reduce(
    (sum, av) => sum + av.dollarValue, 0
  );

  // Total remaining budget across ALL teams
  // Prefer live DOM-scraped budgets if available (allTeamBudgets populated from pick train)
  let totalRemainingBudget: number;
  if (allTeamBudgets.length > 0) {
    totalRemainingBudget = allTeamBudgets.reduce(
      (sum, team) => sum + team.remainingBudget, 0
    );
  } else {
    // Fallback: estimate from picks
    const totalSpent = allPicks.reduce((sum, p) => sum + (p.cost ?? 0), 0);
    // Estimate initial budget: myRemainingBudget + my spend
    const mySpent = allPicks
      .filter(p => p.teamId === "myTeam" || p.cost !== undefined)
      .reduce((sum, p) => sum + (p.cost ?? 0), 0);
    const estimatedInitialBudget = myRemainingBudget + mySpent;
    const totalInitialBudget = estimatedInitialBudget > 0
      ? estimatedInitialBudget * totalTeams
      : 260 * totalTeams;
    totalRemainingBudget = Math.max(0, totalInitialBudget - totalSpent);
  }

  // Compute total league budget for normalization
  const totalInitialBudget = allTeamBudgets.length > 0
    ? allTeamBudgets.reduce((sum, t) => sum + t.remainingBudget, 0)
      + allPicks.reduce((sum, p) => sum + (p.cost ?? 0), 0)  // remaining + spent = initial
    : 260 * totalTeams;

  // FanGraphs dollar values are calibrated to an idealized pool that may differ from
  // the league's actual total budget. Normalize so the full auction value pool scales
  // to the league's budget. Without this, inflation is always negative when
  // sum(FG dollars) > league budget.
  const totalAuctionValuePool = auctionValues.reduce((sum, av) => sum + av.dollarValue, 0);
  const normalizationFactor = totalAuctionValuePool > 0
    ? totalInitialBudget / totalAuctionValuePool
    : 1.0;
  const normalizedRemainingValue = totalRemainingValue * normalizationFactor;

  // Core formula from CONTEXT.md: inflation = remaining_budget / remaining_projected_value
  const rawFactor = normalizedRemainingValue > 0
    ? totalRemainingBudget / normalizedRemainingValue
    : 1.0;

  // Clamp per Phase 11 decision: 0.5 to 2.0
  const inflationFactor = Math.max(0.5, Math.min(2.0, rawFactor));

  // Low confidence when fewer than 20 valued players remain (late draft instability)
  const confidence = remainingPlayers.length >= 20 ? "high" : "low";

  return {
    inflationFactor,
    rawInflationFactor: rawFactor,
    totalRemainingBudget,
    totalRemainingValue: normalizedRemainingValue,  // Use normalized for display
    confidence,
    percentOverMarket: Math.round((inflationFactor - 1) * 100),
  };
}
