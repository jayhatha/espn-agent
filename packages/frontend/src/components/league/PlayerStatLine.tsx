"use client";

import {
  calculateAVG,
  calculateOBP,
  calculateERA,
  calculateWHIP,
} from "@espn-fantasy/shared";

interface PlayerStatLineProps {
  components: Record<string, number> | null;
  label: "YTD" | "Proj RoS";
  positions: string[];
}

function isPitcher(positions: string[]): boolean {
  return positions.some((p) => ["SP", "RP", "P"].includes(p));
}

function formatStat(value: number | null | undefined, decimals = 0): string {
  if (value == null || isNaN(value)) return "--";
  return decimals === 0 ? String(Math.round(value)) : value.toFixed(decimals);
}

function formatRate(
  value: number | null | undefined,
  decimals: number,
  denominatorKey: string,
  components: Record<string, number>,
): string {
  // If denominator is 0, display "--" not "0.00" or ".000"
  const denom = components[denominatorKey] ?? 0;
  if (denom === 0) return "--";
  if (value == null || isNaN(value)) return "--";
  return value.toFixed(decimals);
}

export function PlayerStatLine({
  components,
  label,
  positions,
}: PlayerStatLineProps) {
  if (!components) return null;

  const pitcher = isPitcher(positions);
  const labelColorClass =
    label === "Proj RoS" ? "text-shell-accent" : "text-content-tertiary";

  if (pitcher) {
    const { W = 0, SV = 0, K = 0 } = components;
    const ip = components.IP ?? 0;
    const era = ip > 0 ? calculateERA(components) : null;
    const whip = ip > 0 ? calculateWHIP(components) : null;

    return (
      <div className="text-data font-mono dark:text-shell-muted text-content-secondary mt-1 truncate">
        <span className={`text-caption font-sans mr-1 ${labelColorClass}`}>
          {label}
        </span>
        W: {formatStat(W)} SV: {formatStat(SV)} K: {formatStat(K)}{" "}
        ERA: {formatRate(era, 2, "IP", components)}{" "}
        WHIP: {formatRate(whip, 3, "IP", components)}
      </div>
    );
  }

  // Hitter stats
  const { HR = 0, R = 0, RBI = 0, SB = 0 } = components;
  const ab = components.AB ?? 0;
  const avg = ab > 0 ? calculateAVG(components) : null;
  const obp = ab > 0 ? calculateOBP(components) : null;

  return (
    <div className="text-data font-mono dark:text-shell-muted text-content-secondary mt-1 truncate">
      <span className={`text-caption font-sans mr-1 ${labelColorClass}`}>
        {label}
      </span>
      HR: {formatStat(HR)} R: {formatStat(R)} RBI: {formatStat(RBI)} SB:{" "}
      {formatStat(SB)} AVG: {formatRate(avg, 3, "AB", components)} OBP:{" "}
      {formatRate(obp, 3, "AB", components)}
    </div>
  );
}
