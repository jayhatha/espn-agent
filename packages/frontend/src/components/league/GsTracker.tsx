"use client";

import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";

interface GsTrackerProps {
  gsUsed: number;
  gsCap: number;
  projectedFinal: number;
  paceStatus: "on_track" | "burning_fast" | "too_slow";
  pacePerWeek?: number;
}

export function GsTracker({
  gsUsed,
  gsCap,
  projectedFinal,
  paceStatus,
  pacePerWeek,
}: GsTrackerProps) {
  const pctUsed = gsCap > 0 ? (gsUsed / gsCap) * 100 : 0;
  const pctProjected = gsCap > 0 ? (projectedFinal / gsCap) * 100 : 0;

  const fillColor =
    paceStatus === "on_track"
      ? "bg-emerald-500"
      : paceStatus === "too_slow"
        ? "bg-amber-500"
        : "bg-red-500";

  const statusLabel =
    paceStatus === "on_track"
      ? "On Track"
      : paceStatus === "too_slow"
        ? "Slow"
        : "Burning Fast";

  const statusVariant =
    paceStatus === "on_track"
      ? "success"
      : paceStatus === "too_slow"
        ? "warning"
        : "danger";

  return (
    <div className="space-y-3">
      {/* Progress bar with projected marker */}
      <div className="w-full">
        <div className="flex justify-between text-xs text-shell-muted mb-1">
          <span>0</span>
          <span>{gsCap} GS cap</span>
        </div>
        <div className="relative h-3 rounded-full dark:bg-shell-border bg-gray-200 overflow-hidden">
          {/* Actual usage fill */}
          <div
            className={cn("h-full rounded-full transition-all", fillColor)}
            style={{ width: `${Math.max(0, Math.min(100, pctUsed))}%` }}
          />
          {/* Projected pace marker */}
          {projectedFinal > 0 && (
            <div
              className="absolute top-0 h-full w-0.5 bg-shell-text opacity-60"
              style={{
                left: `${Math.max(0, Math.min(100, pctProjected))}%`,
              }}
              title={`Projected: ${projectedFinal} GS`}
            />
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4">
        <div className="flex items-baseline gap-1.5">
          <span className="text-xs text-shell-muted uppercase tracking-wide">Used</span>
          <span className="font-mono text-sm text-shell-text">
            {gsUsed}/{gsCap}
          </span>
        </div>
        {pacePerWeek !== undefined && (
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs text-shell-muted uppercase tracking-wide">Pace</span>
            <span className="font-mono text-sm text-shell-text">
              {pacePerWeek}/wk
            </span>
          </div>
        )}
        <div className="flex items-baseline gap-1.5">
          <span className="text-xs text-shell-muted uppercase tracking-wide">Projected</span>
          <span className="font-mono text-sm text-shell-text">
            {projectedFinal} GS
          </span>
        </div>
        <Badge variant={statusVariant as any}>{statusLabel}</Badge>
      </div>
    </div>
  );
}
