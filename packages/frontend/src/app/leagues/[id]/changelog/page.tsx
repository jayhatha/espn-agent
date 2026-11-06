"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLeagueTeam } from "@/lib/hooks";
import { TrendingUp, TrendingDown, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { cn } from "@/lib/cn";

// ─── Helpers ─────────────────────────────────────────────────────────────────

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns true during MLB game hours (1pm–midnight ET = 17:00–04:00 UTC). */
function isGameWindow(): boolean {
  const h = new Date().getUTCHours();
  return h >= 17 || h < 4;
}

function formatRelativeTime(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function statAbbrev(categoryName: string): string {
  const name = categoryName.toUpperCase();
  if (name === "HR" || name.includes("HOME RUN")) return "HR";
  if (name === "SB" || name.includes("STOLEN")) return "SB";
  if (name === "K" || name.includes("STRIKEOUT")) return "K";
  if (name === "ERA" || name.startsWith("EARN")) return "ERA";
  if (name === "WHIP" || name.includes("WALKS+HITS")) return "WHIP";
  if (name === "AVG" || name.includes("BATTING AVG")) return "AVG";
  if (name === "OPS") return "OPS";
  if (name === "OBP") return "OBP";
  if (name === "SLG") return "SLG";
  if (name === "RBI" || name.includes("RUNS BATTED")) return "RBI";
  if (name === "R" || (name.includes("RUN") && !name.includes("HOME")))
    return "R";
  if (name === "W" || name.includes("WIN")) return "W";
  if (name === "SV" || name.includes("SAVE")) return "SV";
  if (name === "HLD" || name.includes("HOLD")) return "HLD";
  if (name === "QS" || name.includes("QUALITY")) return "QS";
  return categoryName.slice(0, 4).toUpperCase();
}

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChangeEvent {
  id: number;
  league_id: number;
  team_id: number;
  snapshot_date: string;
  occurred_at: string;
  category_id: string;
  category_name: string;
  prev_roto_pts: number;
  curr_roto_pts: number;
  roto_delta: number;
  passed_team_id: number | null;
  passed_team_name: string | null;
  direction: "gained" | "lost";
  event_source: "snapshot" | "live";
}

interface PollGroup {
  timestamp: Date;
  netDelta: number;
  events: ChangeEvent[];
}

interface NeighborhoodEntry {
  teamId: number;
  teamName: string;
  overallPoints: number;
  overallRank: number;
  isMyTeam: boolean;
}

// ─── Group events by poll run (events within 60s of the group start) ─────────

function groupByPollRun(events: ChangeEvent[]): PollGroup[] {
  // events are newest-first
  const groups: PollGroup[] = [];
  for (const evt of events) {
    const t = new Date(evt.occurred_at).getTime();
    const last = groups[groups.length - 1];
    if (last && Math.abs(t - last.timestamp.getTime()) <= 60_000) {
      last.events.push(evt);
    } else {
      groups.push({
        timestamp: new Date(evt.occurred_at),
        netDelta: 0,
        events: [evt],
      });
    }
  }
  return groups.map((g) => ({
    ...g,
    netDelta: g.events.reduce((sum, e) => sum + Number(e.roto_delta), 0),
  }));
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({
  neighborhood,
  liveDelta,
  lastPolledAt,
  snapshotDate,
}: {
  neighborhood: NeighborhoodEntry[];
  liveDelta: number;
  lastPolledAt: Date | null;
  snapshotDate: string;
}) {
  const myEntry = neighborhood.find((n) => n.isMyTeam);
  return (
    <div className="rounded-lg border border-shell-border overflow-hidden mb-6">
      {myEntry && (
        <div className="px-4 py-3 bg-surface-1 border-b border-shell-border flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold text-content-primary">
              {ordinal(myEntry.overallRank)}
            </span>
            <span className="text-sm text-content-secondary">
              {Number(myEntry.overallPoints).toFixed(1)} pts
            </span>
          </div>
          <div className="flex items-center gap-2">
            {liveDelta !== 0 && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-xs font-mono font-semibold px-2 py-0.5 rounded-full",
                  liveDelta > 0
                    ? "bg-positive/10 text-positive"
                    : "bg-negative/10 text-negative",
                )}
              >
                <Zap className="w-3 h-3" />
                {liveDelta > 0 ? "+" : ""}
                {liveDelta.toFixed(1)} today
              </span>
            )}
            <span className="text-xs text-content-tertiary">
              {lastPolledAt
                ? `Updated ${formatRelativeTime(lastPolledAt)}`
                : `As of ${snapshotDate}`}
            </span>
          </div>
        </div>
      )}
      <div className="divide-y divide-shell-border/50">
        {neighborhood.map((row) => (
          <div
            key={row.teamId}
            className={cn(
              "flex items-center gap-3 px-4 py-2.5",
              row.isMyTeam
                ? "bg-accent/5 border-l-2 border-accent"
                : "bg-surface-0",
            )}
          >
            <span
              className={cn(
                "w-5 text-right font-mono text-sm tabular-nums",
                row.isMyTeam
                  ? "text-content-primary font-semibold"
                  : "text-content-tertiary",
              )}
            >
              {row.overallRank}
            </span>
            <span
              className={cn(
                "flex-1 text-sm truncate",
                row.isMyTeam
                  ? "text-content-primary font-medium"
                  : "text-content-secondary",
              )}
            >
              {row.teamName}
              {row.isMyTeam && (
                <span className="ml-1.5 text-xs text-accent font-normal">
                  you
                </span>
              )}
            </span>
            <span
              className={cn(
                "font-mono text-sm tabular-nums",
                row.isMyTeam
                  ? "text-content-primary font-semibold"
                  : "text-content-tertiary",
              )}
            >
              {Number(row.overallPoints).toFixed(1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
// ─── Poll Group Card ──────────────────────────────────────────────────────────

function PollGroupCard({
  group,
  numTeams,
}: {
  group: PollGroup;
  numTeams: number;
}) {
  const net = group.netDelta;
  const netPositive = net >= 0;
  const time = group.timestamp.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <div className="border border-shell-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-surface-1 border-b border-shell-border">
        <span className="text-xs text-content-tertiary">{time}</span>
        {net !== 0 && (
          <span
            className={cn(
              "font-mono text-sm font-semibold",
              netPositive ? "text-positive" : "text-negative",
            )}
          >
            {net > 0 ? "+" : ""}
            {net.toFixed(1)} pts net
          </span>
        )}
      </div>
      <div className="divide-y divide-shell-border/30">
        {group.events.map((evt) => {
          const gained = evt.direction === "gained";
          const delta = Number(evt.roto_delta);
          const catRank = Math.ceil(numTeams - evt.curr_roto_pts + 1);
          const prevRank = Math.ceil(
            numTeams - (evt.curr_roto_pts - delta) + 1,
          );
          const rankChanged = catRank !== prevRank;

          return (
            <div
              key={evt.id}
              className="flex items-center gap-3 px-4 py-2.5 bg-surface-0"
            >
              <div
                className={cn(
                  "shrink-0 w-6 h-6 rounded-full flex items-center justify-center",
                  gained
                    ? "bg-positive/10 text-positive"
                    : "bg-negative/10 text-negative",
                )}
              >
                {gained ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
              </div>
              <span
                className={cn(
                  "inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono font-medium shrink-0",
                  gained
                    ? "bg-positive/10 text-positive"
                    : "bg-negative/10 text-negative",
                )}
              >
                {statAbbrev(evt.category_name)}
              </span>
              <span className="flex-1 text-xs text-content-secondary">
                {rankChanged
                  ? `${ordinal(prevRank)} → ${ordinal(catRank)}`
                  : ordinal(catRank)}
                {evt.passed_team_name
                  ? gained
                    ? `, passed ${evt.passed_team_name}`
                    : `, passed by ${evt.passed_team_name}`
                  : ""}
              </span>
              <span
                className={cn(
                  "font-mono text-sm font-semibold tabular-nums shrink-0",
                  gained ? "text-positive" : "text-negative",
                )}
              >
                {delta > 0 ? "+" : ""}
                {delta.toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LiveResultsPage() {
  const params = useParams();
  const leagueId = params.id as string;
  const leagueIdNum = parseInt(leagueId, 10);

  const [ourTeamId] = useLeagueTeam(leagueId);
  const [liveEvents, setLiveEvents] = useState<ChangeEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastPolledAt, setLastPolledAt] = useState<Date | null>(null);
  const [isGameTime, setIsGameTime] = useState(false);
  const seenIds = useRef(new Set<number>());

  useEffect(() => {
    setIsGameTime(isGameWindow());
    const interval = setInterval(() => setIsGameTime(isGameWindow()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const queryClient = useQueryClient();

  const { data: teamsData } = useQuery({
    queryKey: ["league-teams", leagueId],
    queryFn: () =>
      api.getTeams(leagueIdNum) as Promise<{
        teams: Array<{ id: number; name: string }>;
      }>,
  });

  const { data: historyData, isLoading } = useQuery({
    queryKey: ["change-log-history", leagueId, "live"],
    queryFn: () =>
      api.getChangeLogHistory(leagueIdNum, 200, "live") as Promise<{
        events: ChangeEvent[];
      }>,
  });

  const { data: neighborhoodData } = useQuery({
    queryKey: ["standings-neighborhood", leagueId, ourTeamId],
    queryFn: () =>
      api.getStandingsNeighborhood(leagueIdNum, ourTeamId!) as Promise<{
        neighborhood: NeighborhoodEntry[];
        snapshotDate: string;
      }>,
    enabled: ourTeamId != null,
    refetchInterval: isGameTime ? 5 * 60 * 1000 : false,
    staleTime: 2 * 60 * 1000,
  });

  const addEvents = useCallback((incoming: ChangeEvent[]) => {
    const liveOnly = incoming.filter((e) => e.event_source === "live");
    if (liveOnly.length === 0) return;
    setLiveEvents((prev) => {
      let updated = prev;
      const newOnes: ChangeEvent[] = [];
      for (const evt of liveOnly) {
        if (seenIds.current.has(evt.id)) {
          updated = updated.map((e) => (e.id === evt.id ? evt : e));
        } else {
          seenIds.current.add(evt.id);
          newOnes.push(evt);
        }
      }
      if (newOnes.length === 0 && updated === prev) return prev;
      return newOnes.length > 0 ? [...newOnes, ...updated] : updated;
    });
  }, []);

  useEffect(() => {
    if (historyData?.events) {
      for (const evt of historyData.events) seenIds.current.add(evt.id);
      setLiveEvents(historyData.events);
    }
  }, [historyData]);

  useEffect(() => {
    if (isNaN(leagueIdNum)) return;
    const url = api.getChangeLogSSEUrl(leagueIdNum);
    const es = new EventSource(url, { withCredentials: true });

    es.onopen = () => setIsConnected(true);
    es.onerror = () => setIsConnected(false);

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as { type: string; data?: unknown };
        if (msg.type === "event" && msg.data) {
          addEvents([msg.data as ChangeEvent]);
        } else if (msg.type === "live_poll") {
          const d = msg.data as { polledAt: string };
          setLastPolledAt(new Date(d.polledAt));
          queryClient.invalidateQueries({
            queryKey: ["standings-neighborhood", leagueId],
          });
        }
      } catch {
        // ignore malformed frames
      }
    };

    return () => {
      es.close();
      setIsConnected(false);
    };
  }, [leagueIdNum, addEvents, leagueId, queryClient]);

  // Rolling 24h, my team only
  const cutoff = Date.now() - TWENTY_FOUR_HOURS;
  const myEvents = liveEvents.filter(
    (e) =>
      e.team_id === ourTeamId && new Date(e.occurred_at).getTime() >= cutoff,
  );

  const liveDelta = myEvents.reduce((sum, e) => sum + Number(e.roto_delta), 0);
  const pollGroups = groupByPollRun(myEvents);
  const numTeams = teamsData?.teams.length ?? 10;

  return (
    <Container className="py-8">
      <PageHeader
        title="Live Results"
        backLink={{ href: `/leagues/${leagueId}`, label: "Back to League" }}
        actions={
          <div className="flex items-center gap-2">
            {isGameTime && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Games live
              </span>
            )}
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full",
                isConnected
                  ? "bg-positive/10 text-positive"
                  : "bg-surface-2 text-content-tertiary",
              )}
            >
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  isConnected
                    ? "bg-positive animate-pulse"
                    : "bg-content-tertiary",
                )}
              />
              {isConnected ? "Live" : "Connecting…"}
            </span>
          </div>
        }
      />

      {neighborhoodData?.neighborhood &&
        neighborhoodData.neighborhood.length > 0 && (
          <div className="mt-6">
            <SummaryCard
              neighborhood={neighborhoodData.neighborhood}
              liveDelta={liveDelta}
              lastPolledAt={lastPolledAt}
              snapshotDate={neighborhoodData.snapshotDate}
            />
          </div>
        )}

      {isLoading && (
        <div className="text-center py-16 text-content-tertiary text-sm">
          Loading live results…
        </div>
      )}

      {!isLoading && ourTeamId != null && myEvents.length === 0 && (
        <div className="text-center py-16">
          <Zap className="w-8 h-8 text-content-tertiary mx-auto mb-3" />
          <p className="text-content-secondary text-sm">
            No live changes in the last 24 hours.
          </p>
          <p className="text-content-tertiary text-xs mt-1">
            Updates appear here during game hours (1pm–midnight ET).
          </p>
        </div>
      )}

      {pollGroups.length > 0 && (
        <div className="flex flex-col gap-3 mt-2">
          {pollGroups.map((group, i) => (
            <PollGroupCard key={i} group={group} numTeams={numTeams} />
          ))}
        </div>
      )}
    </Container>
  );
}
