"use client";

import type { BoardPlayer } from "../useDraftLiveSocket";

interface NominatePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNominate: (playerName: string, playerId?: number) => void;
  availablePlayers: BoardPlayer[];
}

export function NominatePickerModal({
  isOpen,
  onClose,
  onNominate,
  availablePlayers,
}: NominatePickerModalProps) {
  if (!isOpen) return null;

  // Sort by priorityScore descending, fall back to fgDollars descending
  const sorted = [...availablePlayers].sort((a, b) => {
    const aPriority = a.priorityScore ?? null;
    const bPriority = b.priorityScore ?? null;
    if (aPriority != null && bPriority != null) return bPriority - aPriority;
    if (aPriority != null) return -1;
    if (bPriority != null) return 1;
    return b.fgDollars - a.fgDollars;
  });

  function handleRowTap(player: BoardPlayer) {
    onNominate(player.name, undefined);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(24, 27, 31, 0.90)" }}
      onClick={onClose}
    >
      {/* Inner panel — stop propagation so tapping inside doesn't close */}
      <div
        className="bg-[#22252b] rounded-t-2xl w-full max-w-lg overflow-hidden"
        style={{ maxHeight: "80vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 min-h-[44px] border-b border-[#2d3139] flex-shrink-0">
          <span className="text-[#d9dde6] font-semibold text-base">Nominate Player</span>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[#99a5bc] hover:text-[#d9dde6] text-xl"
            aria-label="Close nominate picker"
          >
            ×
          </button>
        </div>

        {/* Player list */}
        <div className="overflow-y-auto flex-1">
          {sorted.length === 0 ? (
            <p className="text-[#99a5bc] text-sm text-center py-8">
              No available players
            </p>
          ) : (
            sorted.map((player, i) => (
              <button
                key={`${player.name}-${i}`}
                type="button"
                onClick={() => handleRowTap(player)}
                className="w-full flex items-center justify-between px-4 min-h-[44px] border-b border-[#2d3139]/50 hover:bg-[#2d3139] active:bg-[#353b47] transition-colors text-left"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-sm text-[#d9dde6] truncate">{player.name}</span>
                  <span className="text-xs text-[#99a5bc] flex-shrink-0">
                    {player.positions.join("/")}
                  </span>
                </div>
                <span className="text-sm font-mono text-[#d9dde6] flex-shrink-0 ml-3">
                  ${Math.round(player.fgDollars)}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
