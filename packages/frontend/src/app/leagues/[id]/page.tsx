"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { api } from "@/lib/api";

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
    searchParams?.get("snapshotting") === "true"
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["league", leagueId],
    queryFn: async () => {
      return api.getLeagueStatus(parseInt(leagueId, 10)) as Promise<LeagueStatus>;
    },
  });

  // Load selected team from localStorage or use auto-detected team
  useEffect(() => {
    // If league has auto-detected team, use that
    const userTeamId = data?.league?.user_team_id;
    if (userTeamId) {
      setSelectedTeamId(userTeamId);
      localStorage.setItem(`league_${leagueId}_team`, userTeamId.toString());
      return;
    }

    // Otherwise fall back to localStorage
    const stored = localStorage.getItem(`league_${leagueId}_team`);
    if (stored) {
      setSelectedTeamId(parseInt(stored, 10));
    }
  }, [leagueId, data?.league?.user_team_id]);

  // Save selected team to localStorage
  const handleTeamSelect = (teamId: number) => {
    setSelectedTeamId(teamId);
    localStorage.setItem(`league_${leagueId}_team`, teamId.toString());
  };

  const {
    data: teamsData,
    isLoading: teamsLoading,
    error: teamsError,
  } = useQuery({
    queryKey: ["league-teams", leagueId],
    queryFn: async () => {
      return api.getTeams(parseInt(leagueId, 10)) as Promise<{ teams: Team[] }>;
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
      return api.getTeamOverview(parseInt(leagueId, 10), selectedTeamId!) as Promise<TeamOverviewData>;
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
        bench: teamOverview.roster.filter((p) => p.roster_status === "bench"),
        il: teamOverview.roster.filter((p) => p.roster_status === "il"),
      }
    : null;

  const formatStatValue = (
    value: number | string,
    type: string,
    statKey: string,
  ) => {
    const num = Number(value);
    if (!isFinite(num)) return "-";
    if (
      type === "RATE" ||
      ["AVG", "OBP", "SLG", "OPS", "ERA", "WHIP"].includes(statKey)
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

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
          <div className="space-y-4">
            <div className="h-32 bg-gray-200 rounded"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-medium">Error loading league</h3>
          <p className="text-red-600 text-sm mt-1">
            {error ? (error as Error).message : "League not found"}
          </p>
          <Link
            href="/leagues"
            className="mt-3 inline-block text-sm text-blue-600 hover:text-blue-700"
          >
            ← Back to leagues
          </Link>
        </div>
      </div>
    );
  }

  const { league, latestSnapshot, snapshotCount } = data;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/leagues"
          className="text-blue-600 hover:text-blue-700 text-sm font-medium"
        >
          ← Back to Leagues
        </Link>
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
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-blue-800">
                Initial snapshot in progress
              </h3>
              <p className="mt-1 text-sm text-blue-700">
                We're fetching your league data from ESPN. This may take a minute.
                The page will update automatically when complete.
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

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{league.name}</h1>
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center text-sm text-gray-500 space-x-4">
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
        </div>
      </div>

      {/* Team Selector */}
      <div className="bg-white shadow rounded-lg p-6 mb-8">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Your Team</h2>
        {teamsLoading ? (
          <div className="animate-pulse">
            <div className="h-10 bg-gray-200 rounded w-full"></div>
          </div>
        ) : teamsError ? (
          <div className="text-sm text-red-600">
            Failed to load teams. Try refreshing the page.
          </div>
        ) : teamsData && teamsData.teams.length > 0 ? (
          <div>
            {/* Show auto-detection success message */}
            {data?.league.user_team_id && (
              <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex items-center">
                  <svg
                    className="h-5 w-5 text-green-400 mr-2"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-green-800">
                      Team Auto-Detected
                    </p>
                    <p className="text-sm text-green-700">
                      We automatically detected your team based on your ESPN
                      account. You can change it below if needed.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <label
              htmlFor="team-select"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              {data?.league.user_team_id
                ? "Your auto-detected team:"
                : "Select your team to get personalized recommendations:"}
            </label>
            <select
              id="team-select"
              value={selectedTeamId || ""}
              onChange={(e) => handleTeamSelect(parseInt(e.target.value, 10))}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
            >
              <option value="">-- Select a team --</option>
              {teamsData.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
            {!selectedTeamId && !data?.league.user_team_id && (
              <p className="mt-2 text-sm text-gray-500">
                Select your team to access waiver recommendations, trade
                analysis, and projections.
              </p>
            )}
            {selectedTeamId && !data?.league.user_team_id && (
              <p className="mt-2 text-sm text-green-600 flex items-center">
                <svg
                  className="mr-1 h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                Team selected!
              </p>
            )}
          </div>
        ) : (
          <div>
            <div className="text-sm text-gray-600 mb-4">
              No teams found. Create a snapshot to sync league data from ESPN.
            </div>
            {createSnapshotMutation.isError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded p-3 text-sm text-red-600">
                {(createSnapshotMutation.error as Error).message}
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
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
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
        {/* Snapshot Status */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
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
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">
                Total Snapshots
              </p>
              <p className="text-2xl font-semibold text-gray-900">
                {snapshotCount}
              </p>
            </div>
          </div>
        </div>

        {/* Latest Snapshot */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
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
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">
                Latest Snapshot
              </p>
              <p className="text-lg font-semibold text-gray-900">
                {latestSnapshot ? latestSnapshot.snapshot_date : "None"}
              </p>
            </div>
          </div>
        </div>

        {/* Status */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
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
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Status</p>
              <p className="text-lg font-semibold text-gray-900">
                {latestSnapshot?.is_degraded ? "Degraded" : "Healthy"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Degraded Warning */}
      {latestSnapshot?.is_degraded &&
        latestSnapshot.degraded_reasons.length > 0 && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h3 className="text-yellow-800 font-medium flex items-center">
              <svg
                className="mr-2 h-5 w-5"
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
              Snapshot Issues Detected
            </h3>
            <ul className="mt-2 text-sm text-yellow-700 space-y-1 ml-7">
              {latestSnapshot.degraded_reasons.map((reason, i) => (
                <li key={i}>• {reason.replace(/_/g, " ")}</li>
              ))}
            </ul>
            <div className="mt-4 ml-7">
              <button
                onClick={() => createSnapshotMutation.mutate()}
                disabled={createSnapshotMutation.isPending}
                className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-yellow-600 hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {createSnapshotMutation.isPending ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-1.5 h-3 w-3 text-white"
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
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Creating...
                  </>
                ) : (
                  <>
                    <svg
                      className="-ml-0.5 mr-1.5 h-3 w-3"
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
                    Create New Snapshot
                  </>
                )}
              </button>
            </div>
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
              <div className="animate-pulse space-y-4">
                <div className="h-6 bg-gray-200 rounded w-1/4"></div>
                <div className="h-24 bg-gray-200 rounded"></div>
              </div>
            </div>
          ) : teamOverviewError ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="text-red-800 font-medium">
                Error loading team overview
              </h3>
              <p className="text-red-600 text-sm mt-1">
                {(teamOverviewError as Error).message}
              </p>
            </div>
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
                        Snapshot: {teamOverview.snapshotDate.split("T")[0]}
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
                <h2 className="text-lg font-medium text-gray-900 mb-4">
                  Category Stats
                </h2>
                {teamOverview.categories.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Category
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Value
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Rank
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Roto Pts
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {teamOverview.categories.map((cat) => (
                          <tr key={cat.category_id}>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                              {cat.name}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                              {formatStatValue(
                                cat.value,
                                cat.type,
                                cat.stat_key,
                              )}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                  teamOverview.overall
                                    ? getRankColor(
                                        cat.rank,
                                        teamOverview.overall.total_teams,
                                      )
                                    : "text-gray-700 bg-gray-50"
                                }`}
                              >
                                #{cat.rank}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-semibold text-gray-900">
                              {Number(cat.roto_points)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">
                    No category data available for this snapshot.
                  </p>
                )}
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
                                <tr key={p.player_id} className="bg-red-50/30">
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
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-800 flex items-center">
            <svg
              className="mr-2 h-5 w-5"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
            Getting Started
          </h3>
          <p className="mt-2 text-sm text-blue-700">
            Your league is connected! The first snapshot will be created at
            03:00 {league.timezone}. You can upload projections now to start
            getting recommendations.
          </p>
        </div>
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
                <li>Go to Application/Storage → Cookies</li>
                <li>Find SWID and espn_s2 values</li>
              </ol>
            </div>

            {updateAuthMutation.isError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded p-3 text-sm text-red-600">
                {(updateAuthMutation.error as Error).message}
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
                  updateAuthMutation.mutate({ SWID: authSwid, espn_s2: authS2 })
                }
                disabled={updateAuthMutation.isPending || !authSwid || !authS2}
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
