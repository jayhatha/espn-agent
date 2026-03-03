"use client";

import { cn } from "@/lib/cn";
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
      className={cn(
        "inline-flex items-center px-2 py-1 rounded-md text-xs font-medium",
        className
      )}
      style={{ backgroundColor: color + "20", color }}
    >
      {teamName}
    </span>
  );
}
