"use client";

import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/cn";

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: "up" | "down" | "neutral";
  subtitle?: string;
  icon?: React.ReactNode;
  className?: string;
}

const trendColors = {
  up: "text-positive dark:text-positive-dark",
  down: "text-negative dark:text-negative-dark",
  neutral: "text-content-secondary dark:text-shell-muted",
};

const trendIcons = {
  up: <TrendingUp className="h-4 w-4 text-positive dark:text-positive-dark" />,
  down: <TrendingDown className="h-4 w-4 text-negative dark:text-negative-dark" />,
  neutral: null,
};

export function StatCard({
  label,
  value,
  trend,
  subtitle,
  icon,
  className = "",
}: StatCardProps) {
  return (
    <div
      className={cn(
        "bg-white rounded-card border border-neutral-200 shadow-card p-6",
        "dark:bg-shell-panel dark:border-shell-border dark:shadow-none",
        className
      )}
    >
      <div className="flex items-center">
        {icon && <div className="flex-shrink-0">{icon}</div>}
        <div className={icon ? "ml-4" : ""}>
          <p className="text-body-sm font-medium text-content-secondary dark:text-shell-muted">
            {label}
          </p>
          <div className="flex items-center mt-1">
            <p
              className={cn(
                "text-h3 font-semibold font-mono",
                trend ? trendColors[trend] : "text-content dark:text-shell-text"
              )}
            >
              {value}
            </p>
            {trend && trendIcons[trend] && (
              <span className="ml-2">{trendIcons[trend]}</span>
            )}
          </div>
          {subtitle && (
            <p className="text-caption text-content-secondary dark:text-shell-muted mt-1">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
