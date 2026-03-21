import React from "react";
import type { DraftEngineSignals } from "../lib/engine";

interface DraftBoardViewProps {
  engineSignals: DraftEngineSignals | null;
}

const POS_GROUPS: Array<{ label: string; keys: string[]; limit: number; flex?: boolean }> = [
  { label: "C", keys: ["C"], limit: 1 },
  { label: "1B", keys: ["1B"], limit: 1 },
  { label: "2B", keys: ["2B"], limit: 1 },
  { label: "SS", keys: ["SS"], limit: 1 },
  { label: "3B", keys: ["3B"], limit: 1 },
  { label: "MI", keys: ["2B", "SS"], limit: 1, flex: true },
  { label: "CI", keys: ["1B", "3B"], limit: 1, flex: true },
  { label: "OF", keys: ["OF"], limit: 4 },
  { label: "SP", keys: ["SP"], limit: 99 },
  { label: "RP", keys: ["RP"], limit: 99 },
];

export default function DraftBoardView({ engineSignals }: DraftBoardViewProps) {
  const boardState = (engineSignals?.optimization as any)?.draftBoardState;
  if (!boardState) return null;

  const { availablePlayers, draftedPlayers, positionsNeeded, totalBudgetRemaining, cumulativeSurplus } = boardState;
  const available = availablePlayers ?? [];
  const drafted = draftedPlayers ?? [];
  const needed = new Set<string>(positionsNeeded ?? []);

  // Group drafted board players by their board position
  const draftedByPos = new Map<string, Array<{ name: string; tier: string; cost: number }>>();
  for (const p of drafted) {
    for (const pos of p.positions) {
      if (!draftedByPos.has(pos)) draftedByPos.set(pos, []);
      const rosterEntry = (boardState.slots ?? []).find(
        (s: any) => s.draftedName === p.name && s.filled
      );
      draftedByPos.get(pos)!.push({
        name: p.name,
        tier: p.tier,
        cost: rosterEntry?.draftedCost ?? 0,
      });
    }
  }

  // Group available board players by position
  const availByPos = new Map<string, Array<{ name: string; tier: string; fgDollars: number }>>();
  for (const p of available) {
    for (const pos of p.positions) {
      if (!availByPos.has(pos)) availByPos.set(pos, []);
      availByPos.get(pos)!.push({ name: p.name, tier: p.tier, fgDollars: Math.round(p.fgDollars) });
    }
  }
  // Sort each position group by FG$ desc
  for (const [, list] of availByPos) list.sort((a, b) => b.fgDollars - a.fgDollars);

  // Deduplicate drafted names across positions
  const draftedNamesSeen = new Set<string>();

  return (
    <div className="px-3 py-2 bg-grafana-panel border-b border-grafana-border">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-body-xs text-grafana-muted uppercase tracking-wide">
          Draft Board
        </div>
        <div className="text-label text-grafana-muted">
          <span className="text-grafana-text font-semibold">${totalBudgetRemaining}</span> left
          {(cumulativeSurplus ?? 0) > 0 && (
            <>
              <span className="mx-1">·</span>
              <span className="text-grafana-positive font-semibold">+${cumulativeSurplus}</span>
              <span className="text-grafana-muted"> banked</span>
            </>
          )}
        </div>
      </div>

      {/* Position rows */}
      <div className="space-y-px">
        {POS_GROUPS.map(({ label, keys, limit, flex }) => {
          const posKey = keys[0];
          // For flex positions (MI/CI), merge players from both eligible positions and deduplicate
          const draftedHere = keys.length > 1
            ? keys.flatMap(k => draftedByPos.get(k) ?? []).filter(p => p?.name)
            : (draftedByPos.get(posKey) ?? []).filter(p => p?.name);
          const availHere = keys.length > 1
            ? [...new Map(
                keys.flatMap(k => (availByPos.get(k) ?? []))
                  .filter(p => p?.name)
                  .map(p => [p.name, p] as [string, typeof p])
              ).values()].sort((a, b) => b.fgDollars - a.fgDollars)
            : (availByPos.get(posKey) ?? []).filter(p => p?.name);
          const needKey = flex ? label : posKey;
          const isFilled = !needed.has(needKey);
          const filledCount = draftedHere.length;

          // Deduplicate (skip undefined names)
          const uniqueDrafted = draftedHere.filter(p => {
            if (!p?.name || draftedNamesSeen.has(p.name)) return false;
            draftedNamesSeen.add(p.name);
            return true;
          });

          return (
            <div key={label} className="flex items-start py-1 border-b border-grafana-border/50 last:border-0">
              {/* Position label */}
              <div className={`w-6 flex-shrink-0 text-right mr-2 font-mono text-label font-bold mt-px ${
                isFilled && filledCount >= Math.min(limit, 1)
                  ? "text-grafana-positive"
                  : needed.has(needKey)
                  ? "text-grafana-warning"
                  : "text-grafana-muted"
              }`}>
                {label}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Drafted players at this position */}
                {uniqueDrafted.map((p, i) => (
                  <div key={i} className="flex items-center gap-1.5 leading-tight">
                    <span className="text-caption text-grafana-positive font-medium">
                      {lastName(p.name)}
                    </span>
                    <span className="text-[9px] text-grafana-muted">${p.cost}</span>
                    <span className={`text-[8px] px-1 rounded-sm font-bold ${
                      p.tier === "target"
                        ? "bg-[#37872d]/30 text-[#37872d]"
                        : "bg-[#5b9cf6]/30 text-[#5b9cf6]"
                    }`}>
                      {p.tier === "target" ? "T" : "R"}
                    </span>
                  </div>
                ))}

                {/* Available targets */}
                {availHere.length > 0 && (
                  <div className="flex flex-wrap gap-x-1 gap-y-0 leading-tight">
                    {availHere.slice(0, label === "SP" || label === "RP" ? 6 : 4).map((p, i) => (
                      <span key={i} className={`text-[10px] ${
                        p.tier === "target" ? "text-grafana-text" : "text-grafana-muted"
                      }`}>
                        {lastName(p.name)}
                        <span className="text-grafana-muted/60 ml-px">{p.fgDollars}</span>
                        {i < Math.min(availHere.length, (label === "SP" || label === "RP" ? 6 : 4)) - 1 && (
                          <span className="text-grafana-border mx-0.5">·</span>
                        )}
                      </span>
                    ))}
                    {availHere.length > (label === "SP" || label === "RP" ? 6 : 4) && (
                      <span className="text-[10px] text-grafana-muted/50">
                        +{availHere.length - (label === "SP" || label === "RP" ? 6 : 4)}
                      </span>
                    )}
                  </div>
                )}

                {/* Empty state */}
                {uniqueDrafted.length === 0 && availHere.length === 0 && (
                  <span className="text-[10px] text-grafana-muted/40 italic">no targets</span>
                )}
              </div>

              {/* Status indicator */}
              <div className="flex-shrink-0 ml-1 mt-px">
                {filledCount >= Math.min(limit, 1) && filledCount > 0 ? (
                  <span className="text-[9px] text-grafana-positive">✓</span>
                ) : needed.has(needKey) ? (
                  <span className="text-[9px] text-grafana-warning">○</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function lastName(fullName: string | undefined | null): string {
  if (!fullName) return "?";
  const parts = fullName.split(" ");
  return parts.length > 1 ? parts.slice(1).join(" ") : fullName;
}
