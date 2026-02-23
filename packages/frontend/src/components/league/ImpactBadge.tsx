"use client";

interface ImpactBadgeProps {
  impact: number;
  size?: "sm" | "md";
  isUncertain?: boolean;
  ciLow?: number | null;
  ciHigh?: number | null;
}

export default function ImpactBadge({ impact, size = "md", isUncertain = false, ciLow, ciHigh }: ImpactBadgeProps) {
  const isPositive = impact > 0;
  const isNeutral = impact === 0;
  const textSize = size === "sm" ? "text-xs" : "text-sm";
  const padding = size === "sm" ? "px-1.5 py-0.5" : "px-2 py-1";

  // Uncertain moves show muted dashed border
  if (isUncertain) {
    const title = ciLow != null && ciHigh != null
      ? `95% CI: [${ciLow.toFixed(1)}, ${ciHigh.toFixed(1)}]`
      : "Uncertain estimate";

    return (
      <span
        className={`inline-flex items-center rounded-full font-semibold border border-dashed border-gray-400 text-gray-500 bg-gray-50 ${textSize} ${padding}`}
        title={title}
      >
        ~{impact.toFixed(1)}
      </span>
    );
  }

  // Normal styling with optional CI tooltip
  const colorClass = isNeutral
    ? "bg-gray-100 text-gray-600"
    : isPositive
    ? "bg-green-100 text-green-800"
    : "bg-red-100 text-red-800";

  const title = ciLow != null && ciHigh != null
    ? `95% CI: [${ciLow.toFixed(1)}, ${ciHigh.toFixed(1)}]`
    : undefined;

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold ${textSize} ${padding} ${colorClass}`}
      title={title}
    >
      {isPositive ? "+" : ""}{impact.toFixed(1)}
    </span>
  );
}
