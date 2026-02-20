"use client";

interface ScarcityBadgeProps {
  level: "surplus" | "neutral" | "deficit";
  className?: string;
}

const badgeConfig = {
  surplus: {
    label: "Strength",
    bgColor: "bg-green-100",
    textColor: "text-green-800",
    borderColor: "border-green-300",
    icon: (
      <svg
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 13l4 4L19 7"
        />
      </svg>
    ),
  },
  neutral: {
    label: "Average",
    bgColor: "bg-gray-100",
    textColor: "text-gray-800",
    borderColor: "border-gray-300",
    icon: null,
  },
  deficit: {
    label: "Weakness",
    bgColor: "bg-red-100",
    textColor: "text-red-800",
    borderColor: "border-red-300",
    icon: (
      <svg
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 14l-7 7m0 0l-7-7m7 7V3"
        />
      </svg>
    ),
  },
};

export function ScarcityBadge({ level, className = "" }: ScarcityBadgeProps) {
  const config = badgeConfig[level];

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded border ${config.borderColor} ${config.bgColor} ${config.textColor} text-xs font-medium ${className}`}
    >
      {config.icon}
      <span>{config.label}</span>
    </span>
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
