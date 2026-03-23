"use client";

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

  const { data } = useQuery<LeagueStatus>({
    queryKey: ["league-status", id],
    queryFn: () => api.getLeagueStatus(parseInt(id, 10)) as Promise<LeagueStatus>,
    enabled: !!id,
    staleTime: 60_000,
  });

  const leagueName = data?.league?.name ?? "—";
  const season = data?.league?.season;
  const weekLabel = season ? `${season}` : "—";

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
        <StatItem label="Season" value={weekLabel} />
        {/* TODO SHELL-03: wire FAAB from API */}
        <StatItem label="FAAB" value="--" />
        {/* TODO SHELL-03: wire GS pace from API */}
        <StatItem label="GS Pace" value="--" />
      </div>
    </header>
  );
}
