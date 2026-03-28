"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import {
  XIcon,
} from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { api } from "@/lib/api";
import { Container } from "@/components/ui/Container";
import { Heading } from "@/components/ui/Heading";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { type ActionItem } from "@/components/league/ActionItemsList";
import { getESPNFreeAgentsUrl, getESPNTradeUrl } from "@/lib/espn-links";
import { IdentitySection } from "./_sections/IdentitySection";
import { ActionsSection } from "./_sections/ActionsSection";
import { StatsSection } from "./_sections/StatsSection";
import { CategoryTableSection } from "./_sections/CategoryTableSection";
// NavigationSection removed -- shell LeagueNav handles navigation
import { RosterSection } from "./_sections/RosterSection";

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
  const leagueId = params.id as string;
  const queryClient = useQueryClient();
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authSwid, setAuthSwid] = useState("");
  const [authS2, setAuthS2] = useState("");
  const [showSnapshotBanner, setShowSnapshotBanner] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      setShowSnapshotBanner(params.get('snapshotting') === 'true');
    }
  }, []);

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
    },
  });

  const createSnapshotMutation = useMutation({
    mutationFn: async () => {
      return api.triggerSnapshot(parseInt(leagueId, 10));
    },
    onSuccess: () => {
      // Invalidate all queries that depend on snapshot data
      queryClient.invalidateQueries({ queryKey: ["league", leagueId] });
      queryClient.invalidateQueries({ queryKey: ["league-teams", leagueId] });
      queryClient.invalidateQueries({ queryKey: ["team-overview"] });
      queryClient.invalidateQueries({ queryKey: ["standings", leagueId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-timeseries", leagueId] });
      queryClient.invalidateQueries({ queryKey: ["timeseries-overall", leagueId] });
      queryClient.invalidateQueries({ queryKey: ["timeseries-projected", leagueId] });
      queryClient.invalidateQueries({ queryKey: ["timeseries-category", leagueId] });
      queryClient.invalidateQueries({ queryKey: ["timeseries-category-total", leagueId] });
      queryClient.invalidateQueries({ queryKey: ["roster", leagueId] });
      queryClient.invalidateQueries({ queryKey: ["waivers", leagueId] });
      queryClient.invalidateQueries({ queryKey: ["sit-start", leagueId] });
      queryClient.invalidateQueries({ queryKey: ["streaming-pitchers", leagueId] });
      queryClient.invalidateQueries({ queryKey: ["gs-summary", leagueId] });
      queryClient.invalidateQueries({ queryKey: ["gs-weekly", leagueId] });
      queryClient.invalidateQueries({ queryKey: ["start-plan", leagueId] });
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
    queryKey: ['waivers-recommendations', leagueId, selectedTeamId],
    queryFn: () => api.getWaiverRecommendations(parseInt(leagueId, 10), selectedTeamId!, { maxRecommendations: 3 }),
    enabled: !!selectedTeamId,
  });

  // Trade candidates for dashboard
  const { data: tradeCandidates } = useQuery({
    queryKey: ['trades-recommendations', leagueId, selectedTeamId],
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

  // Compute delta rank and delta points from timeseries
  const { deltaRank, deltaPoints } = useMemo(() => {
    if (!overallTimeseries?.series || !selectedTeamId) {
      return { deltaRank: null, deltaPoints: null };
    }
    const teamSeries = overallTimeseries.series
      .filter((p: any) => p.team_id === selectedTeamId)
      .sort((a: any, b: any) => a.snapshot_date.localeCompare(b.snapshot_date));
    if (teamSeries.length < 2) {
      return { deltaRank: null, deltaPoints: null };
    }
    const last = teamSeries[teamSeries.length - 1];
    const prev = teamSeries[teamSeries.length - 2];
    return {
      deltaRank: (last.overall_rank ?? 0) - (prev.overall_rank ?? 0),
      deltaPoints: (last.overall_points ?? 0) - (prev.overall_points ?? 0),
    };
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

  if (teamOverviewError) {
    return (
      <Container size="wide" className="py-8">
        <ErrorAlert
          message={(teamOverviewError as Error).message}
        />
      </Container>
    );
  }

  const { league, latestSnapshot, snapshotCount } = data;

  return (
    <>
      <IdentitySection
        league={league}
        latestSnapshot={latestSnapshot}
        snapshotCount={snapshotCount}
        teamsData={teamsData}
        teamsLoading={teamsLoading}
        teamsError={!!teamsError}
        selectedTeamId={selectedTeamId}
        onTeamSelect={handleTeamSelect}
        autoDetectedTeamId={data.league.user_team_id}
        teamOverview={teamOverview}
        teamOverviewLoading={teamOverviewLoading}
        showAuthModal={showAuthModal}
        onShowAuthModal={setShowAuthModal}
        createSnapshotMutation={createSnapshotMutation}
        showSnapshotBanner={showSnapshotBanner}
        onDismissSnapshotBanner={() => setShowSnapshotBanner(false)}
        deltaRank={deltaRank}
        deltaPoints={deltaPoints}
      />

      {selectedTeamId && teamOverview && (
        <>
          <ActionsSection
            actionItems={actionItems}
            leagueId={leagueId}
          />

          <StatsSection
            categories={teamOverview.categories}
            totalTeams={teamOverview.overall?.total_teams ?? 10}
            miniChartData={miniChartData}
          />

          <CategoryTableSection
            categories={teamOverview.categories}
            totalTeams={teamOverview.overall?.total_teams ?? 10}
          />

          <RosterSection
            groupedRoster={groupedRoster}
            hasRosterData={teamOverview.roster.length > 0}
          />
        </>
      )}

      {/* Auth modal: fixed overlay, not a section */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-neutral-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-shell-panel rounded-card max-w-lg w-full p-6 shadow-card dark:shadow-none">
            <div className="flex items-center justify-between mb-4">
              <Heading level={3}>
                Update ESPN Authentication
              </Heading>
              <button
                onClick={() => setShowAuthModal(false)}
                className="text-content-tertiary dark:text-shell-muted hover:text-content-secondary transition-colors"
              >
                <XIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-body-sm text-content-secondary dark:text-shell-muted mb-4">
                For private leagues, you&apos;ll need to provide your ESPN cookies.
                Find these in your browser&apos;s DevTools:
              </p>
              <ol className="text-body-sm text-content-secondary dark:text-shell-muted space-y-1 ml-5 list-decimal">
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
                  className="block text-body-sm font-medium text-content dark:text-shell-text mb-1"
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
                  className="block text-body-sm font-medium text-content dark:text-shell-text mb-1"
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
    </>
  );
}
