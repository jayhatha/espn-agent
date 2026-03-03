"use client";

import { Check, ArrowDown, Minus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

interface ScarcityBadgeProps {
  level: "surplus" | "neutral" | "deficit";
  className?: string;
}

export function ScarcityBadge({ level, className = "" }: ScarcityBadgeProps) {
  if (level === "surplus") {
    return (
      <Badge variant="positive" className={cn("gap-1", className)}>
        <Check className="h-3 w-3" />
        <span>Strength</span>
      </Badge>
    );
  }

  if (level === "deficit") {
    return (
      <Badge variant="negative" className={cn("gap-1", className)}>
        <ArrowDown className="h-3 w-3" />
        <span>Weakness</span>
      </Badge>
    );
  }

  return (
    <Badge variant="default" className={cn("gap-1", className)}>
      <Minus className="h-3 w-3" />
      <span>Average</span>
    </Badge>
  );
}

/**
 * Helper function to determine scarcity level based on rank percentile
 * @param rank - Current rank (1 = best)
 * @param totalTeams - Total number of teams
 * @returns Scarcity level: surplus (top third), neutral (middle), or deficit (bottom third)
 */
export function getScarcityLevel(
  rank: number,
  totalTeams: number,
): "surplus" | "neutral" | "deficit" {
  const ratio = rank / totalTeams;
  if (ratio <= 1 / 3) return "surplus";
  if (ratio <= 2 / 3) return "neutral";
  return "deficit";
}
