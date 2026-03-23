"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
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
import { CHART_THEME } from "@/lib/chart-theme";
import { cn } from "@/lib/cn";
import { Container } from "@/components/ui/Container";
import { Heading } from "@/components/ui/Heading";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import ImpactBadge from "@/components/league/ImpactBadge";
import ImpactDetailCard from "@/components/league/ImpactDetailCard";

type TabView = "timeline" | "leaderboard" | "draft" | "trades" | "league";
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

  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TabView>("league");
  const [moveFilter, setMoveFilter] = useState<MoveFilter>("all");
  const [expandedMoveId, setExpandedMoveId] = useState<number | null>(null);
  const [season, setSeason] = useState<number | null>(null);

  // Load team from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(`league_${leagueId}_team`);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed)) setSelectedTeamId(parsed);
    }
  }, [leagueId]);

  // Fetch teams
  const { data: teamsData } = useQuery({
    queryKey: ["teams", leagueId],
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

  const teams = teamsData?.teams || [];
  const impacts: MoveImpact[] = impactData?.impacts || [];
  const summary = impactData?.summary;

  const filteredImpacts =
    moveFilter === "all"
      ? impacts
      : impacts.filter((m) => m.moveType === moveFilter);

  const handleTeamChange = (teamId: number) => {
    setSelectedTeamId(teamId);
    localStorage.setItem(`league_${leagueId}_team`, String(teamId));
  };

  const tabClass = (active: boolean) =>
    cn(
      "whitespace-nowrap py-4 px-6 border-b-2 font-medium text-body-sm transition-colors",
      active
        ? "border-accent text-content font-semibold"
        : "border-transparent text-content-secondary hover:text-content hover:border-neutral-300"
    );

  return (
    <Container size="wide" className="py-8">
      <PageHeader
        title="Move Impact"
        subtitle="See which roster moves helped or hurt your season the most"
        backLink={{ href: `/leagues/${leagueId}`, label: "Back to League" }}
      />

      {/* Team Selector */}
      <div className="bg-white dark:bg-shell-panel shadow-card dark:shadow-none rounded-card border border-neutral-200 dark:border-shell-border p-4 mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <label className="text-body-sm font-medium text-content-secondary">Team:</label>
          <select
            value={selectedTeamId || ""}
            onChange={(e) => handleTeamChange(parseInt(e.target.value, 10))}
            className="rounded-lg border border-neutral-300 dark:border-shell-border text-body-sm px-3 py-2 bg-white dark:bg-shell-bg text-content dark:text-shell-text focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">Select a team</option>
            {teams.map((t: Team) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <label className="text-body-sm font-medium text-content-secondary">Season:</label>
          <select
            value={season || ""}
            onChange={(e) => setSeason(parseInt(e.target.value, 10))}
            className="rounded-lg border border-neutral-300 dark:border-shell-border text-body-sm px-3 py-2 bg-white dark:bg-shell-bg text-content dark:text-shell-text focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {seasonsData?.seasons?.map((s: number) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {summary && (
            <div className="flex items-center gap-4 ml-auto text-body-sm">
              <span className="text-content-secondary">{summary.totalMoves} moves</span>
              <span className="font-semibold text-content">
                Roster Mgmt: <ImpactBadge impact={summary.netRosterValue ?? summary.sumOfIndividualImpacts} />
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Team-specific Summary Cards */}
      {selectedTeamId && summary && activeTab !== "league" && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white dark:bg-shell-panel shadow-card dark:shadow-none rounded-card border border-neutral-200 dark:border-shell-border p-4">
            <div className="text-xs font-medium text-content-secondary uppercase tracking-wide">Total Moves</div>
            <div className="text-2xl font-bold text-content mt-1">{summary.totalMoves}</div>
          </div>
          <div className="bg-white dark:bg-shell-panel shadow-card dark:shadow-none rounded-card border border-neutral-200 dark:border-shell-border p-4">
            <div className="text-xs font-medium text-content-secondary uppercase tracking-wide">Roster Mgmt Value</div>
            <div className="text-2xl font-bold mt-1">
              {summary.netRosterValue !== null && summary.netRosterValue !== undefined ? (
                <ImpactBadge impact={summary.netRosterValue} />
              ) : (
                <span className="text-content-tertiary">N/A</span>
              )}
            </div>
            {summary.actualRotoPoints !== null && summary.draftOnlyRotoPoints !== null && (
              <div className="text-xs text-content-tertiary mt-1">
                {summary.actualRotoPoints} actual vs {summary.draftOnlyRotoPoints} draft-only
              </div>
            )}
          </div>
          <div className="bg-white dark:bg-shell-panel shadow-card dark:shadow-none rounded-card border border-neutral-200 dark:border-shell-border p-4">
            <div className="text-xs font-medium text-content-secondary uppercase tracking-wide">Avg Impact/Move</div>
            <div className="text-2xl font-bold mt-1">
              <ImpactBadge impact={summary.avgImpactPerMove} />
            </div>
          </div>
          <div className="bg-white dark:bg-shell-panel shadow-card dark:shadow-none rounded-card border border-neutral-200 dark:border-shell-border p-4">
            <div className="text-xs font-medium text-content-secondary uppercase tracking-wide">Best Move</div>
            <div className="text-body-sm font-semibold text-positive mt-1">
              {summary.bestMove?.playerName || "N/A"}
            </div>
            {summary.bestMove && (
              <ImpactBadge impact={summary.bestMove.impact} size="sm" />
            )}
          </div>
          <div className="bg-white dark:bg-shell-panel shadow-card dark:shadow-none rounded-card border border-neutral-200 dark:border-shell-border p-4">
            <div className="text-xs font-medium text-content-secondary uppercase tracking-wide">Worst Move</div>
            <div className="text-body-sm font-semibold text-negative mt-1">
              {summary.worstMove?.playerName || "N/A"}
            </div>
            {summary.worstMove && (
              <ImpactBadge impact={summary.worstMove.impact} size="sm" />
            )}
          </div>
        </div>
      )}

      {(selectedTeamId || activeTab === "league") ? (
        <>
          {/* Tab Navigation */}
          <div className="bg-white dark:bg-shell-panel shadow-card dark:shadow-none rounded-card border border-neutral-200 dark:border-shell-border mb-6">
            <nav className="-mb-px flex border-b border-neutral-200 dark:border-shell-border">
              {(["league", "leaderboard", "trades", "draft", "timeline"] as const).map((tab) => {
                const labels: Record<string, string> = {
                  league: "League Summary",
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
                <div className="text-center py-8 text-content-secondary">
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
        <div className="text-center py-12 text-content-secondary">
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
      <div className="text-center py-8 text-content-secondary">
        No league summary data available. Make sure impact computation has been run.
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-lg border border-neutral-200 dark:border-shell-border bg-surface-secondary dark:bg-shell-bg p-4">
          <div className="text-xs font-medium text-content-secondary uppercase tracking-wide">Total Moves (League)</div>
          <div className="text-2xl font-bold text-content mt-1">{data.totalMovesLeagueWide}</div>
        </div>
        <div className="rounded-lg border border-positive-border bg-positive-light p-4">
          <div className="text-xs font-medium text-positive uppercase tracking-wide">Best Single Move</div>
          {bestMoves[0] && (
            <>
              <div className="text-body-sm font-semibold text-content mt-1">
                {bestMoves[0].playerGained?.name || "—"}
              </div>
              <div className="text-xs text-content-secondary">{bestMoves[0].teamName}</div>
              <ImpactBadge impact={bestMoves[0].impact} size="sm" />
            </>
          )}
        </div>
        <div className="rounded-lg border border-negative-border bg-negative-light p-4">
          <div className="text-xs font-medium text-negative uppercase tracking-wide">Worst Single Move</div>
          {worstMoves[0] && (
            <>
              <div className="text-body-sm font-semibold text-content mt-1">
                {worstMoves[0].playerGained?.name || worstMoves[0].playerLost?.name || "—"}
              </div>
              <div className="text-xs text-content-secondary">{worstMoves[0].teamName}</div>
              <ImpactBadge impact={worstMoves[0].impact} size="sm" />
            </>
          )}
        </div>
      </div>

      {/* Roster Manager Rankings */}
      <div>
        <Heading level={3} className="mb-3">Roster Manager Rankings</Heading>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-200 dark:divide-shell-border">
            <thead className="bg-surface-secondary dark:bg-shell-bg">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wide">Rank</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wide">Team</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary uppercase tracking-wide">Moves</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary uppercase tracking-wide">Net Roster Value</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary uppercase tracking-wide">Actual Pts</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary uppercase tracking-wide">Draft-Only Pts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-shell-border">
              {teamRankings.map((team, idx) => (
                <tr
                  key={team.teamId}
                  className={cn(
                    "border-b border-neutral-100 dark:border-shell-border hover:bg-surface-secondary dark:hover:bg-shell-bg transition-colors",
                    team.teamId === selectedTeamId && "bg-accent-light"
                  )}
                >
                  <td className="px-4 py-3 text-body-sm font-medium text-content">
                    {idx + 1}
                    {idx === 0 && <span className="ml-1" title="Best roster manager">&#127942;</span>}
                  </td>
                  <td className="px-4 py-3 text-body-sm text-content">
                    {team.teamName}
                    {team.teamId === selectedTeamId && (
                      <span className="ml-1 text-xs text-content-secondary">(you)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-body-sm text-content-secondary text-right">{team.moveCount}</td>
                  <td className="px-4 py-3 text-right">
                    {team.netRosterValue != null ? (
                      <ImpactBadge impact={team.netRosterValue} size="sm" />
                    ) : (
                      <span className="text-content-tertiary text-xs">N/A</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-body-sm text-content-secondary text-right">
                    {team.actualRotoPoints ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-body-sm text-content-secondary text-right">
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
      <table className="min-w-full divide-y divide-neutral-200 dark:divide-shell-border">
        <thead className="bg-surface-secondary dark:bg-shell-bg">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wide">Date</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wide">Team</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wide">Type</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wide">Gained</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wide">Lost</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary uppercase tracking-wide">Impact</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-shell-border">
          {moves.map((m) => (
            <tr
              key={m.id}
              className={cn(
                "border-b border-neutral-100 dark:border-shell-border hover:bg-surface-secondary dark:hover:bg-shell-bg transition-colors",
                m.teamId === selectedTeamId && "bg-accent-light"
              )}
            >
              <td className="px-4 py-3 text-body-sm text-content-secondary">
                {new Date(m.effectiveDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                {m.isIncomplete && <span className="ml-1 text-warning" title="Incomplete data">&#9888;</span>}
              </td>
              <td className="px-4 py-3 text-body-sm text-content">{m.teamName}</td>
              <td className="px-4 py-3">
                <Badge variant={getMoveTypeBadgeVariant(m.moveType)}>
                  {MOVE_TYPE_LABELS[m.moveType] || m.moveType}
                </Badge>
              </td>
              <td className="px-4 py-3 text-body-sm font-medium text-content">
                {m.playerGained?.name || "—"}
                {m.playerGained?.positions && (
                  <span className="ml-1 text-xs text-content-secondary">({m.playerGained.positions.join(", ")})</span>
                )}
              </td>
              <td className="px-4 py-3 text-body-sm text-content-secondary">
                {m.playerLost?.name || "—"}
                {m.playerLost?.positions && (
                  <span className="ml-1 text-xs text-content-tertiary">({m.playerLost.positions.join(", ")})</span>
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
              ? "border-accent bg-accent-light"
              : "border-neutral-200 dark:border-shell-border"
          )}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <span className="text-body-sm font-bold text-content-tertiary w-6">{idx + 1}.</span>
              <div>
                <span className="text-body-sm font-semibold text-content">{pkg.teamName}</span>
                <span className="ml-2 text-xs text-content-secondary">
                  {new Date(pkg.effectiveDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </div>
            </div>
            <ImpactBadge impact={pkg.totalImpact} />
          </div>
          <div className="flex items-center gap-2 flex-wrap text-body-sm">
            <span className="text-xs font-medium text-positive uppercase">Got</span>
            {pkg.playersGained.map((p, i) => (
              <span key={p.id} className="font-medium text-content">
                {i > 0 && <span className="text-content-tertiary">, </span>}
                {p.name}
                <span className="ml-0.5 text-xs text-content-secondary">({p.positions.join(", ")})</span>
              </span>
            ))}
            {pkg.playersGained.length === 0 && <span className="text-content-tertiary">—</span>}
            <span className="text-content-tertiary mx-1">|</span>
            <span className="text-xs font-medium text-negative uppercase">Gave</span>
            {pkg.playersLost.map((p, i) => (
              <span key={p.id} className="text-content-secondary">
                {i > 0 && <span className="text-content-tertiary">, </span>}
                {p.name}
                <span className="ml-0.5 text-xs text-content-tertiary">({p.positions.join(", ")})</span>
              </span>
            ))}
            {pkg.playersLost.length === 0 && <span className="text-content-tertiary">—</span>}
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
                : "bg-surface-secondary dark:bg-shell-bg text-content-secondary hover:bg-neutral-200 dark:hover:bg-shell-panel"
            )}
          >
            {f === "all" ? "All" : MOVE_TYPE_LABELS[f] || f}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-200 dark:divide-shell-border">
          <thead className="bg-surface-secondary dark:bg-shell-bg">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wide">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wide">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wide">Player Gained</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wide">Player Lost</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary uppercase tracking-wide">Impact</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary uppercase tracking-wide">Top Category</th>
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
                      className="px-4 py-3 cursor-pointer hover:bg-surface-secondary dark:hover:bg-shell-bg grid grid-cols-6 items-center transition-colors"
                      onClick={() => setExpandedMoveId(expandedMoveId === move.id ? null : move.id)}
                    >
                      <div className="text-body-sm text-content-secondary">
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
                      <div className="text-body-sm font-medium text-content">
                        {move.playerGained?.name || "—"}
                      </div>
                      <div className="text-body-sm text-content-secondary">
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
                      <div className="text-right text-xs text-content-secondary">
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
        <div className="text-center py-8 text-content-secondary">
          No moves found. Run impact computation from the admin panel first.
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="rounded-lg border border-neutral-200 dark:border-shell-border bg-surface-secondary dark:bg-shell-bg p-3">
            <div className="text-xs font-medium text-content-secondary uppercase tracking-wide">Total Picks</div>
            <div className="text-xl font-bold text-content mt-1">{summary.totalPicks}</div>
          </div>
          <div className="rounded-lg border border-neutral-200 dark:border-shell-border bg-surface-secondary dark:bg-shell-bg p-3">
            <div className="text-xs font-medium text-content-secondary uppercase tracking-wide">Total Draft Value</div>
            <div className="text-xl font-bold text-content mt-1">{summary.totalDraftValue.toFixed(1)} pts</div>
          </div>
          <div className="rounded-lg border border-positive-border bg-positive-light p-3">
            <div className="text-xs font-medium text-positive uppercase tracking-wide">Best Pick</div>
            <div className="text-body-sm font-semibold text-content mt-1">{summary.bestPick?.playerName}</div>
            {summary.bestPick && <ImpactBadge impact={summary.bestPick.impact} size="sm" />}
          </div>
          {avgReplacementImpact != null ? (
            <div className="rounded-lg border border-info-border bg-info-light p-3">
              <div className="text-xs font-medium text-info uppercase tracking-wide">Draft Skill</div>
              <div className="text-body-sm font-semibold text-content mt-1">vs Replacement</div>
              <ImpactBadge impact={avgReplacementImpact} size="sm" />
            </div>
          ) : (
            <div className="rounded-lg border border-negative-border bg-negative-light p-3">
              <div className="text-xs font-medium text-negative uppercase tracking-wide">Worst Pick</div>
              <div className="text-body-sm font-semibold text-content mt-1">{summary.worstPick?.playerName}</div>
              {summary.worstPick && <ImpactBadge impact={summary.worstPick.impact} size="sm" />}
            </div>
          )}
        </div>
      )}

      {/* Draft Picks Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-200 dark:divide-shell-border">
          <thead className="bg-surface-secondary dark:bg-shell-bg">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wide">#</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wide">Player</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wide">Pos</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary uppercase tracking-wide">Key Stats</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary uppercase tracking-wide">Roto Pts Value</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary uppercase tracking-wide">vs Replacement</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-content-secondary uppercase tracking-wide">Still On Team</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-shell-border">
            {draftPicks.map((pick, idx) => {
              const displayImpact = pick.shapleyImpact ?? pick.impactRotoPoints;
              return (
                <tr
                  key={pick.playerId}
                  className={cn(
                    "border-b border-neutral-100 dark:border-shell-border hover:bg-surface-secondary dark:hover:bg-shell-bg transition-colors",
                    !pick.stillOnTeam && "opacity-60"
                  )}
                >
                  <td className="px-4 py-3 text-body-sm text-content-tertiary">{idx + 1}</td>
                  <td className="px-4 py-3 text-body-sm font-medium text-content">{pick.playerName}</td>
                  <td className="px-4 py-3 text-xs text-content-secondary">{pick.positions?.join(", ")}</td>
                  <td className="px-4 py-3 text-right text-xs text-content-secondary">
                    {pick.keyStats && formatKeyStats(pick.keyStats)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ImpactBadge
                      impact={displayImpact}
                      isUncertain={pick.isUncertain}
                      ciLow={pick.ciLow}
                      ciHigh={pick.ciHigh}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {pick.replacementLevelImpact != null ? (
                      <ImpactBadge impact={pick.replacementLevelImpact} size="sm" />
                    ) : (
                      <span className="text-content-tertiary text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {pick.stillOnTeam ? (
                      <span className="text-positive">&#10003;</span>
                    ) : (
                      <span className="text-content-tertiary">&#10007;</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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
      <div className="text-center py-8 text-content-secondary">
        No trades found for this season.
      </div>
    );
  }

  return (
    <div>
      {/* Trade Summary Header */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="rounded-lg border border-info-border bg-info-light p-4">
          <div className="text-xs font-medium text-info uppercase tracking-wide">Total Trades</div>
          <div className="text-2xl font-bold text-content mt-1">{tradeGroups.length}</div>
        </div>
        <div className="rounded-lg border border-info-border bg-info-light p-4">
          <div className="text-xs font-medium text-info uppercase tracking-wide">Net Trade Impact</div>
          <div className="text-2xl font-bold text-content mt-1">
            <ImpactBadge impact={netTradeImpact} />
          </div>
        </div>
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
              className="border border-neutral-200 dark:border-shell-border rounded-lg overflow-hidden"
            >
              {/* Trade header row */}
              <div
                className="px-4 py-3 cursor-pointer hover:bg-surface-secondary dark:hover:bg-shell-bg flex items-center gap-4 transition-colors"
                onClick={() => setExpandedMoveId(isExpanded ? null : group.legs[0].id)}
              >
                {/* Date */}
                <div className="text-body-sm text-content-secondary w-20 shrink-0">
                  {new Date(group.effectiveDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </div>

                {/* Players involved */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Received */}
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-xs font-medium text-positive uppercase shrink-0">Got</span>
                      {received.map((p, i) => (
                        <span key={p.id} className="text-body-sm font-medium text-content">
                          {i > 0 && <span className="text-content-tertiary mr-1">,</span>}
                          {p.name}
                          <span className="ml-0.5 text-xs text-content-secondary">
                            ({p.positions.join(", ")})
                          </span>
                        </span>
                      ))}
                    </div>

                    <span className="text-content-tertiary mx-1">|</span>

                    {/* Sent */}
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-xs font-medium text-negative uppercase shrink-0">Gave</span>
                      {sent.map((p, i) => (
                        <span key={p.id} className="text-body-sm text-content-secondary">
                          {i > 0 && <span className="text-content-tertiary mr-1">,</span>}
                          {p.name}
                          <span className="ml-0.5 text-xs text-content-tertiary">
                            ({p.positions.join(", ")})
                          </span>
                        </span>
                      ))}
                      {sent.length === 0 && <span className="text-body-sm text-content-tertiary">—</span>}
                    </div>
                  </div>
                </div>

                {/* Total impact */}
                <div className="shrink-0">
                  <ImpactBadge impact={group.totalImpact} />
                </div>

                {/* Expand indicator */}
                <div className="text-content-tertiary shrink-0">
                  {isExpanded ? "\u25B2" : "\u25BC"}
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="border-t border-neutral-100 dark:border-shell-border bg-surface-secondary dark:bg-shell-bg px-4 py-3">
                  {group.legs.map((leg, idx) => {
                    const legImpact = leg.shapleyImpact ?? leg.impactRotoPoints;
                    return (
                      <div key={leg.id} className={idx > 0 ? "mt-4 pt-4 border-t border-neutral-200 dark:border-shell-border" : ""}>
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
  if (!timelineData?.data?.length) {
    return (
      <div className="text-center py-8 text-content-secondary">
        No timeline data available. View the Trends page for standings over time.
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
              stroke={CHART_THEME.grid.stroke}
              strokeDasharray={CHART_THEME.grid.strokeDasharray}
            />
            <XAxis
              dataKey="date"
              tick={CHART_THEME.axis.tick}
              tickFormatter={(date) =>
                new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
              }
            />
            <YAxis tick={CHART_THEME.axis.tick} />
            <Tooltip
              contentStyle={{
                backgroundColor: CHART_THEME.tooltip.backgroundColor,
                borderColor: CHART_THEME.tooltip.borderColor,
                borderRadius: CHART_THEME.tooltip.borderRadius,
              }}
              labelFormatter={(label) => new Date(label).toLocaleDateString()}
              formatter={(value: number) => [`${value} pts`, teamName]}
            />
            <Line
              type="monotone"
              dataKey="points"
              stroke={CHART_THEME.colors[0]}
              strokeWidth={2}
              dot={false}
              name={teamName}
            />
            {/* Annotate move dates */}
            {Array.from(impactsByDate.entries()).map(([date, moves]) => {
              const dataPoint = chartData.find((d: { date: string; points: number }) => d.date === date);
              if (!dataPoint) return null;
              const netImpact = moves.reduce((s, m) => s + m.impactRotoPoints, 0);
              const color = netImpact > 0 ? CHART_THEME.colors[3] : netImpact < 0 ? CHART_THEME.colors[4] : CHART_THEME.colors[1];
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
      <div className="flex items-center gap-4 justify-center mt-4 text-xs text-content-secondary">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-positive" /> Positive impact
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-negative" /> Negative impact
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-neutral-400" /> Neutral
        </span>
      </div>
    </div>
  );
}
