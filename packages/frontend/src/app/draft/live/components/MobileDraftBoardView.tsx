"use client";

import React, { useState } from "react";
import type { DraftBoardStateSignal } from "../useDraftLiveSocket";

interface MobileDraftBoardViewProps {
  boardState: DraftBoardStateSignal | null;
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

export function MobileDraftBoardView({ boardState }: MobileDraftBoardViewProps) {
  const [expanded, setExpanded] = useState(false);

  if (!boardState) return null;

  const {
    availablePlayers,
    draftedPlayers,
    positionsNeeded,
    totalBudgetRemaining,
    cumulativeSurplus,
  } = boardState;

  const available = availablePlayers ?? [];
  const drafted = draftedPlayers ?? [];
  const needed = new Set<string>(positionsNeeded ?? []);

  // Group drafted players by position
  const draftedByPos = new Map<string, Array<{ name: string; tier: string; cost: number }>>();
  for (const p of drafted) {
    for (const pos of p.positions) {
      if (!draftedByPos.has(pos)) draftedByPos.set(pos, []);
      const rosterEntry = (boardState.slots ?? []).find(
        (s) => s.draftedName === p.name && s.filled
      );
      draftedByPos.get(pos)!.push({
        name: p.name,
        tier: p.tier,
        cost: rosterEntry?.draftedCost ?? 0,
      });
    }
  }

  // Group available players by position, sorted by fgDollars desc
  const availByPos = new Map<string, Array<{ name: string; tier: string; fgDollars: number }>>();
  for (const p of available) {
    for (const pos of p.positions) {
      if (!availByPos.has(pos)) availByPos.set(pos, []);
      availByPos.get(pos)!.push({
        name: p.name,
        tier: p.tier,
        fgDollars: Math.round(p.fgDollars),
      });
    }
  }
  for (const [, list] of availByPos) list.sort((a, b) => b.fgDollars - a.fgDollars);

  const draftedNamesSeen = new Set<string>();

  return (
    <div className="bg-[#22252b] border border-[#2d3139] rounded-xl overflow-hidden">
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-4 min-h-[44px] cursor-pointer select-none"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm text-[#99a5bc] uppercase tracking-wide font-medium">
            Draft Board
          </span>
          <span className="text-xs text-[#6b7a99]">{expanded ? "▼" : "▶"}</span>
        </div>
        <div className="text-sm text-[#99a5bc] font-mono">
          <span className="text-[#d9dde6] font-semibold">${totalBudgetRemaining} left</span>
          {(cumulativeSurplus ?? 0) > 0 && (
            <span className="text-[#37872d] font-semibold ml-2">
              +${cumulativeSurplus} banked
            </span>
          )}
        </div>
      </div>

      {/* Expanded table */}
      {expanded && (
        <table
          className="w-full text-xs leading-tight"
          style={{ borderCollapse: "collapse" }}
        >
          <thead>
            <tr className="text-[11px] text-[#6b7a99] uppercase bg-[#1a1d23]">
              <th className="text-left w-8 px-3 py-2 font-normal">Pos</th>
              <th className="text-left px-1 py-2 font-normal">Player</th>
              <th className="text-right w-10 px-3 py-2 font-normal">FG$</th>
              <th className="text-center w-6 px-1 py-2 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {POS_GROUPS.map(({ label, keys, flex }) => {
              const posKey = keys[0];
              const draftedHere =
                keys.length > 1
                  ? keys.flatMap((k) => draftedByPos.get(k) ?? []).filter((p) => p?.name)
                  : (draftedByPos.get(posKey) ?? []).filter((p) => p?.name);
              const availHere =
                keys.length > 1
                  ? [
                      ...new Map(
                        keys
                          .flatMap((k) => availByPos.get(k) ?? [])
                          .filter((p) => p?.name)
                          .map((p) => [p.name, p] as [string, typeof p])
                      ).values(),
                    ].sort((a, b) => b.fgDollars - a.fgDollars)
                  : (availByPos.get(posKey) ?? []).filter((p) => p?.name);

              const needKey = flex ? label : posKey;
              const posNeeded = needed.has(needKey);

              const uniqueDrafted = draftedHere.filter((p) => {
                if (!p?.name || draftedNamesSeen.has(p.name)) return false;
                draftedNamesSeen.add(p.name);
                return true;
              });

              // Show up to 3 available per group on mobile
              const shownAvail = availHere.slice(0, 3);

              const hasContent = uniqueDrafted.length > 0 || availHere.length > 0;
              if (!hasContent && !posNeeded) return null;

              const isFilled = !posNeeded && uniqueDrafted.length > 0;

              return (
                <React.Fragment key={label}>
                  {/* Position group header */}
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 pt-2 pb-1"
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-mono font-bold text-sm ${
                            isFilled
                              ? "text-[#37872d]"
                              : posNeeded
                              ? "text-[#e0b400]"
                              : "text-[#99a5bc]"
                          }`}
                        >
                          {label}
                        </span>
                        {isFilled && (
                          <span className="text-xs text-[#37872d]">✓</span>
                        )}
                        {posNeeded && (
                          <span className="text-xs text-[#e0b400]">○</span>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Drafted players */}
                  {uniqueDrafted.map((p, i) => (
                    <tr key={`d-${label}-${i}`} className="text-[#37872d]">
                      <td className="px-3 py-0.5"></td>
                      <td className="px-1 py-0.5 font-medium text-xs">{p.name}</td>
                      <td className="text-right px-3 py-0.5 text-[#99a5bc] font-mono text-xs">
                        ${p.cost}
                      </td>
                      <td className="text-center px-1 py-0.5">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                            p.tier === "target"
                              ? "bg-[#37872d]/30 text-[#37872d]"
                              : "bg-[#5b9cf6]/30 text-[#5b9cf6]"
                          }`}
                        >
                          {p.tier === "target" ? "T" : "R"}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {/* Available players */}
                  {shownAvail.map((p, i) => (
                    <tr
                      key={`a-${label}-${i}`}
                      className={
                        p.tier === "target" ? "text-[#d9dde6]" : "text-[#99a5bc]"
                      }
                    >
                      <td className="px-3 py-0.5"></td>
                      <td className="px-1 py-0.5 text-xs">{p.name}</td>
                      <td className="text-right px-3 py-0.5 font-mono text-xs">
                        ${p.fgDollars}
                      </td>
                      <td className="text-center px-1 py-0.5">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                            p.tier === "target"
                              ? "bg-[#37872d]/15 text-[#37872d]"
                              : "bg-[#5b9cf6]/15 text-[#5b9cf6]"
                          }`}
                        >
                          {p.tier === "target" ? "T" : "R"}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {/* Empty position */}
                  {uniqueDrafted.length === 0 && availHere.length === 0 && (
                    <tr>
                      <td className="px-3 py-0.5"></td>
                      <td
                        colSpan={3}
                        className="px-1 py-0.5 text-[#6b7a99]/60 italic text-xs"
                      >
                        no targets
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
