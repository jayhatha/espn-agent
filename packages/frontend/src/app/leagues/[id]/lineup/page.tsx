"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingSpinner, LoadingSkeleton } from "@/components/ui/LoadingSpinner";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { TeamSelector } from "@/components/league/TeamSelector";

interface Team {
  id: number;
  name: string;
}

interface LineupRecommendation {
  slotName: string;
  benchPlayerId: number;
  benchPlayerName: string;
  benchPlayerPositions: string[];
  benchPlayerProjectedValue: number;
  starterPlayerId: number;
  starterPlayerName: string;
  starterPlayerPositions: string[];
  starterPlayerProjectedValue: number;
  projectedGain: number;
  reason: string;
}

interface LineupData {
  recommendations: LineupRecommendation[];
  totalProjectedGain: number;
  snapshotDate: string;
  isOptimal: boolean;
  generatedAt: string;
}

export default function LineupOptimizerPage() {
  const params = useParams();
  const leagueId = params.id as string;
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);

  // Fetch teams
  const {
    data: teamsData,
    isLoading: teamsLoading,
    error: teamsError,
  } = useQuery({
    queryKey: ["league-teams", leagueId],
    queryFn: async () => {
      return api.getTeams(parseInt(leagueId, 10)) as Promise<{
        teams: Team[];
      }>;
    },
  });

  // Fetch lineup recommendations
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["lineup-recommendations", leagueId, selectedTeamId],
    queryFn: async () => {
      if (!selectedTeamId) {
        throw new Error("No team selected");
      }

      return api.getLineupRecommendations(
        parseInt(leagueId, 10),
        selectedTeamId
      ) as Promise<LineupData>;
    },
    enabled: !!selectedTeamId,
  });

  const handleTeamSelect = (teamId: number) => {
    setSelectedTeamId(teamId);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <PageHeader
        title="Lineup Optimizer"
        subtitle="Daily start/sit recommendations based on today's MLB schedule and RoS projections"
        backLink={{ href: `/leagues/${leagueId}`, label: "Back to League" }}
      />

      {/* Team Selector */}
      <div className="mb-6">
        {teamsData && teamsData.teams.length > 0 ? (
          <TeamSelector
            leagueId={leagueId}
            teams={teamsData.teams}
            selectedTeamId={selectedTeamId}
            onSelect={handleTeamSelect}
            loading={teamsLoading}
            error={!!teamsError}
          />
        ) : teamsLoading ? (
          <TeamSelector
            leagueId={leagueId}
            teams={[]}
            selectedTeamId={null}
            onSelect={handleTeamSelect}
            loading={true}
          />
        ) : teamsError ? (
          <TeamSelector
            leagueId={leagueId}
            teams={[]}
            selectedTeamId={null}
            onSelect={handleTeamSelect}
            error={true}
          />
        ) : (
          <div className="text-sm text-gray-600">
            No teams found. Create a snapshot to sync league data from ESPN.
          </div>
        )}
      </div>

      {/* Content */}
      {!selectedTeamId ? (
        <ErrorAlert
          variant="warning"
          message="Select a team to see lineup recommendations."
        />
      ) : isLoading ? (
        <div className="bg-white shadow-lg rounded-xl border border-gray-200 p-6">
          <LoadingSkeleton lines={5} />
        </div>
      ) : error ? (
        <div className="bg-white shadow-lg rounded-xl border border-gray-200 p-6">
          <ErrorAlert
            message={(error as Error).message}
            onRetry={() => refetch()}
          />
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Summary Banner */}
          {data.isOptimal ? (
            <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6">
              <div className="flex items-center">
                <svg
                  className="h-8 w-8 text-green-600 mr-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div>
                  <h2 className="text-xl font-bold text-green-900">
                    Your Lineup is Optimal!
                  </h2>
                  <p className="text-sm text-green-700 mt-1">
                    No recommended changes for today's schedule.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <svg
                    className="h-8 w-8 text-amber-600 mr-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <div>
                    <h2 className="text-xl font-bold text-amber-900">
                      {data.recommendations.length} Recommended Swap
                      {data.recommendations.length !== 1 ? "s" : ""}
                    </h2>
                    <p className="text-sm text-amber-700 mt-1">
                      Projected gain: +{data.totalProjectedGain.toFixed(2)} SGP
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Recommendation Cards */}
          {!data.isOptimal && data.recommendations.length > 0 && (
            <div className="space-y-4">
              {data.recommendations.map((rec, idx) => (
                <div
                  key={`${rec.slotName}-${idx}`}
                  className="bg-white shadow-lg rounded-xl border border-gray-200 p-6"
                >
                  {/* Slot Header */}
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {rec.slotName}
                    </h3>
                  </div>

                  {/* Two-column layout */}
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-center">
                    {/* Bench Player (Start) */}
                    <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
                      <div className="flex items-center mb-2">
                        <span className="text-green-700 font-semibold text-xs uppercase tracking-wide">
                          Start
                        </span>
                      </div>
                      <div className="font-bold text-lg text-gray-900 mb-1">
                        {rec.benchPlayerName}
                      </div>
                      <div className="text-sm text-gray-600 mb-2">
                        {rec.benchPlayerPositions.join(", ")}
                      </div>
                      <div className="text-2xl font-bold text-green-600">
                        {rec.benchPlayerProjectedValue.toFixed(2)}
                      </div>
                    </div>

                    {/* Arrow */}
                    <div className="flex justify-center">
                      <svg
                        className="w-8 h-8 text-gray-400 rotate-90 md:rotate-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                        />
                      </svg>
                    </div>

                    {/* Starter Player (Sit) */}
                    <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 opacity-75">
                      <div className="flex items-center mb-2">
                        <span className="text-red-700 font-semibold text-xs uppercase tracking-wide">
                          Sit
                        </span>
                      </div>
                      <div className="font-bold text-lg text-gray-900 mb-1">
                        {rec.starterPlayerName}
                      </div>
                      <div className="text-sm text-gray-600 mb-2">
                        {rec.starterPlayerPositions.join(", ")}
                      </div>
                      <div className="text-2xl font-medium text-gray-500">
                        {rec.starterPlayerProjectedValue.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {/* Reason and Gain */}
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <p className="text-sm text-gray-600 mb-2">{rec.reason}</p>
                    <div className="inline-flex items-center px-3 py-1 rounded-full bg-green-100 text-green-800 text-sm font-semibold">
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
                          d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                        />
                      </svg>
                      +{rec.projectedGain.toFixed(2)} SGP
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Note */}
          <div className="text-xs text-gray-500 text-center mt-6">
            Recommendations based on today's MLB schedule and rest-of-season
            projections. Snapshot date: {data.snapshotDate}
          </div>
        </div>
      ) : null}
    </div>
  );
}
