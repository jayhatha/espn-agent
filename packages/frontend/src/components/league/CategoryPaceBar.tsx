"use client";

import { formatStatValue } from "@/components/league/CategoryStatsTable";
import { cn } from "@/lib/cn";

interface CategoryPaceBarProps {
  current: number;
  projected: number;
  statKey: string;
  type: "COUNTING" | "RATE";
  className?: string;
}

export function CategoryPaceBar({
  current,
  projected,
  statKey,
  type,
  className,
}: CategoryPaceBarProps) {
  if (type === "RATE") {
    // Rate stats aren't cumulative - show current vs projected side by side
    const improving =
      statKey === "era" || statKey === "whip"
        ? current <= projected // lower is better
        : current >= projected; // higher is better

    return (
      <div className={cn("flex items-center gap-1 text-data", className)}>
        <span className={improving ? "text-positive" : "text-warning"}>
          {formatStatValue(current, "RATE", statKey)}
        </span>
        <span className="text-content-tertiary dark:text-shell-muted">{"\u2192"}</span>
        <span className="text-content-secondary dark:text-shell-muted">
          {formatStatValue(projected, "RATE", statKey)}
        </span>
      </div>
    );
  }

  // Counting stats: progress bar
  const progress = projected > 0 ? (current / projected) * 100 : 0;
  const clampedProgress = Math.min(progress, 100);

  return (
    <div className={cn("flex items-center gap-1.5 mt-0.5", className)}>
      <div className="flex-1 bg-neutral-200 dark:bg-shell-border rounded-full h-1.5 min-w-[40px] max-w-[60px] overflow-hidden">
        <div
          className={cn(
            "h-1.5 w-full transition-transform duration-500 origin-left",
            progress >= 45 ? "bg-positive" : "bg-warning",
          )}
          style={{ transform: `scaleX(${clampedProgress / 100})` }}
        />
      </div>
      <span className="text-data text-content-tertiary dark:text-shell-muted whitespace-nowrap">
        {Math.round(current)}/{Math.round(projected)}
      </span>
    </div>
  );
}
