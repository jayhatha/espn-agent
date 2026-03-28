"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Calendar, DollarSign, BarChart2, TrendingUp, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

interface LeagueStatus {
  league: {
    id: number;
    espn_league_id: number;
    season: number;
    name: string;
    timezone: string;
    user_team_id: number | null;
  };
  latestSnapshot: {
    snapshot_date: string;
    is_degraded: boolean;
    degraded_reasons: string[];
  } | null;
  snapshotCount: number;
  gamesPlayed: number | null;
}

interface ProjectedStandingsResponse {
  overallStandings: Array<{
    team_id: number;
    projected_overall_rank: number;
    projected_overall_points: number;
  }>;
}

interface FaabSummaryResponse {
  faabRemaining: number;
}

interface GsSummaryResponse {
  gsUsed: number;
  gsCap: number;
}

function StatItem({
  label,
  value,
  icon: Icon,
  href,
  warning,
  warningTitle,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  href?: string;
  warning?: boolean;
  warningTitle?: string;
}) {
  const content = (
    <div
      className={cn(
        "flex items-center gap-2",
        href ? "cursor-pointer hover:opacity-80 transition-opacity" : ""
      )}
      title={warningTitle}
    >
      <Icon size={14} className="text-shell-muted flex-shrink-0" aria-hidden="true" />
      <span className="text-shell-muted text-xs uppercase tracking-wide">{label}</span>
      <span
        className={cn(
          "font-mono text-sm",
          warning ? "text-negative font-semibold" : "text-shell-text"
        )}
      >
        {value}
      </span>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

export function TopBar() {
  const params = useParams();
  const id = params?.id as string;
  const leagueId = id ? parseInt(id, 10) : 0;

  // Read team ID from localStorage (same pattern as other pages)
  const [teamId, setTeamId] = useState<number | null>(null);
  useEffect(() => {
    if (!id) return;
    const stored = localStorage.getItem(`league_${id}_team`);
    if (stored) {
      setTeamId(parseInt(stored, 10));
    }
  }, [id]);

  const { data } = useQuery<LeagueStatus>({
    queryKey: ["league-status", id],
    queryFn: () => api.getLeagueStatus(leagueId) as Promise<LeagueStatus>,
    enabled: !!id,
    staleTime: 60_000,
  });

  // FAAB remaining
  const { data: faabData } = useQuery<FaabSummaryResponse>({
    queryKey: ["faab-summary", leagueId, teamId],
    queryFn: () => api.getFaabSummary(leagueId, teamId!) as Promise<FaabSummaryResponse>,
    enabled: !!id && !!teamId,
    staleTime: 5 * 60_000,
  });

  // GS pacing
  const { data: gsData } = useQuery<GsSummaryResponse>({
    queryKey: ["gs-summary", leagueId, teamId],
    queryFn: () => api.getGsSummary(leagueId, teamId!) as Promise<GsSummaryResponse>,
    enabled: !!id && !!teamId,
    staleTime: 5 * 60_000,
  });

  // Projected standings for selected team rank
  const { data: standingsData } = useQuery<ProjectedStandingsResponse>({
    queryKey: ["topbar-projected", leagueId],
    queryFn: () => api.getProjectedStandings(leagueId) as Promise<ProjectedStandingsResponse>,
    enabled: !!id && !!teamId,
    staleTime: 5 * 60_000,
  });

  const projectedValue = useMemo(() => {
    if (!standingsData?.overallStandings || !teamId) return "--";
    const myTeam = standingsData.overallStandings.find(t => t.team_id === teamId);
    return myTeam ? `#${myTeam.projected_overall_rank}` : "--";
  }, [standingsData, teamId]);

  const leagueName = data?.league?.name ?? "--";
  const todayLabel = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const gp = data?.gamesPlayed;
  const seasonProgress = gp != null ? `${gp}/162` : "--";

  const faabValue = faabData ? `$${faabData.faabRemaining}` : "--";
  const gsValue = gsData ? `${gsData.gsUsed}/${gsData.gsCap}` : "--";
  const gsOverCap = gsData ? gsData.gsUsed > gsData.gsCap : false;

  return (
    <header className="h-14 bg-shell-panel border-b border-shell-border px-4 flex items-center justify-between flex-shrink-0 sticky top-0 z-20">
      {/* Left: league name */}
      <div className="flex items-center gap-2">
        <span className="text-shell-text font-semibold text-sm truncate max-w-xs">
          {leagueName}
        </span>
      </div>

      {/* Right: summary stats with icons and links */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-6">
        <StatItem label={todayLabel} value={seasonProgress} icon={Calendar} />
        <StatItem
          label="FAAB"
          value={faabValue}
          icon={DollarSign}
          href={id ? `/leagues/${id}/moves` : undefined}
        />
        <StatItem
          label="GS"
          value={gsValue}
          icon={BarChart2}
          href={id ? `/leagues/${id}/streaming` : undefined}
          warning={gsOverCap}
          warningTitle={gsOverCap ? "Warning: GS usage exceeds cap" : undefined}
        />
        <StatItem
          label="Projected"
          value={projectedValue}
          icon={TrendingUp}
          href={id ? `/leagues/${id}/standings` : undefined}
        />
      </div>
    </header>
  );
}
