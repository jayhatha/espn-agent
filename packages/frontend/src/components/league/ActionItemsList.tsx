"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLinkIcon, ClockIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react";
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

interface TierGroup {
  label: string;
  items: ActionItem[];
  borderColor: string;
}

function impactValue(impact: string): number {
  return parseFloat(impact) || 0;
}

function tierize(items: ActionItem[]): TierGroup[] {
  const high: ActionItem[] = [];
  const medium: ActionItem[] = [];
  const speculative: ActionItem[] = [];

  for (const item of items) {
    const val = impactValue(item.impact);
    if (val >= 2) high.push(item);
    else if (val >= 1) medium.push(item);
    else speculative.push(item);
  }

  const tiers: TierGroup[] = [];
  if (high.length > 0) tiers.push({ label: "High Impact", items: high, borderColor: "border-l-orange-500" });
  if (medium.length > 0) tiers.push({ label: "Medium", items: medium, borderColor: "border-l-yellow-500" });
  if (speculative.length > 0) tiers.push({ label: "Speculative", items: speculative, borderColor: "border-l-neutral-300 dark:border-l-shell-border" });
  return tiers;
}

function ActionItemRow({ item, borderColor }: { item: ActionItem; borderColor: string }) {
  const [expanded, setExpanded] = useState(false);

  const getImpactClasses = (impact: string) => {
    if (impact.startsWith("+")) return "text-positive";
    if (impact.startsWith("-")) return "text-negative";
    return "text-content-secondary";
  };

  const getTypeBadgeVariant = (type: "waiver" | "trade"): "info" | "default" => {
    return type === "waiver" ? "info" : "default";
  };

  return (
    <div
      className={cn(
        "py-4 flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-6 border-l-4 pl-4 cursor-pointer",
        borderColor
      )}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Impact number */}
      <div className="sm:w-20 sm:text-right flex-shrink-0 pt-1">
        <span className={cn("text-h3 font-mono leading-none", getImpactClasses(item.impact))}>
          {item.impact}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant={getTypeBadgeVariant(item.type)} className="uppercase tracking-wide">
            {item.type}
          </Badge>
          <span className="text-caption uppercase tracking-wide text-content-tertiary">
            {item.priority} priority
          </span>
        </div>
        <p className="text-body font-semibold text-content dark:text-shell-text mb-0.5">{item.title}</p>
        {expanded && (
          <p className="text-body-sm text-content-secondary mt-1">{item.description}</p>
        )}
        {!expanded && (
          <p className="text-body-sm text-content-secondary truncate">{item.description}</p>
        )}
      </div>

      {/* CTAs */}
      <div className="flex flex-col gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
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
  );
}

function TierSection({ tier }: { tier: TierGroup }) {
  const [collapsed, setCollapsed] = useState(false);
  const aboveFold = tier.items.slice(0, 3);
  const belowFold = tier.items.slice(3);
  const [showMore, setShowMore] = useState(false);

  const visibleItems = collapsed ? [] : showMore ? tier.items : aboveFold;

  return (
    <div className="mb-4">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 mb-2 w-full text-left"
      >
        {collapsed ? (
          <ChevronRightIcon className="h-4 w-4 text-content-tertiary" />
        ) : (
          <ChevronDownIcon className="h-4 w-4 text-content-tertiary" />
        )}
        <span className="text-body-sm font-semibold text-content dark:text-shell-text uppercase tracking-wide">
          {tier.label}
        </span>
        <span className="text-caption text-content-tertiary font-mono">({tier.items.length})</span>
      </button>

      {!collapsed && (
        <div className="divide-y divide-neutral-200 dark:divide-shell-border">
          {visibleItems.map((item) => (
            <ActionItemRow key={item.id} item={item} borderColor={tier.borderColor} />
          ))}
        </div>
      )}

      {!collapsed && !showMore && belowFold.length > 0 && (
        <button
          onClick={() => setShowMore(true)}
          className="mt-2 text-body-sm text-content-secondary hover:text-content transition-colors"
        >
          Show {belowFold.length} more...
        </button>
      )}
    </div>
  );
}

export function ActionItemsList({ items }: ActionItemsListProps) {
  if (items.length === 0) {
    return (
      <div className="py-12 text-center">
        <ClockIcon className="w-10 h-10 text-content-tertiary mx-auto mb-3" />
        <p className="text-body font-medium text-content-secondary dark:text-shell-muted mb-1">No Recommended Actions</p>
        <p className="text-body-sm text-content-tertiary">Your team is performing well!</p>
      </div>
    );
  }

  const tiers = tierize(items);

  return (
    <div>
      {tiers.map((tier) => (
        <TierSection key={tier.label} tier={tier} />
      ))}
    </div>
  );
}
