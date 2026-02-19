"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingSpinner, LoadingSkeleton } from "@/components/ui/LoadingSpinner";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { StatCard } from "@/components/ui/StatCard";
import { TeamSelector } from "@/components/league/TeamSelector";
import { CategoryStatsTable } from "@/components/league/CategoryStatsTable";

interface Team {
  id: number;
  league_id: number;
  espn_team_id: number;
  name: string;
  created_at: string;
}

interface LeagueStatus {
  league: {
    id: number;
    espn_league_id: number;
    season: number;
    name: string;
    timezone: string;
    user_team_id: number | null;
    created_at: string;
  };
  latestSnapshot: {
    snapshot_date: string;
    is_degraded: boolean;
    degraded_reasons: string[];
  } | null;
  snapshotCount: number;
}

interface TeamOverviewCategory {
  category_id: string;
  name: string;
  stat_key: string;
  type: string;
  direction: string;
  value: number;
  rank: number;
  roto_points: number;
}

interface RosterPlayer {
  player_id: number;
  player_name: string;
  mlb_team: string | null;
  positions: string[];
  roster_status: string;
  roster_slot: string | null;
  acquisition_type: string | null;
}

interface TeamOverviewData {
  snapshotDate: string;
  team: { id: number; name: string };
  overall: {
    overall_points: number;
    overall_rank: number;
    total_teams: number;
  } | null;
  categories: TeamOverviewCategory[];
  roster: RosterPlayer[];
}

export default function LeagueDetailPage() {
  return (
    <ProtectedRoute>
      <LeagueDetailPageContent />
    </ProtectedRoute>
  );
}

function LeagueDetailPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const leagueId = params.id as string;
  const queryClient = useQueryClient();
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authSwid, setAuthSwid] = useState("");
  const [authS2, setAuthS2] = useState("");
  const [showSnapshotBanner, setShowSnapshotBanner] = useState(
    searchParams?.get("snapshotting") === "true",
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["league", leagueId],
    queryFn: async () => {
      return api.getLeagueStatus(
        parseInt(leagueId, 10),
      ) as Promise<LeagueStatus>;
    },
  });

  // Handle team selection from TeamSelector
  const handleTeamSelect = (teamId: number) => {
    setSelectedTeamId(teamId);
  };

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

  const updateAuthMutation = useMutation({
    mutationFn: async (auth: { SWID: string; espn_s2: string }) => {
      return api.updateLeagueAuth(parseInt(leagueId, 10), auth);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["league", leagueId] });
      setShowAuthModal(false);
      setAuthSwid("");
      setAuthS2("");
      alert("Authentication updated successfully!");
    },
  });

  const createSnapshotMutation = useMutation({
    mutationFn: async () => {
      return api.triggerSnapshot(parseInt(leagueId, 10));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["league", leagueId] });
      queryClient.invalidateQueries({ queryKey: ["league-teams", leagueId] });
      queryClient.invalidateQueries({ queryKey: ["team-overview"] });
      alert("Snapshot created successfully! Teams should now be available.");
    },
  });

  const {
    data: teamOverview,
    isLoading: teamOverviewLoading,
    error: teamOverviewError,
  } = useQuery({
    queryKey: ["team-overview", leagueId, selectedTeamId],
    queryFn: async () => {
      return api.getTeamOverview(
        parseInt(leagueId, 10),
        selectedTeamId!,
      ) as Promise<TeamOverviewData>;
    },
    enabled: !!selectedTeamId,
  });

  const SLOT_ORDER = [
    "C",
    "1B",
    "2B",
    "3B",
    "SS",
    "OF",
    "LF",
    "CF",
    "RF",
    "DH",
    "IF",
    "UTIL",
    "SP",
    "RP",
    "P",
  ];

  const groupedRoster = teamOverview
    ? {
        active: [
          ...teamOverview.roster.filter((p) => p.roster_status === "active"),
        ].sort((a, b) => {
          const aIdx = SLOT_ORDER.indexOf(a.roster_slot || "");
          const bIdx = SLOT_ORDER.indexOf(b.roster_slot || "");
          return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
        }),
        bench: teamOverview.roster.filter(
          (p) => p.roster_status === "bench",
        ),
        il: teamOverview.roster.filter((p) => p.roster_status === "il"),
      }
    : null;

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <LoadingSpinner message="Loading league data..." />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ErrorAlert
          message={error ? (error as Error).message : "League not found"}
          backLink={{ href: "/leagues", label: "\u2190 Back to leagues" }}
        />
      </div>
    );
  }

  const { league, latestSnapshot, snapshotCount } = data;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <PageHeader
        title={league.name}
        backLink={{ href: "/leagues", label: "Back to Leagues" }}
        actions={
          <button
            onClick={() => setShowAuthModal(true)}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <svg
              className="mr-1.5 h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
              />
            </svg>
            Update Auth
          </button>
        }
      />

      {/* League metadata row */}
      <div className="mb-6 flex items-center text-sm text-gray-500 space-x-4">
        <span>
          Season:{" "}
          <span className="font-medium text-gray-700">{league.season}</span>
        </span>
        <span>
          ESPN ID:{" "}
          <span className="font-medium text-gray-700">
            {league.espn_league_id}
          </span>
        </span>
        <span>
          Timezone:{" "}
          <span className="font-medium text-gray-700">
            {league.timezone}
          </span>
        </span>
      </div>

      {/* Initial Snapshot Banner */}
      {showSnapshotBanner && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <svg
              className="h-5 w-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-blue-800">
                Initial snapshot in progress
              </h3>
              <p className="mt-1 text-sm text-blue-700">
                We're fetching your league data from ESPN. This may take a
                minute. The page will update automatically when complete.
              </p>
              <button
                onClick={() => setShowSnapshotBanner(false)}
                className="mt-2 text-xs text-blue-600 hover:text-blue-700 underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Team Selector */}
      <div className="bg-white shadow rounded-lg p-6 mb-8">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Your Team</h2>
        {teamsData && teamsData.teams.length > 0 ? (
          <TeamSelector
            leagueId={leagueId}
            teams={teamsData.teams}
            selectedTeamId={selectedTeamId}
            onSelect={handleTeamSelect}
            autoDetectedTeamId={data.league.user_team_id}
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
          <div>
            <div className="text-sm text-gray-600 mb-4">
              No teams found. Create a snapshot to sync league data from ESPN.
            </div>
            {createSnapshotMutation.isError && (
              <div className="mb-4">
                <ErrorAlert
                  message={
                    (createSnapshotMutation.error as Error).message
                  }
                />
              </div>
            )}
            <button
              onClick={() => createSnapshotMutation.mutate()}
              disabled={createSnapshotMutation.isPending}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {createSnapshotMutation.isPending ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Creating Snapshot...
                </>
              ) : (
                <>
                  <svg
                    className="-ml-1 mr-2 h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Create Snapshot
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard
          label="Total Snapshots"
          value={snapshotCount}
          icon={
            <svg
              className="h-8 w-8 text-blue-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          }
        />
        <StatCard
          label="Latest Snapshot"
          value={latestSnapshot ? latestSnapshot.snapshot_date : "None"}
          icon={
            <svg
              className={`h-8 w-8 ${latestSnapshot ? "text-green-600" : "text-gray-400"}`}
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
        <StatCard
          label="Status"
          value={latestSnapshot?.is_degraded ? "Degraded" : "Healthy"}
          icon={
            <svg
              className={`h-8 w-8 ${latestSnapshot?.is_degraded ? "text-yellow-600" : "text-green-600"}`}
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          }
        />
      </div>

      {/* Degraded Warning */}
      {latestSnapshot?.is_degraded &&
        latestSnapshot.degraded_reasons.length > 0 && (
          <div className="mb-6">
            <ErrorAlert
              variant="warning"
              message={`Snapshot Issues Detected: ${latestSnapshot.degraded_reasons.map((r) => r.replace(/_/g, " ")).join(", ")}`}
              onRetry={
                !createSnapshotMutation.isPending
                  ? () => createSnapshotMutation.mutate()
                  : undefined
              }
            />
          </div>
        )}

      {/* Quick Actions */}
      <div className="bg-white shadow rounded-lg p-6 mb-8">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Link
            href={`/leagues/${leagueId}/standings`}
            className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg
              className="h-6 w-6 text-indigo-600 mr-3"
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
            <span className="font-medium text-gray-900">Standings</span>
          </Link>

          <Link
            href={`/leagues/${leagueId}/trends`}
            className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg
              className="h-6 w-6 text-blue-600 mr-3"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
              />
            </svg>
            <span className="font-medium text-gray-900">View Trends</span>
          </Link>

          <Link
            href={`/leagues/${leagueId}/waivers`}
            className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg
              className="h-6 w-6 text-green-600 mr-3"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            <span className="font-medium text-gray-900">Waivers</span>
          </Link>

          <Link
            href={`/leagues/${leagueId}/trades`}
            className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg
              className="h-6 w-6 text-purple-600 mr-3"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
              />
            </svg>
            <span className="font-medium text-gray-900">Trade Analyzer</span>
          </Link>
        </div>
      </div>

      {/* Team Overview - only when team is selected */}
      {selectedTeamId && (
        <div className="mb-8">
          {teamOverviewLoading ? (
            <div className="bg-white shadow rounded-lg p-6">
              <LoadingSkeleton lines={2} />
            </div>
          ) : teamOverviewError ? (
            <ErrorAlert
              message={(teamOverviewError as Error).message}
            />
          ) : teamOverview ? (
            <>
              {/* Overall Standing Banner */}
              {teamOverview.overall && (
                <div className="bg-white shadow rounded-lg p-6 mb-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-medium text-gray-900">
                        {teamOverview.team.name}
                      </h2>
                      <p className="text-sm text-gray-500 mt-1">
                        Snapshot:{" "}
                        {teamOverview.snapshotDate.split("T")[0]}
                      </p>
                    </div>
                    <div className="flex items-center space-x-8">
                      <div className="text-center">
                        <p className="text-sm font-medium text-gray-500">
                          Overall Rank
                        </p>
                        <p className="text-3xl font-bold text-gray-900">
                          {teamOverview.overall.overall_rank}
                          <span className="text-lg font-normal text-gray-400">
                            /{teamOverview.overall.total_teams}
                          </span>
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-medium text-gray-500">
                          Total Points
                        </p>
                        <p className="text-3xl font-bold text-blue-600">
                          {Number(teamOverview.overall.overall_points)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Category Stats Table */}
              <div className="bg-white shadow rounded-lg p-6 mb-6">
                <CategoryStatsTable
                  title="Category Stats"
                  categories={teamOverview.categories}
                  totalTeams={teamOverview.overall?.total_teams ?? 10}
                />
              </div>

              {/* Roster Section */}
              <div className="bg-white shadow rounded-lg p-6 mb-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">
                  Roster
                </h2>
                {teamOverview.roster.length > 0 && groupedRoster ? (
                  <div className="space-y-6">
                    {/* Active Lineup */}
                    {groupedRoster.active.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-2">
                          Active Lineup ({groupedRoster.active.length})
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-16">
                                  Slot
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                  Player
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                  Team
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                  Positions
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {groupedRoster.active.map((p) => (
                                <tr key={p.player_id}>
                                  <td className="px-4 py-2 text-sm font-medium text-gray-500 w-16">
                                    {p.roster_slot}
                                  </td>
                                  <td className="px-4 py-2 text-sm font-medium text-gray-900">
                                    {p.player_name}
                                  </td>
                                  <td className="px-4 py-2 text-sm text-gray-500">
                                    {p.mlb_team || "-"}
                                  </td>
                                  <td className="px-4 py-2 text-sm text-gray-500">
                                    {(p.positions || []).join(", ")}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Bench */}
                    {groupedRoster.bench.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-2">
                          Bench ({groupedRoster.bench.length})
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-16">
                                  Slot
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                  Player
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                  Team
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                  Positions
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {groupedRoster.bench.map((p) => (
                                <tr key={p.player_id}>
                                  <td className="px-4 py-2 text-sm font-medium text-gray-400 w-16">
                                    BE
                                  </td>
                                  <td className="px-4 py-2 text-sm font-medium text-gray-900">
                                    {p.player_name}
                                  </td>
                                  <td className="px-4 py-2 text-sm text-gray-500">
                                    {p.mlb_team || "-"}
                                  </td>
                                  <td className="px-4 py-2 text-sm text-gray-500">
                                    {(p.positions || []).join(", ")}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Injured List */}
                    {groupedRoster.il.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-red-700 uppercase tracking-wider mb-2">
                          Injured List ({groupedRoster.il.length})
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-red-50">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-red-500 uppercase w-16">
                                  Slot
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-red-500 uppercase">
                                  Player
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-red-500 uppercase">
                                  Team
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-red-500 uppercase">
                                  Positions
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {groupedRoster.il.map((p) => (
                                <tr
                                  key={p.player_id}
                                  className="bg-red-50/30"
                                >
                                  <td className="px-4 py-2 text-sm font-medium text-red-400 w-16">
                                    IL
                                  </td>
                                  <td className="px-4 py-2 text-sm font-medium text-gray-900">
                                    {p.player_name}
                                  </td>
                                  <td className="px-4 py-2 text-sm text-gray-500">
                                    {p.mlb_team || "-"}
                                  </td>
                                  <td className="px-4 py-2 text-sm text-gray-500">
                                    {(p.positions || []).join(", ")}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">
                    No roster data available for this snapshot.
                  </p>
                )}
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* Info Message */}
      {snapshotCount === 0 && (
        <ErrorAlert
          variant="info"
          message={`Your league is connected! The first snapshot will be created at 03:00 ${league.timezone}. You can upload projections now to start getting recommendations.`}
        />
      )}

      {/* Auth Update Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                Update ESPN Authentication
              </h3>
              <button
                onClick={() => setShowAuthModal(false)}
                className="text-gray-400 hover:text-gray-500"
              >
                <svg
                  className="h-6 w-6"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-4">
                For private leagues, you'll need to provide your ESPN cookies.
                Find these in your browser's DevTools:
              </p>
              <ol className="text-sm text-gray-600 space-y-1 ml-5 list-decimal">
                <li>Log into ESPN Fantasy Baseball</li>
                <li>Open DevTools (F12)</li>
                <li>Go to Application/Storage &rarr; Cookies</li>
                <li>Find SWID and espn_s2 values</li>
              </ol>
            </div>

            {updateAuthMutation.isError && (
              <div className="mb-4">
                <ErrorAlert
                  message={
                    (updateAuthMutation.error as Error).message
                  }
                />
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="swid"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  SWID
                </label>
                <input
                  type="text"
                  id="swid"
                  value={authSwid}
                  onChange={(e) => setAuthSwid(e.target.value)}
                  placeholder="{12345678-ABCD-1234-ABCD-123456789ABC}"
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                />
              </div>

              <div>
                <label
                  htmlFor="espn_s2"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  espn_s2
                </label>
                <input
                  type="text"
                  id="espn_s2"
                  value={authS2}
                  onChange={(e) => setAuthS2(e.target.value)}
                  placeholder="AEBx..."
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowAuthModal(false);
                  setAuthSwid("");
                  setAuthS2("");
                }}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  updateAuthMutation.mutate({
                    SWID: authSwid,
                    espn_s2: authS2,
                  })
                }
                disabled={
                  updateAuthMutation.isPending || !authSwid || !authS2
                }
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {updateAuthMutation.isPending ? "Updating..." : "Update"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
