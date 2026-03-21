import React from "react";
import type { DraftEngineSignals } from "../lib/engine";

interface DraftBoardViewProps {
  engineSignals: DraftEngineSignals | null;
}

interface BoardSlotDisplay {
  position: string;
  positionGroup: string;
  filled: boolean;
  playerName: string | null;
  playerTier: "target" | "reach" | null;
  cost: number | null;
}

export default function DraftBoardView({ engineSignals }: DraftBoardViewProps) {
  const boardState = (engineSignals?.optimization as any)?.draftBoardState;
  if (!boardState) return null;

  const { slots, availablePlayers, positionsNeeded, totalBudgetRemaining } = boardState;

  // Group available players by position for the "still needed" view
  const availableByPosition = new Map<string, Array<{ name: string; tier: string; fgDollars: number }>>();
  for (const p of availablePlayers ?? []) {
    for (const pos of p.positions) {
      if (!availableByPosition.has(pos)) availableByPosition.set(pos, []);
      availableByPosition.get(pos)!.push({ name: p.name, tier: p.tier, fgDollars: Math.round(p.fgDollars) });
    }
  }

  // Build display slots — combine filled (from boardState) with roster structure
  const posOrder = ["C", "1B", "2B", "SS", "3B", "MI", "CI", "OF", "UTIL", "P", "BN"];
  const groupedSlots = new Map<string, BoardSlotDisplay[]>();

  for (const slot of (slots ?? [])) {
    const group = slot.positionGroup;
    if (!groupedSlots.has(group)) groupedSlots.set(group, []);
    groupedSlots.get(group)!.push({
      position: slot.position,
      positionGroup: group,
      filled: slot.filled,
      playerName: slot.draftedName ?? null,
      playerTier: slot.player?.tier ?? null,
      cost: slot.draftedCost ?? null,
    });
  }

  return (
    <div className="mx-3 my-1.5">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-body-xs font-semibold text-grafana-text uppercase tracking-wider">
          Draft Board
        </span>
        <span className="text-caption text-grafana-muted">
          ${totalBudgetRemaining} left · {(availablePlayers ?? []).length} targets available
        </span>
      </div>

      {/* Positions needing targets */}
      {(positionsNeeded ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {(positionsNeeded as string[]).map((pos: string) => (
            <span key={pos} className="text-label bg-grafana-warning/20 text-grafana-warning rounded px-1.5 py-0.5">
              Need {pos}
            </span>
          ))}
        </div>
      )}

      {/* Filled roster from board */}
      <div className="space-y-0.5">
        {posOrder.map(group => {
          const groupSlots = groupedSlots.get(group);
          if (!groupSlots || groupSlots.length === 0) return null;

          // Only show filled slots and first empty slot per group
          const filledInGroup = groupSlots.filter(s => s.filled);
          const emptyCount = groupSlots.filter(s => !s.filled).length;

          if (filledInGroup.length === 0 && !["P", "BN", "UTIL"].includes(group)) {
            // Show "empty" placeholder for unfilled position groups
            const available = availableByPosition.get(group);
            return (
              <div key={group} className="flex items-center gap-1.5 py-0.5 opacity-60">
                <span className="text-label text-grafana-muted w-7 text-right font-mono">{group}</span>
                <span className="text-caption text-grafana-muted italic">
                  {available && available.length > 0
                    ? `${available.slice(0, 3).map(p => p.name.split(' ').pop()).join(', ')}...`
                    : 'no targets'}
                </span>
              </div>
            );
          }

          return filledInGroup.map((slot, idx) => (
            <div key={slot.position + idx} className="flex items-center gap-1.5 py-0.5">
              <span className="text-label text-grafana-muted w-7 text-right font-mono">
                {filledInGroup.length > 1 && idx > 0 ? '' : group}
              </span>
              <span className={`text-caption font-medium ${
                slot.playerTier === 'target' ? 'text-grafana-positive' :
                slot.playerTier === 'reach' ? 'text-grafana-accent' :
                'text-grafana-text'
              }`}>
                {slot.playerName}
              </span>
              {slot.cost != null && (
                <span className="text-label text-grafana-muted">${slot.cost}</span>
              )}
              {slot.playerTier && (
                <span className={`text-[9px] px-1 rounded ${
                  slot.playerTier === 'target'
                    ? 'bg-grafana-positive/20 text-grafana-positive'
                    : 'bg-grafana-accent/20 text-grafana-accent'
                }`}>
                  {slot.playerTier === 'target' ? 'T' : 'R'}
                </span>
              )}
            </div>
          ));
        })}
      </div>

      {/* Available targets by position */}
      <div className="mt-3 pt-2 border-t border-grafana-border">
        <div className="text-body-xs font-semibold text-grafana-text uppercase tracking-wider mb-1.5">
          Available Targets
        </div>
        <div className="space-y-1">
          {posOrder.filter(g => !["UTIL", "BN"].includes(g)).map(group => {
            const available = availableByPosition.get(group === "P" ? "SP" : group);
            const availableRP = group === "P" ? availableByPosition.get("RP") : undefined;
            const combined = [...(available ?? []), ...(availableRP ?? [])];
            if (combined.length === 0) return null;

            // Sort by FG$ descending, show top 4
            combined.sort((a, b) => b.fgDollars - a.fgDollars);
            const isNeeded = (positionsNeeded as string[])?.includes(group === "P" ? "SP" : group)
              || (group === "P" && (positionsNeeded as string[])?.includes("RP"));

            return (
              <div key={group} className="flex items-start gap-1.5">
                <span className={`text-label w-5 text-right font-mono mt-0.5 ${
                  isNeeded ? 'text-grafana-warning' : 'text-grafana-muted'
                }`}>
                  {group === "P" ? "P" : group}
                </span>
                <div className="flex flex-wrap gap-x-2 gap-y-0">
                  {combined.slice(0, 5).map((p, i) => (
                    <span key={i} className={`text-caption ${
                      p.tier === 'target' ? 'text-grafana-text' : 'text-grafana-muted'
                    }`}>
                      {p.name.split(' ').pop()} <span className="text-grafana-muted">${p.fgDollars}</span>
                    </span>
                  ))}
                  {combined.length > 5 && (
                    <span className="text-caption text-grafana-muted">+{combined.length - 5}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
