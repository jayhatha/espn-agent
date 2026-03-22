"use client";

import { useState } from "react";
import type {
  DraftLiveState,
  EngineSignals,
  ControlActionName,
  ControlActionMap,
} from "../useDraftLiveSocket";
import { MobileBidVerdict } from "../components/MobileBidVerdict";
import { MobileDraftBoardView } from "../components/MobileDraftBoardView";
import { NominatePickerModal } from "../components/NominatePickerModal";

// ---- Props ----

interface LiveTabProps {
  state: DraftLiveState | null;
  engineSignals: EngineSignals | null;
  hasData: boolean;
  wsConnected: boolean;
  wsUrl: string;
  positionFilter: string;
  splitValue: number;
  onPositionFilterChange: (value: string) => void;
  onSplitValueChange: (value: number) => void;
  sendControl: <A extends ControlActionName>(
    action: A,
    ...args: ControlActionMap[A] extends undefined ? [] : [ControlActionMap[A]]
  ) => void;
}

export function LiveTab({
  state,
  engineSignals,
  hasData,
  wsConnected,
  wsUrl,
  sendControl,
}: LiveTabProps) {
  const [nominateOpen, setNominateOpen] = useState(false);

  return (
    <>
      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">

        {/* Pre-connection states */}
        {!wsUrl && (
          <div className="bg-[#22252b] border border-[#2d3139] rounded-xl p-4">
            <p className="text-[#99a5bc] text-center py-4">
              Enter a WebSocket URL above to connect.
            </p>
          </div>
        )}

        {wsUrl && !wsConnected && (
          <div className="text-center py-6 text-[#99a5bc]">
            <p className="text-lg">Connecting...</p>
            <p className="text-xs mt-1 font-mono text-[#6b7a99]">{wsUrl}</p>
          </div>
        )}

        {wsConnected && !hasData && (
          <div className="bg-[#22252b] border border-[#2d3139] rounded-xl p-4">
            <p className="text-[#99a5bc] text-center py-4">
              Waiting for draft data...
            </p>
            <p className="text-xs text-center text-[#6b7a99] mt-1">
              Make sure the ESPN extension is open and a draft is in progress.
            </p>
          </div>
        )}

        {hasData && (
          <>
            {/* 1. MobileBidVerdict — top */}
            <MobileBidVerdict
              currentPlayer={state?.currentAuctionPlayer ?? null}
              optimization={engineSignals?.optimization ?? null}
              remainingBudget={state?.remainingBudget ?? 0}
            />

            {/* 2. MobileDraftBoardView — middle */}
            <MobileDraftBoardView
              boardState={engineSignals?.optimization?.draftBoardState ?? null}
            />
          </>
        )}
      </div>

      {/* Sticky control bar — bottom */}
      {hasData && (
        <div className="sticky bottom-0 z-40 bg-[#22252b] border-t border-[#2d3139] px-4 py-3">
          <div className="max-w-lg mx-auto flex items-center gap-3">

            {/* Auto-bid toggle */}
            <button
              type="button"
              onClick={() => sendControl("SET_AUTO_MODE", !(state?.autoMode ?? false))}
              className={`min-h-[44px] px-3 py-2 rounded-lg text-sm font-bold uppercase tracking-wide transition-colors ${
                state?.autoMode
                  ? "bg-[#37872d] text-white"
                  : "bg-[#2d3139] text-[#99a5bc]"
              }`}
              aria-label={state?.autoMode ? "Auto-bid ON" : "Auto-bid OFF"}
            >
              Auto {state?.autoMode ? "ON" : "OFF"}
            </button>

            {/* Manual BID button — enabled when shouldBid is true */}
            <button
              type="button"
              onClick={() => sendControl("MANUAL_BID")}
              disabled={!(state?.currentAuctionPlayer && engineSignals?.optimization?.shouldBid)}
              className="min-h-[44px] flex-1 px-4 py-2 rounded-lg bg-[#37872d] hover:bg-green-600 text-white font-bold disabled:opacity-40 disabled:pointer-events-none"
              aria-label="Place manual bid +$1"
            >
              BID +$1
              {state?.currentAuctionPlayer?.currentBid != null
                ? ` ($${state.currentAuctionPlayer.currentBid + 1})`
                : ""}
            </button>

            {/* Nominate button — opens NominatePickerModal */}
            <button
              type="button"
              onClick={() => setNominateOpen(true)}
              className="min-h-[44px] px-3 py-2 rounded-lg bg-[#2d3139] hover:bg-[#3a4150] text-[#d9dde6] font-semibold text-sm"
              aria-label="Nominate a player"
            >
              Nominate
            </button>
          </div>
        </div>
      )}

      {/* Nominate picker modal */}
      <NominatePickerModal
        isOpen={nominateOpen}
        onClose={() => setNominateOpen(false)}
        onNominate={(playerName) => {
          sendControl("MANUAL_NOMINATE", { playerName });
          setNominateOpen(false);
        }}
        availablePlayers={engineSignals?.optimization?.draftBoardState?.availablePlayers ?? []}
      />
    </>
  );
}
