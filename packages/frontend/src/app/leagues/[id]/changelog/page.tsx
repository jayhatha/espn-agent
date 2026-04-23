"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ScrollText,
  TrendingUp,
  TrendingDown,
  Zap,
  RefreshCw,
} from "lucide-react";
import { api } from "@/lib/api";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { cn } from "@/lib/cn";

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

/** Maps verbose category names to compact stat abbreviations for event chips. */
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
  // fallback: first 4 chars uppercase
  return categoryName.slice(0, 4).toUpperCase();
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProximateCause {
  playerName: string;
  stat: string;
  value: number;
  description: string;
}

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
  proximate_cause: ProximateCause | null;
}

interface NeighborhoodEntry {
  teamId: number;
  teamName: string;
  overallPoints: number;
  overallRank: number;
  isMyTeam: boolean;
  projectedPoints: number | null;
  projectedRank: number | null;
}

// ─── Event Card ───────────────────────────────────────────────────────────────

function EventCard({
  event,
  teamName,
  numTeams,
}: {
  event: ChangeEvent;
  teamName: string;
  numTeams: number;
}) {
  const gained = event.direction === "gained";
  // Use Math.ceil so tied teams (fractional roto_pts like 8.5) map to the better
  // of the two shared positions (4th rather than 5th in a 4th/5th tie).
  const catRank = Math.ceil(numTeams - event.curr_roto_pts + 1);
  const prevRank = Math.ceil(
    numTeams - (event.curr_roto_pts - event.roto_delta) + 1,
  );
  const rankChanged = catRank !== prevRank;

  const deltaStr = gained
    ? `+${Number(event.roto_delta).toFixed(1)}`
    : Number(event.roto_delta).toFixed(1);

  const formattedTime = new Date(event.occurred_at).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  // Build narrative lines
  const lines: string[] = [];

  if (event.proximate_cause?.description) {
    lines.push(event.proximate_cause.description);
  }

  const passedText =
    gained && event.passed_team_name
      ? `, passing ${event.passed_team_name}`
      : !gained && event.passed_team_name
        ? `, passed by ${event.passed_team_name}`
        : "";

  if (rankChanged) {
    lines.push(
      `Now ${ordinal(catRank)} in ${event.category_name}${passedText}.`,
    );
  } else if (passedText) {
    lines.push(`${ordinal(catRank)} in ${event.category_name}${passedText}.`);
  }

  return (
    <div
      className={cn(
        "border rounded-lg p-4 transition-colors",
        gained ? "border-positive/20" : "border-negative/20",
        "bg-surface-1",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left: icon + narrative */}
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={cn(
              "mt-0.5 shrink-0 w-7 h-7 rounded-full flex items-center justify-center",
              gained
                ? "bg-positive/10 text-positive"
                : "bg-negative/10 text-negative",
            )}
          >
            {gained ? (
              <TrendingUp className="w-3.5 h-3.5" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5" />
            )}
          </div>

          <div className="min-w-0">
            {/* Category badge — abbreviated stat + full name */}
            <span
              className={cn(
                "inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-xs font-mono font-medium mb-1.5",
                gained
                  ? "bg-positive/10 text-positive"
                  : "bg-negative/10 text-negative",
              )}
            >
              <span>{statAbbrev(event.category_name)}</span>
              <span className="opacity-60 font-normal text-[10px]">
                {event.category_name}
              </span>
            </span>

            {/* Narrative lines */}
            {lines.map((line, i) => (
              <p
                key={i}
                className={cn(
                  "text-sm",
                  i === 0 ? "text-content-primary" : "text-content-secondary",
                )}
              >
                {line}
              </p>
            ))}
          </div>
        </div>

        {/* Right: delta + time */}
        <div className="shrink-0 text-right">
          <span
            className={cn(
              "font-mono text-sm font-semibold",
              gained ? "text-positive" : "text-negative",
            )}
          >
            {deltaStr} pts
          </span>
          <p className="text-xs text-content-tertiary mt-0.5">
            {formattedTime}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Standings Neighborhood ──────────────────────────────────────────────────

function StandingsNeighborhood({
  neighborhood,
}: {
  neighborhood: NeighborhoodEntry[];
}) {
  return (
    <div className="rounded-lg border border-shell-border overflow-hidden mb-6">
      <div className="px-3 py-2 border-b border-shell-border bg-surface-1 flex items-center gap-2">
        <span className="text-xs font-medium text-content-tertiary uppercase tracking-wider">
          Live Standings
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-positive">
          <span className="w-1.5 h-1.5 rounded-full bg-positive animate-pulse" />
          live
        </span>
      </div>
      <div className="divide-y divide-shell-border/50">
        {neighborhood.map((row) => (
          <div
            key={row.teamId}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5",
              row.isMyTeam
                ? "bg-accent/5 border-l-2 border-accent"
                : "bg-surface-0",
            )}
          >
            {/* Rank */}
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

            {/* Team name */}
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

            {/* Points */}
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChangeLogPage() {
  const params = useParams();
  const leagueId = params.id as string;
  const leagueIdNum = parseInt(leagueId, 10);

  const [ourTeamId, setOurTeamId] = useState<number | null>(null);
  const [liveEvents, setLiveEvents] = useState<ChangeEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastPolledAt, setLastPolledAt] = useState<Date | null>(null);
  const [refreshError, setRefreshError] = useState(false);
  // false on server; real value set after mount to avoid SSR/client hydration mismatch
  const [isGameTime, setIsGameTime] = useState(false);
  const seenIds = useRef(new Set<number>());

  // Load our team from localStorage (same pattern as rest of app)
  useEffect(() => {
    const stored = localStorage.getItem(`league_${leagueId}_team`);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed)) setOurTeamId(parsed);
    }
  }, [leagueId]);

  // Set real game-window value on mount (client only), then update every minute
  useEffect(() => {
    setIsGameTime(isGameWindow());
    const interval = setInterval(() => setIsGameTime(isGameWindow()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const queryClient = useQueryClient();

  // Manual refresh handler
  const handleRefresh = useCallback(async () => {
    setRefreshError(false);
    try {
      await api.triggerLiveRefresh(leagueIdNum);
      setLastPolledAt(new Date());
      queryClient.invalidateQueries({
        queryKey: ["standings-neighborhood", leagueId],
      });
    } catch {
      setRefreshError(true);
    }
  }, [leagueIdNum, leagueId, queryClient]);

  // Fetch teams for name lookup
  const { data: teamsData } = useQuery({
    queryKey: ["league-teams", leagueId],
    queryFn: () =>
      api.getTeams(leagueIdNum) as Promise<{
        teams: Array<{ id: number; name: string }>;
      }>,
  });

  const teamMap = new Map(teamsData?.teams.map((t) => [t.id, t.name]) ?? []);

  // Fetch history via REST on mount
  const { data: historyData, isLoading } = useQuery({
    queryKey: ["change-log-history", leagueId, "live"],
    queryFn: () =>
      api.getChangeLogHistory(leagueIdNum, 50, "live") as Promise<{
        events: ChangeEvent[];
      }>,
  });

  // Fetch standings neighborhood (2 above + me + 2 below)
  const { data: neighborhoodData } = useQuery({
    queryKey: ["standings-neighborhood", leagueId, ourTeamId],
    queryFn: () =>
      api.getStandingsNeighborhood(leagueIdNum, ourTeamId!) as Promise<{
        neighborhood: NeighborhoodEntry[];
        snapshotDate: string;
      }>,
    enabled: ourTeamId != null,
    refetchInterval: isGameTime ? 5 * 60 * 1000 : false, // only poll during game hours
    staleTime: 2 * 60 * 1000,
  });

  // Deduplicated event merge (newest first).
  // For events whose ID is already in the feed (intraday delta update), update in-place.
  const addEvents = useCallback((incoming: ChangeEvent[]) => {
    setLiveEvents((prev) => {
      let updated = prev;
      const newOnes: ChangeEvent[] = [];
      for (const evt of incoming) {
        if (seenIds.current.has(evt.id)) {
          // Update the existing card in-place with the latest delta
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

  // Pre-populate seenIds and state from REST history
  useEffect(() => {
    if (historyData?.events) {
      for (const evt of historyData.events) seenIds.current.add(evt.id);
      setLiveEvents(historyData.events);
    }
  }, [historyData]);

  // SSE subscription for live updates
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
          // Refresh neighborhood standings immediately when live poll completes
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
  }, [leagueIdNum, addEvents]);

  const myEvents = liveEvents.filter((e) => e.team_id === ourTeamId);
  const numTeams = teamsData?.teams.length ?? 10;

  return (
    <Container className="py-8">
      <PageHeader
        title="Streaming Results"
        backLink={{ href: `/leagues/${leagueId}`, label: "Back to League" }}
        actions={
          <div className="flex items-center gap-2">
            {/* Last polled timestamp */}
            {lastPolledAt && (
              <span className="text-xs text-content-tertiary hidden sm:inline">
                Updated {formatRelativeTime(lastPolledAt)}
              </span>
            )}

            {/* Games in progress indicator */}
            {isGameTime && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Games live
              </span>
            )}

            {/* Manual refresh button */}
            <button
              onClick={handleRefresh}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border transition-colors",
                refreshError
                  ? "border-negative/40 text-negative"
                  : "border-shell-border text-content-secondary hover:text-content-primary hover:border-accent",
              )}
              title={refreshError ? "Refresh failed — try again" : undefined}
            >
              <RefreshCw className="w-3 h-3" />
              {refreshError ? "Failed" : "Refresh"}
            </button>

            {/* SSE connection dot */}
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

      {/* Standings neighborhood panel */}
      {neighborhoodData?.neighborhood &&
        neighborhoodData.neighborhood.length > 0 && (
          <div className="mt-6">
            <StandingsNeighborhood
              neighborhood={neighborhoodData.neighborhood}
            />
          </div>
        )}

      {/* Loading state */}
      {isLoading && (
        <div className="text-center py-16 text-content-tertiary text-sm">
          Loading streaming results…
        </div>
      )}

      {/* Empty state — gate on ourTeamId being resolved to avoid flash before localStorage loads */}
      {!isLoading && ourTeamId != null && myEvents.length === 0 && (
        <div className="text-center py-16">
          <ScrollText className="w-8 h-8 text-content-tertiary mx-auto mb-3" />
          <p className="text-content-secondary text-sm">
            No changes affecting your team yet.
          </p>
          <p className="text-content-tertiary text-xs mt-1">
            Changes appear here when your standing in any category shifts.
          </p>
        </div>
      )}

      {/* Event feed — my team only */}
      {myEvents.length > 0 && (
        <div className="flex flex-col gap-3 mt-6">
          {myEvents.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              teamName={teamMap.get(event.team_id) ?? `Team ${event.team_id}`}
              numTeams={numTeams}
            />
          ))}
        </div>
      )}
    </Container>
  );
}
