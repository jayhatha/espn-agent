"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import { ArrowRight, ExternalLink, FileText, AlertTriangle, ChevronDown } from "lucide-react";
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
import { getESPNFreeAgentsUrl } from "@/lib/espn-links";
import { cn } from "@/lib/cn";

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
  const [sortBy, setSortBy] = useState<string>("pct_owned");
  const [positionFilter, setPositionFilter] = useState<string[]>([]);

  // Load selected team from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(`league_${leagueId}_team`);
    if (stored) {
      setSelectedTeamId(parseInt(stored, 10));
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
      alert("Failed to evaluate add/drop. Please try again.");
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

  const renderCategoryImpactTable = (
    impacts: Array<{
      categoryId: string;
      categoryName: string;
      deltaRank: number;
      deltaPoints: number;
    }>,
  ) => (
    <div className="mt-3 border-t border-neutral-200 pt-3 overflow-x-auto">
      <table className="min-w-full divide-y divide-neutral-200">
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
        <tbody className="divide-y divide-neutral-200">
          {impacts
            .filter((impact) => impact.deltaPoints !== 0)
            .sort(
              (a, b) => Math.abs(b.deltaPoints) - Math.abs(a.deltaPoints),
            )
            .map((impact) => (
              <tr key={impact.categoryId}>
                <td className="px-2 sm:px-3 py-2 text-data font-medium text-content whitespace-nowrap">
                  {impact.categoryName}
                </td>
                <td className="px-2 sm:px-3 py-2 text-data text-center whitespace-nowrap">
                  {renderDeltaValue(impact.deltaRank)}
                </td>
                <td className="px-2 sm:px-3 py-2 text-data text-right whitespace-nowrap">
                  {impact.deltaPoints !== 0 && (
                    <span className={cn("font-semibold text-data", impact.deltaPoints > 0 ? "text-positive" : "text-negative")}>
                      {impact.deltaPoints > 0 ? "+" : ""}{impact.deltaPoints.toFixed(1)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );

  const renderLegalityWarning = (issues: string[]) => (
    <div className="mt-3 bg-warning-light border border-warning-border rounded-lg p-3">
      <div className="flex">
        <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
        <div className="ml-3 flex-1">
          <h4 className="text-body-sm font-medium text-warning">
            Roster Constraints
          </h4>
          <ul className="mt-1 text-data text-warning list-disc list-inside space-y-1">
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
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 sm:gap-4 mb-4">
      {/* Drop Player */}
      <div className="bg-negative-light border-2 border-negative-border rounded-lg p-3 sm:p-4">
        <div className="flex items-center mb-2">
          <span className="text-negative font-semibold text-data uppercase tracking-wide">
            Drop
          </span>
        </div>
        <div className="text-base sm:text-lg font-bold text-content truncate">
          {dropName}
        </div>
        {dropPositions && (
          <div className="text-data text-content-secondary mt-1">
            {dropPositions.join(", ")}
          </div>
        )}
      </div>

      {/* Arrow */}
      <div className="flex items-center justify-center sm:px-2">
        <ArrowRight className="w-6 h-6 sm:w-8 sm:h-8 text-content-tertiary rotate-90 sm:rotate-0" />
      </div>

      {/* Add Player */}
      <div className="bg-positive-light border-2 border-positive-border rounded-lg p-3 sm:p-4">
        <div className="flex items-center mb-2">
          <span className="text-positive font-semibold text-data uppercase tracking-wide">
            Add
          </span>
        </div>
        <div className="text-base sm:text-lg font-bold text-content truncate">
          {addName}
        </div>
        {addPositions && (
          <div className="text-data text-content-secondary mt-1">
            {addPositions.join(", ")}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Container size="wide" className="py-6 sm:py-8">
      <PageHeader
        title="Waiver Wire"
        subtitle={
          viewMode === "ai"
            ? "AI-generated add/drop moves that could maximize your roto points."
            : "Manually evaluate the impact of any add/drop move."
        }
        backLink={{ href: `/leagues/${leagueId}`, label: "Back to League" }}
      />

      {/* Mode Switcher */}
      {selectedTeamId && (
        <div className="mb-6">
          <div className="inline-flex rounded-lg border border-neutral-200 bg-white p-1">
            <Button
              variant={viewMode === "ai" ? "primary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("ai")}
            >
              AI Recommendations
            </Button>
            <Button
              variant={viewMode === "manual" ? "primary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("manual")}
            >
              Manual Evaluation
            </Button>
          </div>
        </div>
      )}

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
            <CardContent className="space-y-4 sm:space-y-6">
              {aiData.recommendations.map((rec, idx) => (
                <div
                  key={`${rec.addPlayerId}-${rec.dropPlayerId}`}
                  className="border border-neutral-200 rounded-lg p-4 sm:p-6 hover:shadow-card-hover transition-all"
                >
                  {/* Header with Rank and Delta */}
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                    <div className="flex items-center space-x-3 sm:space-x-4">
                      <span className="flex-shrink-0 inline-flex items-center justify-center h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-accent text-content-inverse font-bold text-base sm:text-lg shadow-card">
                        #{idx + 1}
                      </span>

                      {/* Overall Impact */}
                      <div>
                        <div className="text-data font-medium text-content-secondary">
                          Projected Gain
                        </div>
                        <div className="text-h4 font-bold text-positive">
                          {rec.deltaOverallPoints > 0 ? "+" : ""}
                          {rec.deltaOverallPoints.toFixed(1)} pts
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled
                        title="Waiver claim execution coming soon"
                      >
                        Add to Queue
                      </Button>
                      {espnLeagueId && season && (
                        <a
                          href={getESPNFreeAgentsUrl(espnLeagueId, season)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center px-3 h-8 bg-positive text-white rounded-md hover:bg-emerald-700 font-medium text-body-sm gap-2"
                        >
                          Add on ESPN
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Swap Visualization */}
                  {renderSwapVisualization(
                    rec.dropPlayerName,
                    rec.addPlayerName,
                  )}

                  {/* Explanation */}
                  <p className="text-data text-content-secondary mb-3 leading-relaxed">
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
              ))}
            </CardContent>
          ) : (
            <CardContent className="py-12 text-center">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-surface-secondary rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 sm:w-10 sm:h-10 text-content-tertiary" />
              </div>
              <Heading level={3} className="text-base sm:text-lg mb-2">
                No Waiver Recommendations Available
              </Heading>
              <div className="text-data text-content-secondary space-y-2 mb-6">
                <p>This could mean:</p>
                <ul className="list-disc list-inside text-left inline-block space-y-1">
                  <li>No free agents are currently available</li>
                  <li>
                    All available players would hurt your team's standings
                  </li>
                  <li>
                    Projections haven't been uploaded by administrator yet
                  </li>
                  <li>A snapshot needs to be created</li>
                </ul>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href={`/leagues/${leagueId}`}
                  className="inline-flex items-center justify-center px-4 py-2 text-body-sm font-medium rounded-lg text-content-inverse bg-accent hover:bg-accent-hover"
                >
                  Refresh League Data
                </Link>
              </div>
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
                      <label className="block text-body-sm font-medium text-content">
                        Add from Waiver Wire
                      </label>
                      <div className="flex gap-2">
                        <select
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value)}
                          className="text-data border border-neutral-200 rounded px-2 py-1 text-content"
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
                          className="text-data border border-neutral-200 rounded px-2 py-1 max-h-8 text-content"
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
                    <div className="border border-neutral-200 rounded-lg max-h-96 overflow-y-auto">
                      {freeAgentsData?.freeAgents &&
                      freeAgentsData.freeAgents.length > 0 ? (
                        <div className="divide-y divide-neutral-100">
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
                    <div className="border border-neutral-200 rounded-lg max-h-96 overflow-y-auto">
                      {rosterData?.roster && rosterData.roster.length > 0 ? (
                        <div className="divide-y divide-neutral-100">
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
                      "text-3xl font-bold",
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
