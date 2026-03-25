"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import { ArrowRight, ExternalLink, AlertTriangle, ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import { Container } from "@/components/ui/Container";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingSpinner, LoadingSkeleton } from "@/components/ui/LoadingSpinner";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { PlayerRow } from "@/components/league/PlayerRow";
import { PlayerStatLine } from "@/components/league/PlayerStatLine";
import { getESPNFreeAgentsUrl } from "@/lib/espn-links";
import { cn } from "@/lib/cn";
import { Term } from "@/components/ui/Term";

interface WaiverRecommendation {
  addPlayerId: number;
  addPlayerName: string;
  dropPlayerId: number;
  dropPlayerName: string;
  deltaOverallPoints: number;
  categoryImpacts: Array<{
    categoryId: string;
    categoryName: string;
    deltaRank: number;
    deltaPoints: number;
  }>;
  explanation: string;
  isLegal: boolean;
  legalityIssues?: string[];
}

interface FreeAgent {
  playerId: number;
  espnPlayerId: number;
  playerName: string;
  mlbTeam: string | null;
  positions: string[];
  projections: {
    [key: string]: number;
  } | null;
  currentStats: {
    [key: string]: number;
  } | null;
  pctOwned: number;
}

interface RosterPlayer {
  playerId: number;
  espnPlayerId: number;
  playerName: string;
  mlbTeam: string | null;
  positions: string[];
  rosterStatus: string;
  rosterSlot: string;
  projections: {
    [key: string]: number;
  } | null;
  currentStats: {
    [key: string]: number;
  } | null;
}

interface EvaluationResult {
  addPlayer: {
    id: number;
    name: string;
    positions: string[];
  };
  dropPlayer: {
    id: number;
    name: string;
    positions: string[];
  };
  deltaOverallPoints: number;
  categoryImpacts: Array<{
    categoryId: string;
    categoryName: string;
    deltaRank: number;
    deltaPoints: number;
  }>;
  explanation: string;
  isLegal: boolean;
  legalityIssues?: string[];
  snapshotDate: string;
}

type ViewMode = "ai" | "manual";

function groupByTopCategory(
  recs: WaiverRecommendation[]
): { category: string; recs: WaiverRecommendation[] }[] {
  const groups: Record<string, WaiverRecommendation[]> = {};

  for (const rec of recs) {
    const topCat = rec.categoryImpacts
      ?.filter((ci) => Math.abs(ci.deltaPoints) > 0.3)
      .sort((a, b) => Math.abs(b.deltaPoints) - Math.abs(a.deltaPoints))[0];

    const groupKey = topCat ? topCat.categoryName : "Best Overall";
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(rec);
  }

  return Object.entries(groups)
    .map(([category, recs]) => ({ category, recs }))
    .sort((a, b) => {
      if (a.category === "Best Overall") return 1;
      if (b.category === "Best Overall") return -1;
      const avgA =
        a.recs.reduce((sum, r) => {
          const top = r.categoryImpacts?.sort(
            (x, y) => Math.abs(y.deltaPoints) - Math.abs(x.deltaPoints)
          )[0];
          return sum + (top?.deltaPoints ?? 0);
        }, 0) / a.recs.length;
      const avgB =
        b.recs.reduce((sum, r) => {
          const top = r.categoryImpacts?.sort(
            (x, y) => Math.abs(y.deltaPoints) - Math.abs(x.deltaPoints)
          )[0];
          return sum + (top?.deltaPoints ?? 0);
        }, 0) / b.recs.length;
      return avgB - avgA;
    });
}

export default function WaiversPage() {
  const params = useParams();
  const leagueId = params.id as string;
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("ai");
  const [selectedFreeAgentId, setSelectedFreeAgentId] = useState<number | null>(
    null,
  );
  const [selectedRosterPlayerId, setSelectedRosterPlayerId] = useState<
    number | null
  >(null);
  const [evaluationResult, setEvaluationResult] =
    useState<EvaluationResult | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>("pct_owned");
  const [positionFilter, setPositionFilter] = useState<string[]>([]);

  // Load selected team from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(`league_${leagueId}_team`);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed)) setSelectedTeamId(parsed);
    }
  }, [leagueId]);

  // Fetch league status for ESPN links
  const { data: leagueStatus } = useQuery({
    queryKey: ['league', leagueId],
    queryFn: () => api.getLeagueStatus(parseInt(leagueId, 10)),
  });
  const espnLeagueId = leagueStatus?.league?.espn_league_id;
  const season = leagueStatus?.league?.season;

  // AI Recommendations query
  const {
    data: aiData,
    isLoading: aiLoading,
    error: aiError,
  } = useQuery({
    queryKey: ["waivers", leagueId, selectedTeamId],
    queryFn: async () => {
      if (!selectedTeamId) {
        throw new Error("No team selected");
      }

      return api.getWaiverRecommendations(
        parseInt(leagueId, 10),
        selectedTeamId,
      ) as Promise<{
        recommendations: WaiverRecommendation[];
        snapshotDate: string;
      }>;
    },
    enabled: !!selectedTeamId && viewMode === "ai",
  });

  // Free agents query
  const { data: freeAgentsData, isLoading: freeAgentsLoading } = useQuery({
    queryKey: ["free-agents", leagueId, sortBy, positionFilter.join(",")],
    queryFn: async () => {
      return api.getFreeAgents(parseInt(leagueId, 10), {
        sortBy,
        ...(positionFilter.length > 0 && {
          position: positionFilter.join(","),
        }),
      }) as Promise<{
        freeAgents: FreeAgent[];
        snapshotDate: string;
      }>;
    },
    enabled: !!selectedTeamId && viewMode === "manual",
  });

  // Roster query
  const { data: rosterData, isLoading: rosterLoading } = useQuery({
    queryKey: ["roster", leagueId, selectedTeamId],
    queryFn: async () => {
      if (!selectedTeamId) {
        throw new Error("No team selected");
      }

      return api.getTeamRoster(
        parseInt(leagueId, 10),
        selectedTeamId,
      ) as Promise<{
        roster: RosterPlayer[];
        snapshotDate: string;
      }>;
    },
    enabled: !!selectedTeamId && viewMode === "manual",
  });

  // Evaluate add/drop
  const handleEvaluate = async () => {
    if (!selectedTeamId || !selectedFreeAgentId || !selectedRosterPlayerId) {
      return;
    }

    setIsEvaluating(true);
    setEvaluationResult(null);
    setEvaluationError(null);

    try {
      const result = (await api.evaluateWaiver(
        parseInt(leagueId, 10),
        selectedTeamId,
        {
          addPlayerId: selectedFreeAgentId,
          dropPlayerId: selectedRosterPlayerId,
        },
      )) as EvaluationResult;
      setEvaluationResult(result);
    } catch (error) {
      console.error("Evaluation error:", error);
      setEvaluationError("Failed to evaluate add/drop. Please try again.");
    } finally {
      setIsEvaluating(false);
    }
  };

  const renderDeltaValue = (value: number, suffix = "") => (
    <span
      className={cn(
        "font-semibold text-data",
        value > 0
          ? "text-positive"
          : value < 0
            ? "text-negative"
            : "text-content-secondary",
      )}
    >
      {value > 0 ? "+" : ""}
      {value === 0 ? "\u2014" : `${value}${suffix}`}
    </span>
  );

  // Rank deltas use INVERTED colors: negative = improved (green), positive = worsened (red)
  const renderDeltaRank = (value: number) => (
    <span
      className={cn(
        "font-semibold text-data",
        value < 0
          ? "text-positive"
          : value > 0
            ? "text-negative"
            : "text-content-secondary",
      )}
    >
      {value === 0
        ? "\u2014"
        : value < 0
          ? `\u2191${Math.abs(value)}`
          : `\u2193${value}`}
    </span>
  );

  const renderCategoryImpactTable = (
    impacts: Array<{
      categoryId: string;
      categoryName: string;
      deltaRank: number;
      deltaPoints: number;
    }>,
  ) => (
    <div className="mt-3 border-t border-neutral-200 dark:border-shell-border pt-3 overflow-x-auto">
      <table className="min-w-full divide-y divide-neutral-200 dark:divide-shell-border">
        <thead>
          <tr>
            <th className="px-2 sm:px-3 py-2 text-left text-data font-medium text-content-secondary uppercase">
              Category
            </th>
            <th className="px-2 sm:px-3 py-2 text-center text-data font-medium text-content-secondary uppercase">
              Rank Change
            </th>
            <th className="px-2 sm:px-3 py-2 text-right text-data font-medium text-content-secondary uppercase">
              Points
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-shell-border">
          {[...impacts]
            .sort(
              (a, b) => Math.abs(b.deltaPoints) - Math.abs(a.deltaPoints),
            )
            .map((impact) => (
              <tr key={impact.categoryId} className={impact.deltaPoints === 0 ? "opacity-40" : ""}>
                <td className={cn("px-2 sm:px-3 py-2 text-data font-medium whitespace-nowrap", impact.deltaPoints === 0 ? "text-content-tertiary" : "text-content dark:text-shell-text")}>
                  {impact.categoryName}
                </td>
                <td className="px-2 sm:px-3 py-2 text-data text-center whitespace-nowrap">
                  {renderDeltaRank(impact.deltaRank)}
                </td>
                <td className="px-2 sm:px-3 py-2 text-data text-right whitespace-nowrap">
                  {impact.deltaPoints !== 0 ? (
                    <span className={cn("font-semibold text-data", impact.deltaPoints > 0 ? "text-positive" : "text-negative")}>
                      {impact.deltaPoints > 0 ? "+" : ""}{impact.deltaPoints.toFixed(1)}
                    </span>
                  ) : (
                    <span className="text-content-tertiary text-data">{"\u2014"}</span>
                  )}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );

  const renderLegalityWarning = (issues: string[]) => (
    <div className="mt-3 bg-warning-light dark:bg-amber-900/20 border border-warning-border dark:border-amber-800 rounded-lg p-3">
      <div className="flex">
        <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
        <div className="ml-3 flex-1">
          <h4 className="text-body-sm font-medium text-warning dark:text-amber-400">
            Roster Constraints
          </h4>
          <ul className="mt-1 text-data text-warning dark:text-amber-400 list-disc list-inside space-y-1">
            {issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );

  const renderSwapVisualization = (
    dropName: string,
    addName: string,
    dropPositions?: string[],
    addPositions?: string[],
  ) => (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 mb-4">
      <div className="bg-shell-bg dark:bg-shell-bg border border-shell-border rounded-lg p-3">
        <div className="text-caption font-semibold text-negative uppercase tracking-wider mb-1.5">
          Drop
        </div>
        <div className="text-sm font-medium text-content dark:text-shell-text truncate">
          {dropName}
        </div>
        {dropPositions && (
          <div className="text-xs text-content-secondary dark:text-shell-muted mt-1">
            {dropPositions.join(", ")}
          </div>
        )}
      </div>

      <div className="flex items-center justify-center">
        <ArrowRight className="w-5 h-5 text-shell-muted rotate-90 sm:rotate-0" />
      </div>

      <div className="bg-shell-bg dark:bg-shell-bg border border-shell-border rounded-lg p-3">
        <div className="text-caption font-semibold text-positive uppercase tracking-wider mb-1.5">
          Add
        </div>
        <div className="text-sm font-medium text-content dark:text-shell-text truncate">
          {addName}
        </div>
        {addPositions && (
          <div className="text-xs text-content-secondary dark:text-shell-muted mt-1">
            {addPositions.join(", ")}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Container size="wide" className="py-6 sm:py-8">
      {/* Compact header with inline mode toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-content dark:text-shell-text">Waivers</h1>
          <p className="text-body-sm text-content-secondary dark:text-shell-muted">
            {viewMode === "ai" ? "AI-generated add/drop recommendations" : "Evaluate any add/drop move"}
          </p>
        </div>
        {selectedTeamId && (
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode("ai")}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                viewMode === "ai"
                  ? "bg-shell-accent text-white"
                  : "bg-transparent border border-shell-border text-content-secondary dark:text-shell-muted hover:text-content dark:hover:text-shell-text"
              )}
            >
              AI Picks
            </button>
            <button
              onClick={() => setViewMode("manual")}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                viewMode === "manual"
                  ? "bg-shell-accent text-white"
                  : "bg-transparent border border-shell-border text-content-secondary dark:text-shell-muted hover:text-content dark:hover:text-shell-text"
              )}
            >
              Manual Eval
            </button>
          </div>
        )}
      </div>

      {!selectedTeamId ? (
        <ErrorAlert
          variant="warning"
          message="Please go back to the league page and select your team to view waiver recommendations."
          backLink={{
            href: `/leagues/${leagueId}`,
            label: "Go to League Page",
          }}
        />
      ) : viewMode === "ai" ? (
        <Card>
          {aiLoading ? (
            <CardContent>
              <LoadingSkeleton lines={3} />
            </CardContent>
          ) : aiError ? (
            <CardContent>
              <ErrorAlert message={(aiError as Error).message} />
            </CardContent>
          ) : aiData && aiData.recommendations.length > 0 ? (
            <CardContent className="space-y-8">
              {groupByTopCategory(aiData.recommendations).map((group, groupIdx) => (
                <div key={group.category} className="mb-2">
                  <h3 className="text-h4 font-semibold text-content dark:text-shell-text mb-3 flex items-center gap-2">
                    {group.category}
                    <span className="text-caption text-content-secondary font-normal">
                      ({group.recs.length} {group.recs.length === 1 ? "recommendation" : "recommendations"})
                    </span>
                  </h3>
                  <div className="space-y-4">
                    {group.recs.map((rec, idx) => {
                      const globalIdx = groupIdx * 100 + idx;
                      return (
                        <div
                          key={`${rec.addPlayerId}-${rec.dropPlayerId}`}
                          className="border border-shell-border rounded-lg p-4 sm:p-5 bg-shell-panel dark:bg-shell-panel hover:border-accent/40 transition-colors"
                        >
                          {/* Compact header: delta + marginal label + ESPN link */}
                          <div className="flex items-center gap-3 mb-3">
                            <div className="px-2.5 py-1 rounded-md font-bold text-base font-mono bg-positive/10 text-positive">
                              +{rec.deltaOverallPoints.toFixed(1)}
                            </div>
                            <div className="flex-1 min-w-0">
                              {(() => {
                                const topImpact = rec.categoryImpacts
                                  ?.filter((ci) => Math.abs(ci.deltaPoints) > 0)
                                  .sort((a, b) => Math.abs(b.deltaPoints) - Math.abs(a.deltaPoints))[0];
                                return topImpact ? (
                                  <span className="text-xs font-semibold text-accent truncate block">
                                    +{topImpact.deltaPoints.toFixed(0)} roto pts in {topImpact.categoryName}
                                  </span>
                                ) : null;
                              })()}
                            </div>
                            {espnLeagueId && season && (
                              <a
                                href={getESPNFreeAgentsUrl(espnLeagueId, season)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-shrink-0 inline-flex items-center px-2.5 py-1 text-xs font-medium text-accent border border-accent/30 rounded hover:bg-accent/10 gap-1"
                              >
                                ESPN <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>

                          {/* Swap Visualization */}
                          {renderSwapVisualization(
                            rec.dropPlayerName,
                            rec.addPlayerName,
                          )}

                          {/* Explanation */}
                          <p className="text-xs text-content-secondary dark:text-shell-muted leading-relaxed line-clamp-2 mb-2">
                            {rec.explanation}
                          </p>

                          {/* Category Breakdown */}
                          {rec.categoryImpacts.length > 0 && (
                            <details className="group">
                              <summary className="cursor-pointer text-body-sm font-medium text-accent hover:text-accent-hover flex items-center py-2">
                                <span>View Category Breakdown</span>
                                <ChevronDown className="w-4 h-4 ml-1 transform group-open:rotate-180 transition-transform" />
                              </summary>
                              {renderCategoryImpactTable(rec.categoryImpacts)}
                            </details>
                          )}

                          {/* Legality Issues */}
                          {!rec.isLegal &&
                            rec.legalityIssues &&
                            rec.legalityIssues.length > 0 &&
                            renderLegalityWarning(rec.legalityIssues)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </CardContent>
          ) : (
            <CardContent className="py-8">
              <ErrorAlert
                variant="info"
                message="No waiver recommendations available. Upload FanGraphs projections to generate personalized recommendations."
                action={{ label: "Upload Projections", href: "/admin" }}
              />
            </CardContent>
          )}
        </Card>
      ) : (
        /* Manual Evaluation Mode */
        <div className="space-y-6">
          {/* Free Agents and Roster Picker */}
          <Card>
            <CardHeader>
              <Heading level={3}>Select Add/Drop</Heading>
            </CardHeader>
            <CardContent>
              {freeAgentsLoading || rosterLoading ? (
                <LoadingSkeleton lines={2} />
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Free Agents Column */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-body-sm font-medium text-content dark:text-shell-text">
                        Add from Waiver Wire
                      </label>
                      <div className="flex gap-2">
                        <select
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value)}
                          className="text-data border border-neutral-200 dark:border-shell-border rounded px-2 py-1 text-content dark:text-shell-text dark:bg-shell-bg"
                        >
                          <option value="pct_owned">% Rostered</option>
                          <option value="name">Name A-Z</option>
                        </select>
                        <select
                          multiple
                          value={positionFilter}
                          onChange={(e) => {
                            const selected = Array.from(
                              e.target.selectedOptions,
                            ).map((opt) => opt.value);
                            setPositionFilter(selected);
                          }}
                          className="text-data border border-neutral-200 dark:border-shell-border rounded px-2 py-1 max-h-8 text-content dark:text-shell-text dark:bg-shell-bg"
                          size={1}
                          title="Hold Ctrl/Cmd to select multiple positions"
                        >
                          <option value="">All Positions</option>
                          {["C", "1B", "2B", "3B", "SS", "OF", "DH", "SP", "RP"].map(
                            (pos) => (
                              <option key={pos} value={pos}>
                                {pos}
                              </option>
                            ),
                          )}
                        </select>
                      </div>
                    </div>
                    {positionFilter.length > 0 && (
                      <div className="text-data text-content-secondary mb-2">
                        Filtering: {positionFilter.join(", ")}
                        <button
                          onClick={() => setPositionFilter([])}
                          className="ml-2 text-accent hover:text-accent-hover"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                    <div className="border border-neutral-200 dark:border-shell-border bg-white dark:bg-shell-panel rounded-lg max-h-96 overflow-y-auto">
                      {freeAgentsData?.freeAgents &&
                      freeAgentsData.freeAgents.length > 0 ? (
                        <div className="divide-y divide-neutral-100 dark:divide-shell-border">
                          {freeAgentsData.freeAgents.map((player) => (
                            <label
                              key={player.playerId}
                              className="flex items-center cursor-pointer"
                            >
                              <div className="pl-3">
                                <input
                                  type="radio"
                                  name="freeAgent"
                                  value={player.playerId}
                                  checked={
                                    selectedFreeAgentId === player.playerId
                                  }
                                  onChange={() =>
                                    setSelectedFreeAgentId(player.playerId)
                                  }
                                  className="h-4 w-4 text-positive focus:ring-positive"
                                />
                              </div>
                              <div className="flex-1">
                                <PlayerRow
                                  player={{
                                    id: player.playerId,
                                    name: player.playerName,
                                    position: player.positions.join(", "),
                                    team: player.mlbTeam,
                                  }}
                                  variant="add"
                                  selected={
                                    selectedFreeAgentId === player.playerId
                                  }
                                  actions={
                                    <span className="text-data font-semibold text-accent">
                                      {player.pctOwned.toFixed(1)}%
                                    </span>
                                  }
                                />
                                <div className="px-3 pb-2">
                                  <PlayerStatLine
                                    components={player.projections}
                                    label="Proj RoS"
                                    positions={player.positions}
                                  />
                                  <PlayerStatLine
                                    components={player.currentStats}
                                    label="YTD"
                                    positions={player.positions}
                                  />
                                </div>
                              </div>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <div className="p-6 text-center text-body-sm text-content-secondary">
                          No free agents available
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Roster Column */}
                  <div>
                    <label className="block text-body-sm font-medium text-content mb-3">
                      Drop from Your Roster
                    </label>
                    <div className="border border-neutral-200 dark:border-shell-border bg-white dark:bg-shell-panel rounded-lg max-h-96 overflow-y-auto">
                      {rosterData?.roster && rosterData.roster.length > 0 ? (
                        <div className="divide-y divide-neutral-100 dark:divide-shell-border">
                          {rosterData.roster.map((player) => (
                            <label
                              key={player.playerId}
                              className="flex items-center cursor-pointer"
                            >
                              <div className="pl-3">
                                <input
                                  type="radio"
                                  name="rosterPlayer"
                                  value={player.playerId}
                                  checked={
                                    selectedRosterPlayerId === player.playerId
                                  }
                                  onChange={() =>
                                    setSelectedRosterPlayerId(player.playerId)
                                  }
                                  className="h-4 w-4 text-negative focus:ring-negative"
                                />
                              </div>
                              <div className="flex-1">
                                <PlayerRow
                                  player={{
                                    id: player.playerId,
                                    name: player.playerName,
                                    position: player.positions.join(", "),
                                    team: player.mlbTeam,
                                    rosterSlot: player.rosterSlot,
                                  }}
                                  variant="drop"
                                  selected={
                                    selectedRosterPlayerId === player.playerId
                                  }
                                />
                                <div className="px-3 pb-2">
                                  <PlayerStatLine
                                    components={player.projections}
                                    label="Proj RoS"
                                    positions={player.positions}
                                  />
                                  <PlayerStatLine
                                    components={player.currentStats}
                                    label="YTD"
                                    positions={player.positions}
                                  />
                                </div>
                              </div>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <div className="p-6 text-center text-body-sm text-content-secondary">
                          No roster players available
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Evaluate Button */}
              <div className="mt-6 flex justify-center">
                <Button
                  variant="primary"
                  onClick={handleEvaluate}
                  disabled={
                    !selectedFreeAgentId ||
                    !selectedRosterPlayerId ||
                    isEvaluating
                  }
                >
                  {isEvaluating ? "Evaluating..." : "Evaluate Impact"}
                </Button>
              </div>
              {evaluationError && (
                <ErrorAlert
                  message={evaluationError}
                  variant="error"
                  onRetry={() => { setEvaluationError(null); handleEvaluate(); }}
                />
              )}
            </CardContent>
          </Card>

          {/* Evaluation Results */}
          {evaluationResult && (
            <Card>
              <CardHeader>
                <Heading level={3}>Evaluation Result</Heading>
              </CardHeader>
              <CardContent>
                {renderSwapVisualization(
                  evaluationResult.dropPlayer.name,
                  evaluationResult.addPlayer.name,
                  evaluationResult.dropPlayer.positions,
                  evaluationResult.addPlayer.positions,
                )}

                {/* Impact Summary */}
                <div className="mb-4">
                  <div className="text-body-sm font-medium text-content-secondary mb-1">
                    Projected Impact
                  </div>
                  <div
                    className={cn(
                      "text-3xl font-bold font-mono",
                      evaluationResult.deltaOverallPoints > 0
                        ? "text-positive"
                        : evaluationResult.deltaOverallPoints < 0
                          ? "text-negative"
                          : "text-content-secondary",
                    )}
                  >
                    {evaluationResult.deltaOverallPoints > 0 ? "+" : ""}
                    {evaluationResult.deltaOverallPoints.toFixed(1)} pts
                  </div>
                </div>

                {/* Explanation */}
                <p className="text-body-sm text-content-secondary mb-4 leading-relaxed">
                  {evaluationResult.explanation}
                </p>

                {/* Category Breakdown */}
                {evaluationResult.categoryImpacts.length > 0 && (
                  <details className="group" open>
                    <summary className="cursor-pointer text-body-sm font-medium text-accent hover:text-accent-hover flex items-center py-2">
                      <span>Category Breakdown</span>
                      <ChevronDown className="w-4 h-4 ml-1 transform group-open:rotate-180 transition-transform" />
                    </summary>
                    {renderCategoryImpactTable(
                      evaluationResult.categoryImpacts,
                    )}
                  </details>
                )}

                {/* Legality Issues */}
                {!evaluationResult.isLegal &&
                  evaluationResult.legalityIssues &&
                  evaluationResult.legalityIssues.length > 0 &&
                  renderLegalityWarning(evaluationResult.legalityIssues)}

                {/* ESPN Link */}
                {espnLeagueId && season && (
                  <div className="mt-4">
                    <a
                      href={getESPNFreeAgentsUrl(espnLeagueId, season)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-4 py-2 bg-positive text-white rounded-lg hover:bg-emerald-700 font-medium text-body-sm gap-2"
                    >
                      View on ESPN
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </Container>
  );
}
