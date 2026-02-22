"use client";

import ImpactBadge from "./ImpactBadge";

interface CategoryImpact {
  categoryId: string;
  actualValue: number;
  counterfactualValue: number;
  deltaRotoPoints: number;
}

interface ImpactDetailCardProps {
  playerGained: { name: string; positions: string[] } | null;
  playerLost: { name: string; positions: string[] } | null;
  moveType: string;
  effectiveDate: string;
  impactRotoPoints: number;
  categoryImpacts: CategoryImpact[];
  isIncomplete: boolean;
  onClose: () => void;
}

export default function ImpactDetailCard({
  playerGained,
  playerLost,
  moveType,
  effectiveDate,
  impactRotoPoints,
  categoryImpacts,
  isIncomplete,
  onClose,
}: ImpactDetailCardProps) {
  const moveLabel =
    moveType === "draft" ? "Draft Pick" :
    moveType === "trade" ? "Trade" :
    "Add/Drop";

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
          <ImpactBadge impact={impactRotoPoints} />
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

      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-1 pr-3 text-gray-500 font-medium">Category</th>
              <th className="text-right py-1 px-2 text-gray-500 font-medium">Actual</th>
              <th className="text-right py-1 px-2 text-gray-500 font-medium">W/O Move</th>
              <th className="text-right py-1 pl-2 text-gray-500 font-medium">Impact</th>
            </tr>
          </thead>
          <tbody>
            {categoryImpacts
              .filter((c) => c.deltaRotoPoints !== 0)
              .sort((a, b) => Math.abs(b.deltaRotoPoints) - Math.abs(a.deltaRotoPoints))
              .map((cat) => (
                <tr key={cat.categoryId} className="border-b border-gray-50">
                  <td className="py-1 pr-3 font-medium text-gray-700">{cat.categoryId}</td>
                  <td className="py-1 px-2 text-right text-gray-600">
                    {cat.actualValue < 1 ? cat.actualValue.toFixed(3) : Math.round(cat.actualValue)}
                  </td>
                  <td className="py-1 px-2 text-right text-gray-400">
                    {cat.counterfactualValue < 1 ? cat.counterfactualValue.toFixed(3) : Math.round(cat.counterfactualValue)}
                  </td>
                  <td className="py-1 pl-2 text-right">
                    <ImpactBadge impact={cat.deltaRotoPoints} size="sm" />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
