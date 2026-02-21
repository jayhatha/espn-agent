"use client";

import { useState } from "react";

interface PlayerDetail {
  id: number;
  name: string;
}

interface AnnotationData {
  id: number;
  event_date: string;
  event_type: string;
  team_name?: string;
  players_added_details: PlayerDetail[];
  players_dropped_details: PlayerDetail[];
}

interface TransactionMarkerProps {
  viewBox?: { x: number; y: number; width?: number; height?: number };
  annotation: AnnotationData;
}

export function TransactionMarker({ viewBox, annotation }: TransactionMarkerProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!viewBox) return null;

  // Determine color by event type
  const getColor = (eventType: string): string => {
    if (eventType === "trade") return "#8b5cf6"; // purple
    if (eventType === "add" || eventType === "waiver") return "#10b981"; // green
    if (eventType === "drop") return "#ef4444"; // red
    return "#6b7280"; // gray
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
          <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-2 text-xs pointer-events-none">
            <div className="font-bold uppercase mb-1">{annotation.event_type}</div>
            <div className="text-gray-600 mb-1">{formatDate(annotation.event_date)}</div>
            {annotation.team_name && (
              <div className="text-gray-700 mb-1">{annotation.team_name}</div>
            )}
            {annotation.players_added_details.length > 0 && (
              <div className="text-green-700">
                <span className="font-semibold">Added:</span>{" "}
                {annotation.players_added_details.map((p) => p.name).join(", ")}
              </div>
            )}
            {annotation.players_dropped_details.length > 0 && (
              <div className="text-red-700">
                <span className="font-semibold">Dropped:</span>{" "}
                {annotation.players_dropped_details.map((p) => p.name).join(", ")}
              </div>
            )}
          </div>
        </foreignObject>
      )}
    </g>
  );
}
