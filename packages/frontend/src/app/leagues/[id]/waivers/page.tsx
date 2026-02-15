"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";

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
  const [selectedFreeAgentId, setSelectedFreeAgentId] = useState<number | null>(null);
  const [selectedRosterPlayerId, setSelectedRosterPlayerId] = useState<number | null>(null);
  const [evaluationResult, setEvaluationResult] = useState<EvaluationResult | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);

  // Load selected team from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(`league_${leagueId}_team`);
    if (stored) {
      setSelectedTeamId(parseInt(stored, 10));
    }
  }, [leagueId]);

  // AI Recommendations query
  const { data: aiData, isLoading: aiLoading, error: aiError } = useQuery({
    queryKey: ["waivers", leagueId, selectedTeamId],
    queryFn: async () => {
      if (!selectedTeamId) {
        throw new Error("No team selected");
      }

      const response = await fetch(
        `http://localhost:3001/api/leagues/${leagueId}/teams/${selectedTeamId}/waivers/recommendations`,
      );

      if (!response.ok) {
        throw new Error("Failed to fetch waiver recommendations");
      }

      return response.json() as Promise<{
        recommendations: WaiverRecommendation[];
        snapshotDate: string;
      }>;
    },
    enabled: !!selectedTeamId && viewMode === "ai",
  });

  // Free agents query
  const { data: freeAgentsData, isLoading: freeAgentsLoading } = useQuery({
    queryKey: ["free-agents", leagueId],
    queryFn: async () => {
      const response = await fetch(
        `http://localhost:3001/api/leagues/${leagueId}/free-agents`,
      );

      if (!response.ok) {
        throw new Error("Failed to fetch free agents");
      }

      return response.json() as Promise<{
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

      const response = await fetch(
        `http://localhost:3001/api/leagues/${leagueId}/teams/${selectedTeamId}/roster`,
      );

      if (!response.ok) {
        throw new Error("Failed to fetch roster");
      }

      return response.json() as Promise<{
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
      const response = await fetch(
        `http://localhost:3001/api/leagues/${leagueId}/teams/${selectedTeamId}/waivers/evaluate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            addPlayerId: selectedFreeAgentId,
            dropPlayerId: selectedRosterPlayerId,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to evaluate add/drop");
      }

      const result = await response.json() as EvaluationResult;
      setEvaluationResult(result);
    } catch (error) {
      console.error("Evaluation error:", error);
      alert("Failed to evaluate add/drop. Please try again.");
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <div className="mb-4 sm:mb-6">
        <Link
          href={`/leagues/${leagueId}`}
          className="inline-flex items-center text-blue-600 hover:text-blue-700 text-sm font-medium"
        >
          <svg
            className="w-4 h-4 mr-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to League
        </Link>
      </div>

      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
          Waiver Wire
        </h1>
        <p className="text-sm sm:text-base text-gray-600">
          {viewMode === "ai"
            ? "AI-generated add/drop moves that could maximize your roto points."
            : "Manually evaluate the impact of any add/drop move."}
        </p>
      </div>

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
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 sm:p-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-yellow-400"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-yellow-800">
                Team Selection Required
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>
                  Please{" "}
                  <Link
                    href={`/leagues/${leagueId}`}
                    className="font-medium underline hover:text-yellow-600"
                  >
                    go back to the league page
                  </Link>{" "}
                  and select your team to view waiver recommendations.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : viewMode === "ai" ? (
        <div className="bg-white shadow-lg rounded-xl border border-gray-200">
          {aiLoading ? (
            <div className="p-4 sm:p-6">
              <div className="animate-pulse space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-32 sm:h-40 bg-gray-200 rounded-lg"></div>
                ))}
              </div>
            </div>
          ) : aiError ? (
            <div className="p-4 sm:p-6">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 className="text-red-800 font-medium">
                  Error loading recommendations
                </h3>
                <p className="text-red-600 text-sm mt-1">
                  {(aiError as Error).message}
                </p>
              </div>
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

                    {/* Action button (future) */}
                    <button
                      className="w-full sm:w-auto px-4 py-2 sm:py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                      disabled
                      title="Waiver claim execution coming soon"
                    >
                      Add to Queue
                    </button>
                  </div>

                  {/* Swap Visualization */}
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 sm:gap-4 mb-4">
                    {/* Drop Player */}
                    <div className="bg-red-50 border-2 border-red-200 rounded-lg p-3 sm:p-4">
                      <div className="flex items-center mb-2">
                        <span className="text-red-600 font-semibold text-xs uppercase tracking-wide">
                          Drop
                        </span>
                      </div>
                      <div className="text-base sm:text-lg font-bold text-gray-900 truncate">
                        {rec.dropPlayerName}
                      </div>
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
                        {rec.addPlayerName}
                      </div>
                    </div>
                  </div>

                  {/* Explanation */}
                  <p className="text-xs sm:text-sm text-gray-600 mb-3 leading-relaxed">
                    {rec.explanation}
                  </p>

                  {/* Category Breakdown - Expandable */}
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

                      <div className="mt-3 border-t border-gray-200 pt-3 overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead>
                            <tr>
                              <th className="px-2 sm:px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                Category
                              </th>
                              <th className="px-2 sm:px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                                Rank Δ
                              </th>
                              <th className="px-2 sm:px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                                Points
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {rec.categoryImpacts
                              .filter((impact) => impact.deltaPoints !== 0)
                              .sort(
                                (a, b) =>
                                  Math.abs(b.deltaPoints) -
                                  Math.abs(a.deltaPoints),
                              )
                              .map((impact) => (
                                <tr key={impact.categoryId}>
                                  <td className="px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium text-gray-900 whitespace-nowrap">
                                    {impact.categoryName}
                                  </td>
                                  <td className="px-2 sm:px-3 py-2 text-xs sm:text-sm text-center whitespace-nowrap">
                                    <span
                                      className={
                                        impact.deltaRank < 0
                                          ? "text-green-600 font-semibold"
                                          : impact.deltaRank > 0
                                          ? "text-red-600 font-semibold"
                                          : "text-gray-500"
                                      }
                                    >
                                      {impact.deltaRank === 0
                                        ? "—"
                                        : `${impact.deltaRank > 0 ? "+" : ""}${impact.deltaRank}`}
                                    </span>
                                  </td>
                                  <td className="px-2 sm:px-3 py-2 text-xs sm:text-sm text-right whitespace-nowrap">
                                    <span
                                      className={
                                        impact.deltaPoints > 0
                                          ? "text-green-600 font-semibold"
                                          : impact.deltaPoints < 0
                                          ? "text-red-600 font-semibold"
                                          : "text-gray-500"
                                      }
                                    >
                                      {impact.deltaPoints > 0 ? "+" : ""}
                                      {impact.deltaPoints.toFixed(1)}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  )}

                  {/* Legality Issues (if any) */}
                  {!rec.isLegal &&
                    rec.legalityIssues &&
                    rec.legalityIssues.length > 0 && (
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
                              {rec.legalityIssues.map((issue, i) => (
                                <li key={i}>{issue}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}
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
                  <li>Projections haven't been uploaded yet</li>
                  <li>A snapshot needs to be created</li>
                </ul>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href={`/leagues/${leagueId}/projections`}
                  className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50"
                >
                  Upload Projections
                </Link>
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
              <div className="animate-pulse space-y-4">
                <div className="h-48 bg-gray-200 rounded-lg"></div>
                <div className="h-48 bg-gray-200 rounded-lg"></div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Free Agents Column */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Add from Waiver Wire
                  </label>
                  <div className="border border-gray-300 rounded-lg max-h-96 overflow-y-auto">
                    {freeAgentsData?.freeAgents && freeAgentsData.freeAgents.length > 0 ? (
                      <div className="divide-y divide-gray-200">
                        {freeAgentsData.freeAgents.map((player) => (
                          <label
                            key={player.playerId}
                            className={`flex items-center p-3 cursor-pointer hover:bg-green-50 transition-colors ${
                              selectedFreeAgentId === player.playerId
                                ? "bg-green-100 border-l-4 border-green-600"
                                : ""
                            }`}
                          >
                            <input
                              type="radio"
                              name="freeAgent"
                              value={player.playerId}
                              checked={selectedFreeAgentId === player.playerId}
                              onChange={() => setSelectedFreeAgentId(player.playerId)}
                              className="h-4 w-4 text-green-600 focus:ring-green-500"
                            />
                            <div className="ml-3 flex-1">
                              <div className="text-sm font-medium text-gray-900">
                                {player.playerName}
                              </div>
                              <div className="text-xs text-gray-500">
                                {player.positions.join(", ")}
                                {player.mlbTeam && ` • ${player.mlbTeam}`}
                              </div>
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
                            className={`flex items-center p-3 cursor-pointer hover:bg-red-50 transition-colors ${
                              selectedRosterPlayerId === player.playerId
                                ? "bg-red-100 border-l-4 border-red-600"
                                : ""
                            }`}
                          >
                            <input
                              type="radio"
                              name="rosterPlayer"
                              value={player.playerId}
                              checked={selectedRosterPlayerId === player.playerId}
                              onChange={() => setSelectedRosterPlayerId(player.playerId)}
                              className="h-4 w-4 text-red-600 focus:ring-red-500"
                            />
                            <div className="ml-3 flex-1">
                              <div className="text-sm font-medium text-gray-900">
                                {player.playerName}
                              </div>
                              <div className="text-xs text-gray-500">
                                {player.positions.join(", ")}
                                {player.mlbTeam && ` • ${player.mlbTeam}`}
                                {player.rosterSlot && ` • ${player.rosterSlot}`}
                              </div>
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

              {/* Swap Visualization */}
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 sm:gap-4 mb-4">
                {/* Drop Player */}
                <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
                  <div className="flex items-center mb-2">
                    <span className="text-red-600 font-semibold text-xs uppercase tracking-wide">
                      Drop
                    </span>
                  </div>
                  <div className="text-lg font-bold text-gray-900">
                    {evaluationResult.dropPlayer.name}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {evaluationResult.dropPlayer.positions.join(", ")}
                  </div>
                </div>

                {/* Arrow */}
                <div className="flex items-center justify-center sm:px-2">
                  <svg
                    className="w-8 h-8 text-gray-400 rotate-90 sm:rotate-0"
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
                <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
                  <div className="flex items-center mb-2">
                    <span className="text-green-600 font-semibold text-xs uppercase tracking-wide">
                      Add
                    </span>
                  </div>
                  <div className="text-lg font-bold text-gray-900">
                    {evaluationResult.addPlayer.name}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {evaluationResult.addPlayer.positions.join(", ")}
                  </div>
                </div>
              </div>

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

                  <div className="mt-3 border-t border-gray-200 pt-3 overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead>
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Category
                          </th>
                          <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                            Rank Δ
                          </th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                            Points
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {evaluationResult.categoryImpacts
                          .filter((impact) => impact.deltaPoints !== 0)
                          .sort(
                            (a, b) =>
                              Math.abs(b.deltaPoints) - Math.abs(a.deltaPoints),
                          )
                          .map((impact) => (
                            <tr key={impact.categoryId}>
                              <td className="px-3 py-2 text-sm font-medium text-gray-900 whitespace-nowrap">
                                {impact.categoryName}
                              </td>
                              <td className="px-3 py-2 text-sm text-center whitespace-nowrap">
                                <span
                                  className={
                                    impact.deltaRank < 0
                                      ? "text-green-600 font-semibold"
                                      : impact.deltaRank > 0
                                      ? "text-red-600 font-semibold"
                                      : "text-gray-500"
                                  }
                                >
                                  {impact.deltaRank === 0
                                    ? "—"
                                    : `${impact.deltaRank > 0 ? "+" : ""}${impact.deltaRank}`}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-sm text-right whitespace-nowrap">
                                <span
                                  className={
                                    impact.deltaPoints > 0
                                      ? "text-green-600 font-semibold"
                                      : impact.deltaPoints < 0
                                      ? "text-red-600 font-semibold"
                                      : "text-gray-500"
                                  }
                                >
                                  {impact.deltaPoints > 0 ? "+" : ""}
                                  {impact.deltaPoints.toFixed(1)}
                                </span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}

              {/* Legality Issues */}
              {!evaluationResult.isLegal &&
                evaluationResult.legalityIssues &&
                evaluationResult.legalityIssues.length > 0 && (
                  <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
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
                        <ul className="mt-1 text-sm text-yellow-700 list-disc list-inside space-y-1">
                          {evaluationResult.legalityIssues.map((issue, i) => (
                            <li key={i}>{issue}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
