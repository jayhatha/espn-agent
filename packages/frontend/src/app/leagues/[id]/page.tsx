"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useState, useMemo } from "react";
import {
  KeyRoundIcon,
  RefreshCwIcon,
  Loader2Icon,
  TableIcon,
  TrendingUpIcon,
  PlusIcon,
  ArrowRightLeftIcon,
  BarChart3Icon,
  ClipboardListIcon,
  ActivityIcon,
  DollarSignIcon,
  XIcon,
} from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Container } from "@/components/ui/Container";
import { Card, CardContent } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingSpinner, LoadingSkeleton } from "@/components/ui/LoadingSpinner";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { StatCard } from "@/components/ui/StatCard";
import { TeamSelector } from "@/components/league/TeamSelector";
import { CategoryStatsTable } from "@/components/league/CategoryStatsTable";
import { TeamHealthOverview } from "@/components/league/TeamHealthOverview";
import { CategoryMiniChart } from "@/components/league/CategoryMiniChart";
import { ActionItemsList, type ActionItem } from "@/components/league/ActionItemsList";
import { getESPNFreeAgentsUrl, getESPNTradeUrl } from "@/lib/espn-links";

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

  // Waiver recommendations for dashboard
  const { data: waiverRecs } = useQuery({
    queryKey: ['dashboard-waivers', leagueId, selectedTeamId],
    queryFn: () => api.getWaiverRecommendations(parseInt(leagueId, 10), selectedTeamId!, { maxRecommendations: 3 }),
    enabled: !!selectedTeamId,
  });

  // Trade candidates for dashboard
  const { data: tradeCandidates } = useQuery({
    queryKey: ['dashboard-trades', leagueId, selectedTeamId],
    queryFn: () => api.getTradeRecommendations(parseInt(leagueId, 10), selectedTeamId!),
    enabled: !!selectedTeamId,
  });

  // Overall timeseries for mini chart
  const { data: overallTimeseries } = useQuery({
    queryKey: ['dashboard-timeseries', leagueId],
    queryFn: () => api.getOverallTimeSeries(parseInt(leagueId, 10)),
    enabled: !!leagueId,
  });

  // Transform recommendations into action items
  const actionItems = useMemo(() => {
    const items: ActionItem[] = [];
    const espnLeagueId = data?.league?.espn_league_id;
    const season = data?.league?.season;

    // Add top waiver recommendations
    if (waiverRecs?.recommendations) {
      for (const rec of waiverRecs.recommendations.slice(0, 3)) {
        items.push({
          id: `waiver-${rec.addPlayerId}-${rec.dropPlayerId}`,
          type: 'waiver',
          priority: rec.deltaOverallPoints >= 2 ? 'high' : rec.deltaOverallPoints >= 1 ? 'medium' : 'low',
          title: `Add ${rec.addPlayerName}, Drop ${rec.dropPlayerName}`,
          description: rec.explanation,
          impact: `+${rec.deltaOverallPoints.toFixed(1)} pts`,
          espnLink: espnLeagueId && season ? getESPNFreeAgentsUrl(espnLeagueId, season) : undefined,
          internalLink: `/leagues/${leagueId}/waivers`,
        });
      }
    }

    // Add top trade candidates
    if (tradeCandidates?.candidates) {
      for (const cand of tradeCandidates.candidates.slice(0, 2)) {
        const giveName = cand.trade.givePlayers.map((p: any) => p.playerName).join(', ');
        const getName = cand.trade.receivePlayers.map((p: any) => p.playerName).join(', ');
        items.push({
          id: `trade-${cand.partnerTeamId}-${giveName}`,
          type: 'trade',
          priority: cand.deltaOverallPoints >= 3 ? 'high' : cand.deltaOverallPoints >= 1.5 ? 'medium' : 'low',
          title: `Trade ${giveName} for ${getName}`,
          description: `${cand.partnerTeamName}: ${cand.explanation}`,
          impact: `+${cand.deltaOverallPoints.toFixed(1)} pts`,
          espnLink: espnLeagueId && season ? getESPNTradeUrl(espnLeagueId, season) : undefined,
          internalLink: `/leagues/${leagueId}/trades`,
        });
      }
    }

    // Sort by impact descending
    return items.sort((a, b) => parseFloat(b.impact) - parseFloat(a.impact));
  }, [waiverRecs, tradeCandidates, data, leagueId]);

  // Transform timeseries data for mini chart
  const miniChartData = useMemo(() => {
    if (!overallTimeseries?.series || !selectedTeamId) return [];
    return overallTimeseries.series
      .filter((p: any) => p.team_id === selectedTeamId)
      .map((p: any) => ({ date: p.snapshot_date, rank: p.overall_rank }))
      .sort((a: any, b: any) => a.date.localeCompare(b.date));
  }, [overallTimeseries, selectedTeamId]);

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
      <Container size="wide" className="py-8">
        <LoadingSpinner message="Loading league data..." />
      </Container>
    );
  }

  if (error || !data) {
    return (
      <Container size="wide" className="py-8">
        <ErrorAlert
          message={error ? (error as Error).message : "League not found"}
          backLink={{ href: "/leagues", label: "\u2190 Back to leagues" }}
        />
      </Container>
    );
  }

  const { league, latestSnapshot, snapshotCount } = data;

  return (
    <Container size="wide" className="py-8">
      {/* Header */}
      <PageHeader
        title={league.name}
        backLink={{ href: "/leagues", label: "Back to Leagues" }}
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowAuthModal(true)}
          >
            <KeyRoundIcon className="mr-1.5 h-4 w-4" />
            Update Auth
          </Button>
        }
      />

      {/* League metadata row */}
      <div className="mb-6 flex items-center text-body-sm text-content-secondary space-x-4">
        <span>
          Season:{" "}
          <span className="font-medium text-content">{league.season}</span>
        </span>
        <span>
          ESPN ID:{" "}
          <span className="font-medium text-content">
            {league.espn_league_id}
          </span>
        </span>
        <span>
          Timezone:{" "}
          <span className="font-medium text-content">
            {league.timezone}
          </span>
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => createSnapshotMutation.mutate()}
          disabled={createSnapshotMutation.isPending}
          className="ml-auto"
        >
          <RefreshCwIcon
            className={cn(
              "-ml-0.5 mr-1.5 h-3.5 w-3.5",
              createSnapshotMutation.isPending ? "animate-spin" : ""
            )}
          />
          {createSnapshotMutation.isPending ? "Refreshing..." : "Refresh Snapshot"}
        </Button>
      </div>

      {/* Initial Snapshot Banner */}
      {showSnapshotBanner && (
        <div className="mb-6 bg-info-light border border-info-border rounded-lg p-4">
          <div className="flex items-start">
            <Loader2Icon className="h-5 w-5 text-info mt-0.5 mr-3 flex-shrink-0 animate-spin" />
            <div className="flex-1">
              <h3 className="text-body-sm font-medium text-info">
                Initial snapshot in progress
              </h3>
              <p className="mt-1 text-body-sm text-info">
                We're fetching your league data from ESPN. This may take a
                minute. The page will update automatically when complete.
              </p>
              <button
                onClick={() => setShowSnapshotBanner(false)}
                className="mt-2 text-xs text-info hover:underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Team Selector */}
      <Card className="mb-8">
        <CardContent>
          <Heading level={2} className="mb-4">Your Team</Heading>
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
              <p className="text-body-sm text-content-secondary mb-4">
                No teams found. Create a snapshot to sync league data from ESPN.
              </p>
              {createSnapshotMutation.isError && (
                <div className="mb-4">
                  <ErrorAlert
                    message={
                      (createSnapshotMutation.error as Error).message
                    }
                  />
                </div>
              )}
              <Button
                onClick={() => createSnapshotMutation.mutate()}
                disabled={createSnapshotMutation.isPending}
              >
                {createSnapshotMutation.isPending ? (
                  <>
                    <Loader2Icon className="animate-spin -ml-1 mr-2 h-4 w-4" />
                    Creating Snapshot...
                  </>
                ) : (
                  <>
                    <RefreshCwIcon className="-ml-1 mr-2 h-4 w-4" />
                    Create Snapshot
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

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

      {/* Team Overview - only when team is selected */}
      {selectedTeamId && (
        <div className="mb-8">
          {teamOverviewLoading ? (
            <Card>
              <CardContent>
                <LoadingSkeleton lines={2} />
              </CardContent>
            </Card>
          ) : teamOverviewError ? (
            <ErrorAlert
              message={(teamOverviewError as Error).message}
            />
          ) : teamOverview ? (
            <>
              {/* Overall Standing Banner */}
              {teamOverview.overall && (
                <Card className="mb-6">
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <Heading level={2}>
                          {teamOverview.team.name}
                        </Heading>
                        <p className="text-body-sm text-content-secondary mt-1">
                          Snapshot:{" "}
                          {teamOverview.snapshotDate.split("T")[0]}
                        </p>
                      </div>
                      <div className="flex items-center space-x-8">
                        <div className="text-center">
                          <p className="text-body-sm font-medium text-content-secondary">
                            Overall Rank
                          </p>
                          <p className="text-3xl font-bold text-content">
                            {teamOverview.overall.overall_rank}
                            <span className="text-lg font-normal text-content-tertiary">
                              /{teamOverview.overall.total_teams}
                            </span>
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-body-sm font-medium text-content-secondary">
                            Total Points
                          </p>
                          <p className="text-3xl font-bold text-content">
                            {Number(teamOverview.overall.overall_points)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-grid mb-6">
                <StatCard
                  label="Total Snapshots"
                  value={snapshotCount}
                  icon={
                    <TableIcon className="h-8 w-8 text-content-secondary" />
                  }
                />
                <StatCard
                  label="Latest Snapshot"
                  value={latestSnapshot ? latestSnapshot.snapshot_date : "None"}
                  icon={
                    <ActivityIcon
                      className={cn(
                        "h-8 w-8",
                        latestSnapshot ? "text-positive" : "text-content-tertiary"
                      )}
                    />
                  }
                />
                <StatCard
                  label="Status"
                  value={latestSnapshot?.is_degraded ? "Degraded" : "Healthy"}
                  icon={
                    <BarChart3Icon
                      className={cn(
                        "h-8 w-8",
                        latestSnapshot?.is_degraded ? "text-warning" : "text-positive"
                      )}
                    />
                  }
                />
              </div>

              {/* Health Overview + Mini Chart - Two-column grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-grid mb-6">
                <div className="lg:col-span-2">
                  <TeamHealthOverview
                    categories={teamOverview.categories}
                    totalTeams={teamOverview.overall?.total_teams ?? 10}
                  />
                </div>
                <Card>
                  <CardContent>
                    <Heading level={3} className="text-body-sm mb-4">Standings Trend</Heading>
                    <CategoryMiniChart data={miniChartData} />
                  </CardContent>
                </Card>
              </div>

              {/* Action Items */}
              {actionItems.length > 0 && (
                <Card className="mb-6">
                  <CardContent>
                    <div className="flex items-center justify-between mb-4">
                      <Heading level={2}>Recommended Actions</Heading>
                      <div className="flex gap-2">
                        <Link href={`/leagues/${leagueId}/waivers`} className="text-body-sm text-content-secondary hover:text-content transition-colors">All Waivers &rarr;</Link>
                        <Link href={`/leagues/${leagueId}/trades`} className="text-body-sm text-content-secondary hover:text-content transition-colors">All Trades &rarr;</Link>
                      </div>
                    </div>
                    <ActionItemsList items={actionItems} maxItems={5} />
                  </CardContent>
                </Card>
              )}

              {/* Category Stats Table */}
              <Card className="mb-6">
                <CardContent>
                  <CategoryStatsTable
                    title="Category Stats"
                    categories={teamOverview.categories}
                    totalTeams={teamOverview.overall?.total_teams ?? 10}
                  />
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <Card className="mb-6">
                <CardContent>
                  <Heading level={2} className="mb-4">
                    Quick Actions
                  </Heading>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-grid">
                    <Link
                      href={`/leagues/${leagueId}/standings`}
                      className="flex items-center p-4 border border-neutral-200 rounded-card hover:bg-surface-secondary transition-colors"
                    >
                      <TableIcon className="h-6 w-6 text-content-secondary mr-3" />
                      <span className="font-medium text-content">Standings</span>
                    </Link>

                    <Link
                      href={`/leagues/${leagueId}/trends`}
                      className="flex items-center p-4 border border-neutral-200 rounded-card hover:bg-surface-secondary transition-colors"
                    >
                      <TrendingUpIcon className="h-6 w-6 text-content-secondary mr-3" />
                      <span className="font-medium text-content">View Trends</span>
                    </Link>

                    <Link
                      href={`/leagues/${leagueId}/waivers`}
                      className="flex items-center p-4 border border-neutral-200 rounded-card hover:bg-surface-secondary transition-colors"
                    >
                      <PlusIcon className="h-6 w-6 text-content-secondary mr-3" />
                      <span className="font-medium text-content">Waivers</span>
                    </Link>

                    <Link
                      href={`/leagues/${leagueId}/trades`}
                      className="flex items-center p-4 border border-neutral-200 rounded-card hover:bg-surface-secondary transition-colors"
                    >
                      <ArrowRightLeftIcon className="h-6 w-6 text-content-secondary mr-3" />
                      <span className="font-medium text-content">Trade Analyzer</span>
                    </Link>

                    <Link
                      href={`/leagues/${leagueId}/moves`}
                      className="flex items-center p-4 border border-neutral-200 rounded-card hover:bg-surface-secondary transition-colors"
                    >
                      <BarChart3Icon className="h-6 w-6 text-content-secondary mr-3" />
                      <span className="font-medium text-content">Move Impact</span>
                    </Link>

                    <Link
                      href={`/leagues/${leagueId}/lineup`}
                      className="flex items-center p-4 border border-neutral-200 rounded-card hover:bg-surface-secondary transition-colors"
                    >
                      <ClipboardListIcon className="h-6 w-6 text-content-secondary mr-3" />
                      <span className="font-medium text-content">Lineup Optimizer</span>
                    </Link>

                    <Link
                      href={`/leagues/${leagueId}/streaming`}
                      className="flex items-center p-4 border border-neutral-200 rounded-card hover:bg-surface-secondary transition-colors"
                    >
                      <ActivityIcon className="h-6 w-6 text-content-secondary mr-3" />
                      <span className="font-medium text-content">Streaming Pitchers</span>
                    </Link>

                    <Link
                      href={`/leagues/${leagueId}/draft/rankings`}
                      className="flex items-center p-4 border border-neutral-200 rounded-card hover:bg-surface-secondary transition-colors"
                    >
                      <BarChart3Icon className="h-6 w-6 text-content-secondary mr-3" />
                      <span className="font-medium text-content">Draft Rankings</span>
                    </Link>

                    <Link
                      href={`/leagues/${leagueId}/draft/auction`}
                      className="flex items-center p-4 border border-neutral-200 rounded-card hover:bg-surface-secondary transition-colors"
                    >
                      <DollarSignIcon className="h-6 w-6 text-content-secondary mr-3" />
                      <span className="font-medium text-content">Auction Values</span>
                    </Link>
                  </div>
                </CardContent>
              </Card>

              {/* Roster Section */}
              <Card className="mb-6">
                <CardContent>
                  <Heading level={2} className="mb-4">
                    Roster
                  </Heading>
                  {teamOverview.roster.length > 0 && groupedRoster ? (
                    <div className="space-y-6">
                      {/* Active Lineup */}
                      {groupedRoster.active.length > 0 && (
                        <div>
                          <h3 className="text-body-sm font-semibold text-content-secondary uppercase tracking-wider mb-2">
                            Active Lineup ({groupedRoster.active.length})
                          </h3>
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-neutral-200">
                              <thead className="bg-surface-secondary">
                                <tr>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-content-secondary uppercase w-16">
                                    Slot
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-content-secondary uppercase">
                                    Player
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-content-secondary uppercase">
                                    Team
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-content-secondary uppercase">
                                    Positions
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-neutral-100">
                                {groupedRoster.active.map((p) => (
                                  <tr key={p.player_id}>
                                    <td className="px-4 py-2 text-body-sm font-medium text-content-secondary w-16">
                                      {p.roster_slot}
                                    </td>
                                    <td className="px-4 py-2 text-body-sm font-medium text-content">
                                      {p.player_name}
                                    </td>
                                    <td className="px-4 py-2 text-body-sm text-content-secondary">
                                      {p.mlb_team || "-"}
                                    </td>
                                    <td className="px-4 py-2 text-body-sm text-content-secondary">
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
                          <h3 className="text-body-sm font-semibold text-content-secondary uppercase tracking-wider mb-2">
                            Bench ({groupedRoster.bench.length})
                          </h3>
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-neutral-200">
                              <thead className="bg-surface-secondary">
                                <tr>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-content-secondary uppercase w-16">
                                    Slot
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-content-secondary uppercase">
                                    Player
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-content-secondary uppercase">
                                    Team
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-content-secondary uppercase">
                                    Positions
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-neutral-100">
                                {groupedRoster.bench.map((p) => (
                                  <tr key={p.player_id}>
                                    <td className="px-4 py-2 text-body-sm font-medium text-content-tertiary w-16">
                                      BE
                                    </td>
                                    <td className="px-4 py-2 text-body-sm font-medium text-content">
                                      {p.player_name}
                                    </td>
                                    <td className="px-4 py-2 text-body-sm text-content-secondary">
                                      {p.mlb_team || "-"}
                                    </td>
                                    <td className="px-4 py-2 text-body-sm text-content-secondary">
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
                          <h3 className="text-body-sm font-semibold text-negative uppercase tracking-wider mb-2">
                            Injured List ({groupedRoster.il.length})
                          </h3>
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-neutral-200">
                              <thead className="bg-negative-light">
                                <tr>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-negative uppercase w-16">
                                    Slot
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-negative uppercase">
                                    Player
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-negative uppercase">
                                    Team
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-negative uppercase">
                                    Positions
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-neutral-100">
                                {groupedRoster.il.map((p) => (
                                  <tr
                                    key={p.player_id}
                                    className="bg-negative-light/30"
                                  >
                                    <td className="px-4 py-2 text-body-sm font-medium text-negative w-16">
                                      IL
                                    </td>
                                    <td className="px-4 py-2 text-body-sm font-medium text-content">
                                      {p.player_name}
                                    </td>
                                    <td className="px-4 py-2 text-body-sm text-content-secondary">
                                      {p.mlb_team || "-"}
                                    </td>
                                    <td className="px-4 py-2 text-body-sm text-content-secondary">
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
                    <p className="text-body-sm text-content-secondary">
                      No roster data available for this snapshot.
                    </p>
                  )}
                </CardContent>
              </Card>
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
        <div className="fixed inset-0 bg-neutral-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-card max-w-lg w-full p-6 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <Heading level={3}>
                Update ESPN Authentication
              </Heading>
              <button
                onClick={() => setShowAuthModal(false)}
                className="text-content-tertiary hover:text-content-secondary transition-colors"
              >
                <XIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-body-sm text-content-secondary mb-4">
                For private leagues, you'll need to provide your ESPN cookies.
                Find these in your browser's DevTools:
              </p>
              <ol className="text-body-sm text-content-secondary space-y-1 ml-5 list-decimal">
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
                  className="block text-body-sm font-medium text-content mb-1"
                >
                  SWID
                </label>
                <Input
                  type="text"
                  id="swid"
                  value={authSwid}
                  onChange={(e) => setAuthSwid(e.target.value)}
                  placeholder="{12345678-ABCD-1234-ABCD-123456789ABC}"
                />
              </div>

              <div>
                <label
                  htmlFor="espn_s2"
                  className="block text-body-sm font-medium text-content mb-1"
                >
                  espn_s2
                </label>
                <Input
                  type="text"
                  id="espn_s2"
                  value={authS2}
                  onChange={(e) => setAuthS2(e.target.value)}
                  placeholder="AEBx..."
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowAuthModal(false);
                  setAuthSwid("");
                  setAuthS2("");
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() =>
                  updateAuthMutation.mutate({
                    SWID: authSwid,
                    espn_s2: authS2,
                  })
                }
                disabled={
                  updateAuthMutation.isPending || !authSwid || !authS2
                }
              >
                {updateAuthMutation.isPending ? "Updating..." : "Update"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Container>
  );
}
