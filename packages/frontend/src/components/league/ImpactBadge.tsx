"use client";

interface ImpactBadgeProps {
  impact: number;
  size?: "sm" | "md";
}

export default function ImpactBadge({ impact, size = "md" }: ImpactBadgeProps) {
  const isPositive = impact > 0;
  const isNeutral = impact === 0;
  const textSize = size === "sm" ? "text-xs" : "text-sm";
  const padding = size === "sm" ? "px-1.5 py-0.5" : "px-2 py-1";

  const colorClass = isNeutral
    ? "bg-gray-100 text-gray-600"
    : isPositive
    ? "bg-green-100 text-green-800"
    : "bg-red-100 text-red-800";

  return (
    <span className={`inline-flex items-center rounded-full font-semibold ${textSize} ${padding} ${colorClass}`}>
      {isPositive ? "+" : ""}{impact.toFixed(1)}
    </span>
  );
}
