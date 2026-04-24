"use client";

// Types defined locally — Plan 41-03 may add these to useDraftLiveSocket.ts later
export interface CategoryProgress {
  statKey: string;
  label: string;
  target: number;
  projected: number;
  percent: number;
  direction: "HIGHER_BETTER" | "LOWER_BETTER";
}

interface CategoryProgressBarProps {
  progress: CategoryProgress;
}

export function CategoryProgressBar({ progress }: CategoryProgressBarProps) {
  const { label, target, projected, percent, direction } = progress;
  const cappedPercent = Math.min(100, Math.max(0, percent));

  // For HIGHER_BETTER: green when high percent, red when low
  // For LOWER_BETTER: green when LOW projected (good), red when HIGH projected (bad)
  // For LOWER_BETTER, percent represents projected/target — lower is better
  const isOnTrack =
    direction === "LOWER_BETTER"
      ? percent <= 110 // projected at or below target is good
      : percent >= 90;
  const isWarning =
    direction === "LOWER_BETTER"
      ? percent > 110 && percent <= 140
      : percent >= 60 && percent < 90;

  let barColor = "bg-grafana-negative";
  if (isOnTrack) barColor = "bg-grafana-positive";
  else if (isWarning) barColor = "bg-grafana-warning";

  const arrow = direction === "LOWER_BETTER" ? "\u2193" : "\u2191";

  // Format numbers: use 2 decimals for rate stats, 0 for counting stats
  const isRate = ["AVG", "OBP", "SLG", "OPS", "ERA", "WHIP"].includes(
    label.toUpperCase()
  );
  const fmt = (n: number) => (isRate ? n.toFixed(3) : Math.round(n).toString());

  return (
    <div className="flex items-center gap-2">
      {/* Label + direction */}
      <div className="w-12 flex-shrink-0 text-right">
        <span className="text-xs font-semibold text-grafana-muted">
          {label}
        </span>
        <span className="text-caption text-grafana-muted/70 ml-0.5">{arrow}</span>
      </div>

      {/* Bar track */}
      <div className="flex-1 h-5 bg-grafana-panel rounded overflow-hidden relative">
        <div
          className={`h-full w-full transition-transform duration-500 origin-left ${barColor}`}
          style={{ transform: `scaleX(${cappedPercent / 100})` }}
        />
        {/* Percentage overlay */}
        <span className="absolute inset-0 flex items-center justify-center text-caption font-bold text-white/80">
          {Math.round(percent)}%
        </span>
      </div>

      {/* Projected / Target */}
      <div className="w-20 flex-shrink-0 text-right">
        <span className="text-data text-grafana-muted">
          {fmt(projected)}/{fmt(target)}
        </span>
      </div>
    </div>
  );
}
