"use client";

import Link from "next/link";
import { ExternalLinkIcon, ClockIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";

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

  const getPriorityClasses = (priority: "high" | "medium" | "low") => {
    switch (priority) {
      case "high":
        return "border-l-4 border-l-negative bg-negative-light";
      case "medium":
        return "border-l-4 border-l-warning bg-warning-light";
      case "low":
        return "border-l-4 border-l-positive bg-positive-light";
    }
  };

  const getImpactClasses = (impact: string) => {
    if (impact.startsWith("+")) {
      return "text-positive font-semibold";
    } else if (impact.startsWith("-")) {
      return "text-negative font-semibold";
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
      <div className="border border-neutral-200 rounded-card p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center">
          <ClockIcon className="w-12 h-12 text-warning" />
        </div>
        <h3 className="text-body-lg font-semibold text-content mb-2">
          No Recommended Actions
        </h3>
        <p className="text-body-sm text-content-secondary">
          No recommended actions at this time. Your team is performing well!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {displayItems.map((item) => (
        <div
          key={item.id}
          className={cn(
            getPriorityClasses(item.priority),
            "rounded-lg p-4 border border-neutral-200 transition-shadow hover:shadow-card-hover"
          )}
        >
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            {/* Left side: Type badge, title, description, and impact */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant={getTypeBadgeVariant(item.type)} className="uppercase tracking-wide">
                  {item.type}
                </Badge>
                <span className={cn("text-body-sm", getImpactClasses(item.impact))}>
                  {item.impact}
                </span>
              </div>
              <h4 className="text-body font-bold text-content mb-1">
                {item.title}
              </h4>
              <p className="text-body-sm text-content-secondary">{item.description}</p>
            </div>

            {/* Right side: Action buttons */}
            <div className="flex flex-row sm:flex-col gap-2 sm:items-end">
              {item.internalLink && (
                <Link
                  href={item.internalLink}
                  className="px-4 py-2 border border-neutral-300 bg-white text-content rounded-lg hover:bg-surface-secondary font-medium text-body-sm transition-colors text-center whitespace-nowrap"
                >
                  Analyze
                </Link>
              )}
              {item.espnLink && (
                <a
                  href={item.espnLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-accent text-content-inverse rounded-lg hover:bg-accent-hover font-medium text-body-sm flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                >
                  ESPN
                  <ExternalLinkIcon className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>
        </div>
      ))}

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
