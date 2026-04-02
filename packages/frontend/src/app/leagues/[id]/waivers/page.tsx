"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import { ArrowRight, ExternalLink, AlertTriangle, ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import { Container } from "@/components/ui/Container";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { LoadingSpinner, LoadingSkeleton } from "@/components/ui/LoadingSpinner";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import ImpactBadge from "@/components/league/ImpactBadge";
import { getESPNFreeAgentsUrl } from "@/lib/espn-links";
import { cn } from "@/lib/cn";
import { Term } from "@/components/ui/Term";
import { calculateAVG, calculateERA, calculateWHIP } from "@espn-fantasy/shared";

interface WaiverRecommendation {
  addPlayerId: number;
  addPlayerName: string;
  dropPlayerId: number;
  dropPlayerName: string;
  deltaOverallPoints: number;
  categoryImpacts: Array<{
    categoryId: string;
    categoryName: string;
    deltaRank: number;
    deltaPoints: number;
  }>;
  explanation: string;
  isLegal: boolean;
  legalityIssues?: string[];
}

interface FreeAgent {
  playerId: number;
  espnPlayerId: number;
  playerName: string;
  mlbTeam: string | null;
  positions: string[];
  projections: {
    [key: string]: number;
  } | null;
  currentStats: {
    [key: string]: number;
  } | null;
  pctOwned: number;
  pctStarted: number;
  pitcherlistRank: number | null;
}

interface RosterPlayer {
  playerId: number;
  espnPlayerId: number;
  playerName: string;
  mlbTeam: string | null;
  positions: string[];
  rosterStatus: string;
  rosterSlot: string;
  projections: {
    [key: string]: number;
  } | null;
  currentStats: {
    [key: string]: number;
  } | null;
  tenureStats: {
    [key: string]: number;
  } | null;
}

interface EvaluationResult {
  addPlayer: {
    id: number;
    name: string;
    positions: string[];
  };
  dropPlayer: {
    id: number;
    name: string;
    positions: string[];
  };
  deltaOverallPoints: number;
  categoryImpacts: Array<{
    categoryId: string;
    categoryName: string;
    deltaRank: number;
    deltaPoints: number;
  }>;
  explanation: string;
  isLegal: boolean;
  legalityIssues?: string[];
  snapshotDate: string;
}

type ViewMode = "ai" | "manual";

// ── Helpers ──────────────────────────────────────────

function groupByTopCategory(
  recs: WaiverRecommendation[]
): { category: string; recs: WaiverRecommendation[] }[] {
  const groups: Record<string, WaiverRecommendation[]> = {};

  for (const rec of recs) {
    const topCat = rec.categoryImpacts
      ?.filter((ci) => Math.abs(ci.deltaPoints) > 0.3)
      .sort((a, b) => Math.abs(b.deltaPoints) - Math.abs(a.deltaPoints))[0];

    const groupKey = topCat ? topCat.categoryName : "Best Overall";
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(rec);
  }

  return Object.entries(groups)
    .map(([category, recs]) => ({ category, recs }))
    .sort((a, b) => {
      if (a.category === "Best Overall") return 1;
      if (b.category === "Best Overall") return -1;
      const avgA =
        a.recs.reduce((sum, r) => {
          const top = r.categoryImpacts?.sort(
            (x, y) => Math.abs(y.deltaPoints) - Math.abs(x.deltaPoints)
          )[0];
          return sum + (top?.deltaPoints ?? 0);
        }, 0) / a.recs.length;
      const avgB =
        b.recs.reduce((sum, r) => {
          const top = r.categoryImpacts?.sort(
            (x, y) => Math.abs(y.deltaPoints) - Math.abs(x.deltaPoints)
          )[0];
          return sum + (top?.deltaPoints ?? 0);
        }, 0) / b.recs.length;
      return avgB - avgA;
    });
}

function isPitcherPosition(positions: string[]) {
  return positions.some((p) => ["SP", "RP", "P"].includes(p));
}

function fmtInt(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "--";
  return String(Math.round(v));
}

function fmtRate(v: number | null | undefined, decimals: number): string {
  if (v == null || isNaN(v) || !isFinite(v)) return "--";
  return v.toFixed(decimals);
}

const TH_CLASS = "px-2 py-2 text-left text-data font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider whitespace-nowrap";
const TH_RIGHT = "px-2 py-2 text-right text-data font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider whitespace-nowrap";

function SortHeader({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: string;
  currentKey: string;
  currentDir: "asc" | "desc";
  onSort: (key: string) => void;
  align?: "left" | "right";
}) {
  const active = currentKey === sortKey;
  return (
    <th
      className={cn(
        align === "right" ? TH_RIGHT : TH_CLASS,
        "cursor-pointer select-none hover:text-content dark:hover:text-shell-text transition-colors",
      )}
      onClick={() => onSort(sortKey)}
    >
      {label}
      {active && (
        <span className="ml-0.5 text-shell-accent">
          {currentDir === "asc" ? "↑" : "↓"}
        </span>
      )}
    </th>
  );
}

function sortRows<T extends Record<string, any>>(
  data: T[],
  key: string,
  dir: "asc" | "desc",
): T[] {
  return [...data].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "string" && typeof bv === "string") {
      return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    return dir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });
}

function toggleSort(
  key: string,
  currentKey: string,
  currentDir: "asc" | "desc",
  setSortKey: (k: string) => void,
  setSortDir: (d: "asc" | "desc") => void,
) {
  if (key === currentKey) {
    setSortDir(currentDir === "asc" ? "desc" : "asc");
  } else {
    setSortKey(key);
    setSortDir("desc");
  }
}

// ── Component ────────────────────────────────────────

export default function WaiversPage() {
  const params = useParams();
  const leagueId = params.id as string;
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("ai");
  const [selectedFreeAgentId, setSelectedFreeAgentId] = useState<number | null>(null);
  const [selectedRosterPlayerId, setSelectedRosterPlayerId] = useState<number | null>(null);
  const [evaluationResult, setEvaluationResult] = useState<EvaluationResult | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [positionFilter, setPositionFilter] = useState<string[]>([]);
  const [expandedRecKey, setExpandedRecKey] = useState<string | null>(null);

  // Sort state for manual eval tables
  const [faSortKey, setFaSortKey] = useState("pctOwned");
  const [faSortDir, setFaSortDir] = useState<"asc" | "desc">("desc");
  const [rosterSortKey, setRosterSortKey] = useState("slot");
  const [rosterSortDir, setRosterSortDir] = useState<"asc" | "desc">("asc");

  // Load selected team from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(`league_${leagueId}_team`);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed)) setSelectedTeamId(parsed);
    }
  }, [leagueId]);

  // Fetch league status for ESPN links
  const { data: leagueStatus } = useQuery({
    queryKey: ['league', leagueId],
    queryFn: () => api.getLeagueStatus(parseInt(leagueId, 10)),
  });
  const espnLeagueId = leagueStatus?.league?.espn_league_id;
  const season = leagueStatus?.league?.season;

  // AI Recommendations query
  const {
    data: aiData,
    isLoading: aiLoading,
    error: aiError,
  } = useQuery({
    queryKey: ["waivers", leagueId, selectedTeamId],
    queryFn: async () => {
      if (!selectedTeamId) throw new Error("No team selected");
      return api.getWaiverRecommendations(
        parseInt(leagueId, 10),
        selectedTeamId,
      ) as Promise<{
        recommendations: WaiverRecommendation[];
        snapshotDate: string;
      }>;
    },
    enabled: !!selectedTeamId && viewMode === "ai",
  });

  // Free agents query
  const { data: freeAgentsData, isLoading: freeAgentsLoading } = useQuery({
    queryKey: ["free-agents", leagueId, positionFilter.join(",")],
    queryFn: async () => {
      return api.getFreeAgents(parseInt(leagueId, 10), {
        sortBy: "pct_owned",
        ...(positionFilter.length > 0 && {
          position: positionFilter.join(","),
        }),
      }) as Promise<{
        freeAgents: FreeAgent[];
        snapshotDate: string;
      }>;
    },
    enabled: !!selectedTeamId && viewMode === "manual",
  });

  // Roster query
  const { data: rosterData, isLoading: rosterLoading } = useQuery({
    queryKey: ["roster", leagueId, selectedTeamId],
    queryFn: async () => {
      if (!selectedTeamId) throw new Error("No team selected");
      return api.getTeamRoster(
        parseInt(leagueId, 10),
        selectedTeamId,
      ) as Promise<{
        roster: RosterPlayer[];
        snapshotDate: string;
      }>;
    },
    enabled: !!selectedTeamId && viewMode === "manual",
  });

  // Build flat row data for free agents table
  const faRows = useMemo(() => {
    if (!freeAgentsData?.freeAgents) return [];
    return freeAgentsData.freeAgents.map((p) => {
      const pitcher = isPitcherPosition(p.positions);
      const proj = p.projections ?? {};
      const ab = proj.AB ?? 0;
      const ip = proj.IP ?? 0;
      return {
        id: p.playerId,
        name: p.playerName,
        positions: p.positions.join(", "),
        team: p.mlbTeam ?? "--",
        pctOwned: p.pctOwned ?? 0,
        pctStarted: p.pctStarted ?? 0,
        HR: !pitcher ? (proj.HR ?? 0) : null,
        R: !pitcher ? (proj.R ?? 0) : null,
        RBI: !pitcher ? (proj.RBI ?? 0) : null,
        SB: !pitcher ? (proj.SB ?? 0) : null,
        AVG: !pitcher && ab > 0 ? calculateAVG(proj) : null,
        W: pitcher ? (proj.W ?? 0) : null,
        SV: pitcher ? (proj.SV ?? 0) : null,
        K: pitcher ? (proj.K ?? 0) : null,
        ERA: pitcher && ip > 0 ? calculateERA(proj) : null,
        WHIP: pitcher && ip > 0 ? calculateWHIP(proj) : null,
        plRank: p.pitcherlistRank,
        _isPitcher: pitcher,
      };
    });
  }, [freeAgentsData]);

  // Build flat row data for roster table
  const rosterRows = useMemo(() => {
    if (!rosterData?.roster) return [];
    return rosterData.roster.map((p) => {
      const pitcher = isPitcherPosition(p.positions);
      const proj = p.projections ?? {};
      const ab = proj.AB ?? 0;
      const ip = proj.IP ?? 0;
      return {
        id: p.playerId,
        name: p.playerName,
        slot: p.rosterSlot,
        positions: p.positions.join(", "),
        team: p.mlbTeam ?? "--",
        HR: !pitcher ? (proj.HR ?? 0) : null,
        R: !pitcher ? (proj.R ?? 0) : null,
        RBI: !pitcher ? (proj.RBI ?? 0) : null,
        SB: !pitcher ? (proj.SB ?? 0) : null,
        AVG: !pitcher && ab > 0 ? calculateAVG(proj) : null,
        W: pitcher ? (proj.W ?? 0) : null,
        SV: pitcher ? (proj.SV ?? 0) : null,
        K: pitcher ? (proj.K ?? 0) : null,
        ERA: pitcher && ip > 0 ? calculateERA(proj) : null,
        WHIP: pitcher && ip > 0 ? calculateWHIP(proj) : null,
        _isPitcher: pitcher,
      };
    });
  }, [rosterData]);

  // Determine which stat columns to show based on position filter
  const showPitcherStats = positionFilter.length > 0 && ["SP", "RP"].includes(positionFilter[0]);
  const showHitterStats = positionFilter.length > 0 && !showPitcherStats;
  const showAllStats = positionFilter.length === 0;

  // Evaluate add/drop
  const handleEvaluate = async () => {
    if (!selectedTeamId || !selectedFreeAgentId || !selectedRosterPlayerId) return;
    setIsEvaluating(true);
    setEvaluationResult(null);
    setEvaluationError(null);
    try {
      const result = (await api.evaluateWaiver(
        parseInt(leagueId, 10),
        selectedTeamId,
        { addPlayerId: selectedFreeAgentId, dropPlayerId: selectedRosterPlayerId },
      )) as EvaluationResult;
      setEvaluationResult(result);
    } catch (error) {
      console.error("Evaluation error:", error);
      setEvaluationError("Failed to evaluate add/drop. Please try again.");
    } finally {
      setIsEvaluating(false);
    }
  };

  const renderDeltaRank = (value: number) => (
    <span
      className={cn(
        "font-semibold text-data",
        value < 0 ? "text-positive" : value > 0 ? "text-negative" : "text-content-secondary dark:text-shell-muted",
      )}
    >
      {value === 0 ? "\u2014" : value < 0 ? `\u2191${Math.abs(value)}` : `\u2193${value}`}
    </span>
  );

  const renderCategoryImpactTable = (
    impacts: Array<{ categoryId: string; categoryName: string; deltaRank: number; deltaPoints: number }>,
  ) => (
    <div className="mt-2 overflow-x-auto">
      <table className="min-w-full divide-y divide-neutral-200 dark:divide-shell-border">
        <thead>
          <tr>
            <th className="px-2 py-1.5 text-left text-data font-medium text-content-secondary dark:text-shell-muted uppercase">Category</th>
            <th className="px-2 py-1.5 text-center text-data font-medium text-content-secondary dark:text-shell-muted uppercase">Rank</th>
            <th className="px-2 py-1.5 text-right text-data font-medium text-content-secondary dark:text-shell-muted uppercase">Pts</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-shell-border">
          {[...impacts]
            .sort((a, b) => Math.abs(b.deltaPoints) - Math.abs(a.deltaPoints))
            .map((impact) => (
              <tr key={impact.categoryId} className={impact.deltaPoints === 0 ? "opacity-40" : ""}>
                <td className={cn("px-2 py-1.5 text-data font-medium whitespace-nowrap", impact.deltaPoints === 0 ? "text-content-tertiary dark:text-shell-muted" : "text-content dark:text-shell-text")}>
                  {impact.categoryName}
                </td>
                <td className="px-2 py-1.5 text-data text-center whitespace-nowrap">
                  {renderDeltaRank(impact.deltaRank)}
                </td>
                <td className="px-2 py-1.5 text-data text-right whitespace-nowrap">
                  {impact.deltaPoints !== 0 ? (
                    <span className={cn("font-semibold text-data", impact.deltaPoints > 0 ? "text-positive" : "text-negative")}>
                      {impact.deltaPoints > 0 ? "+" : ""}{impact.deltaPoints.toFixed(1)}
                    </span>
                  ) : (
                    <span className="text-content-tertiary dark:text-shell-muted text-data">{"\u2014"}</span>
                  )}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );

  const renderLegalityWarning = (issues: string[]) => (
    <div className="mt-3 bg-warning-light dark:bg-warning-dark-bg/20 border border-warning-border dark:border-warning-dark-border rounded-lg p-3">
      <div className="flex">
        <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
        <div className="ml-3 flex-1">
          <h4 className="text-body-sm font-medium text-warning dark:text-warning-dark">Roster Constraints</h4>
          <ul className="mt-1 text-data text-warning dark:text-warning-dark list-disc list-inside space-y-1">
            {issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );

  const renderSwapVisualization = (
    dropName: string,
    addName: string,
    dropPositions?: string[],
    addPositions?: string[],
  ) => (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 mb-4">
      <div className="bg-shell-bg dark:bg-shell-bg border border-shell-border rounded-lg p-3">
        <div className="text-caption font-semibold text-negative uppercase tracking-wider mb-1.5">Drop</div>
        <div className="text-sm font-medium text-content dark:text-shell-text truncate">{dropName}</div>
        {dropPositions && <div className="text-xs text-content-secondary dark:text-shell-muted mt-1">{dropPositions.join(", ")}</div>}
      </div>
      <div className="flex items-center justify-center">
        <ArrowRight className="w-5 h-5 text-shell-muted rotate-90 sm:rotate-0" />
      </div>
      <div className="bg-shell-bg dark:bg-shell-bg border border-shell-border rounded-lg p-3">
        <div className="text-caption font-semibold text-positive uppercase tracking-wider mb-1.5">Add</div>
        <div className="text-sm font-medium text-content dark:text-shell-text truncate">{addName}</div>
        {addPositions && <div className="text-xs text-content-secondary dark:text-shell-muted mt-1">{addPositions.join(", ")}</div>}
      </div>
    </div>
  );

  // ── Render stat columns for player tables ──
  const renderStatHeaders = (sortKey: string, sortDir: "asc" | "desc", onSort: (k: string) => void) => {
    const cols: JSX.Element[] = [];
    if (showHitterStats || showAllStats) {
      cols.push(
        <SortHeader key="HR" label="HR" sortKey="HR" currentKey={sortKey} currentDir={sortDir} onSort={onSort} align="right" />,
        <SortHeader key="R" label="R" sortKey="R" currentKey={sortKey} currentDir={sortDir} onSort={onSort} align="right" />,
        <SortHeader key="RBI" label="RBI" sortKey="RBI" currentKey={sortKey} currentDir={sortDir} onSort={onSort} align="right" />,
        <SortHeader key="SB" label="SB" sortKey="SB" currentKey={sortKey} currentDir={sortDir} onSort={onSort} align="right" />,
        <SortHeader key="AVG" label="AVG" sortKey="AVG" currentKey={sortKey} currentDir={sortDir} onSort={onSort} align="right" />,
      );
    }
    if (showPitcherStats || showAllStats) {
      cols.push(
        <SortHeader key="W" label="W" sortKey="W" currentKey={sortKey} currentDir={sortDir} onSort={onSort} align="right" />,
        <SortHeader key="SV" label="SV" sortKey="SV" currentKey={sortKey} currentDir={sortDir} onSort={onSort} align="right" />,
        <SortHeader key="K" label="K" sortKey="K" currentKey={sortKey} currentDir={sortDir} onSort={onSort} align="right" />,
        <SortHeader key="ERA" label="ERA" sortKey="ERA" currentKey={sortKey} currentDir={sortDir} onSort={onSort} align="right" />,
        <SortHeader key="WHIP" label="WHIP" sortKey="WHIP" currentKey={sortKey} currentDir={sortDir} onSort={onSort} align="right" />,
      );
    }
    return cols;
  };

  const renderStatCells = (row: Record<string, any>) => {
    const cells: JSX.Element[] = [];
    if (showHitterStats || showAllStats) {
      cells.push(
        <td key="HR" className="px-2 py-2 text-right font-mono text-data text-content dark:text-shell-text">{fmtInt(row.HR)}</td>,
        <td key="R" className="px-2 py-2 text-right font-mono text-data text-content dark:text-shell-text">{fmtInt(row.R)}</td>,
        <td key="RBI" className="px-2 py-2 text-right font-mono text-data text-content dark:text-shell-text">{fmtInt(row.RBI)}</td>,
        <td key="SB" className="px-2 py-2 text-right font-mono text-data text-content dark:text-shell-text">{fmtInt(row.SB)}</td>,
        <td key="AVG" className="px-2 py-2 text-right font-mono text-data text-content dark:text-shell-text">{fmtRate(row.AVG, 3)}</td>,
      );
    }
    if (showPitcherStats || showAllStats) {
      cells.push(
        <td key="W" className="px-2 py-2 text-right font-mono text-data text-content dark:text-shell-text">{fmtInt(row.W)}</td>,
        <td key="SV" className="px-2 py-2 text-right font-mono text-data text-content dark:text-shell-text">{fmtInt(row.SV)}</td>,
        <td key="K" className="px-2 py-2 text-right font-mono text-data text-content dark:text-shell-text">{fmtInt(row.K)}</td>,
        <td key="ERA" className="px-2 py-2 text-right font-mono text-data text-content dark:text-shell-text">{fmtRate(row.ERA, 2)}</td>,
        <td key="WHIP" className="px-2 py-2 text-right font-mono text-data text-content dark:text-shell-text">{fmtRate(row.WHIP, 2)}</td>,
      );
    }
    return cells;
  };

  return (
    <Container size="wide" className="py-6 sm:py-8">
      {/* Compact header with inline mode toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-h3 font-semibold text-content dark:text-shell-text">Waivers</h1>
          <p className="text-body-sm text-content-secondary dark:text-shell-muted">
            {viewMode === "ai" ? "AI-generated add/drop recommendations" : "Evaluate any add/drop move"}
          </p>
        </div>
        {selectedTeamId && (
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode("ai")}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                viewMode === "ai"
                  ? "bg-shell-accent text-white"
                  : "bg-transparent border border-shell-border text-content-secondary dark:text-shell-muted hover:text-content dark:hover:text-shell-text"
              )}
            >
              AI Picks
            </button>
            <button
              onClick={() => setViewMode("manual")}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                viewMode === "manual"
                  ? "bg-shell-accent text-white"
                  : "bg-transparent border border-shell-border text-content-secondary dark:text-shell-muted hover:text-content dark:hover:text-shell-text"
              )}
            >
              Manual Eval
            </button>
          </div>
        )}
      </div>

      {!selectedTeamId ? (
        <ErrorAlert
          variant="warning"
          message="Please go back to the league page and select your team to view waiver recommendations."
          backLink={{ href: `/leagues/${leagueId}`, label: "Go to League Page" }}
        />
      ) : viewMode === "ai" ? (
        /* ═══════════════════════════════════════════════════
           AI PICKS TABLE
           ═══════════════════════════════════════════════════ */
        <Card>
          {aiLoading ? (
            <CardContent><LoadingSkeleton lines={3} /></CardContent>
          ) : aiError ? (
            <CardContent><ErrorAlert message={(aiError as Error).message} /></CardContent>
          ) : aiData && aiData.recommendations.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-surface-secondary dark:bg-shell-bg sticky top-0 z-10">
                  <tr className="border-b border-neutral-200 dark:border-shell-border">
                    <th className={cn(TH_CLASS, "w-16")}>
                      <Term id="impact">Impact</Term>
                    </th>
                    <th className={TH_CLASS}>Drop</th>
                    <th className={TH_CLASS}>Add</th>
                    <th className={TH_CLASS}>Top Category</th>
                    {espnLeagueId && season && <th className={cn(TH_CLASS, "w-12")}></th>}
                  </tr>
                </thead>
                <tbody>
                  {groupByTopCategory(aiData.recommendations).map((group) => (
                    <>
                      {/* Group header */}
                      <tr key={`group-${group.category}`} className="bg-surface-secondary/50 dark:bg-shell-bg/50">
                        <td
                          colSpan={espnLeagueId && season ? 5 : 4}
                          className="px-2 py-2 text-data font-semibold text-content dark:text-shell-text uppercase tracking-wider"
                        >
                          {group.category}
                          <span className="ml-2 text-content-tertiary dark:text-shell-muted font-normal normal-case tracking-normal">
                            {group.recs.length}
                          </span>
                        </td>
                      </tr>
                      {/* Recommendation rows */}
                      {group.recs.map((rec) => {
                        const key = `${rec.addPlayerId}-${rec.dropPlayerId}`;
                        const isExpanded = expandedRecKey === key;
                        const topImpact = rec.categoryImpacts
                          ?.filter((ci) => Math.abs(ci.deltaPoints) > 0)
                          .sort((a, b) => Math.abs(b.deltaPoints) - Math.abs(a.deltaPoints))[0];

                        return (
                          <>
                            <tr
                              key={key}
                              onClick={() => setExpandedRecKey(isExpanded ? null : key)}
                              className={cn(
                                "border-b border-neutral-100 dark:border-shell-border cursor-pointer transition-colors",
                                "hover:bg-surface-secondary dark:hover:bg-shell-bg",
                                isExpanded && "bg-surface-secondary/50 dark:bg-shell-bg/50",
                              )}
                            >
                              <td className="px-2 py-2.5">
                                <ImpactBadge impact={rec.deltaOverallPoints} size="sm" />
                              </td>
                              <td className="px-2 py-2.5 text-body-sm font-medium text-negative whitespace-nowrap">
                                {rec.dropPlayerName}
                              </td>
                              <td className="px-2 py-2.5 text-body-sm font-medium text-positive whitespace-nowrap">
                                {rec.addPlayerName}
                              </td>
                              <td className="px-2 py-2.5 text-data text-content-secondary dark:text-shell-muted whitespace-nowrap">
                                {topImpact ? (
                                  <span>
                                    <span className="text-positive font-semibold">+{topImpact.deltaPoints.toFixed(1)}</span>
                                    {" "}in {topImpact.categoryName}
                                  </span>
                                ) : "\u2014"}
                              </td>
                              {espnLeagueId && season && (
                                <td className="px-2 py-2.5">
                                  <a
                                    href={getESPNFreeAgentsUrl(espnLeagueId, season)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-shell-muted hover:text-shell-text"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                </td>
                              )}
                            </tr>
                            {/* Expanded detail row */}
                            {isExpanded && (
                              <tr key={`${key}-detail`} className="bg-surface-secondary/30 dark:bg-shell-bg/30">
                                <td colSpan={espnLeagueId && season ? 5 : 4} className="px-4 py-3">
                                  <p className="text-body-sm text-content-secondary dark:text-shell-muted leading-relaxed mb-2">
                                    {rec.explanation}
                                  </p>
                                  {rec.categoryImpacts.length > 0 && renderCategoryImpactTable(rec.categoryImpacts)}
                                  {!rec.isLegal && rec.legalityIssues && rec.legalityIssues.length > 0 && renderLegalityWarning(rec.legalityIssues)}
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <CardContent className="py-8">
              <ErrorAlert
                variant="info"
                message="No waiver recommendations available. Recommendations require a daily snapshot and uploaded FanGraphs projections. Upload projections from the league dashboard to get started."
                action={{ label: "Go to Dashboard", href: `/leagues/${leagueId}` }}
              />
            </CardContent>
          )}
        </Card>
      ) : (
        /* ═══════════════════════════════════════════════════
           MANUAL EVALUATION MODE
           ═══════════════════════════════════════════════════ */
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <Heading level={3}>Select Add/Drop</Heading>
                <select
                  value={positionFilter.length > 0 ? positionFilter[0] : ""}
                  onChange={(e) => setPositionFilter(e.target.value ? [e.target.value] : [])}
                  className="text-data border border-neutral-200 dark:border-shell-border rounded px-2 py-1 text-content dark:text-shell-text dark:bg-shell-bg"
                >
                  <option value="">All Positions</option>
                  {["C", "1B", "2B", "3B", "SS", "OF", "DH", "SP", "RP"].map((pos) => (
                    <option key={pos} value={pos}>{pos}</option>
                  ))}
                </select>
              </div>
            </CardHeader>
            <CardContent>
              {freeAgentsLoading || rosterLoading ? (
                <LoadingSkeleton lines={2} />
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* ── Free Agents Table ── */}
                  <div>
                    <label className="block text-data font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider mb-2">
                      Add from Waiver Wire
                    </label>
                    <div className="border border-neutral-200 dark:border-shell-border rounded-lg max-h-[28rem] overflow-auto">
                      <table className="min-w-full">
                        <thead className="bg-surface-secondary dark:bg-shell-bg sticky top-0 z-10">
                          <tr className="border-b border-neutral-200 dark:border-shell-border">
                            <SortHeader label="Name" sortKey="name" currentKey={faSortKey} currentDir={faSortDir} onSort={(k) => toggleSort(k, faSortKey, faSortDir, setFaSortKey, setFaSortDir)} />
                            <th className={TH_CLASS}>Pos</th>
                            <SortHeader label="% Own" sortKey="pctOwned" currentKey={faSortKey} currentDir={faSortDir} onSort={(k) => toggleSort(k, faSortKey, faSortDir, setFaSortKey, setFaSortDir)} align="right" />
                            <SortHeader label="% Start" sortKey="pctStarted" currentKey={faSortKey} currentDir={faSortDir} onSort={(k) => toggleSort(k, faSortKey, faSortDir, setFaSortKey, setFaSortDir)} align="right" />
                            <SortHeader label="PL" sortKey="plRank" currentKey={faSortKey} currentDir={faSortDir} onSort={(k) => toggleSort(k, faSortKey, faSortDir, setFaSortKey, setFaSortDir)} align="right" />
                            {renderStatHeaders(faSortKey, faSortDir, (k) => toggleSort(k, faSortKey, faSortDir, setFaSortKey, setFaSortDir))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 dark:divide-shell-border">
                          {sortRows(faRows, faSortKey, faSortDir).map((row) => (
                            <tr
                              key={row.id}
                              onClick={() => setSelectedFreeAgentId(row.id)}
                              className={cn(
                                "cursor-pointer transition-colors",
                                selectedFreeAgentId === row.id
                                  ? "bg-positive-light dark:bg-positive-dark-bg/20"
                                  : "hover:bg-surface-secondary dark:hover:bg-shell-bg",
                              )}
                            >
                              <td className="px-2 py-2 text-body-sm font-medium text-content dark:text-shell-text whitespace-nowrap sticky left-0 bg-inherit z-[5]">
                                {row.name}
                              </td>
                              <td className="px-2 py-2 text-data text-content-secondary dark:text-shell-muted whitespace-nowrap">
                                {row.positions}
                              </td>
                              <td className="px-2 py-2 text-right font-mono text-data text-content dark:text-shell-text">
                                {row.pctOwned.toFixed(1)}%
                              </td>
                              <td className="px-2 py-2 text-right font-mono text-data text-content dark:text-shell-text">
                                {row.pctStarted.toFixed(1)}%
                              </td>
                              <td className="px-2 py-2 text-right font-mono text-data text-content dark:text-shell-text">
                                {row.plRank != null ? (
                                  <span className={cn(
                                    "inline-flex items-center justify-center min-w-[1.5rem] px-1 py-0.5 rounded text-caption font-medium",
                                    row.plRank <= 20 ? "bg-positive-light text-positive dark:bg-positive-dark-bg/30 dark:text-positive" :
                                    row.plRank <= 50 ? "bg-info-light text-info dark:bg-info-dark-bg/30 dark:text-info" :
                                    "text-content-secondary dark:text-shell-muted"
                                  )}>
                                    {row.plRank}
                                  </span>
                                ) : (
                                  <span className="text-content-tertiary dark:text-shell-muted">--</span>
                                )}
                              </td>
                              {renderStatCells(row)}
                            </tr>
                          ))}
                          {faRows.length === 0 && (
                            <tr>
                              <td colSpan={20} className="px-4 py-8 text-center text-body-sm text-content-secondary dark:text-shell-muted">
                                No free agents available
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* ── Roster Table ── */}
                  <div>
                    <label className="block text-data font-medium text-content-secondary dark:text-shell-muted uppercase tracking-wider mb-2">
                      Drop from Your Roster
                    </label>
                    <div className="border border-neutral-200 dark:border-shell-border rounded-lg max-h-[28rem] overflow-auto">
                      <table className="min-w-full">
                        <thead className="bg-surface-secondary dark:bg-shell-bg sticky top-0 z-10">
                          <tr className="border-b border-neutral-200 dark:border-shell-border">
                            <SortHeader label="Slot" sortKey="slot" currentKey={rosterSortKey} currentDir={rosterSortDir} onSort={(k) => toggleSort(k, rosterSortKey, rosterSortDir, setRosterSortKey, setRosterSortDir)} />
                            <SortHeader label="Name" sortKey="name" currentKey={rosterSortKey} currentDir={rosterSortDir} onSort={(k) => toggleSort(k, rosterSortKey, rosterSortDir, setRosterSortKey, setRosterSortDir)} />
                            <th className={TH_CLASS}>Pos</th>
                            {renderStatHeaders(rosterSortKey, rosterSortDir, (k) => toggleSort(k, rosterSortKey, rosterSortDir, setRosterSortKey, setRosterSortDir))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 dark:divide-shell-border">
                          {sortRows(rosterRows, rosterSortKey, rosterSortDir).map((row) => (
                            <tr
                              key={row.id}
                              onClick={() => setSelectedRosterPlayerId(row.id)}
                              className={cn(
                                "cursor-pointer transition-colors",
                                selectedRosterPlayerId === row.id
                                  ? "bg-negative-light dark:bg-negative-dark-bg/20"
                                  : "hover:bg-surface-secondary dark:hover:bg-shell-bg",
                              )}
                            >
                              <td className="px-2 py-2 text-data font-medium text-content-secondary dark:text-shell-muted whitespace-nowrap">
                                {row.slot}
                              </td>
                              <td className="px-2 py-2 text-body-sm font-medium text-content dark:text-shell-text whitespace-nowrap sticky left-0 bg-inherit z-[5]">
                                {row.name}
                              </td>
                              <td className="px-2 py-2 text-data text-content-secondary dark:text-shell-muted whitespace-nowrap">
                                {row.positions}
                              </td>
                              {renderStatCells(row)}
                            </tr>
                          ))}
                          {rosterRows.length === 0 && (
                            <tr>
                              <td colSpan={20} className="px-4 py-8 text-center text-body-sm text-content-secondary dark:text-shell-muted">
                                No roster players available
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Evaluate Button */}
              <div className="mt-6 flex items-center justify-center gap-4">
                <Button
                  variant="primary"
                  onClick={handleEvaluate}
                  disabled={!selectedFreeAgentId || !selectedRosterPlayerId || isEvaluating}
                >
                  {isEvaluating ? "Evaluating..." : "Evaluate Impact"}
                </Button>
                {(selectedFreeAgentId || selectedRosterPlayerId) && (
                  <span className="text-data text-content-secondary dark:text-shell-muted">
                    {selectedFreeAgentId ? faRows.find(r => r.id === selectedFreeAgentId)?.name : "..."} for {selectedRosterPlayerId ? rosterRows.find(r => r.id === selectedRosterPlayerId)?.name : "..."}
                  </span>
                )}
              </div>
              {evaluationError && (
                <ErrorAlert
                  message={evaluationError}
                  variant="error"
                  onRetry={() => { setEvaluationError(null); handleEvaluate(); }}
                />
              )}
            </CardContent>
          </Card>

          {/* Evaluation Results */}
          {evaluationResult && (
            <Card>
              <CardHeader>
                <Heading level={3}>Evaluation Result</Heading>
              </CardHeader>
              <CardContent>
                {renderSwapVisualization(
                  evaluationResult.dropPlayer.name,
                  evaluationResult.addPlayer.name,
                  evaluationResult.dropPlayer.positions,
                  evaluationResult.addPlayer.positions,
                )}

                <div className="mb-4">
                  <div className="text-body-sm font-medium text-content-secondary dark:text-shell-muted mb-1">
                    <Term id="impact">Projected Impact</Term>
                  </div>
                  <div
                    className={cn(
                      "text-3xl font-bold font-mono",
                      evaluationResult.deltaOverallPoints > 0
                        ? "text-positive"
                        : evaluationResult.deltaOverallPoints < 0
                          ? "text-negative"
                          : "text-content-secondary dark:text-shell-muted",
                    )}
                  >
                    {evaluationResult.deltaOverallPoints > 0 ? "+" : ""}
                    {evaluationResult.deltaOverallPoints.toFixed(1)} pts
                  </div>
                </div>

                <p className="text-body-sm text-content-secondary dark:text-shell-muted mb-4 leading-relaxed">
                  {evaluationResult.explanation}
                </p>

                {evaluationResult.categoryImpacts.length > 0 && (
                  <details className="group" open>
                    <summary className="cursor-pointer text-body-sm font-medium text-accent dark:text-shell-accent hover:text-accent-hover dark:hover:text-shell-accent flex items-center py-2">
                      <span>Category Breakdown</span>
                      <ChevronDown className="w-4 h-4 ml-1 transform group-open:rotate-180 transition-transform" />
                    </summary>
                    {renderCategoryImpactTable(evaluationResult.categoryImpacts)}
                  </details>
                )}

                {!evaluationResult.isLegal &&
                  evaluationResult.legalityIssues &&
                  evaluationResult.legalityIssues.length > 0 &&
                  renderLegalityWarning(evaluationResult.legalityIssues)}

                {espnLeagueId && season && (
                  <div className="mt-4">
                    <a
                      href={getESPNFreeAgentsUrl(espnLeagueId, season)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-4 py-2 bg-positive text-white rounded-lg hover:bg-emerald-700 font-medium text-body-sm gap-2"
                    >
                      View on ESPN
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </Container>
  );
}
