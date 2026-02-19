"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";

interface Category {
  category_id: string;
  name: string;
  stat_key: string;
  type: string;
  direction: string;
}

interface CategoryStanding {
  league_id: number;
  snapshot_date: string;
  team_id: number;
  category_id: string;
  projected_value: number;
  projected_rank: number;
  projected_roto_points: number | null;
  teamName: string;
}

interface CurrentCategoryStanding {
  league_id: number;
  snapshot_date: string;
  team_id: number;
  category_id: string;
  value: number;
  rank: number;
  roto_points: number;
  teamName: string;
}

interface OverallStanding {
  league_id: number;
  snapshot_date: string;
  team_id: number;
  projected_overall_points: number;
  projected_overall_rank: number;
  teamName: string;
}

interface CurrentOverallStanding {
  league_id: number;
  snapshot_date: string;
  team_id: number;
  overall_points: number;
  overall_rank: number;
  teamName: string;
}

interface StandingsData {
  snapshotDate: string;
  categories: Category[];
  categoryStandings: CategoryStanding[];
  overallStandings: OverallStanding[];
  currentCategoryStandings: CurrentCategoryStanding[];
  currentOverallStandings: CurrentOverallStanding[];
}

type ViewMode = "current" | "projected";

export default function StandingsPage() {
  const params = useParams();
  const leagueId = params.id as string;
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("current");

  useEffect(() => {
    const stored = localStorage.getItem(`league_${leagueId}_team`);
    if (stored) {
      setSelectedTeamId(parseInt(stored, 10));
    }
  }, [leagueId]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["standings", leagueId],
    queryFn: async () => {
      return api.getProjectedStandings(parseInt(leagueId, 10)) as Promise<StandingsData>;
    },
  });

  const buildCurrentMatrix = () => {
    if (!data) return null;
    const { categories, currentCategoryStandings, currentOverallStandings } = data;
    if (!currentOverallStandings || currentOverallStandings.length === 0) return null;
    if (!currentCategoryStandings) return null;

    const teamCategoryMap = new Map<number, Map<string, CurrentCategoryStanding>>();
    for (const cs of currentCategoryStandings) {
      if (!teamCategoryMap.has(cs.team_id)) {
        teamCategoryMap.set(cs.team_id, new Map());
      }
      teamCategoryMap.get(cs.team_id)!.set(cs.category_id, cs);
    }

    return { categories, overallStandings: currentOverallStandings, teamCategoryMap };
  };

  const buildProjectedMatrix = () => {
    if (!data) return null;
    const { categories, categoryStandings, overallStandings } = data;
    if (overallStandings.length === 0) return null;

    const teamCategoryMap = new Map<number, Map<string, CategoryStanding>>();
    for (const cs of categoryStandings) {
      if (!teamCategoryMap.has(cs.team_id)) {
        teamCategoryMap.set(cs.team_id, new Map());
      }
      teamCategoryMap.get(cs.team_id)!.set(cs.category_id, cs);
    }

    return { categories, overallStandings, teamCategoryMap };
  };

  const currentMatrix = data ? buildCurrentMatrix() : null;
  const projectedMatrix = data ? buildProjectedMatrix() : null;

  const formatValue = (value: number | string, category: Category) => {
    const num = Number(value);
    if (
      category.type === "RATE" ||
      category.stat_key === "AVG" ||
      category.stat_key === "OBP" ||
      category.stat_key === "SLG" ||
      category.stat_key === "OPS" ||
      category.stat_key === "ERA" ||
      category.stat_key === "WHIP"
    ) {
      return num.toFixed(3);
    }
    return Math.round(num).toString();
  };

  const getRankColor = (rank: number, total: number) => {
    const ratio = rank / total;
    if (ratio <= 0.25) return "text-green-700 bg-green-50";
    if (ratio <= 0.5) return "text-green-600 bg-green-50/50";
    if (ratio <= 0.75) return "text-yellow-700 bg-yellow-50";
    return "text-red-700 bg-red-50";
  };

  const hasCurrentData = currentMatrix !== null;
  const hasProjectedData = projectedMatrix !== null;

  return (
    <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link
          href={`/leagues/${leagueId}`}
          className="text-blue-600 hover:text-blue-700 text-sm font-medium"
        >
          &larr; Back to League
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Standings</h1>
        <p className="mt-2 text-gray-600">
          Current and projected end-of-season standings by category.
        </p>
        {data?.snapshotDate && (
          <p className="mt-1 text-sm text-gray-500">
            As of snapshot: {data.snapshotDate}
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="bg-white shadow rounded-lg p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-medium">Error loading standings</h3>
          <p className="text-red-600 text-sm mt-1">
            {(error as Error).message}
          </p>
        </div>
      ) : hasCurrentData || hasProjectedData ? (
        <>
          {/* View Mode Tabs */}
          <div className="mb-6">
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => setViewMode("current")}
                  className={`py-3 px-1 border-b-2 font-medium text-sm ${
                    viewMode === "current"
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  Current Standings
                </button>
                <button
                  onClick={() => setViewMode("projected")}
                  className={`py-3 px-1 border-b-2 font-medium text-sm ${
                    viewMode === "projected"
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  Projected Standings
                </button>
              </nav>
            </div>
          </div>

          {viewMode === "current" && currentMatrix ? (
            <>
              {/* Current Overall Standings */}
              <div className="bg-white shadow rounded-lg p-6 mb-8">
                <h2 className="text-lg font-medium text-gray-900 mb-4">
                  Current Overall Standings
                </h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Rank
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Team
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total Roto Points
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {currentMatrix.overallStandings.map((team) => {
                        const isSelected = selectedTeamId === team.team_id;
                        return (
                          <tr
                            key={team.team_id}
                            className={isSelected ? "bg-blue-50" : ""}
                          >
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                              {team.overall_rank}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                              <div className="flex items-center">
                                {isSelected && (
                                  <span className="inline-block w-2 h-2 rounded-full bg-blue-600 mr-2"></span>
                                )}
                                {team.teamName}
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-semibold text-gray-900">
                              {Number(team.overall_points)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Current Category Breakdown */}
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">
                  Current Category Breakdown
                </h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10">
                          Team
                        </th>
                        {currentMatrix.categories.map((cat) => (
                          <th
                            key={cat.category_id}
                            className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px]"
                          >
                            {cat.name || cat.stat_key}
                          </th>
                        ))}
                        <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider font-bold">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {currentMatrix.overallStandings.map((team) => {
                        const isSelected = selectedTeamId === team.team_id;
                        const teamCats = currentMatrix.teamCategoryMap.get(team.team_id);
                        const numTeams = currentMatrix.overallStandings.length;

                        return (
                          <tr
                            key={team.team_id}
                            className={isSelected ? "bg-blue-50" : ""}
                          >
                            <td className="px-3 py-3 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-inherit z-10">
                              <div className="flex items-center">
                                {isSelected && (
                                  <span className="inline-block w-2 h-2 rounded-full bg-blue-600 mr-2 flex-shrink-0"></span>
                                )}
                                <span className="truncate max-w-[150px]">
                                  {team.teamName}
                                </span>
                              </div>
                            </td>
                            {currentMatrix.categories.map((cat) => {
                              const catData = teamCats?.get(cat.category_id);
                              if (!catData) {
                                return (
                                  <td
                                    key={cat.category_id}
                                    className="px-3 py-3 text-center text-sm text-gray-400"
                                  >
                                    -
                                  </td>
                                );
                              }
                              return (
                                <td
                                  key={cat.category_id}
                                  className="px-3 py-3 text-center text-sm"
                                >
                                  <div className="flex flex-col items-center">
                                    <span className="text-gray-900 font-medium text-xs">
                                      {formatValue(catData.value, cat)}
                                    </span>
                                    <span
                                      className={`text-xs rounded px-1 mt-0.5 ${getRankColor(catData.rank, numTeams)}`}
                                    >
                                      #{catData.rank} (
                                      {Number(catData.roto_points)}pts)
                                    </span>
                                  </div>
                                </td>
                              );
                            })}
                            <td className="px-3 py-3 text-center text-sm font-bold text-gray-900">
                              {Number(team.overall_points)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : viewMode === "current" && !currentMatrix ? (
            <div className="bg-white shadow rounded-lg p-6">
              <div className="text-center py-12">
                <h3 className="text-sm font-medium text-gray-900">
                  No current standings available
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Current standings will appear after you create a snapshot.
                </p>
              </div>
            </div>
          ) : null}

          {viewMode === "projected" && projectedMatrix ? (
            <>
              {/* Projected Overall Standings */}
              <div className="bg-white shadow rounded-lg p-6 mb-8">
                <h2 className="text-lg font-medium text-gray-900 mb-4">
                  Overall Projected Standings
                </h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Rank
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Team
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total Roto Points
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {projectedMatrix.overallStandings.map((team) => {
                        const isSelected = selectedTeamId === team.team_id;
                        return (
                          <tr
                            key={team.team_id}
                            className={isSelected ? "bg-blue-50" : ""}
                          >
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                              {team.projected_overall_rank}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                              <div className="flex items-center">
                                {isSelected && (
                                  <span className="inline-block w-2 h-2 rounded-full bg-blue-600 mr-2"></span>
                                )}
                                {team.teamName}
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-semibold text-gray-900">
                              {team.projected_overall_points}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Projected Category Breakdown */}
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">
                  Projected Category Breakdown
                </h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10">
                          Team
                        </th>
                        {projectedMatrix.categories.map((cat) => (
                          <th
                            key={cat.category_id}
                            className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px]"
                          >
                            {cat.name || cat.stat_key}
                          </th>
                        ))}
                        <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider font-bold">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {projectedMatrix.overallStandings.map((team) => {
                        const isSelected = selectedTeamId === team.team_id;
                        const teamCats = projectedMatrix.teamCategoryMap.get(team.team_id);
                        const numTeams = projectedMatrix.overallStandings.length;

                        return (
                          <tr
                            key={team.team_id}
                            className={isSelected ? "bg-blue-50" : ""}
                          >
                            <td className="px-3 py-3 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-inherit z-10">
                              <div className="flex items-center">
                                {isSelected && (
                                  <span className="inline-block w-2 h-2 rounded-full bg-blue-600 mr-2 flex-shrink-0"></span>
                                )}
                                <span className="truncate max-w-[150px]">
                                  {team.teamName}
                                </span>
                              </div>
                            </td>
                            {projectedMatrix.categories.map((cat) => {
                              const catData = teamCats?.get(cat.category_id);
                              if (!catData) {
                                return (
                                  <td
                                    key={cat.category_id}
                                    className="px-3 py-3 text-center text-sm text-gray-400"
                                  >
                                    -
                                  </td>
                                );
                              }
                              return (
                                <td
                                  key={cat.category_id}
                                  className="px-3 py-3 text-center text-sm"
                                >
                                  <div className="flex flex-col items-center">
                                    <span className="text-gray-900 font-medium text-xs">
                                      {formatValue(catData.projected_value, cat)}
                                    </span>
                                    <span
                                      className={`text-xs rounded px-1 mt-0.5 ${getRankColor(catData.projected_rank, numTeams)}`}
                                    >
                                      #{catData.projected_rank} (
                                      {catData.projected_roto_points}pts)
                                    </span>
                                  </div>
                                </td>
                              );
                            })}
                            <td className="px-3 py-3 text-center text-sm font-bold text-gray-900">
                              {team.projected_overall_points}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : viewMode === "projected" && !projectedMatrix ? (
            <div className="bg-white shadow rounded-lg p-6">
              <div className="text-center py-12">
                <h3 className="text-sm font-medium text-gray-900">
                  No projected standings available
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Projected standings will appear after projections are uploaded
                  and a snapshot is created. Contact your administrator if projections
                  are needed.
                </p>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="bg-white shadow rounded-lg p-6">
          <div className="text-center py-12">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">
              No standings available
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Standings will appear after you create a snapshot.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
