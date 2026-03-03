"use client";

import { cn } from "@/lib/cn";
import { Card, CardContent } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";
import ImpactBadge from "./ImpactBadge";

interface SGPCategoryImpact {
  categoryId: string;
  shapleyDelta?: number;
  sgpDelta?: number;
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

  const sgpData = sgpCategoryImpacts || [];
  const impactVal = (s: SGPCategoryImpact) => s.shapleyDelta ?? s.sgpDelta ?? 0;
  const nonZero = sgpData.filter((s) => Math.abs(impactVal(s)) >= 0.01 || Math.abs(s.rawDelta) >= 0.5);

  return (
    <Card className="mt-2 shadow-card-hover">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="text-data font-medium text-content-secondary uppercase">{moveLabel}</span>
            <span className="text-data text-content-tertiary ml-2">
              {new Date(effectiveDate).toLocaleDateString()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ImpactBadge impact={impactRotoPoints} isUncertain={isUncertain} ciLow={ciLow} ciHigh={ciHigh} />
            <button onClick={onClose} className="text-content-tertiary hover:text-content-secondary text-body-sm">
              &times;
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-3">
          {playerGained && (
            <span className="text-body-sm font-medium text-positive">
              + {playerGained.name}
              <span className="text-data text-content-tertiary ml-1">
                ({playerGained.positions?.join(", ")})
              </span>
            </span>
          )}
          {playerLost && (
            <span className="text-body-sm font-medium text-negative">
              - {playerLost.name}
              <span className="text-data text-content-tertiary ml-1">
                ({playerLost.positions?.join(", ")})
              </span>
            </span>
          )}
        </div>

        {isIncomplete && (
          <div className="text-data text-warning bg-warning-light rounded px-2 py-1 mb-3">
            Incomplete data — dropped player may not have been picked up
          </div>
        )}

        {isUncertain && (
          <div className="text-data text-info bg-info-light rounded px-2 py-1 mb-3">
            Low confidence — impact estimate has wide uncertainty range
            {ciLow != null && ciHigh != null && (
              <span className="ml-1 text-info opacity-70">(95% CI: {ciLow.toFixed(1)} to {ciHigh.toFixed(1)})</span>
            )}
          </div>
        )}

        {nonZero.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-data">
              <thead>
                <tr className="border-b border-neutral-100">
                  <th className="text-left py-1 pr-3 text-content-secondary font-medium">Category</th>
                  <th className="text-right py-1 px-2 text-content-secondary font-medium">Net Stats</th>
                  <th className="text-right py-1 pl-2 text-content-secondary font-medium">Roto Pts</th>
                </tr>
              </thead>
              <tbody>
                {nonZero
                  .sort((a, b) => Math.abs(impactVal(b)) - Math.abs(impactVal(a)))
                  .map((sgp) => {
                    const delta = impactVal(sgp);
                    return (
                      <tr key={sgp.categoryId} className="border-b border-neutral-50">
                        <td className="py-1 pr-3 font-medium text-content">{sgp.categoryId}</td>
                        <td className="py-1 px-2 text-right text-content-secondary">
                          {(() => {
                            const isLowerBetter = ["ERA", "WHIP"].includes(sgp.categoryId);
                            const isGood = isLowerBetter ? sgp.rawDelta < 0 : sgp.rawDelta > 0;
                            const isBad = isLowerBetter ? sgp.rawDelta > 0 : sgp.rawDelta < 0;
                            return (
                              <span className={cn(isGood ? "text-positive" : isBad ? "text-negative" : "")}>
                                {sgp.rawDelta > 0 ? "+" : ""}
                                {Math.abs(sgp.rawDelta) < 1 ? sgp.rawDelta.toFixed(3) : Math.round(sgp.rawDelta)}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="py-1 pl-2 text-right">
                          <span className={cn(delta > 0 ? "text-positive" : delta < 0 ? "text-negative" : "text-content-secondary")}>
                            {delta > 0 ? "+" : ""}{delta.toFixed(2)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            <p className="text-[10px] text-content-tertiary mt-1">
              Roto Pts = Shapley-attributed standings impact per category. Net stats = gained - lost player.
            </p>
          </div>
        ) : (
          <p className="text-data text-content-tertiary">No significant category contributions.</p>
        )}
      </CardContent>
    </Card>
  );
}
