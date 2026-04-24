"use client";

import { cn } from "@/lib/cn";

interface FaabGaugeProps {
  spent: number;
  total: number;
  leagueAvg: number;
}

export function FaabGauge({ spent, total, leagueAvg }: FaabGaugeProps) {
  const remaining = total - spent;
  const pct = total > 0 ? (remaining / total) * 100 : 0;

  // Color based on remaining percentage
  const fillColor =
    pct > 50
      ? "bg-positive"
      : pct > 25
        ? "bg-warning"
        : "bg-negative";

  const textColor =
    pct > 50
      ? "text-positive"
      : pct > 25
        ? "text-warning"
        : "text-negative";

  return (
    <div className="space-y-3">
      {/* Progress bar */}
      <div className="w-full">
        <div className="flex justify-between text-xs text-shell-muted mb-1">
          <span>$0</span>
          <span>${total}</span>
        </div>
        <div className="h-3 rounded-full bg-neutral-200 dark:bg-shell-border overflow-hidden">
          <div
            className={cn("h-full w-full transition-transform duration-500 origin-left", fillColor)}
            style={{ transform: `scaleX(${Math.max(0, Math.min(100, pct)) / 100})` }}
            role="progressbar"
            aria-valuenow={remaining}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label="FAAB remaining"
          />
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-6">
        <div className="flex items-baseline gap-1.5">
          <span className="text-xs text-shell-muted uppercase tracking-wide">Remaining</span>
          <span className={cn("font-mono text-sm font-semibold", textColor)}>
            ${remaining}
          </span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-xs text-shell-muted uppercase tracking-wide">Spent</span>
          <span className="font-mono text-sm text-shell-text">${spent}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-xs text-shell-muted uppercase tracking-wide">League Avg</span>
          <span className="font-mono text-sm text-shell-text">${Math.round(leagueAvg)}</span>
        </div>
      </div>
    </div>
  );
}
