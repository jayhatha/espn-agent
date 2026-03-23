"use client";

import { cn } from "@/lib/cn";

interface PlayerRowProps {
  player: {
    id: number;
    name: string;
    position: string;
    team?: string | null;
    stats?: Record<string, number>;
    rosterSlot?: string | null;
    rosterStatus?: string;
  };
  actions?: React.ReactNode;
  compact?: boolean;
  variant?: "default" | "add" | "drop";
  selected?: boolean;
}

const variantStyles = {
  default: {
    hover: "hover:bg-surface-secondary",
    selectedBg: "bg-accent-light border-l-4 border-accent",
  },
  add: {
    hover: "hover:bg-positive-light",
    selectedBg: "bg-positive-light border-l-4 border-positive",
  },
  drop: {
    hover: "hover:bg-negative-light",
    selectedBg: "bg-negative-light border-l-4 border-negative",
  },
};

export function PlayerRow({
  player,
  actions,
  compact = false,
  variant = "default",
  selected = false,
}: PlayerRowProps) {
  const styles = variantStyles[variant];
  const py = compact ? "py-2" : "py-3";

  return (
    <div
      className={cn(
        "flex items-center px-3 transition-colors",
        py,
        selected ? styles.selectedBg : styles.hover,
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <div className="text-body-sm font-medium text-content dark:text-shell-text truncate">
            {player.name}
          </div>
          {player.rosterSlot && (
            <span className="text-data text-content-tertiary ml-2">
              {player.rosterSlot}
            </span>
          )}
        </div>
        <div className="text-data text-content-secondary">
          {player.position}
          {player.team && ` \u2022 ${player.team}`}
        </div>
      </div>
      {actions && <div className="ml-3 flex-shrink-0">{actions}</div>}
    </div>
  );
}
