"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useLeagueTeam } from "@/lib/hooks";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceDot,
} from "recharts";
import { api } from "@/lib/api";
import { COLORS } from "@/lib/constants";
import { useChartTheme } from "@/lib/useChartTheme";
import { cn } from "@/lib/cn";
import { Container } from "@/components/ui/Container";
import { Heading } from "@/components/ui/Heading";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import ImpactBadge from "@/components/league/ImpactBadge";
import ImpactDetailCard from "@/components/league/ImpactDetailCard";
import { FaabGauge } from "@/components/league/FaabGauge";
import { Tooltip as InfoTooltip } from "@/components/ui/Tooltip";
import { StatsTable, StatsTableColumn } from "@/components/ui/StatsTable";

type TabView = "timeline" | "leaderboard" | "draft" | "trades" | "league" | "faab";
type MoveFilter = "all" | "draft" | "add_drop" | "trade";

interface Team {
  id: number;
  name: string;
}

interface LeagueMoveEntry {
  playerGained: { id: number; name: string; positions: string[] } | null;
  playerLost: { id: number; name: string; positions: string[] } | null;
  teamName: string;
  impact: number;
}

interface TradePackage {
  teamName: string;
  impact: number;
}

interface TeamRanking {
  teamId: number;
  teamName: string;
  moveCount: number;
  netRosterValue: number | null;
  actualRotoPoints: number | null;
  draftOnlyRotoPoints: number | null;
  sumOfImpacts: number;
}

interface TimelineDataPoint {
  snapshot_date: string;
  overall_points: number;
}

interface TimelineData {
  data: TimelineDataPoint[];
}

interface LeagueSummaryData {
  totalMovesLeagueWide: number;
  bestMoves: LeagueMoveEntry[];
  worstMoves: LeagueMoveEntry[];
  bestTrades: TradePackage[];
  worstTrades: TradePackage[];
  teamRankings: TeamRanking[];
}

interface SgpCategoryImpact {
  categoryId: string;
  shapleyDelta?: number;
  sgpDelta?: number;
  rawDelta: number;
  sgpFactor: number;
}

interface MoveImpact {
  id: number;
  moveType: string;
  effectiveDate: string;
  impactRotoPoints: number;
  shapleyImpact: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  isUncertain: boolean;
  sgpCategoryImpacts: Array<{
    categoryId: string;
    sgpDelta: number;
    rawDelta: number;
    sgpFactor: number;
  }> | null;
  replacementLevelImpact: number | null;
  playerGained: { id: number; name: string; positions: string[] } | null;
  playerLost: { id: number; name: string; positions: string[] } | null;
  categoryImpacts: Array<{
    categoryId: string;
    actualValue: number;
    counterfactualValue: number;
    deltaRotoPoints: number;
  }>;
  isIncomplete: boolean;
}

interface DraftPick {
  playerId: number;
  playerName: string;
  positions: string[];
  impactRotoPoints: number;
  shapleyImpact: number | null;
  replacementLevelImpact: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  isUncertain: boolean;
  sgpCategoryImpacts: Array<{
    categoryId: string;
    sgpDelta: number;
    rawDelta: number;
    sgpFactor: number;
  }> | null;
  categoryImpacts: Array<{
    categoryId: string;
    actualValue: number;
    counterfactualValue: number;
    deltaRotoPoints: number;
  }>;
  keyStats: Record<string, number> | null;
  stillOnTeam: boolean;
  isIncomplete: boolean;
}

const MOVE_TYPE_LABELS: Record<string, string> = {
  draft: "Draft",
  add_drop: "Add/Drop",
  trade: "Trade",
};

function getMoveTypeBadgeVariant(moveType: string): "default" | "positive" | "negative" | "info" | "warning" {
  if (moveType === "add_drop") return "positive";
  if (moveType === "trade") return "info";
  return "default";
}

export default function MovesPage() {
  const params = useParams();
  const leagueId = parseInt(params.id as string, 10);

  const [selectedTeamId, setSelectedTeamId] = useLeagueTeam(leagueId);
  const [activeTab, setActiveTab] = useState<TabView>("league");
  const [moveFilter, setMoveFilter] = useState<MoveFilter>("all");
  const [expandedMoveId, setExpandedMoveId] = useState<number | null>(null);
  const [season, setSeason] = useState<number | null>(null);

  // Fetch teams
  const { data: teamsData } = useQuery({
    queryKey: ["league-teams", leagueId],
    queryFn: () => api.getTeams(leagueId),
    enabled: !!leagueId,
  });

  // Fetch available seasons
  const { data: seasonsData } = useQuery({
    queryKey: ["league-seasons", leagueId],
    queryFn: () => api.getLeagueSeasons(leagueId),
    enabled: !!leagueId,
  });

  // Default season to most recent when seasons load
  useEffect(() => {
    if (seasonsData?.seasons?.length && season === null) {
      setSeason(seasonsData.seasons[0]);
    }
  }, [seasonsData, season]);

  // Fetch transaction impacts
  const { data: impactData, isLoading: impactLoading, error: impactError } = useQuery({
    queryKey: ["transaction-impacts", leagueId, selectedTeamId, season],
    queryFn: () => api.getTransactionImpacts(leagueId, selectedTeamId!, { season: season! }),
    enabled: !!selectedTeamId && !!season,
  });

  // Fetch draft report
  const { data: draftData, isLoading: draftLoading } = useQuery({
    queryKey: ["draft-report", leagueId, selectedTeamId, season],
    queryFn: () => api.getDraftReport(leagueId, selectedTeamId!, season!),
    enabled: !!selectedTeamId && !!season && activeTab === "draft",
  });

  // Fetch league-wide impact summary
  const { data: leagueSummaryData, isLoading: leagueSummaryLoading } = useQuery({
    queryKey: ["league-impact-summary", leagueId, season],
    queryFn: () => api.getLeagueImpactSummary(leagueId, season!),
    enabled: !!leagueId && !!season && activeTab === "league",
  });

  // Fetch overall standings timeline for the chart
  const { data: timelineData } = useQuery({
    queryKey: ["timeline-overall", leagueId, season],
    queryFn: () => api.getOverallTimeSeries(leagueId, { season: String(season!) }),
    enabled: !!leagueId && !!season && activeTab === "timeline",
  });

  const queryClient = useQueryClient();
  const [computeStatus, setComputeStatus] = useState<string | null>(null);

  const computeMutation = useMutation({
    mutationFn: () => api.computeTransactionImpacts(leagueId, season!),
    onSuccess: (data: any) => {
      setComputeStatus(`Done — ${data.totalMoves} moves, ${data.impactsComputed} impacts computed`);
      queryClient.invalidateQueries({ queryKey: ["transaction-impacts"] });
      queryClient.invalidateQueries({ queryKey: ["league-impact-summary"] });
      queryClient.invalidateQueries({ queryKey: ["draft-report"] });
    },
    onError: (err: any) => {
      setComputeStatus(`Error: ${err.message || "Failed to compute impacts"}`);
    },
  });

  const teams = teamsData?.teams || [];
  const impacts: MoveImpact[] = impactData?.impacts || [];
  const summary = impactData?.summary;

  const filteredImpacts =
    moveFilter === "all"
      ? impacts
      : impacts.filter((m) => m.moveType === moveFilter);

  const handleTeamChange = (teamId: number) => {
    setSelectedTeamId(teamId);
  };

  const tabClass = (active: boolean) =>
    cn(
      "whitespace-nowrap py-3 px-5 border-b-2 font-medium text-sm transition-colors",
      active
        ? "border-accent dark:border-shell-accent text-accent dark:text-shell-text font-semibold"
        : "border-transparent text-content-secondary dark:text-shell-muted hover:text-content dark:hover:text-shell-text hover:border-accent/40 dark:hover:border-shell-border"
    );

  return (
    <Container size="wide" className="py-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-h3 font-semibold text-content dark:text-shell-text">Move Impact</h1>
        <p className="text-body-sm text-content-secondary dark:text-shell-muted">
          See which roster moves helped or hurt your season
        </p>
      </div>

      {/* Team Selector */}
      <div className="bg-shell-panel dark:bg-shell-panel rounded-card border border-shell-border p-4 mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <label className="text-body-sm font-medium text-content-secondary dark:text-shell-muted">Team:</label>
          <select
            value={selectedTeamId || ""}
            onChange={(e) => handleTeamChange(parseInt(e.target.value, 10))}
            className="rounded-lg border border-shell-border text-body-sm px-3 py-2 bg-shell-bg dark:bg-shell-bg text-content dark:text-shell-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <option value="">Select a team</option>
            {teams.map((t: Team) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <label className="text-body-sm font-medium text-content-secondary dark:text-shell-muted">Season:</label>
          <select
            value={season || ""}
            onChange={(e) => setSeason(parseInt(e.target.value, 10))}
            className="rounded-lg border border-shell-border text-body-sm px-3 py-2 bg-shell-bg dark:bg-shell-bg text-content dark:text-shell-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {seasonsData?.seasons?.map((s: number) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <button
            onClick={() => {
              setComputeStatus(null);
              computeMutation.mutate();
            }}
            disabled={!season || computeMutation.isPending}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              computeMutation.isPending
                ? "bg-shell-border text-shell-muted cursor-wait"
                : "bg-accent text-white hover:bg-accent/80"
            )}
          >
            {computeMutation.isPending ? "Computing..." : "Compute Impacts"}
          </button>
          {computeStatus && (
            <span className="text-xs text-shell-muted ml-2">{computeStatus}</span>
          )}
        </div>
      </div>

      {/* Team-specific Summary Line */}
      {selectedTeamId && summary && activeTab !== "league" && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-body-sm mb-6">
          <span className="text-shell-muted">{summary.totalMoves} moves</span>
          <span className="font-mono text-positive dark:text-positive-dark">
            {summary.netRosterValue != null ? (
              <>{summary.netRosterValue >= 0 ? "+" : ""}{summary.netRosterValue.toFixed(1)} pts</>
            ) : (
              <>{summary.sumOfIndividualImpacts >= 0 ? "+" : ""}{summary.sumOfIndividualImpacts.toFixed(1)} pts</>
            )}
          </span>
          <span className="text-shell-muted">avg <span className="font-mono">{summary.avgImpactPerMove >= 0 ? "+" : ""}{summary.avgImpactPerMove.toFixed(1)}</span>/move</span>
          {summary.bestMove && (
            <span className="text-shell-muted">
              Best: <span className="text-shell-text font-medium">{summary.bestMove.playerName}</span>{" "}
              <span className="text-positive dark:text-positive-dark font-mono">+{summary.bestMove.impact.toFixed(1)}</span>
            </span>
          )}
          {summary.worstMove && (
            <span className="text-shell-muted">
              Worst: <span className="text-shell-text font-medium">{summary.worstMove.playerName}</span>{" "}
              <span className="text-negative dark:text-negative-dark font-mono">{summary.worstMove.impact.toFixed(1)}</span>
            </span>
          )}
        </div>
      )}

      {(selectedTeamId || activeTab === "league") ? (
        <>
          {/* Tab Navigation */}
          <div className="bg-shell-panel dark:bg-shell-panel rounded-card border border-shell-border mb-6">
            <nav className="-mb-px flex border-b border-shell-border">
              {(["league", "faab", "leaderboard", "trades", "draft", "timeline"] as const).map((tab) => {
                const labels: Record<string, string> = {
                  league: "League Summary",
                  faab: "FAAB Budget",
                  leaderboard: "Move Leaderboard",
                  trades: "Trades",
                  draft: "Draft Report",
                  timeline: "Impact Timeline",
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
              {activeTab === "league" && (
                <LeagueSummaryTab
                  data={leagueSummaryData}
                  isLoading={leagueSummaryLoading}
                  selectedTeamId={selectedTeamId}
                />
              )}
              {activeTab === "faab" && (
                <FaabBudgetTab leagueId={leagueId} teamId={selectedTeamId} />
              )}
              {activeTab === "leaderboard" && selectedTeamId && (
                <LeaderboardTab
                  impacts={filteredImpacts}
                  moveFilter={moveFilter}
                  setMoveFilter={setMoveFilter}
                  expandedMoveId={expandedMoveId}
                  setExpandedMoveId={setExpandedMoveId}
                />
              )}
              {activeTab !== "league" && !selectedTeamId && (
                <div className="text-center py-8 text-content-secondary dark:text-shell-muted">
                  Select a team to view this tab.
                </div>
              )}
              {activeTab === "trades" && selectedTeamId && (
                <TradesTab
                  impacts={impacts.filter((m) => m.moveType === "trade")}
                  expandedMoveId={expandedMoveId}
                  setExpandedMoveId={setExpandedMoveId}
                />
              )}
              {activeTab === "draft" && selectedTeamId && (
                <DraftReportTab
                  draftPicks={draftData?.draftPicks || []}
                  summary={draftData?.summary}
                  isLoading={draftLoading}
                />
              )}
              {activeTab === "timeline" && selectedTeamId && (
                <TimelineTab
                  impacts={impacts}
                  timelineData={timelineData}
                  selectedTeamId={selectedTeamId}
                  teams={teams}
                />
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-content-secondary dark:text-shell-muted">
          Select a team to view move impact analysis, or use the League Summary tab.
        </div>
      )}
    </Container>
  );
}

// ─── League Summary Tab ─────────────────────────────────────

interface LeagueMoveEntry {
  id: number;
  teamId: number;
  teamName: string;
  moveType: string;
  effectiveDate: string;
  impact: number;
  isUncertain: boolean;
  ciLow: number | null;
  ciHigh: number | null;
  isIncomplete: boolean;
  playerGained: { id: number; name: string; positions: string[] } | null;
  playerLost: { id: number; name: string; positions: string[] } | null;
}

interface TeamRanking {
  teamId: number;
  teamName: string;
  moveCount: number;
  netRosterValue: number | null;
  actualRotoPoints: number | null;
  draftOnlyRotoPoints: number | null;
  sumOfImpacts: number;
}

interface TradePackage {
  teamId: number;
  teamName: string;
  effectiveDate: string;
  totalImpact: number;
  playersGained: Array<{ id: number; name: string; positions: string[] }>;
  playersLost: Array<{ id: number; name: string; positions: string[] }>;
}

// --- FAAB Budget Tab ---

interface FaabSummaryData {
  faabTotal: number;
  faabSpent: number;
  faabRemaining: number;
  leagueAvgRemaining: number;
  spendRate: number;
  projectedRunoutWeek: number | null;
  weeksRemaining: number;
  willRunOut: boolean;
}

interface FaabBid {
  date: string;
  playerName: string;
  playerId: number;
  bidAmount: number;
  outcome: string;
  roi: number | null;
}

function FaabBudgetTab({ leagueId, teamId }: { leagueId: number; teamId: number | null }) {
  const { data: faabSummary, isLoading: summaryLoading } = useQuery<FaabSummaryData>({
    queryKey: ["faab-summary", leagueId, teamId],
    queryFn: () => api.getFaabSummary(leagueId, teamId!) as Promise<FaabSummaryData>,
    enabled: !!teamId,
    staleTime: 5 * 60_000,
  });

  const { data: historyData, isLoading: historyLoading } = useQuery<{ bids: FaabBid[] }>({
    queryKey: ["faab-history", leagueId, teamId],
    queryFn: () => api.getFaabHistory(leagueId, teamId!) as Promise<{ bids: FaabBid[] }>,
    enabled: !!teamId,
    staleTime: 5 * 60_000,
  });

  if (!teamId) {
    return (
      <div className="text-center py-8 text-shell-muted">
        Select a team to view FAAB budget.
      </div>
    );
  }

  if (summaryLoading) {
    return <div className="flex justify-center py-8"><LoadingSpinner /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Budget Overview */}
      {faabSummary && (
        <div>
          <h3 className="text-sm font-semibold text-shell-text mb-3">Budget Overview</h3>
          <FaabGauge
            spent={faabSummary.faabSpent}
            total={faabSummary.faabTotal}
            leagueAvg={faabSummary.leagueAvgRemaining}
          />
          <p className="text-xs text-shell-muted mt-3">
            {faabSummary.spendRate > 0 ? (
              faabSummary.willRunOut ? (
                <span className="text-red-400">
                  Spending ${faabSummary.spendRate}/week — projected to run out by Week {faabSummary.projectedRunoutWeek}
                </span>
              ) : (
                <span className="text-emerald-400">
                  Spending ${faabSummary.spendRate}/week — on pace to finish with ${faabSummary.faabRemaining} remaining
                </span>
              )
            ) : (
              "No FAAB spending recorded yet."
            )}
          </p>
        </div>
      )}

      {/* Bid History */}
      <div>
        <h3 className="text-sm font-semibold text-shell-text mb-3">Bid History</h3>
        {historyLoading ? (
          <div className="flex justify-center py-4"><LoadingSpinner /></div>
        ) : historyData?.bids && historyData.bids.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-shell-border text-left">
                  <th className="py-2 pr-4 text-xs text-shell-muted uppercase tracking-wide">Date</th>
                  <th className="py-2 pr-4 text-xs text-shell-muted uppercase tracking-wide">Player</th>
                  <th className="py-2 pr-4 text-xs text-shell-muted uppercase tracking-wide text-right">Bid</th>
                  <th className="py-2 pr-4 text-xs text-shell-muted uppercase tracking-wide">Result</th>
                  <th className="py-2 text-xs text-shell-muted uppercase tracking-wide text-right">ROI</th>
                </tr>
              </thead>
              <tbody>
                {historyData.bids.map((bid) => (
                  <tr key={`${bid.playerId}-${bid.date}`} className="border-b border-shell-border/50">
                    <td className="py-2 pr-4 font-mono text-xs text-shell-muted">{bid.date}</td>
                    <td className="py-2 pr-4 text-shell-text">{bid.playerName}</td>
                    <td className="py-2 pr-4 font-mono text-right text-shell-text">${bid.bidAmount}</td>
                    <td className="py-2 pr-4">
                      <Badge variant="positive" className="text-xs">{bid.outcome}</Badge>
                    </td>
                    <td className="py-2 font-mono text-right text-shell-text">
                      {bid.roi !== null ? `${bid.roi}x` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-4 text-shell-muted text-sm">
            No bid history found.
          </div>
        )}
      </div>
    </div>
  );
}

function LeagueSummaryTab({
  data,
  isLoading,
  selectedTeamId,
}: {
  data: LeagueSummaryData | null;
  isLoading: boolean;
  selectedTeamId: number | null;
}) {
  if (isLoading) {
    return <LoadingSpinner message="Loading league-wide summary..." />;
  }

  if (!data) {
    return (
      <div className="text-center py-8 text-content-secondary dark:text-shell-muted">
        No impact data yet. Click "Compute Impacts" above to analyze roster moves. Requires at least 2 daily snapshots.
      </div>
    );
  }

  const bestMoves: LeagueMoveEntry[] = data.bestMoves || [];
  const worstMoves: LeagueMoveEntry[] = data.worstMoves || [];
  const bestTrades: TradePackage[] = data.bestTrades || [];
  const worstTrades: TradePackage[] = data.worstTrades || [];
  const teamRankings: TeamRanking[] = data.teamRankings || [];

  return (
    <div className="space-y-8">
      {/* League-wide stats */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-body-sm">
        <span className="text-shell-muted">{data.totalMovesLeagueWide} moves league-wide</span>
        {bestMoves[0] && (
          <span className="text-shell-muted">
            Best: <span className="text-shell-text font-medium">{bestMoves[0].playerGained?.name || "—"}</span>{" "}
            <span className="text-xs text-content-secondary dark:text-shell-muted">({bestMoves[0].teamName})</span>{" "}
            <span className="text-positive dark:text-positive-dark font-mono">+{bestMoves[0].impact.toFixed(1)}</span>
          </span>
        )}
        {worstMoves[0] && (
          <span className="text-shell-muted">
            Worst: <span className="text-shell-text font-medium">{worstMoves[0].playerGained?.name || worstMoves[0].playerLost?.name || "—"}</span>{" "}
            <span className="text-xs text-content-secondary dark:text-shell-muted">({worstMoves[0].teamName})</span>{" "}
            <span className="text-negative dark:text-negative-dark font-mono">{worstMoves[0].impact.toFixed(1)}</span>
          </span>
        )}
      </div>

      {/* Roster Manager Rankings */}
      <div>
        <Heading level={3} className="mb-3">Roster Manager Rankings</Heading>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-shell-border">
            <thead className="bg-shell-bg">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wide">Rank</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wide">Team</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wide">Moves</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wide">Net Roster Value</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wide">Actual Pts</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wide">Draft-Only Pts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-shell-border">
              {teamRankings.map((team, idx) => (
                <tr
                  key={team.teamId}
                  className={cn(
                    "border-b border-shell-border hover:bg-shell-bg transition-colors",
                    team.teamId === selectedTeamId && "bg-accent/10"
                  )}
                >
                  <td className="px-4 py-3 text-body-sm font-medium text-content dark:text-shell-text">
                    {idx + 1}
                    {idx === 0 && <span className="ml-1" title="Best roster manager">&#127942;</span>}
                  </td>
                  <td className="px-4 py-3 text-body-sm text-content dark:text-shell-text">
                    {team.teamName}
                    {team.teamId === selectedTeamId && (
                      <span className="ml-1 text-xs text-content-secondary dark:text-shell-muted">(you)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-body-sm text-content-secondary dark:text-shell-muted text-right">{team.moveCount}</td>
                  <td className="px-4 py-3 text-right">
                    {team.netRosterValue != null ? (
                      <ImpactBadge impact={team.netRosterValue} size="sm" />
                    ) : (
                      <span className="text-content-tertiary dark:text-shell-muted text-xs">N/A</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-body-sm text-content-secondary dark:text-shell-muted text-right">
                    {team.actualRotoPoints ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-body-sm text-content-secondary dark:text-shell-muted text-right">
                    {team.draftOnlyRotoPoints ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Best Trades */}
      {bestTrades.length > 0 && (
        <div>
          <Heading level={3} className="mb-3">Best Trades</Heading>
          <TradePackageList packages={bestTrades} selectedTeamId={selectedTeamId} />
        </div>
      )}

      {/* Worst Trades */}
      {worstTrades.length > 0 && (
        <div>
          <Heading level={3} className="mb-3">Worst Trades</Heading>
          <TradePackageList packages={worstTrades} selectedTeamId={selectedTeamId} />
        </div>
      )}

      {/* Best Moves */}
      <div>
        <Heading level={3} className="mb-3 text-positive">Best Moves (All Types)</Heading>
        <MoveListTable moves={bestMoves} selectedTeamId={selectedTeamId} />
      </div>

      {/* Worst Moves */}
      <div>
        <Heading level={3} className="mb-3 text-negative">Worst Moves (All Types)</Heading>
        <MoveListTable moves={worstMoves} selectedTeamId={selectedTeamId} />
      </div>
    </div>
  );
}

function MoveListTable({
  moves,
  selectedTeamId,
}: {
  moves: LeagueMoveEntry[];
  selectedTeamId: number | null;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-shell-border">
        <thead className="bg-shell-bg">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wide">Date</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wide">Team</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wide">Type</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wide">Gained</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wide">Lost</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wide">Impact</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-shell-border">
          {moves.map((m) => (
            <tr
              key={m.id}
              className={cn(
                "border-b border-shell-border hover:bg-shell-bg transition-colors",
                m.teamId === selectedTeamId && "bg-accent/10"
              )}
            >
              <td className="px-4 py-3 text-body-sm text-content-secondary dark:text-shell-muted">
                {new Date(m.effectiveDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                {m.isIncomplete && <span className="ml-1 text-warning" title="Incomplete data">&#9888;</span>}
              </td>
              <td className="px-4 py-3 text-body-sm text-content dark:text-shell-text">{m.teamName}</td>
              <td className="px-4 py-3">
                <Badge variant={getMoveTypeBadgeVariant(m.moveType)}>
                  {MOVE_TYPE_LABELS[m.moveType] || m.moveType}
                </Badge>
              </td>
              <td className="px-4 py-3 text-body-sm font-medium text-content dark:text-shell-text">
                {m.playerGained?.name || "—"}
                {m.playerGained?.positions && (
                  <span className="ml-1 text-xs text-content-secondary dark:text-shell-muted">({m.playerGained.positions.join(", ")})</span>
                )}
              </td>
              <td className="px-4 py-3 text-body-sm text-content-secondary dark:text-shell-muted">
                {m.playerLost?.name || "—"}
                {m.playerLost?.positions && (
                  <span className="ml-1 text-xs text-content-tertiary dark:text-shell-muted">({m.playerLost.positions.join(", ")})</span>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <ImpactBadge impact={m.impact} isUncertain={m.isUncertain} size="sm" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TradePackageList({
  packages: pkgs,
  selectedTeamId,
}: {
  packages: TradePackage[];
  selectedTeamId: number | null;
}) {
  return (
    <div className="space-y-2">
      {pkgs.map((pkg, idx) => (
        <div
          key={`${pkg.teamId}-${pkg.effectiveDate}`}
          className={cn(
            "border rounded-lg p-4",
            pkg.teamId === selectedTeamId
              ? "border-accent dark:border-shell-accent bg-accent/10 dark:bg-shell-accent/20"
              : "border-shell-border"
          )}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <span className="text-body-sm font-bold text-content-tertiary dark:text-shell-muted w-6">{idx + 1}.</span>
              <div>
                <span className="text-body-sm font-semibold text-content dark:text-shell-text">{pkg.teamName}</span>
                <span className="ml-2 text-xs text-content-secondary dark:text-shell-muted">
                  {new Date(pkg.effectiveDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </div>
            </div>
            <ImpactBadge impact={pkg.totalImpact} />
          </div>
          <div className="flex items-center gap-2 flex-wrap text-body-sm">
            <span className="text-xs font-medium text-positive uppercase">Got</span>
            {pkg.playersGained.map((p, i) => (
              <span key={p.id} className="font-medium text-content dark:text-shell-text">
                {i > 0 && <span className="text-content-tertiary dark:text-shell-muted">, </span>}
                {p.name}
                <span className="ml-0.5 text-xs text-content-secondary dark:text-shell-muted">({p.positions.join(", ")})</span>
              </span>
            ))}
            {pkg.playersGained.length === 0 && <span className="text-content-tertiary dark:text-shell-muted">—</span>}
            <span className="text-content-tertiary dark:text-shell-muted mx-1">|</span>
            <span className="text-xs font-medium text-negative uppercase">Gave</span>
            {pkg.playersLost.map((p, i) => (
              <span key={p.id} className="text-content-secondary dark:text-shell-muted">
                {i > 0 && <span className="text-content-tertiary dark:text-shell-muted">, </span>}
                {p.name}
                <span className="ml-0.5 text-xs text-content-tertiary dark:text-shell-muted">({p.positions.join(", ")})</span>
              </span>
            ))}
            {pkg.playersLost.length === 0 && <span className="text-content-tertiary dark:text-shell-muted">—</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Leaderboard Tab ─────────────────────────────────────────

function LeaderboardTab({
  impacts,
  moveFilter,
  setMoveFilter,
  expandedMoveId,
  setExpandedMoveId,
}: {
  impacts: MoveImpact[];
  moveFilter: MoveFilter;
  setMoveFilter: (f: MoveFilter) => void;
  expandedMoveId: number | null;
  setExpandedMoveId: (id: number | null) => void;
}) {
  return (
    <div>
      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {(["all", "draft", "add_drop", "trade"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setMoveFilter(f)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-colors",
              moveFilter === f
                ? "bg-accent text-content-inverse"
                : "bg-shell-bg text-content-secondary dark:text-shell-muted hover:bg-neutral-200 dark:hover:bg-shell-panel"
            )}
          >
            {f === "all" ? "All" : MOVE_TYPE_LABELS[f] || f}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-shell-border">
          <thead className="bg-shell-bg">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wide">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wide">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wide">Player Gained</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wide">Player Lost</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wide">Impact</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wide">Top Category</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-shell-border">
            {impacts.map((move) => {
              const topSgp = move.sgpCategoryImpacts
                ?.filter((c: SgpCategoryImpact) => Math.abs(c.shapleyDelta ?? c.sgpDelta ?? 0) >= 0.01)
                .sort((a: SgpCategoryImpact, b: SgpCategoryImpact) => Math.abs(b.shapleyDelta ?? b.sgpDelta ?? 0) - Math.abs(a.shapleyDelta ?? a.sgpDelta ?? 0))[0] as SgpCategoryImpact | undefined;
              const topCatDelta = topSgp ? (topSgp.shapleyDelta ?? topSgp.sgpDelta ?? 0) : null;

              // Use Shapley impact if available, else legacy impact
              const displayImpact = move.shapleyImpact ?? move.impactRotoPoints;

              return (
                <tr key={move.id} className={cn("group", move.isUncertain && "opacity-80")}>
                  <td colSpan={6} className="p-0">
                    <div
                      className="px-4 py-3 cursor-pointer hover:bg-shell-bg grid grid-cols-6 items-center transition-colors"
                      onClick={() => setExpandedMoveId(expandedMoveId === move.id ? null : move.id)}
                    >
                      <div className="text-body-sm text-content-secondary dark:text-shell-muted">
                        {new Date(move.effectiveDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </div>
                      <div>
                        <Badge variant={getMoveTypeBadgeVariant(move.moveType)}>
                          {MOVE_TYPE_LABELS[move.moveType] || move.moveType}
                        </Badge>
                        {move.isIncomplete && (
                          <span className="ml-1 text-warning" title="Incomplete data">&#9888;</span>
                        )}
                      </div>
                      <div className="text-body-sm font-medium text-content dark:text-shell-text">
                        {move.playerGained?.name || "—"}
                      </div>
                      <div className="text-body-sm text-content-secondary dark:text-shell-muted">
                        {move.playerLost?.name || "—"}
                      </div>
                      <div className="text-right">
                        <ImpactBadge
                          impact={displayImpact}
                          isUncertain={move.isUncertain}
                          ciLow={move.ciLow}
                          ciHigh={move.ciHigh}
                        />
                      </div>
                      <div className="text-right text-xs text-content-secondary dark:text-shell-muted">
                        {topSgp && topCatDelta !== null ? `${topSgp.categoryId} (${topCatDelta > 0 ? "+" : ""}${topCatDelta.toFixed(1)})` : "—"}
                      </div>
                    </div>

                    {expandedMoveId === move.id && (
                      <div className="px-4 pb-3">
                        <ImpactDetailCard
                          playerGained={move.playerGained}
                          playerLost={move.playerLost}
                          moveType={move.moveType}
                          effectiveDate={move.effectiveDate}
                          impactRotoPoints={displayImpact}
                          categoryImpacts={move.categoryImpacts}
                          sgpCategoryImpacts={move.sgpCategoryImpacts}
                          isUncertain={move.isUncertain}
                          ciLow={move.ciLow}
                          ciHigh={move.ciHigh}
                          isIncomplete={move.isIncomplete}
                          onClose={() => setExpandedMoveId(null)}
                        />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {impacts.length === 0 && (
        <div className="text-center py-8 text-content-secondary dark:text-shell-muted">
          No moves found. Click "Compute Impacts" above to derive roster moves and calculate their roto-point impact.
        </div>
      )}
    </div>
  );
}

// ─── Draft Report Tab ────────────────────────────────────────

function DraftReportTab({
  draftPicks,
  summary,
  isLoading,
}: {
  draftPicks: DraftPick[];
  summary?: {
    totalPicks: number;
    totalDraftValue: number;
    bestPick: { playerName: string; impact: number } | null;
    worstPick: { playerName: string; impact: number } | null;
  };
  isLoading: boolean;
}) {
  if (isLoading) return <LoadingSpinner message="Loading draft report..." />;

  // Calculate draft skill (average replacement-level impact)
  const replacementImpacts = draftPicks
    .map(p => p.replacementLevelImpact)
    .filter((i): i is number => i != null);
  const avgReplacementImpact = replacementImpacts.length > 0
    ? replacementImpacts.reduce((sum, i) => sum + i, 0) / replacementImpacts.length
    : null;

  return (
    <div>
      {/* Draft Summary */}
      {summary && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-body-sm mb-4">
          <span className="text-shell-muted">{summary.totalPicks} picks</span>
          <span className="font-mono text-positive dark:text-positive-dark">
            {summary.totalDraftValue >= 0 ? "+" : ""}{summary.totalDraftValue.toFixed(1)} pts
          </span>
          {summary.bestPick && (
            <span className="text-shell-muted">
              Best: <span className="text-shell-text font-medium">{summary.bestPick.playerName}</span>{" "}
              <span className="text-positive dark:text-positive-dark font-mono">+{summary.bestPick.impact.toFixed(1)}</span>
            </span>
          )}
          {avgReplacementImpact != null && (
            <span className="text-shell-muted">
              Skill: <span className="font-mono text-positive dark:text-positive-dark">
                {avgReplacementImpact >= 0 ? "+" : ""}{avgReplacementImpact.toFixed(1)}
              </span> vs replacement
            </span>
          )}
        </div>
      )}

      {/* Draft Picks Table */}
      <StatsTable
        columns={draftTableColumns}
        data={draftPicks.map((pick, idx) => ({
          id: pick.playerId,
          pickNum: idx + 1,
          playerName: pick.playerName,
          positions: pick.positions?.join(", ") ?? "",
          keyStats: pick.keyStats ? formatKeyStats(pick.keyStats) : "",
          displayImpact: pick.shapleyImpact ?? pick.impactRotoPoints,
          replacementLevelImpact: pick.replacementLevelImpact,
          stillOnTeam: pick.stillOnTeam,
          isUncertain: pick.isUncertain,
          ciLow: pick.ciLow,
          ciHigh: pick.ciHigh,
        }))}
        sortable
        defaultSortKey="displayImpact"
        defaultSortDir="desc"
        rowKey="id"
        highlightRow={(row) => !row.stillOnTeam}
        highlightClassName="opacity-60"
        emptyMessage="No draft picks found."
      />
    </div>
  );
}

const draftTableColumns: StatsTableColumn[] = [
  {
    key: "pickNum",
    label: "#",
    align: "left",
    sortable: false,
    className: "text-content-tertiary dark:text-shell-muted !font-sans",
  },
  {
    key: "playerName",
    label: "Player",
    align: "left",
    sortable: false,
    className: "font-medium !font-sans",
  },
  {
    key: "positions",
    label: "Pos",
    align: "left",
    sortable: false,
    className: "text-content-secondary dark:text-shell-muted text-xs !font-sans",
  },
  {
    key: "keyStats",
    label: "Key Stats",
    align: "right",
    sortable: false,
    className: "text-content-secondary dark:text-shell-muted text-xs !font-sans",
  },
  {
    key: "displayImpact",
    label: (
      <InfoTooltip content="Impact on overall roto standings points from drafting this player">
        Roto Pts Value
      </InfoTooltip>
    ),
    align: "right",
    sortable: true,
    format: (value: number, row: Record<string, any>) => (
      <ImpactBadge
        impact={value}
        isUncertain={row.isUncertain}
        ciLow={row.ciLow}
        ciHigh={row.ciHigh}
      />
    ),
  },
  {
    key: "replacementLevelImpact",
    label: (
      <InfoTooltip content="Value above a freely available replacement-level player at the same position">
        vs Replacement
      </InfoTooltip>
    ),
    align: "right",
    sortable: true,
    format: (value: number | null) =>
      value != null ? (
        <ImpactBadge impact={value} size="sm" />
      ) : (
        <span className="text-content-tertiary dark:text-shell-muted text-xs">&mdash;</span>
      ),
  },
  {
    key: "stillOnTeam",
    label: "On Team",
    align: "center",
    sortable: false,
    format: (value: boolean) =>
      value ? (
        <span className="text-positive">&#10003;</span>
      ) : (
        <span className="text-content-tertiary dark:text-shell-muted">&#10007;</span>
      ),
  },
];

function formatKeyStats(stats: Record<string, number>): string {
  const parts: string[] = [];
  if (stats.R) parts.push(`${Math.round(stats.R)}R`);
  if (stats.HR) parts.push(`${Math.round(stats.HR)}HR`);
  if (stats.RBI) parts.push(`${Math.round(stats.RBI)}RBI`);
  if (stats.SB) parts.push(`${Math.round(stats.SB)}SB`);
  if (stats.K) parts.push(`${Math.round(stats.K)}K`);
  if (stats.W) parts.push(`${Math.round(stats.W)}W`);
  if (stats.SV) parts.push(`${Math.round(stats.SV)}SV`);
  if (parts.length === 0 && stats.H) parts.push(`${Math.round(stats.H)}H`);
  if (parts.length === 0 && stats.IP) parts.push(`${stats.IP.toFixed(1)}IP`);
  return parts.slice(0, 4).join(" / ");
}

// ─── Trades Tab ──────────────────────────────────────────

interface TradeGroup {
  key: string;
  effectiveDate: string;
  legs: MoveImpact[];
  totalImpact: number;
  isMultiPlayer: boolean;
}

function groupTradesByDate(impacts: MoveImpact[]): TradeGroup[] {
  const byDate = new Map<string, MoveImpact[]>();
  for (const m of impacts) {
    const existing = byDate.get(m.effectiveDate) || [];
    existing.push(m);
    byDate.set(m.effectiveDate, existing);
  }

  return Array.from(byDate.entries()).map(([date, legs]) => ({
    key: date,
    effectiveDate: date,
    legs,
    totalImpact: legs.reduce((sum, l) => sum + (l.shapleyImpact ?? l.impactRotoPoints), 0),
    isMultiPlayer: legs.length > 1,
  }));
}

function TradesTab({
  impacts,
  expandedMoveId,
  setExpandedMoveId,
}: {
  impacts: MoveImpact[];
  expandedMoveId: number | null;
  setExpandedMoveId: (id: number | null) => void;
}) {
  const tradeGroups = groupTradesByDate(impacts);
  const netTradeImpact = impacts.reduce((sum, m) => sum + (m.shapleyImpact ?? m.impactRotoPoints), 0);

  // Sort groups by absolute total impact (descending)
  const sortedGroups = [...tradeGroups].sort(
    (a, b) => Math.abs(b.totalImpact) - Math.abs(a.totalImpact),
  );

  if (impacts.length === 0) {
    return (
      <div className="text-center py-8 text-content-secondary dark:text-shell-muted">
        No trades found for this season.
      </div>
    );
  }

  return (
    <div>
      {/* Trade Summary */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-body-sm mb-4">
        <span className="text-shell-muted">{tradeGroups.length} trades</span>
        <span className="font-mono">
          <span className={netTradeImpact >= 0 ? "text-positive dark:text-positive-dark" : "text-negative dark:text-negative-dark"}>
            {netTradeImpact >= 0 ? "+" : ""}{netTradeImpact.toFixed(1)} pts net
          </span>
        </span>
      </div>

      {/* Trades List */}
      <div className="space-y-2">
        {sortedGroups.map((group) => {
          const isExpanded = expandedMoveId === group.legs[0].id;
          const received = group.legs
            .map((l) => l.playerGained)
            .filter(Boolean) as { id: number; name: string; positions: string[] }[];
          const sent = group.legs
            .map((l) => l.playerLost)
            .filter(Boolean) as { id: number; name: string; positions: string[] }[];

          return (
            <div
              key={group.key}
              className="border border-shell-border rounded-lg overflow-hidden"
            >
              {/* Trade header row */}
              <div
                className="px-4 py-3 cursor-pointer hover:bg-shell-bg flex items-center gap-4 transition-colors"
                onClick={() => setExpandedMoveId(isExpanded ? null : group.legs[0].id)}
              >
                {/* Date */}
                <div className="text-body-sm text-content-secondary dark:text-shell-muted w-20 shrink-0">
                  {new Date(group.effectiveDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </div>

                {/* Players involved */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Received */}
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-xs font-medium text-positive uppercase shrink-0">Got</span>
                      {received.map((p, i) => (
                        <span key={p.id} className="text-body-sm font-medium text-content dark:text-shell-text">
                          {i > 0 && <span className="text-content-tertiary dark:text-shell-muted mr-1">,</span>}
                          {p.name}
                          <span className="ml-0.5 text-xs text-content-secondary dark:text-shell-muted">
                            ({p.positions.join(", ")})
                          </span>
                        </span>
                      ))}
                    </div>

                    <span className="text-content-tertiary dark:text-shell-muted mx-1">|</span>

                    {/* Sent */}
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-xs font-medium text-negative uppercase shrink-0">Gave</span>
                      {sent.map((p, i) => (
                        <span key={p.id} className="text-body-sm text-content-secondary dark:text-shell-muted">
                          {i > 0 && <span className="text-content-tertiary dark:text-shell-muted mr-1">,</span>}
                          {p.name}
                          <span className="ml-0.5 text-xs text-content-tertiary dark:text-shell-muted">
                            ({p.positions.join(", ")})
                          </span>
                        </span>
                      ))}
                      {sent.length === 0 && <span className="text-body-sm text-content-tertiary dark:text-shell-muted">—</span>}
                    </div>
                  </div>
                </div>

                {/* Total impact */}
                <div className="shrink-0">
                  <ImpactBadge impact={group.totalImpact} />
                </div>

                {/* Expand indicator */}
                <div className="text-content-tertiary dark:text-shell-muted shrink-0">
                  {isExpanded ? "\u25B2" : "\u25BC"}
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="border-t border-shell-border bg-shell-bg px-4 py-3">
                  {group.legs.map((leg, idx) => {
                    const legImpact = leg.shapleyImpact ?? leg.impactRotoPoints;
                    return (
                      <div key={leg.id} className={idx > 0 ? "mt-4 pt-4 border-t border-shell-border" : ""}>
                        {group.isMultiPlayer && (
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-info uppercase">
                              Leg {idx + 1}: {leg.playerGained?.name || "—"} for {leg.playerLost?.name || "—"}
                            </span>
                            <ImpactBadge impact={legImpact} size="sm" />
                          </div>
                        )}
                        <ImpactDetailCard
                          playerGained={leg.playerGained}
                          playerLost={leg.playerLost}
                          moveType={leg.moveType}
                          effectiveDate={leg.effectiveDate}
                          impactRotoPoints={legImpact}
                          categoryImpacts={leg.categoryImpacts}
                          sgpCategoryImpacts={leg.sgpCategoryImpacts}
                          isUncertain={leg.isUncertain}
                          ciLow={leg.ciLow}
                          ciHigh={leg.ciHigh}
                          isIncomplete={leg.isIncomplete}
                          onClose={() => setExpandedMoveId(null)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Timeline Tab ────────────────────────────────────────────

function TimelineTab({
  impacts,
  timelineData,
  selectedTeamId,
  teams,
}: {
  impacts: MoveImpact[];
  timelineData: TimelineData;
  selectedTeamId: number;
  teams: Team[];
}) {
  const chartTheme = useChartTheme();

  if (!timelineData?.data?.length) {
    return (
      <div className="text-center py-8 text-content-secondary dark:text-shell-muted">
        No standings timeline data available yet. Take a few daily snapshots to build the timeline.
      </div>
    );
  }

  // Build chart data from timeline
  const chartData = timelineData.data.map((point: TimelineDataPoint) => ({
    date: point.snapshot_date,
    points: point.overall_points,
  }));

  const selectedTeam = teams.find((t: Team) => t.id === selectedTeamId);
  const teamName = selectedTeam?.name || `Team ${selectedTeamId}`;

  // Map impacts to chart dates for annotation
  const impactsByDate = new Map<string, MoveImpact[]>();
  for (const m of impacts) {
    const date = m.effectiveDate;
    if (!impactsByDate.has(date)) impactsByDate.set(date, []);
    impactsByDate.get(date)!.push(m);
  }

  return (
    <div>
      <div className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid
              stroke={chartTheme.grid.stroke}
              strokeDasharray={chartTheme.grid.strokeDasharray}
            />
            <XAxis
              dataKey="date"
              tick={chartTheme.axis.tick}
              tickFormatter={(date) =>
                new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
              }
            />
            <YAxis tick={chartTheme.axis.tick} />
            <Tooltip
              contentStyle={{
                backgroundColor: chartTheme.tooltip.backgroundColor,
                borderColor: chartTheme.tooltip.borderColor,
                borderRadius: chartTheme.tooltip.borderRadius,
              }}
              labelFormatter={(label) => new Date(label).toLocaleDateString()}
              formatter={(value: number) => [`${value} pts`, teamName]}
            />
            <Line
              type="monotone"
              dataKey="points"
              stroke={chartTheme.colors[0]}
              strokeWidth={2}
              dot={false}
              name={teamName}
            />
            {/* Annotate move dates */}
            {Array.from(impactsByDate.entries()).map(([date, moves]) => {
              const dataPoint = chartData.find((d: { date: string; points: number }) => d.date === date);
              if (!dataPoint) return null;
              const netImpact = moves.reduce((s, m) => s + m.impactRotoPoints, 0);
              const color = netImpact > 0 ? chartTheme.colors[3] : netImpact < 0 ? chartTheme.colors[4] : chartTheme.colors[1];
              return (
                <ReferenceDot
                  key={date}
                  x={date}
                  y={dataPoint.points}
                  r={6}
                  fill={color}
                  stroke="white"
                  strokeWidth={2}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend for annotations */}
      <div className="flex items-center gap-4 justify-center mt-4 text-xs text-content-secondary dark:text-shell-muted">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-positive" /> Positive impact
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-negative" /> Negative impact
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-neutral-400 dark:bg-shell-muted" /> Neutral
        </span>
      </div>
    </div>
  );
}
