"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingSpinner, LoadingSkeleton } from "@/components/ui/LoadingSpinner";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { TeamSelector } from "@/components/league/TeamSelector";
import { Container } from "@/components/ui/Container";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { FileText } from "lucide-react";
import { GsTracker } from "@/components/league/GsTracker";

type PitchingTab = "gs-pacing" | "start-plan" | "streaming";

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
  const [activeTab, setActiveTab] = useState<PitchingTab>("gs-pacing");

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

  const getScoreVariant = (score: number): "positive" | "warning" | "default" => {
    if (score > 30) return "positive";
    if (score > 15) return "warning";
    return "default";
  };

  const getScoreClass = (score: number): string => {
    if (score > 30) return "text-positive";
    if (score > 15) return "text-warning";
    return "text-content-secondary";
  };

  // GS pacing data
  const { data: gsSummary } = useQuery({
    queryKey: ["gs-summary", leagueId, selectedTeamId],
    queryFn: () => api.getGsSummary(parseInt(leagueId, 10), selectedTeamId!) as Promise<any>,
    enabled: !!selectedTeamId,
    staleTime: 5 * 60_000,
  });

  const { data: gsWeekly } = useQuery({
    queryKey: ["gs-weekly", leagueId, selectedTeamId],
    queryFn: () => api.getGsWeekly(parseInt(leagueId, 10), selectedTeamId!) as Promise<any>,
    enabled: !!selectedTeamId && activeTab === "gs-pacing",
    staleTime: 5 * 60_000,
  });

  const { data: startPlan } = useQuery({
    queryKey: ["start-plan", leagueId, selectedTeamId],
    queryFn: () => api.getStartPlan(parseInt(leagueId, 10), selectedTeamId!) as Promise<any>,
    enabled: !!selectedTeamId && activeTab === "start-plan",
    staleTime: 5 * 60_000,
  });

  const tabClass = (isActive: boolean) =>
    cn(
      "px-4 py-3 text-sm font-medium border-b-2 transition-colors",
      isActive
        ? "border-accent text-accent"
        : "border-transparent text-shell-muted hover:text-shell-text hover:border-shell-border"
    );

  return (
    <Container className="py-8">
      <PageHeader
        title="Pitching Usage"
        subtitle="GS pacing, start/sit recommendations, and streaming picks"
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
          <div className="text-body-sm text-content-secondary">
            No teams found. Create a snapshot to sync league data from ESPN.
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      {selectedTeamId && (
        <div className="bg-white dark:bg-shell-panel shadow-card dark:shadow-none rounded-card border border-neutral-200 dark:border-shell-border mb-6">
          <nav className="-mb-px flex border-b border-neutral-200 dark:border-shell-border">
            {(["gs-pacing", "start-plan", "streaming"] as const).map((tab) => {
              const labels: Record<string, string> = {
                "gs-pacing": "GS Pacing",
                "start-plan": "Start Plan",
                streaming: "Streaming Picks",
              };
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={tabClass(activeTab === tab)}
                >
                  {labels[tab]}
                </button>
              );
            })}
          </nav>

          <div className="p-6">
            {/* GS Pacing Tab */}
            {activeTab === "gs-pacing" && (
              <div className="space-y-6">
                {gsSummary && (
                  <div>
                    <h3 className="text-sm font-semibold text-shell-text mb-3">Season Tracker</h3>
                    <GsTracker
                      gsUsed={gsSummary.gsUsed}
                      gsCap={gsSummary.gsCap}
                      projectedFinal={gsSummary.projectedFinal}
                      paceStatus={gsSummary.paceStatus}
                      pacePerWeek={gsSummary.pacePerWeek}
                    />
                    <p className="text-xs text-shell-muted mt-3">
                      {gsSummary.gsRemaining} starts remaining over {gsSummary.weeksRemaining} weeks = {gsSummary.targetPacePerWeek} starts/week target
                    </p>
                    {gsSummary.paceStatus === "burning_fast" && (
                      <div className="mt-3 p-3 rounded bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                        Pace alert: You'll exceed the {gsSummary.gsCap}-GS cap. Consider sitting low-value SPs.
                      </div>
                    )}
                    {gsSummary.paceStatus === "too_slow" && (
                      <div className="mt-3 p-3 rounded bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
                        You have {gsSummary.gsRemaining} unused starts available — consider streaming.
                      </div>
                    )}
                  </div>
                )}

                {/* Weekly Breakdown */}
                {gsWeekly && (
                  <div>
                    <h3 className="text-sm font-semibold text-shell-text mb-3">
                      This Week ({gsWeekly.weekStart} — {gsWeekly.weekEnd})
                    </h3>
                    <p className="text-xs text-shell-muted mb-2">
                      {gsWeekly.startsUsed} starts used / {gsWeekly.targetPerWeek} target this week
                    </p>
                    {gsWeekly.pitcherStarts.length > 0 ? (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-shell-border text-left">
                            <th className="py-2 pr-4 text-xs text-shell-muted uppercase tracking-wide">Pitcher</th>
                            <th className="py-2 pr-4 text-xs text-shell-muted uppercase tracking-wide">Dates</th>
                            <th className="py-2 text-xs text-shell-muted uppercase tracking-wide text-right">Starts</th>
                          </tr>
                        </thead>
                        <tbody>
                          {gsWeekly.pitcherStarts.map((ps: any) => (
                            <tr key={ps.playerId} className="border-b border-shell-border/50">
                              <td className="py-2 pr-4 text-shell-text">{ps.playerName}</td>
                              <td className="py-2 pr-4">
                                <div className="flex gap-1">
                                  {ps.dates.map((d: string) => (
                                    <Badge key={d} variant="default" className="text-xs font-mono">{d.slice(5)}</Badge>
                                  ))}
                                </div>
                              </td>
                              <td className="py-2 font-mono text-right text-shell-text">{ps.dates.length}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="text-sm text-shell-muted">No SP starts recorded this week.</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Start Plan Tab */}
            {activeTab === "start-plan" && (
              <div className="space-y-4">
                {startPlan?.alert && (
                  <div className={cn(
                    "p-3 rounded text-xs",
                    startPlan.paceStatus === "burning_fast"
                      ? "bg-red-500/10 border border-red-500/20 text-red-400"
                      : "bg-amber-500/10 border border-amber-500/20 text-amber-400"
                  )}>
                    {startPlan.alert}
                  </div>
                )}
                {startPlan?.recommendations?.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-shell-border text-left">
                        <th className="py-2 pr-4 text-xs text-shell-muted uppercase tracking-wide">Pitcher</th>
                        <th className="py-2 pr-4 text-xs text-shell-muted uppercase tracking-wide text-right">K/GS</th>
                        <th className="py-2 pr-4 text-xs text-shell-muted uppercase tracking-wide">Rec</th>
                        <th className="py-2 text-xs text-shell-muted uppercase tracking-wide">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {startPlan.recommendations.map((rec: any) => (
                        <tr key={rec.playerId} className="border-b border-shell-border/50">
                          <td className="py-2 pr-4 text-shell-text">{rec.playerName}</td>
                          <td className="py-2 pr-4 font-mono text-right text-shell-text">
                            {rec.kPerGs !== null ? rec.kPerGs.toFixed(1) : "—"}
                          </td>
                          <td className="py-2 pr-4">
                            <Badge
                              variant={rec.action === "start" ? "positive" : rec.action === "stream" ? "info" : "default"}
                              className="text-xs"
                            >
                              {rec.action}
                            </Badge>
                          </td>
                          <td className="py-2 text-xs text-shell-muted">{rec.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-center py-8 text-shell-muted text-sm">
                    No SP start plan available. Ensure roster snapshots exist.
                  </div>
                )}
              </div>
            )}

            {/* Streaming Picks Tab (existing content) */}
            {activeTab === "streaming" && (
              <div>
                {/* Streaming controls moved inside tab */}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Streaming Picks Content (only when tab active) */}
      {selectedTeamId && activeTab === "streaming" && (
        <div className="mb-6 flex items-center justify-between">
          <div className="inline-flex rounded-lg border border-neutral-200 dark:border-shell-border bg-white dark:bg-shell-panel p-1 gap-1">
            {[1, 3, 7].map((days) => (
              <button
                key={days}
                onClick={() => setLookAheadDays(days)}
                className={cn(
                  "px-4 py-2 text-body-sm font-medium rounded-md transition-colors",
                  lookAheadDays === days
                    ? "bg-accent text-content-inverse shadow-sm"
                    : "text-content hover:bg-surface-secondary dark:hover:bg-shell-bg"
                )}
              >
                {days === 1 ? "1 Day" : days === 3 ? "3 Days" : "7 Days"}
              </button>
            ))}
          </div>

          {data && (
            <div className="text-body-sm text-content-secondary">
              Showing matchups: {formatDate(data.dateRange.start)} -{" "}
              {formatDate(data.dateRange.end)}
            </div>
          )}
        </div>
      )}

      {/* Streaming Content */}
      {activeTab !== "streaming" ? null : !selectedTeamId ? (
        <ErrorAlert
          variant="warning"
          message="Select a team to see streaming pitcher recommendations."
        />
      ) : isLoading ? (
        <Card>
          <CardContent>
            <LoadingSkeleton lines={5} />
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent>
            <ErrorAlert
              message={(error as Error).message}
              onRetry={() => refetch()}
            />
          </CardContent>
        </Card>
      ) : data && data.candidates.length > 0 ? (
        <div className="space-y-4">
          {data.candidates.map((candidate, idx) => (
            <Card
              key={candidate.playerId}
              className="hover:shadow-card-hover transition-shadow"
            >
              <CardContent className="py-5">
                <div className="flex items-start gap-4">
                  {/* Rank Badge */}
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-center h-12 w-12 rounded-full bg-accent text-content-inverse font-bold text-lg shadow-sm">
                      #{idx + 1}
                    </div>
                  </div>

                  {/* Player Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-h4 font-semibold text-content dark:text-shell-text mb-1">
                          {candidate.playerName}
                        </h3>
                        <div className="flex items-center gap-2 text-body-sm text-content-secondary">
                          <span className="font-medium text-content dark:text-shell-text">{candidate.mlbTeam}</span>
                          <span className="text-content-tertiary">•</span>
                          <span>
                            {candidate.isHome ? "vs." : "@"}{" "}
                            {candidate.matchupOpponent}
                          </span>
                          <span className="text-content-tertiary">•</span>
                          <span>{formatDate(candidate.gameDate)}</span>
                        </div>
                      </div>

                      {/* Composite Score */}
                      <div className="flex flex-col items-end">
                        <div
                          className={cn(
                            "text-3xl font-bold font-mono",
                            getScoreClass(candidate.compositeScore)
                          )}
                        >
                          {candidate.compositeScore.toFixed(0)}
                        </div>
                        <div className="text-body-sm text-content-tertiary">Score</div>
                      </div>
                    </div>

                    {/* Score Breakdown */}
                    <div className="flex flex-wrap gap-3 mb-3">
                      <Badge variant={getScoreVariant(candidate.projectionScore)}>
                        Projection: {candidate.projectionScore.toFixed(0)}
                      </Badge>
                      <Badge variant={getScoreVariant(candidate.matchupScore)}>
                        Matchup: {candidate.matchupScore.toFixed(0)}
                      </Badge>
                      {candidate.multiStartBonus > 0 && (
                        <Badge variant="info">
                          Multi-start: +{candidate.multiStartBonus.toFixed(0)}
                        </Badge>
                      )}
                    </div>

                    {/* Additional Badges */}
                    <div className="flex items-center gap-2">
                      {candidate.weekStarts >= 2 && (
                        <Badge variant="default" className="bg-accent text-content-inverse border-transparent">
                          {candidate.weekStarts}-Start Week
                        </Badge>
                      )}
                      {candidate.ownershipPct !== null && (
                        <Badge variant="default">
                          {candidate.ownershipPct.toFixed(1)}% Owned
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 bg-surface-secondary dark:bg-shell-bg rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-content-tertiary" />
            </div>
            <h3 className="text-h4 font-semibold text-content dark:text-shell-text mb-2">
              No Streaming Candidates Found
            </h3>
            <p className="text-body-sm text-content-secondary mb-4">
              No streaming candidates found for this period. Try expanding the
              lookahead window.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Note */}
      {activeTab === "streaming" && data && data.candidates.length > 0 && (
        <div className="text-body-sm text-content-tertiary text-center mt-6">
          Probable pitchers sourced from MLB StatsAPI. Pitchers may change before
          game time.
        </div>
      )}
    </Container>
  );
}
