"use client";

import ImpactBadge from "./ImpactBadge";

interface SGPCategoryImpact {
  categoryId: string;
  sgpDelta: number;
  rawDelta: number;
  sgpFactor: number;
}

interface ImpactDetailCardProps {
  playerGained: { name: string; positions: string[] } | null;
  playerLost: { name: string; positions: string[] } | null;
  moveType: string;
  effectiveDate: string;
  impactRotoPoints: number;
  categoryImpacts: unknown[];
  sgpCategoryImpacts?: SGPCategoryImpact[] | null;
  isUncertain?: boolean;
  ciLow?: number | null;
  ciHigh?: number | null;
  isIncomplete: boolean;
  onClose: () => void;
}

export default function ImpactDetailCard({
  playerGained,
  playerLost,
  moveType,
  effectiveDate,
  impactRotoPoints,
  sgpCategoryImpacts,
  isUncertain = false,
  ciLow,
  ciHigh,
  isIncomplete,
  onClose,
}: ImpactDetailCardProps) {
  const moveLabel =
    moveType === "draft" ? "Draft Pick" :
    moveType === "trade" ? "Trade" :
    "Add/Drop";

  // Use SGP data for category breakdown — shows raw stat contributions
  const sgpData = sgpCategoryImpacts || [];
  // Filter by SGP delta (not raw delta) so rate stats with small raw values but big SGP impact show up
  const nonZeroSgp = sgpData.filter((s) => Math.abs(s.sgpDelta) >= 0.01 || Math.abs(s.rawDelta) >= 0.5);

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-4 mt-2">
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-xs font-medium text-gray-500 uppercase">{moveLabel}</span>
          <span className="text-xs text-gray-400 ml-2">
            {new Date(effectiveDate).toLocaleDateString()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ImpactBadge impact={impactRotoPoints} isUncertain={isUncertain} ciLow={ciLow} ciHigh={ciHigh} />
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">
            &times;
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        {playerGained && (
          <span className="text-sm font-medium text-green-700">
            + {playerGained.name}
            <span className="text-xs text-gray-400 ml-1">
              ({playerGained.positions?.join(", ")})
            </span>
          </span>
        )}
        {playerLost && (
          <span className="text-sm font-medium text-red-700">
            - {playerLost.name}
            <span className="text-xs text-gray-400 ml-1">
              ({playerLost.positions?.join(", ")})
            </span>
          </span>
        )}
      </div>

      {isIncomplete && (
        <div className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1 mb-3">
          Incomplete data — dropped player may not have been picked up
        </div>
      )}

      {isUncertain && (
        <div className="text-xs text-blue-600 bg-blue-50 rounded px-2 py-1 mb-3">
          Low confidence — impact estimate has wide uncertainty range
          {ciLow != null && ciHigh != null && (
            <span className="ml-1 text-blue-400">(95% CI: {ciLow.toFixed(1)} to {ciHigh.toFixed(1)})</span>
          )}
        </div>
      )}

      {nonZeroSgp.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-1 pr-3 text-gray-500 font-medium">Category</th>
                <th className="text-right py-1 px-2 text-gray-500 font-medium">Net Stats</th>
                <th className="text-right py-1 pl-2 text-gray-500 font-medium">SGP</th>
              </tr>
            </thead>
            <tbody>
              {nonZeroSgp
                .sort((a, b) => Math.abs(b.sgpDelta) - Math.abs(a.sgpDelta))
                .map((sgp) => (
                  <tr key={sgp.categoryId} className="border-b border-gray-50">
                    <td className="py-1 pr-3 font-medium text-gray-700">{sgp.categoryId}</td>
                    <td className="py-1 px-2 text-right text-gray-600">
                      {(() => {
                        const isLowerBetter = ["ERA", "WHIP"].includes(sgp.categoryId);
                        const isGood = isLowerBetter ? sgp.rawDelta < 0 : sgp.rawDelta > 0;
                        const isBad = isLowerBetter ? sgp.rawDelta > 0 : sgp.rawDelta < 0;
                        const color = isGood ? "text-green-600" : isBad ? "text-red-600" : "";
                        return (
                          <span className={color}>
                            {sgp.rawDelta > 0 ? "+" : ""}
                            {Math.abs(sgp.rawDelta) < 1 ? sgp.rawDelta.toFixed(3) : Math.round(sgp.rawDelta)}
                          </span>
                        );
                      })()}
                    </td>
                    <td
                      className="py-1 pl-2 text-right"
                      title={`1 SGP = ${sgp.sgpFactor.toFixed(1)} ${sgp.categoryId}`}
                    >
                      <span className={sgp.sgpDelta > 0 ? "text-green-600" : sgp.sgpDelta < 0 ? "text-red-600" : "text-gray-500"}>
                        {sgp.sgpDelta > 0 ? "+" : ""}{sgp.sgpDelta.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <p className="text-[10px] text-gray-400 mt-1">
            Net stats = gained player - lost player. SGP = standings gain points.
          </p>
        </div>
      ) : (
        <p className="text-xs text-gray-400">No significant category contributions.</p>
      )}
    </div>
  );
}
