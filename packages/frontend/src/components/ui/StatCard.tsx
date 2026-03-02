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
  up: "text-positive",
  down: "text-negative",
  neutral: "text-content-secondary",
};

const trendIcons = {
  up: <TrendingUp className="h-4 w-4 text-positive" />,
  down: <TrendingDown className="h-4 w-4 text-negative" />,
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
        className
      )}
    >
      <div className="flex items-center">
        {icon && <div className="flex-shrink-0">{icon}</div>}
        <div className={icon ? "ml-4" : ""}>
          <p className="text-body-sm font-medium text-content-secondary">
            {label}
          </p>
          <div className="flex items-center mt-1">
            <p
              className={cn(
                "text-h3 font-semibold",
                trend ? trendColors[trend] : "text-content"
              )}
            >
              {value}
            </p>
            {trend && trendIcons[trend] && (
              <span className="ml-2">{trendIcons[trend]}</span>
            )}
          </div>
          {subtitle && (
            <p className="text-caption text-content-secondary mt-1">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
