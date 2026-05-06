"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { RefreshCw, ArrowLeftRight, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { type ActionItem } from "@/components/league/ActionItemsList";

// ---- Types returned from API ------------------------------------------------

interface WaiverRec {
  addPlayerId: number;
  addPlayerName: string;
  dropPlayerId: number;
  dropPlayerName: string;
  deltaOverallPoints: number;
  explanation: string;
}

interface TradeCandidate {
  partnerTeamId: number;
  partnerTeamName: string;
  deltaOverallPoints: number;
  explanation: string;
  trade: {
    givePlayers: { playerName: string }[];
    receivePlayers: { playerName: string }[];
  };
}

type TabKey = "all" | "trade" | "waiver";

// ---- Signal item renderer ---------------------------------------------------

function SignalItem({ item }: { item: ActionItem }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = item.type === "waiver" ? RefreshCw : ArrowLeftRight;
  const isPositive = item.impact.startsWith("+");

  return (
    <div
      className="py-3 px-3 border-b border-shell-border last:border-0 cursor-pointer"
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onClick={() => setExpanded(!expanded)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setExpanded(!expanded);
        }
      }}
    >
      <div className="flex items-start gap-2">
        <Icon size={14} className="mt-0.5 flex-shrink-0 text-shell-muted" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-shell-text leading-tight truncate">
            {item.title}
          </p>
          <p
            className={cn(
              "text-xs text-shell-muted mt-0.5",
              expanded ? "" : "line-clamp-2",
            )}
          >
            {item.description}
          </p>
          <div className="flex items-center justify-between mt-1">
            <span
              className={cn(
                "text-xs font-mono font-semibold",
                isPositive ? "text-positive" : "text-negative",
              )}
            >
              {item.impact}
            </span>
            {item.internalLink && (
              <Link
                href={item.internalLink}
                className="text-xs text-shell-accent hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                Analyze
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Main component ---------------------------------------------------------

export function SignalsPanel() {
  const params = useParams();
  const id = params?.id as string;

  const [teamId, setTeamId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [showLowImpact, setShowLowImpact] = useState(false);

  // Read selected team from localStorage (same key pattern as the dashboard)
  useEffect(() => {
    if (!id) return;
    const stored = localStorage.getItem(`league_${id}_team`);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed)) setTeamId(parsed);
    }
  }, [id]);

  const { data: waiverData, isLoading: waiverLoading } = useQuery({
    queryKey: ["waivers-recommendations", id, teamId, 5],
    queryFn: () =>
      api.getWaiverRecommendations(parseInt(id, 10), teamId!, {
        maxRecommendations: 5,
      }),
    enabled: !!teamId && !!id,
    staleTime: 5 * 60_000,
  });

  const { data: tradeData, isLoading: tradeLoading } = useQuery({
    queryKey: ["trades-recommendations", id, teamId],
    queryFn: () => api.getTradeRecommendations(parseInt(id, 10), teamId!),
    enabled: !!teamId && !!id,
    staleTime: 5 * 60_000,
  });

  const isLoadingSignals = (waiverLoading || tradeLoading) && !!teamId;

  // Build action items list
  const allSignals: ActionItem[] = useMemo(() => {
    const signals: ActionItem[] = [];

    if (waiverData?.recommendations) {
      for (const rec of (waiverData.recommendations as WaiverRec[]).slice(
        0,
        5,
      )) {
        signals.push({
          id: `waiver-${rec.addPlayerId}-${rec.dropPlayerId}`,
          type: "waiver",
          priority:
            rec.deltaOverallPoints >= 2
              ? "high"
              : rec.deltaOverallPoints >= 1
                ? "medium"
                : "low",
          title: `Add ${rec.addPlayerName}, Drop ${rec.dropPlayerName}`,
          description: rec.explanation,
          impact: `+${rec.deltaOverallPoints.toFixed(1)} pts`,
          internalLink: `/leagues/${id}/waivers`,
        });
      }
    }

    if (tradeData?.candidates) {
      for (const cand of (tradeData.candidates as TradeCandidate[]).slice(
        0,
        3,
      )) {
        const giveName = cand.trade.givePlayers
          .map((p) => p.playerName)
          .join(", ");
        const getName = cand.trade.receivePlayers
          .map((p) => p.playerName)
          .join(", ");
        signals.push({
          id: `trade-${cand.partnerTeamId}-${giveName}`,
          type: "trade",
          priority:
            cand.deltaOverallPoints >= 3
              ? "high"
              : cand.deltaOverallPoints >= 1.5
                ? "medium"
                : "low",
          title: `Trade ${giveName} for ${getName}`,
          description: `${cand.partnerTeamName}: ${cand.explanation}`,
          impact: `+${cand.deltaOverallPoints.toFixed(1)} pts`,
          internalLink: `/leagues/${id}/trades`,
        });
      }
    }

    // Sort by impact descending
    signals.sort((a, b) => parseFloat(b.impact) - parseFloat(a.impact));
    return signals;
  }, [waiverData, tradeData, id]);

  const waiverCount = allSignals.filter((s) => s.type === "waiver").length;
  const tradeCount = allSignals.filter((s) => s.type === "trade").length;

  const filteredSignals = useMemo(() => {
    let filtered =
      activeTab === "all"
        ? allSignals
        : allSignals.filter((s) => s.type === activeTab);

    // Separate high and low impact
    const highImpact = filtered.filter((s) => parseFloat(s.impact) >= 0.5);
    const lowImpact = filtered.filter((s) => parseFloat(s.impact) < 0.5);

    if (!showLowImpact) {
      return {
        visible: highImpact.slice(0, 3),
        hidden: highImpact.slice(3).length + lowImpact.length,
        lowCount: lowImpact.length,
      };
    }
    return {
      visible: filtered.slice(0, 6),
      hidden: filtered.length - Math.min(filtered.length, 6),
      lowCount: 0,
    };
  }, [allSignals, activeTab, showLowImpact]);

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "all", label: "All", count: allSignals.length },
    { key: "trade", label: "Trades", count: tradeCount },
    { key: "waiver", label: "Waivers", count: waiverCount },
  ];

  return (
    <aside className="hidden xl:flex xl:flex-col w-[280px] flex-shrink-0 bg-shell-panel border-l border-shell-border overflow-y-auto">
      {/* Header */}
      <div className="px-3 py-3 border-b border-shell-border flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-shell-accent" />
          <span className="text-xs font-semibold text-shell-text uppercase tracking-wide">
            Signals
          </span>
        </div>
        {allSignals.length > 0 && (
          <span className="text-xs font-mono bg-shell-accent/20 text-shell-accent px-1.5 py-0.5 rounded-full">
            {allSignals.length}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        className="flex border-b border-shell-border flex-shrink-0"
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex-1 px-2 py-2 text-xs font-medium transition-colors",
              activeTab === tab.key
                ? "border-b-2 border-shell-accent text-shell-accent"
                : "text-shell-muted hover:text-shell-text",
            )}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1 text-xs opacity-70">({tab.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1">
        {!teamId ? (
          <div className="px-3 py-6 text-center">
            <p className="text-xs text-shell-muted">
              Select a team to see signals
            </p>
          </div>
        ) : allSignals.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <p className="text-xs text-shell-muted">
              {isLoadingSignals
                ? "Loading signals..."
                : "Nothing urgent \u2014 enjoy the off-day"}
            </p>
          </div>
        ) : filteredSignals.visible.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <p className="text-xs text-shell-muted">
              {activeTab === "all"
                ? "All quiet on the waiver wire"
                : `No ${activeTab} signals right now`}
            </p>
          </div>
        ) : (
          <>
            {filteredSignals.visible.map((item) => (
              <SignalItem key={item.id} item={item} />
            ))}

            {filteredSignals.lowCount > 0 && !showLowImpact && (
              <button
                onClick={() => setShowLowImpact(true)}
                className="w-full px-3 py-2 text-xs text-shell-muted hover:text-shell-text transition-colors text-center"
              >
                Show low impact ({filteredSignals.lowCount})
              </button>
            )}

            {filteredSignals.hidden > 0 && (
              <div className="px-3 py-2 text-center">
                <Link
                  href={`/leagues/${id}/${activeTab === "trade" ? "trades" : activeTab === "waiver" ? "waivers" : "waivers"}`}
                  className="text-xs text-shell-accent hover:underline"
                >
                  View all
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
