"use client";

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
    hover: "hover:bg-gray-50",
    selectedBg: "bg-blue-100 border-l-4 border-blue-600",
  },
  add: {
    hover: "hover:bg-green-50",
    selectedBg: "bg-green-100 border-l-4 border-green-600",
  },
  drop: {
    hover: "hover:bg-red-50",
    selectedBg: "bg-red-100 border-l-4 border-red-600",
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
      className={`flex items-center ${py} px-3 transition-colors ${
        selected ? styles.selectedBg : styles.hover
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-gray-900 truncate">
            {player.name}
          </div>
          {player.rosterSlot && (
            <span className="text-xs font-medium text-gray-400 ml-2">
              {player.rosterSlot}
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500">
          {player.position}
          {player.team && ` \u2022 ${player.team}`}
        </div>
      </div>
      {actions && <div className="ml-3 flex-shrink-0">{actions}</div>}
    </div>
  );
}
