import React from "react";
import type { DraftEngineSignals } from "../lib/engine";
import ShoppingList from "./ShoppingList";

interface EngineInsightsProps {
  engineSignals: DraftEngineSignals | null;
}

export default function EngineInsights({ engineSignals }: EngineInsightsProps) {
  if (!engineSignals) {
    return null;
  }

  const { inflation, optimization, leagueAnalysis, projectedStandings, simulation } = engineSignals;

  // Inflation color: green < 5%, neutral 5-15%, warning > 15%
  const inflationPct = inflation.percentOverMarket;
  const inflationColorClass =
    Math.abs(inflationPct) < 5
      ? "text-positive"
      : Math.abs(inflationPct) < 15
      ? "text-content"
      : "text-warning";

  const inflationSign = inflationPct >= 0 ? "+" : "";

  return (
    <div className="border-b border-surface-tertiary">
      {/* Inflation section */}
      <details open className="group">
        <summary className="px-3 py-2 cursor-pointer flex items-center justify-between bg-surface-secondary hover:bg-surface-tertiary/50 select-none">
          <span className="text-body-sm font-semibold text-content">Inflation</span>
          <span className="text-body-xs text-content-secondary group-open:rotate-180 transition-transform">▾</span>
        </summary>
        <div className="px-3 pb-3 pt-2 bg-surface">
          <div className="flex items-baseline gap-2 mb-1">
            <span className={`text-h2 font-display ${inflationColorClass}`}>
              {inflationSign}{Math.round(inflationPct)}%
            </span>
            <span
              className={`text-body-xs font-semibold px-1.5 py-0.5 rounded ${
                inflation.confidence === "high"
                  ? "bg-positive-light text-positive"
                  : "bg-warning-light text-warning"
              }`}
            >
              {inflation.confidence.toUpperCase()}
            </span>
          </div>
          <div className="text-body-xs text-content-secondary">
            League budget remaining: ${Math.round(inflation.totalRemainingBudget)}
          </div>
        </div>
      </details>

      {/* Win Probability section — shown when simulation has baseline data */}
      {simulation?.winProbability != null && (
        <details open className="group">
          <summary className="px-3 py-2 cursor-pointer flex items-center justify-between bg-surface-secondary hover:bg-surface-tertiary/50 select-none border-t border-surface-tertiary">
            <div className="flex items-center gap-2">
              <span className="text-body-sm font-semibold text-content">Win Probability</span>
              <span className="font-display text-body-sm font-semibold text-accent">
                #{Math.round(simulation.winProbability.expectedFinish)}
              </span>
            </div>
            <span className="text-body-xs text-content-secondary group-open:rotate-180 transition-transform">&#9662;</span>
          </summary>
          <div className="px-3 pb-3 pt-2 bg-surface">
            {/* Big expected finish number */}
            <div className="flex items-baseline gap-3 mb-2">
              <div>
                <span className="text-h1 font-display text-accent">
                  {simulation.winProbability.expectedFinish.toFixed(1)}
                </span>
                <span className="text-body-xs text-content-secondary ml-1">exp. finish</span>
              </div>
            </div>

            {/* Probability bars */}
            <div className="space-y-1.5">
              {/* Win probability */}
              <div className="flex items-center justify-between text-body-xs">
                <span className="text-content">Win</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-positive rounded-full"
                      style={{ width: `${Math.min(100, simulation.winProbability.winProbability * 100)}%` }}
                    />
                  </div>
                  <span className="font-semibold text-content w-10 text-right">
                    {Math.round(simulation.winProbability.winProbability * 100)}%
                  </span>
                </div>
              </div>

              {/* Top 3 probability */}
              <div className="flex items-center justify-between text-body-xs">
                <span className="text-content">Top 3</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-info rounded-full"
                      style={{ width: `${Math.min(100, simulation.winProbability.top3Probability * 100)}%` }}
                    />
                  </div>
                  <span className="font-semibold text-content w-10 text-right">
                    {Math.round(simulation.winProbability.top3Probability * 100)}%
                  </span>
                </div>
              </div>

              {/* Top 6 probability */}
              <div className="flex items-center justify-between text-body-xs">
                <span className="text-content">Top 6</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-content-secondary rounded-full"
                      style={{ width: `${Math.min(100, simulation.winProbability.top6Probability * 100)}%` }}
                    />
                  </div>
                  <span className="font-semibold text-content w-10 text-right">
                    {Math.round(simulation.winProbability.top6Probability * 100)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Sim metadata */}
            <div className="text-body-xs text-content-secondary mt-2">
              {simulation.winProbability.simCount} sims in {simulation.computeTimeMs}ms
            </div>

            {/* Decision Comparison — shown when a player is nominated */}
            {simulation.currentDecision != null && simulation.currentDecision.decisions.length > 0 && (
              <div className="border-t border-surface-tertiary mt-2 pt-2">
                <div className="text-body-xs font-semibold text-content mb-1.5">Bid vs Pass</div>
                <div className="space-y-1.5">
                  {simulation.currentDecision.decisions.map((d) => {
                    const isRecommended = d.label === simulation.currentDecision!.recommendedAction;
                    return (
                      <div
                        key={d.label}
                        className={`flex items-center justify-between text-body-xs rounded px-1.5 py-1 ${
                          isRecommended ? "ring-1 ring-accent bg-surface-secondary" : ""
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          {isRecommended && (
                            <span className="text-accent font-semibold text-body-xs">&#10003;</span>
                          )}
                          <span className={`${isRecommended ? "font-semibold text-content" : "text-content"}`}>
                            {d.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-content-secondary">
                          <span>#{d.outcome.expectedFinish.toFixed(1)}</span>
                          <span className="font-semibold">
                            {Math.round(d.outcome.winProbability * 100)}% win
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </details>
      )}

      {/* Shopping List section — replaces Top Targets */}
      <ShoppingList shoppingList={optimization?.shoppingList ?? null} />

      {/* League Analysis section — collapsed by default */}
      {leagueAnalysis != null && leagueAnalysis.teamsAnalyzed > 1 && (
        <details className="group">
          <summary className="px-3 py-2 cursor-pointer flex items-center justify-between bg-surface-secondary hover:bg-surface-tertiary/50 select-none border-t border-surface-tertiary">
            <span className="text-body-sm font-semibold text-content">League Analysis</span>
            <span className="text-body-xs text-content-secondary group-open:rotate-180 transition-transform">▾</span>
          </summary>
          <div className="px-3 pb-3 pt-2 bg-surface">
            {/* Category Rankings grid */}
            <div className="space-y-1">
              {leagueAnalysis.categoryRankings.map((ranking) => {
                const isTop3 = ranking.myRank <= 3;
                const isBottom3 = ranking.myRank >= ranking.totalTeams - 2 && ranking.totalTeams >= 4;
                const rankColorClass = isTop3
                  ? "text-positive"
                  : isBottom3
                  ? "text-negative"
                  : "text-content-secondary";
                // Precision: 0 decimals for counting stats, 3 for rate stats
                const isRateStat = ["AVG", "OBP", "SLG", "OPS", "ERA", "WHIP"].includes(ranking.category);
                const displayTotal = isRateStat
                  ? ranking.myTotal.toFixed(3)
                  : Math.round(ranking.myTotal).toString();

                return (
                  <div
                    key={ranking.category}
                    className="flex items-center justify-between text-body-xs"
                  >
                    <span className="text-content">{ranking.category}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-content-secondary">{displayTotal}</span>
                      <span className={`font-semibold ${rankColorClass}`}>
                        {ranking.myRank}/{ranking.totalTeams}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Market Demand subsection — only high/medium demand categories */}
            {leagueAnalysis.categoryDemand.some(d => d.demandLevel === "high" || d.demandLevel === "medium") && (
              <div className="border-t border-surface-tertiary mt-2 pt-2">
                <div className="text-body-xs font-semibold text-content mb-1">Market Demand</div>
                <div className="space-y-1">
                  {leagueAnalysis.categoryDemand
                    .filter(d => d.demandLevel === "high" || d.demandLevel === "medium")
                    .map((demand) => {
                      const totalTeamsForDemand = leagueAnalysis.teamsAnalyzed;
                      return (
                        <div
                          key={demand.category}
                          className="flex items-center justify-between text-body-xs"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="text-content">{demand.category}</span>
                            <span
                              className={`text-body-xs font-semibold px-1.5 py-0.5 rounded ${
                                demand.demandLevel === "high"
                                  ? "bg-negative-light text-negative"
                                  : "bg-warning-light text-warning"
                              }`}
                            >
                              {demand.demandLevel === "high" ? "HIGH" : "MED"}
                            </span>
                          </div>
                          <span className="text-content-secondary">
                            {demand.weakTeamCount} of {totalTeamsForDemand} weak
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Strategic Recommendations */}
            {leagueAnalysis.recommendations.length > 0 && (
              <div className="border-t border-surface-tertiary mt-2 pt-2 space-y-1">
                {leagueAnalysis.recommendations.map((rec, i) => (
                  <div key={i} className="text-body-xs text-content-secondary">
                    — {rec}
                  </div>
                ))}
              </div>
            )}
          </div>
        </details>
      )}

      {/* Projected Standings section — collapsed by default, shown when >= 3 teams have data */}
      {projectedStandings != null && projectedStandings.teamsWithData >= 3 && (
        <details className="group">
          <summary className="px-3 py-2 cursor-pointer flex items-center justify-between bg-surface-secondary hover:bg-surface-tertiary/50 select-none border-t border-surface-tertiary">
            <div className="flex items-center gap-2">
              <span className="text-body-sm font-semibold text-content">Projected Standings</span>
              {projectedStandings.myTeamRank > 0 && (
                <span className="font-display text-body-sm font-semibold text-accent">
                  #{projectedStandings.myTeamRank}
                </span>
              )}
              <span
                className={`text-body-xs font-semibold px-1.5 py-0.5 rounded ${
                  projectedStandings.draftProgressWeight >= 0.5
                    ? "bg-positive-light text-positive"
                    : "bg-warning-light text-warning"
                }`}
              >
                {projectedStandings.draftProgressWeight >= 0.5
                  ? "HIGH"
                  : projectedStandings.draftProgressWeight >= 0.2
                  ? "MED"
                  : "LOW"}
              </span>
            </div>
            <span className="text-body-xs text-content-secondary group-open:rotate-180 transition-transform">▾</span>
          </summary>
          <div className="px-3 pb-3 pt-2 bg-surface">
            {/* Standings table — all teams sorted by rank */}
            <div className="space-y-1">
              {projectedStandings.standings.map((team) => {
                const isMyTeam = team.projectedOverallRank === projectedStandings.myTeamRank && projectedStandings.myTeamRank > 0;
                return (
                  <div
                    key={team.teamId}
                    className={`flex items-center justify-between text-body-xs ${
                      isMyTeam ? "ring-1 ring-accent rounded px-1.5 py-1" : ""
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-display text-content font-semibold w-4 text-right">
                        {team.projectedOverallRank}
                      </span>
                      <span className={`${isMyTeam ? "font-semibold text-content" : "text-content"}`}>
                        {team.teamName.length > 15
                          ? team.teamName.slice(0, 15) + "…"
                          : team.teamName}
                        {isMyTeam && (
                          <span className="ml-1 text-accent font-normal">(you)</span>
                        )}
                      </span>
                    </div>
                    <span className="text-content-secondary">
                      {Math.round(team.projectedRotoPts)} pts
                    </span>
                  </div>
                );
              })}
            </div>

            {/* My category ranks with projected values — only shown when user's team is in standings */}
            {projectedStandings.myTeamRank > 0 && (() => {
              const myStanding = projectedStandings.standings.find(
                s => s.projectedOverallRank === projectedStandings.myTeamRank,
              );
              if (!myStanding) return null;
              const totalTeams = projectedStandings.totalTeamCount;
              const categoryEntries = Object.entries(myStanding.categoryRanks);
              if (categoryEntries.length === 0) return null;

              const RATE_STATS = new Set(["AVG", "OBP", "SLG", "OPS", "ERA", "WHIP"]);

              return (
                <div className="border-t border-surface-tertiary mt-2 pt-2">
                  <div className="text-body-xs font-semibold text-content mb-1">My Projected Categories</div>
                  <div className="space-y-1">
                    {categoryEntries.map(([statKey, rank]) => {
                      const isTop3 = rank <= 3;
                      const isBottom3 = totalTeams >= 4 && rank >= totalTeams - 2;
                      const rankColorClass = isTop3
                        ? "text-positive"
                        : isBottom3
                        ? "text-negative"
                        : "text-content-secondary";
                      const value = myStanding.categoryValues?.[statKey];
                      const isRate = RATE_STATS.has(statKey);
                      const displayValue = value != null
                        ? isRate ? value.toFixed(3) : Math.round(value).toString()
                        : "—";

                      return (
                        <div
                          key={statKey}
                          className="flex items-center justify-between text-body-xs"
                        >
                          <span className="text-content">{statKey}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-content-secondary">{displayValue}</span>
                            <span className={`font-semibold ${rankColorClass}`}>
                              {rank}/{totalTeams}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Weak/strong category summary */}
            {(projectedStandings.myWeakCategories.length > 0 || projectedStandings.myStrongCategories.length > 0) && (
              <div className="border-t border-surface-tertiary mt-2 pt-2 space-y-0.5">
                {projectedStandings.myStrongCategories.length > 0 && (
                  <div className="text-body-xs text-positive">
                    Strong: {projectedStandings.myStrongCategories.join(", ")}
                  </div>
                )}
                {projectedStandings.myWeakCategories.length > 0 && (
                  <div className="text-body-xs text-negative">
                    Weak: {projectedStandings.myWeakCategories.join(", ")}
                  </div>
                )}
              </div>
            )}
          </div>
        </details>
      )}
      {/* Nomination Strategy section — collapsed by default */}
      {simulation?.nominationStrategy != null && simulation.nominationStrategy.length > 0 && (
        <details className="group">
          <summary className="px-3 py-2 cursor-pointer flex items-center justify-between bg-surface-secondary hover:bg-surface-tertiary/50 select-none border-t border-surface-tertiary">
            <span className="text-body-sm font-semibold text-content">Nomination Strategy</span>
            <span className="text-body-xs text-content-secondary group-open:rotate-180 transition-transform">&#9662;</span>
          </summary>
          <div className="px-3 pb-3 pt-2 bg-surface">
            <div className="text-body-xs text-content-secondary mb-2">
              Players to nominate that drain opponent budgets
            </div>
            <div className="space-y-1.5">
              {simulation.nominationStrategy.map((nom, i) => {
                // trapScore color: > 0.6 = positive, > 0.3 = neutral, else muted
                const scoreColorClass =
                  nom.trapScore > 0.6
                    ? "text-positive"
                    : nom.trapScore > 0.3
                    ? "text-content"
                    : "text-content-secondary";

                return (
                  <div key={`nom-${i}`} className="flex items-start justify-between text-body-xs gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-content truncate">{nom.playerName}</div>
                      <div className="text-content-secondary truncate">{nom.reason}</div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-content-secondary">${Math.round(nom.expectedDrain)}</span>
                      <span className={`font-semibold ${scoreColorClass}`}>
                        {(nom.trapScore * 100).toFixed(0)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
