"use client";

import { useState } from "react";
import { CHART_THEME } from "@/lib/chart-theme";

interface PlayerDetail {
  id: number;
  name: string;
}

interface CategoryChange {
  categoryId: string;
  deltaPts: number;
  rankBefore: number;
  rankAfter: number;
}

interface Transaction {
  id: number;
  eventType: string;
  eventDate: string;
  playersAdded: PlayerDetail[];
  playersDropped: PlayerDetail[];
}

export interface InflectionPoint {
  date: string;
  previousDate: string;
  pointsDelta?: number;
  rankBefore: number;
  rankAfter: number;
  rankDelta?: number; // category-specific mode: positive = improved
  categoryId?: string; // set when category-specific
  ptsBefore?: number;
  ptsAfter?: number;
  categoryChanges?: CategoryChange[];
  transactions: Transaction[];
}

interface InflectionPointMarkerProps {
  viewBox?: { x: number; y: number; width?: number; height?: number };
  point: InflectionPoint;
}

export function InflectionPointMarker({ viewBox, point }: InflectionPointMarkerProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!viewBox) return null;

  const { x } = viewBox;
  const topY = 10; // render near top of chart

  const isCategoryMode = point.categoryId != null;
  const isPositive = isCategoryMode ? (point.rankDelta ?? 0) > 0 : (point.pointsDelta ?? 0) > 0;
  const color = isPositive ? CHART_THEME.colors[3] : CHART_THEME.colors[4]; // positive/negative from theme

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const month = date.toLocaleDateString(undefined, { month: "short" });
    const day = date.getDate();
    return `${month} ${day}`;
  };

  const rankSuffix = (rank: number) => {
    if (rank === 1) return "st";
    if (rank === 2) return "nd";
    if (rank === 3) return "rd";
    return "th";
  };

  const baseHeight = 100;
  const categoryHeight = (point.categoryChanges?.length ?? 0) * 20;
  const transactionHeight = point.transactions.length * 20;
  const tooltipHeight = Math.min(baseHeight + categoryHeight + transactionHeight, 300);

  return (
    <g>
      {/* Diamond marker at top of chart */}
      <g
        transform={`translate(${x}, ${topY})`}
        style={{ cursor: "pointer" }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <rect
          x={-7}
          y={-7}
          width={14}
          height={14}
          fill={color}
          stroke="#fff"
          strokeWidth={1}
          transform="rotate(45)"
        />
        <text
          x={0}
          y={1}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#fff"
          fontSize={8}
          fontWeight="bold"
          pointerEvents="none"
        >
          {isPositive ? "+" : "-"}
        </text>
      </g>

      {/* Tooltip */}
      {showTooltip && (
        <foreignObject
          x={x - 130}
          y={topY + 18}
          width={260}
          height={tooltipHeight}
        >
          <div
            className="rounded-lg p-3 text-xs"
            style={{
              backgroundColor: CHART_THEME.tooltip.backgroundColor,
              border: `1px solid ${CHART_THEME.tooltip.borderColor}`,
              borderRadius: CHART_THEME.tooltip.borderRadius,
            }}
          >
            <div className="font-bold mb-2 text-content dark:text-shell-text">
              {formatDate(point.date)}: Rank {point.rankBefore}{rankSuffix(point.rankBefore)} → {point.rankAfter}{rankSuffix(point.rankAfter)}
              {isCategoryMode && ` (${point.categoryId})`}
              {!isCategoryMode && point.pointsDelta != null && ` · ${point.pointsDelta > 0 ? "+" : ""}${point.pointsDelta} pts`}
            </div>

            {point.categoryChanges && point.categoryChanges.length > 0 && (
              <div className="mb-2">
                <div className="font-semibold text-content-secondary mb-1">Category Changes:</div>
                {point.categoryChanges.map((cat, idx) => {
                  const catColorClass = cat.deltaPts > 0 ? "text-positive" : "text-negative";
                  const catLabel = cat.deltaPts > 0 ? `+${cat.deltaPts}` : String(cat.deltaPts);
                  return (
                    <div key={idx} className={catColorClass}>
                      {cat.categoryId}: {catLabel} pts ({cat.rankBefore}{rankSuffix(cat.rankBefore)} → {cat.rankAfter}{rankSuffix(cat.rankAfter)})
                    </div>
                  );
                })}
              </div>
            )}

            {point.transactions.length > 0 ? (
              <div>
                <div className="font-semibold text-content-secondary mb-1">Roster Moves:</div>
                {point.transactions.map((tx, idx) => (
                  <div key={idx} className="mb-1">
                    {tx.playersAdded.length > 0 && (
                      <div className="text-positive">
                        + {tx.playersAdded.map((p) => p.name).join(", ")}
                      </div>
                    )}
                    {tx.playersDropped.length > 0 && (
                      <div className="text-negative">
                        - {tx.playersDropped.map((p) => p.name).join(", ")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-content-tertiary italic">No roster moves in this period</div>
            )}
          </div>
        </foreignObject>
      )}
    </g>
  );
}
