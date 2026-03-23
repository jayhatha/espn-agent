"use client";

import { useState } from "react";
import { CHART_THEME } from "@/lib/chart-theme";

interface PlayerDetail {
  id: number;
  name: string;
}

interface AnnotationData {
  id: number;
  event_date: string;
  event_type: string;
  team_name?: string;
  players_added_details?: PlayerDetail[];
  players_dropped_details?: PlayerDetail[];
}

interface TransactionMarkerProps {
  viewBox?: { x: number; y: number; width?: number; height?: number };
  annotation: AnnotationData;
}

export function TransactionMarker({ viewBox, annotation }: TransactionMarkerProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!viewBox) return null;

  // Determine color by event type using design tokens
  const getColor = (eventType: string): string => {
    if (eventType === "trade") return CHART_THEME.colors[5]; // info blue
    if (eventType === "add" || eventType === "waiver") return CHART_THEME.colors[3]; // positive green
    if (eventType === "drop") return CHART_THEME.colors[4]; // negative red
    return CHART_THEME.colors[1]; // neutral gray
  };

  // Determine label character by event type
  const getLabel = (eventType: string): string => {
    if (eventType === "trade") return "T";
    if (eventType === "add" || eventType === "waiver") return "+";
    if (eventType === "drop") return "-";
    return "?";
  };

  const color = getColor(annotation.event_type);
  const label = getLabel(annotation.event_type);

  // Format date as "MMM d"
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const month = date.toLocaleDateString(undefined, { month: "short" });
    const day = date.getDate();
    return `${month} ${day}`;
  };

  return (
    <g>
      {/* Circle marker */}
      <circle
        cx={viewBox.x}
        cy={20}
        r={8}
        fill={color}
        style={{ cursor: "pointer" }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      />

      {/* Text label inside circle */}
      <text
        x={viewBox.x}
        y={20}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#fff"
        fontSize={9}
        fontWeight="bold"
        pointerEvents="none"
      >
        {label}
      </text>

      {/* Tooltip */}
      {showTooltip && (
        <foreignObject
          x={viewBox.x - 80}
          y={35}
          width={160}
          height={90}
        >
          <div
            className="rounded-lg p-2 text-xs pointer-events-none"
            style={{
              backgroundColor: CHART_THEME.tooltip.backgroundColor,
              border: `1px solid ${CHART_THEME.tooltip.borderColor}`,
              borderRadius: CHART_THEME.tooltip.borderRadius,
            }}
          >
            <div className="font-bold uppercase mb-1 text-content dark:text-shell-text">{annotation.event_type}</div>
            <div className="text-content-secondary mb-1">{formatDate(annotation.event_date)}</div>
            {annotation.team_name && (
              <div className="text-content dark:text-shell-text mb-1">{annotation.team_name}</div>
            )}
            {(annotation.players_added_details?.length ?? 0) > 0 && (
              <div className="text-positive">
                <span className="font-semibold">Added:</span>{" "}
                {annotation.players_added_details!.map((p) => p.name).join(", ")}
              </div>
            )}
            {(annotation.players_dropped_details?.length ?? 0) > 0 && (
              <div className="text-negative">
                <span className="font-semibold">Dropped:</span>{" "}
                {annotation.players_dropped_details!.map((p) => p.name).join(", ")}
              </div>
            )}
          </div>
        </foreignObject>
      )}
    </g>
  );
}
