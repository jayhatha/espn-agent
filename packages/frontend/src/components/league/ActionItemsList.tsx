"use client";

import Link from "next/link";
import { ExternalLinkIcon, ClockIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export interface ActionItem {
  id: string;
  type: "waiver" | "trade";
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  impact: string; // e.g., "+2.5 pts"
  espnLink?: string;
  internalLink?: string;
}

export interface ActionItemsListProps {
  items: ActionItem[];
  maxItems?: number; // default 5
}

export function ActionItemsList({
  items,
  maxItems = 5,
}: ActionItemsListProps) {
  const displayItems = items.slice(0, maxItems);
  const remainingCount = Math.max(0, items.length - maxItems);

  const getImpactClasses = (impact: string) => {
    if (impact.startsWith("+")) {
      return "text-positive";
    } else if (impact.startsWith("-")) {
      return "text-negative";
    }
    return "text-content-secondary";
  };

  const getTypeBadgeVariant = (
    type: "waiver" | "trade"
  ): "info" | "default" => {
    return type === "waiver" ? "info" : "default";
  };

  if (items.length === 0) {
    return (
      <div className="py-12 text-center">
        <ClockIcon className="w-10 h-10 text-content-tertiary mx-auto mb-3" />
        <p className="text-body font-medium text-content-secondary mb-1">No Recommended Actions</p>
        <p className="text-body-sm text-content-tertiary">Your team is performing well!</p>
      </div>
    );
  }

  return (
    <div>
      <div className="divide-y divide-neutral-200">
        {displayItems.map((item) => (
          <div
            key={item.id}
            className="py-5 flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6"
          >
            {/* Impact number: oversized, left-aligned on mobile, right-aligned on desktop */}
            <div className="sm:w-24 sm:text-right flex-shrink-0 pt-1">
              <span className={cn("text-h2 font-display leading-none", getImpactClasses(item.impact))}>
                {item.impact}
              </span>
            </div>

            {/* Content: badge + priority + title + description */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant={getTypeBadgeVariant(item.type)} className="uppercase tracking-wide">
                  {item.type}
                </Badge>
                <span className="text-caption uppercase tracking-wide text-content-tertiary">
                  {item.priority} priority
                </span>
              </div>
              <p className="text-body font-semibold text-content mb-0.5">{item.title}</p>
              <p className="text-body-sm text-content-secondary">{item.description}</p>
            </div>

            {/* CTAs: stacked vertically on right */}
            <div className="flex flex-col gap-2 flex-shrink-0">
              {item.internalLink && (
                <Link href={item.internalLink}>
                  <Button variant="secondary" size="sm">Analyze</Button>
                </Link>
              )}
              {item.espnLink && (
                <a href={item.espnLink} target="_blank" rel="noopener noreferrer">
                  <Button size="sm">
                    ESPN
                    <ExternalLinkIcon className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {remainingCount > 0 && (
        <div className="text-center py-2">
          <p className="text-body-sm text-content-tertiary">
            and {remainingCount} more recommendation{remainingCount > 1 ? "s" : ""}...
          </p>
        </div>
      )}
    </div>
  );
}
