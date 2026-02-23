"use client";

import { useState } from "react";

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
  pointsDelta: number;
  rankBefore: number;
  rankAfter: number;
  categoryChanges: CategoryChange[];
  transactions: Transaction[];
}

interface InflectionPointMarkerProps {
  cx?: number;
  cy?: number;
  point: InflectionPoint;
}

export function InflectionPointMarker({ cx, cy, point }: InflectionPointMarkerProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (cx === undefined || cy === undefined) return null;

  const isPositive = point.pointsDelta > 0;
  const color = isPositive ? "#10b981" : "#ef4444"; // green for positive, red for negative
  const label = isPositive ? `+${point.pointsDelta}` : String(point.pointsDelta);

  // Format date as "MMM d"
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const month = date.toLocaleDateString(undefined, { month: "short" });
    const day = date.getDate();
    return `${month} ${day}`;
  };

  // Estimate tooltip height
  const baseHeight = 120;
  const categoryHeight = point.categoryChanges.length * 20;
  const transactionHeight = point.transactions.length * 20;
  const tooltipHeight = Math.min(baseHeight + categoryHeight + transactionHeight, 300);

  return (
    <g>
      {/* Diamond marker (rotated square) */}
      <g
        transform={`translate(${cx}, ${cy})`}
        style={{ cursor: "pointer" }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <rect
          x={-6}
          y={-6}
          width={12}
          height={12}
          fill={color}
          transform="rotate(45)"
        />
        <text
          x={0}
          y={0}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#fff"
          fontSize={7}
          fontWeight="bold"
          pointerEvents="none"
        >
          {isPositive ? "+" : "-"}
        </text>
      </g>

      {/* Tooltip */}
      {showTooltip && (
        <foreignObject
          x={cx - 130}
          y={cy + 15}
          width={260}
          height={tooltipHeight}
        >
          <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs pointer-events-none">
            <div className="font-bold mb-2">
              {formatDate(point.date)}: {label} pts (Rank {point.rankBefore} → {point.rankAfter})
            </div>

            {point.categoryChanges.length > 0 && (
              <div className="mb-2">
                <div className="font-semibold text-gray-700 mb-1">Category Changes:</div>
                {point.categoryChanges.map((cat, idx) => {
                  const catColor = cat.deltaPts > 0 ? "text-green-700" : "text-red-700";
                  const catLabel = cat.deltaPts > 0 ? `+${cat.deltaPts}` : String(cat.deltaPts);
                  const rankSuffix = (rank: number) => {
                    if (rank === 1) return "st";
                    if (rank === 2) return "nd";
                    if (rank === 3) return "rd";
                    return "th";
                  };
                  return (
                    <div key={idx} className={catColor}>
                      {cat.categoryId}: {catLabel} pts ({cat.rankBefore}{rankSuffix(cat.rankBefore)} → {cat.rankAfter}{rankSuffix(cat.rankAfter)})
                    </div>
                  );
                })}
              </div>
            )}

            {point.transactions.length > 0 ? (
              <div>
                <div className="font-semibold text-gray-700 mb-1">Transactions:</div>
                {point.transactions.map((tx, idx) => (
                  <div key={idx} className="mb-1">
                    {tx.playersAdded.length > 0 && (
                      <div className="text-green-700">
                        Added: {tx.playersAdded.map((p) => p.name).join(", ")}
                      </div>
                    )}
                    {tx.playersDropped.length > 0 && (
                      <div className="text-red-700">
                        Dropped: {tx.playersDropped.map((p) => p.name).join(", ")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-500 italic">No roster moves in this period</div>
            )}
          </div>
        </foreignObject>
      )}
    </g>
  );
}
