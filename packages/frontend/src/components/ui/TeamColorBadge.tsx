"use client";

import { COLORS } from "@/lib/constants";

interface TeamColorBadgeProps {
  teamIndex: number;
  teamName: string;
  className?: string;
}

export function TeamColorBadge({ teamIndex, teamName, className = "" }: TeamColorBadgeProps) {
  const color = COLORS[teamIndex % COLORS.length];
  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${className}`}
      style={{ backgroundColor: color + "20", color }}
    >
      {teamName}
    </span>
  );
}
