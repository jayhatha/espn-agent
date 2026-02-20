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

interface StreamingCandidate {
  playerId: number;
  playerName: string;
  mlbTeam: string;
  matchupOpponent: string;
  isHome: boolean;
  gameDate: string;
  compositeScore: number;
  projectionScore: number;
  matchupScore: number;
  multiStartBonus: number;
  weekStarts: number;
  ownershipPct: number | null;
}

interface StreamingData {
  candidates: StreamingCandidate[];
  dateRange: { start: string; end: string };
  totalCandidates: number;
  generatedAt: string;
}

export default function StreamingPitchersPage() {
  const params = useParams();
  const leagueId = params.id as string;
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [lookAheadDays, setLookAheadDays] = useState(7);

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

  // Fetch streaming pitchers
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["streaming-pitchers", leagueId, selectedTeamId, lookAheadDays],
    queryFn: async () => {
      if (!selectedTeamId) {
        throw new Error("No team selected");
      }

      return api.getStreamingPitchers(parseInt(leagueId, 10), {
        teamId: selectedTeamId,
        lookAheadDays,
        limit: 20,
      }) as Promise<StreamingData>;
    },
    enabled: !!selectedTeamId,
  });

  const handleTeamSelect = (teamId: number) => {
    setSelectedTeamId(teamId);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const getScoreColor = (score: number) => {
    if (score > 30) return "text-green-600";
    if (score > 15) return "text-yellow-600";
    return "text-gray-600";
  };

  const getScoreBgColor = (score: number) => {
    if (score > 30) return "bg-green-100";
    if (score > 15) return "bg-yellow-100";
    return "bg-gray-100";
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <PageHeader
        title="Streaming Pitchers"
        subtitle="Favorable matchup analysis for short-term pitcher adds"
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

      {/* Controls */}
      {selectedTeamId && (
        <div className="mb-6 flex items-center justify-between">
          <div className="inline-flex rounded-lg border border-gray-300 bg-white p-1">
            <button
              onClick={() => setLookAheadDays(1)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                lookAheadDays === 1
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              1 Day
            </button>
            <button
              onClick={() => setLookAheadDays(3)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                lookAheadDays === 3
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              3 Days
            </button>
            <button
              onClick={() => setLookAheadDays(7)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                lookAheadDays === 7
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              7 Days
            </button>
          </div>

          {data && (
            <div className="text-sm text-gray-600">
              Showing matchups: {formatDate(data.dateRange.start)} -{" "}
              {formatDate(data.dateRange.end)}
            </div>
          )}
        </div>
      )}

      {/* Content */}
      {!selectedTeamId ? (
        <ErrorAlert
          variant="warning"
          message="Select a team to see streaming pitcher recommendations."
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
      ) : data && data.candidates.length > 0 ? (
        <div className="space-y-4">
          {data.candidates.map((candidate, idx) => (
            <div
              key={candidate.playerId}
              className="bg-white shadow-lg rounded-xl border border-gray-200 p-6 hover:shadow-xl transition-shadow"
            >
              <div className="flex items-start gap-4">
                {/* Rank Badge */}
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center h-12 w-12 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 text-white font-bold text-lg shadow-md">
                    #{idx + 1}
                  </div>
                </div>

                {/* Player Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 mb-1">
                        {candidate.playerName}
                      </h3>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span className="font-medium">{candidate.mlbTeam}</span>
                        <span className="text-gray-400">•</span>
                        <span>
                          {candidate.isHome ? "vs." : "@"}{" "}
                          {candidate.matchupOpponent}
                        </span>
                        <span className="text-gray-400">•</span>
                        <span>{formatDate(candidate.gameDate)}</span>
                      </div>
                    </div>

                    {/* Composite Score */}
                    <div className="flex flex-col items-end">
                      <div
                        className={`text-3xl font-bold ${getScoreColor(
                          candidate.compositeScore
                        )}`}
                      >
                        {candidate.compositeScore.toFixed(0)}
                      </div>
                      <div className="text-xs text-gray-500">Score</div>
                    </div>
                  </div>

                  {/* Score Breakdown */}
                  <div className="flex flex-wrap gap-3 mb-3">
                    <div
                      className={`inline-flex items-center px-3 py-1 rounded-full ${getScoreBgColor(
                        candidate.projectionScore
                      )} text-sm`}
                    >
                      <span className="text-gray-700 font-medium">
                        Projection: {candidate.projectionScore.toFixed(0)}
                      </span>
                    </div>
                    <div
                      className={`inline-flex items-center px-3 py-1 rounded-full ${getScoreBgColor(
                        candidate.matchupScore
                      )} text-sm`}
                    >
                      <span className="text-gray-700 font-medium">
                        Matchup: {candidate.matchupScore.toFixed(0)}
                      </span>
                    </div>
                    {candidate.multiStartBonus > 0 && (
                      <div className="inline-flex items-center px-3 py-1 rounded-full bg-blue-100 text-sm">
                        <span className="text-blue-700 font-medium">
                          Multi-start: +{candidate.multiStartBonus.toFixed(0)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Badges */}
                  <div className="flex items-center gap-2">
                    {candidate.weekStarts >= 2 && (
                      <span className="inline-flex items-center px-3 py-1 rounded-full bg-blue-600 text-white text-xs font-semibold">
                        {candidate.weekStarts}-Start Week
                      </span>
                    )}
                    {candidate.ownershipPct !== null && (
                      <span className="inline-flex items-center px-3 py-1 rounded-full bg-gray-200 text-gray-700 text-xs font-medium">
                        {candidate.ownershipPct.toFixed(1)}% Owned
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white shadow-lg rounded-xl border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-gray-400"
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
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No Streaming Candidates Found
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            No streaming candidates found for this period. Try expanding the
            lookahead window.
          </p>
        </div>
      )}

      {/* Note */}
      {data && data.candidates.length > 0 && (
        <div className="text-xs text-gray-500 text-center mt-6">
          Probable pitchers sourced from MLB StatsAPI. Pitchers may change before
          game time.
        </div>
      )}
    </div>
  );
}
