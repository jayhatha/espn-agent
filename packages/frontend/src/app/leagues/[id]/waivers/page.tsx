"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingSpinner, LoadingSkeleton } from "@/components/ui/LoadingSpinner";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { PlayerRow } from "@/components/league/PlayerRow";

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
      className={`font-semibold ${
        value > 0
          ? "text-green-600"
          : value < 0
            ? "text-red-600"
            : "text-gray-500"
      }`}
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
    <div className="mt-3 border-t border-gray-200 pt-3 overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead>
          <tr>
            <th className="px-2 sm:px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
              Category
            </th>
            <th className="px-2 sm:px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
              Rank Change
            </th>
            <th className="px-2 sm:px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
              Points
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {impacts
            .filter((impact) => impact.deltaPoints !== 0)
            .sort(
              (a, b) => Math.abs(b.deltaPoints) - Math.abs(a.deltaPoints),
            )
            .map((impact) => (
              <tr key={impact.categoryId}>
                <td className="px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium text-gray-900 whitespace-nowrap">
                  {impact.categoryName}
                </td>
                <td className="px-2 sm:px-3 py-2 text-xs sm:text-sm text-center whitespace-nowrap">
                  {renderDeltaValue(impact.deltaRank)}
                </td>
                <td className="px-2 sm:px-3 py-2 text-xs sm:text-sm text-right whitespace-nowrap">
                  {renderDeltaValue(impact.deltaPoints, "")}
                  {impact.deltaPoints !== 0 && (
                    <span className={impact.deltaPoints > 0 ? "text-green-600" : "text-red-600"}>
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
    <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
      <div className="flex">
        <svg
          className="h-5 w-5 text-yellow-400 flex-shrink-0"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
        <div className="ml-3 flex-1">
          <h4 className="text-sm font-medium text-yellow-800">
            Roster Constraints
          </h4>
          <ul className="mt-1 text-xs sm:text-sm text-yellow-700 list-disc list-inside space-y-1">
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
      <div className="bg-red-50 border-2 border-red-200 rounded-lg p-3 sm:p-4">
        <div className="flex items-center mb-2">
          <span className="text-red-600 font-semibold text-xs uppercase tracking-wide">
            Drop
          </span>
        </div>
        <div className="text-base sm:text-lg font-bold text-gray-900 truncate">
          {dropName}
        </div>
        {dropPositions && (
          <div className="text-xs text-gray-500 mt-1">
            {dropPositions.join(", ")}
          </div>
        )}
      </div>

      {/* Arrow */}
      <div className="flex items-center justify-center sm:px-2">
        <svg
          className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400 rotate-90 sm:rotate-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M14 5l7 7m0 0l-7 7m7-7H3"
          />
        </svg>
      </div>

      {/* Add Player */}
      <div className="bg-green-50 border-2 border-green-200 rounded-lg p-3 sm:p-4">
        <div className="flex items-center mb-2">
          <span className="text-green-600 font-semibold text-xs uppercase tracking-wide">
            Add
          </span>
        </div>
        <div className="text-base sm:text-lg font-bold text-gray-900 truncate">
          {addName}
        </div>
        {addPositions && (
          <div className="text-xs text-gray-500 mt-1">
            {addPositions.join(", ")}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
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
          <div className="inline-flex rounded-lg border border-gray-300 bg-white p-1">
            <button
              onClick={() => setViewMode("ai")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                viewMode === "ai"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              AI Recommendations
            </button>
            <button
              onClick={() => setViewMode("manual")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                viewMode === "manual"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              Manual Evaluation
            </button>
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
        <div className="bg-white shadow-lg rounded-xl border border-gray-200">
          {aiLoading ? (
            <div className="p-4 sm:p-6">
              <LoadingSkeleton lines={3} />
            </div>
          ) : aiError ? (
            <div className="p-4 sm:p-6">
              <ErrorAlert message={(aiError as Error).message} />
            </div>
          ) : aiData && aiData.recommendations.length > 0 ? (
            <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
              {aiData.recommendations.map((rec, idx) => (
                <div
                  key={`${rec.addPlayerId}-${rec.dropPlayerId}`}
                  className="bg-gradient-to-br from-white to-gray-50 border border-gray-200 rounded-xl p-4 sm:p-6 hover:shadow-lg transition-all"
                >
                  {/* Header with Rank and Delta */}
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                    <div className="flex items-center space-x-3 sm:space-x-4">
                      <span className="flex-shrink-0 inline-flex items-center justify-center h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 text-white font-bold text-base sm:text-lg shadow-md">
                        #{idx + 1}
                      </span>

                      {/* Overall Impact */}
                      <div>
                        <div className="text-xs sm:text-sm font-medium text-gray-500">
                          Projected Gain
                        </div>
                        <div className="text-xl sm:text-2xl font-bold text-green-600">
                          {rec.deltaOverallPoints > 0 ? "+" : ""}
                          {rec.deltaOverallPoints.toFixed(1)} pts
                        </div>
                      </div>
                    </div>

                    <button
                      className="w-full sm:w-auto px-4 py-2 sm:py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                      disabled
                      title="Waiver claim execution coming soon"
                    >
                      Add to Queue
                    </button>
                  </div>

                  {/* Swap Visualization */}
                  {renderSwapVisualization(
                    rec.dropPlayerName,
                    rec.addPlayerName,
                  )}

                  {/* Explanation */}
                  <p className="text-xs sm:text-sm text-gray-600 mb-3 leading-relaxed">
                    {rec.explanation}
                  </p>

                  {/* Category Breakdown */}
                  {rec.categoryImpacts.length > 0 && (
                    <details className="group">
                      <summary className="cursor-pointer text-xs sm:text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center py-2">
                        <span>View Category Breakdown</span>
                        <svg
                          className="w-4 h-4 ml-1 transform group-open:rotate-180 transition-transform"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
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
            </div>
          ) : (
            <div className="p-8 sm:p-12 text-center">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 sm:w-10 sm:h-10 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">
                No Waiver Recommendations Available
              </h3>
              <div className="text-xs sm:text-sm text-gray-500 space-y-2 mb-6">
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
                  className="inline-flex items-center justify-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700"
                >
                  Refresh League Data
                </Link>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Manual Evaluation Mode */
        <div className="space-y-6">
          {/* Free Agents and Roster Picker */}
          <div className="bg-white shadow-lg rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Select Add/Drop
            </h2>

            {freeAgentsLoading || rosterLoading ? (
              <LoadingSkeleton lines={2} />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Free Agents Column */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium text-gray-700">
                      Add from Waiver Wire
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="text-xs border border-gray-300 rounded px-2 py-1"
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
                        className="text-xs border border-gray-300 rounded px-2 py-1 max-h-8"
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
                    <div className="text-xs text-gray-600 mb-2">
                      Filtering: {positionFilter.join(", ")}
                      <button
                        onClick={() => setPositionFilter([])}
                        className="ml-2 text-blue-600 hover:text-blue-800"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                  <div className="border border-gray-300 rounded-lg max-h-96 overflow-y-auto">
                    {freeAgentsData?.freeAgents &&
                    freeAgentsData.freeAgents.length > 0 ? (
                      <div className="divide-y divide-gray-200">
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
                                className="h-4 w-4 text-green-600 focus:ring-green-500"
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
                                  <span className="text-xs font-semibold text-blue-600">
                                    {player.pctOwned.toFixed(1)}%
                                  </span>
                                }
                              />
                            </div>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div className="p-6 text-center text-sm text-gray-500">
                        No free agents available
                      </div>
                    )}
                  </div>
                </div>

                {/* Roster Column */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Drop from Your Roster
                  </label>
                  <div className="border border-gray-300 rounded-lg max-h-96 overflow-y-auto">
                    {rosterData?.roster && rosterData.roster.length > 0 ? (
                      <div className="divide-y divide-gray-200">
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
                                className="h-4 w-4 text-red-600 focus:ring-red-500"
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
                      <div className="p-6 text-center text-sm text-gray-500">
                        No roster players available
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Evaluate Button */}
            <div className="mt-6 flex justify-center">
              <button
                onClick={handleEvaluate}
                disabled={
                  !selectedFreeAgentId ||
                  !selectedRosterPlayerId ||
                  isEvaluating
                }
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all"
              >
                {isEvaluating ? "Evaluating..." : "Evaluate Impact"}
              </button>
            </div>
          </div>

          {/* Evaluation Results */}
          {evaluationResult && (
            <div className="bg-white shadow-lg rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Evaluation Result
              </h2>

              {renderSwapVisualization(
                evaluationResult.dropPlayer.name,
                evaluationResult.addPlayer.name,
                evaluationResult.dropPlayer.positions,
                evaluationResult.addPlayer.positions,
              )}

              {/* Impact Summary */}
              <div className="mb-4">
                <div className="text-sm font-medium text-gray-500 mb-1">
                  Projected Impact
                </div>
                <div
                  className={`text-3xl font-bold ${
                    evaluationResult.deltaOverallPoints > 0
                      ? "text-green-600"
                      : evaluationResult.deltaOverallPoints < 0
                        ? "text-red-600"
                        : "text-gray-600"
                  }`}
                >
                  {evaluationResult.deltaOverallPoints > 0 ? "+" : ""}
                  {evaluationResult.deltaOverallPoints.toFixed(1)} pts
                </div>
              </div>

              {/* Explanation */}
              <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                {evaluationResult.explanation}
              </p>

              {/* Category Breakdown */}
              {evaluationResult.categoryImpacts.length > 0 && (
                <details className="group" open>
                  <summary className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center py-2">
                    <span>Category Breakdown</span>
                    <svg
                      className="w-4 h-4 ml-1 transform group-open:rotate-180 transition-transform"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
