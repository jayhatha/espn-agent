"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

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
}

interface FaabSummaryResponse {
  faabRemaining: number;
}

interface GsSummaryResponse {
  gsUsed: number;
  gsCap: number;
}

function StatItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-shell-muted text-xs uppercase tracking-wide">{label}</span>
      <span className="text-shell-text font-mono text-sm">{value}</span>
    </div>
  );
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

  const leagueName = data?.league?.name ?? "—";
  const season = data?.league?.season;
  const weekLabel = season ? `${season}` : "—";

  const faabValue = faabData ? `$${faabData.faabRemaining}` : "--";
  const gsValue = gsData ? `${gsData.gsUsed}/${gsData.gsCap}` : "--";

  return (
    <header className="h-14 bg-shell-panel border-b border-shell-border px-4 flex items-center justify-between flex-shrink-0">
      {/* Left: league name */}
      <div className="flex items-center gap-2">
        <span className="text-shell-text font-semibold text-sm truncate max-w-xs">
          {leagueName}
        </span>
      </div>

      {/* Right: summary stats */}
      <div className="flex items-center gap-6">
        <StatItem label="Week" value="--" />
        <StatItem label="FAAB" value={faabValue} />
        <StatItem label="GS" value={gsValue} />
        {/* TODO SHELL-03: wire projected total roto points */}
        <StatItem label="Projected" value="--" />
      </div>
    </header>
  );
}
