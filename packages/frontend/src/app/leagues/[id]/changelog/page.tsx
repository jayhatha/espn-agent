"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ScrollText, TrendingUp, TrendingDown, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { cn } from "@/lib/cn";

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

// ─── Event Card ───────────────────────────────────────────────────────────────

function EventCard({
  event,
  isOurTeam,
  teamName,
}: {
  event: ChangeEvent;
  isOurTeam: boolean;
  teamName: string;
}) {
  const gained = event.direction === "gained";
  const deltaStr = gained
    ? `+${Number(event.roto_delta).toFixed(1)}`
    : Number(event.roto_delta).toFixed(1);

  const passedLabel = event.passed_team_name
    ? gained
      ? `Passed ${event.passed_team_name}`
      : `Passed by ${event.passed_team_name}`
    : null;

  const formattedTime = new Date(event.occurred_at).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <div
      className={cn(
        "border rounded-lg p-4 transition-opacity",
        isOurTeam
          ? "border-shell-border bg-surface-1"
          : "border-shell-border/50 bg-surface-0 opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left: icon + content */}
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={cn(
              "mt-0.5 shrink-0 w-7 h-7 rounded-full flex items-center justify-center",
              gained ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"
            )}
          >
            {gained ? (
              <TrendingUp className="w-3.5 h-3.5" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5" />
            )}
          </div>

          <div className="min-w-0">
            {/* Team name + category badge */}
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={cn(
                  "text-sm font-semibold",
                  isOurTeam ? "text-content-primary" : "text-content-secondary"
                )}
              >
                {teamName}
              </span>
              <span
                className={cn(
                  "inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono font-medium",
                  gained
                    ? "bg-positive/10 text-positive"
                    : "bg-negative/10 text-negative"
                )}
              >
                {event.category_name}
              </span>
            </div>

            {/* Passed label */}
            {passedLabel && (
              <p className="text-xs text-content-secondary mt-0.5">{passedLabel}</p>
            )}

            {/* Proximate cause */}
            {event.proximate_cause && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <Zap className="w-3 h-3 text-content-tertiary shrink-0" />
                <p className="text-xs text-content-tertiary">
                  {event.proximate_cause.description}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right: delta + time */}
        <div className="shrink-0 text-right">
          <span
            className={cn(
              "font-mono text-sm font-semibold",
              gained ? "text-positive" : "text-negative"
            )}
          >
            {deltaStr} pts
          </span>
          <p className="text-xs text-content-tertiary mt-0.5">{formattedTime}</p>
        </div>
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
  const seenIds = useRef(new Set<number>());

  // Load our team from localStorage (same pattern as rest of app)
  useEffect(() => {
    const stored = localStorage.getItem(`league_${leagueId}_team`);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed)) setOurTeamId(parsed);
    }
  }, [leagueId]);

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
    queryKey: ["change-log-history", leagueId],
    queryFn: () =>
      api.getChangeLogHistory(leagueIdNum, 50) as Promise<{
        events: ChangeEvent[];
      }>,
  });

  // Deduplicated event merge (newest first)
  const addEvents = useCallback((incoming: ChangeEvent[]) => {
    setLiveEvents((prev) => {
      const newOnes: ChangeEvent[] = [];
      for (const evt of incoming) {
        if (!seenIds.current.has(evt.id)) {
          seenIds.current.add(evt.id);
          newOnes.push(evt);
        }
      }
      if (newOnes.length === 0) return prev;
      return [...newOnes, ...prev];
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
        const msg = JSON.parse(e.data) as { type: string; data?: ChangeEvent };
        if (msg.type === "event" && msg.data) {
          addEvents([msg.data]);
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

  return (
    <Container className="py-8">
      <PageHeader
        title="Change Log"
        backLink={{ href: `/leagues/${leagueId}`, label: "Back to League" }}
        actions={
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full",
              isConnected
                ? "bg-positive/10 text-positive"
                : "bg-surface-2 text-content-tertiary"
            )}
          >
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                isConnected ? "bg-positive animate-pulse" : "bg-content-tertiary"
              )}
            />
            {isConnected ? "Live" : "Connecting…"}
          </span>
        }
      />

      {/* Loading state */}
      {isLoading && (
        <div className="text-center py-16 text-content-tertiary text-sm">
          Loading change log…
        </div>
      )}

      {/* Empty state */}
      {!isLoading && liveEvents.length === 0 && (
        <div className="text-center py-16">
          <ScrollText className="w-8 h-8 text-content-tertiary mx-auto mb-3" />
          <p className="text-content-secondary text-sm">No standings changes yet.</p>
          <p className="text-content-tertiary text-xs mt-1">
            Changes appear after the next snapshot runs.
          </p>
        </div>
      )}

      {/* Event feed */}
      {liveEvents.length > 0 && (
        <div className="flex flex-col gap-3 mt-6">
          {liveEvents.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              isOurTeam={event.team_id === ourTeamId}
              teamName={teamMap.get(event.team_id) ?? `Team ${event.team_id}`}
            />
          ))}
        </div>
      )}
    </Container>
  );
}
