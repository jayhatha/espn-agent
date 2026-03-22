import React, { useState } from "react";
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
  const [expanded, setExpanded] = useState(false);

  // Group drafted board players by position
  const draftedByPos = new Map<string, Array<{ name: string; tier: string; cost: number }>>();
  for (const p of drafted) {
    for (const pos of p.positions) {
      if (!draftedByPos.has(pos)) draftedByPos.set(pos, []);
      const rosterEntry = (boardState.slots ?? []).find(
        (s: any) => s.draftedName === p.name && s.filled
      );
      draftedByPos.get(pos)!.push({
        name: p.name, tier: p.tier, cost: rosterEntry?.draftedCost ?? 0,
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
  for (const [, list] of availByPos) list.sort((a, b) => b.fgDollars - a.fgDollars);

  const draftedNamesSeen = new Set<string>();

  return (
    <div className="px-3 py-2 bg-grafana-panel border-b border-grafana-border">
      {/* Header bar */}
      <div
        className="flex items-center justify-between mb-1.5 cursor-pointer select-none"
        onClick={() => setExpanded(prev => !prev)}
      >
        <div className="text-body-xs text-grafana-muted uppercase tracking-wide">
          Draft Board <span className="text-[9px] ml-0.5">{expanded ? "▼" : "▶"}</span>
        </div>
        <div className="text-label text-grafana-muted">
          <span className="text-grafana-text font-semibold">${totalBudgetRemaining}</span>
          {(cumulativeSurplus ?? 0) > 0 && (
            <span className="text-grafana-positive font-semibold ml-1.5">+${cumulativeSurplus}</span>
          )}
        </div>
      </div>

      {/* Table */}
      <table className="w-full text-[10px] leading-tight" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr className="text-[9px] text-grafana-muted uppercase">
            <th className="text-left w-6 pb-0.5 font-normal">Pos</th>
            <th className="text-left pb-0.5 font-normal">Player</th>
            <th className="text-right w-8 pb-0.5 font-normal">FG$</th>
            <th className="text-center w-5 pb-0.5 font-normal"></th>
          </tr>
        </thead>
        <tbody>
          {POS_GROUPS.map(({ label, keys, limit, flex }) => {
            const posKey = keys[0];
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
            const posNeeded = needed.has(needKey);
            const filledCount = draftedHere.length;
            const isFilled = !posNeeded && filledCount > 0;

            const uniqueDrafted = draftedHere.filter(p => {
              if (!p?.name || draftedNamesSeen.has(p.name)) return false;
              draftedNamesSeen.add(p.name);
              return true;
            });

            const maxCollapsed = label === "SP" || label === "RP" ? 4 : 3;
            const shownAvail = expanded ? availHere : availHere.slice(0, maxCollapsed);
            const hiddenCount = expanded ? 0 : Math.max(0, availHere.length - maxCollapsed);

            const hasContent = uniqueDrafted.length > 0 || availHere.length > 0;
            if (!hasContent && !posNeeded) return null;

            return (
              <React.Fragment key={label}>
                {/* Position header row */}
                <tr>
                  <td
                    colSpan={4}
                    className="pt-1.5 pb-0.5"
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`font-mono font-bold text-[11px] ${
                        isFilled ? "text-grafana-positive" : posNeeded ? "text-grafana-warning" : "text-grafana-muted"
                      }`}>
                        {label}
                      </span>
                      {isFilled && <span className="text-[9px] text-grafana-positive">✓</span>}
                      {posNeeded && <span className="text-[9px] text-grafana-warning">○</span>}
                    </div>
                  </td>
                </tr>

                {/* Drafted players */}
                {uniqueDrafted.map((p, i) => (
                  <tr key={`d-${label}-${i}`} className="text-grafana-positive">
                    <td></td>
                    <td className="py-px font-medium">{p.name}</td>
                    <td className="text-right py-px text-grafana-muted">${p.cost}</td>
                    <td className="text-center py-px">
                      <span className={`text-[8px] px-1 rounded-sm font-bold ${
                        p.tier === "target"
                          ? "bg-[#37872d]/30 text-[#37872d]"
                          : "bg-[#5b9cf6]/30 text-[#5b9cf6]"
                      }`}>
                        {p.tier === "target" ? "T" : "R"}
                      </span>
                    </td>
                  </tr>
                ))}

                {/* Available players */}
                {shownAvail.map((p, i) => (
                  <tr key={`a-${label}-${i}`} className={p.tier === "target" ? "text-grafana-text" : "text-grafana-muted"}>
                    <td></td>
                    <td className="py-px">{p.name}</td>
                    <td className="text-right py-px">${p.fgDollars}</td>
                    <td className="text-center py-px">
                      <span className={`text-[8px] px-1 rounded-sm font-bold ${
                        p.tier === "target"
                          ? "bg-[#37872d]/15 text-[#37872d]"
                          : "bg-[#5b9cf6]/15 text-[#5b9cf6]"
                      }`}>
                        {p.tier === "target" ? "T" : "R"}
                      </span>
                    </td>
                  </tr>
                ))}

                {/* Overflow count */}
                {hiddenCount > 0 && (
                  <tr>
                    <td></td>
                    <td colSpan={3} className="py-px text-grafana-muted/40 italic">
                      +{hiddenCount} more
                    </td>
                  </tr>
                )}

                {/* Empty position */}
                {uniqueDrafted.length === 0 && availHere.length === 0 && (
                  <tr>
                    <td></td>
                    <td colSpan={3} className="py-px text-grafana-muted/30 italic">no targets</td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
