"use client";

import type {
  DraftLiveState,
  EngineSignals,
} from "../useDraftLiveSocket";

// ---- Local types for queue/nomination features ----
// These may not yet exist on DraftLiveState (Plan 03 may add them).
// We extend via intersection to access optional queue/nomination fields.

export interface NominationQueueEntry {
  playerId: number;
  playerName: string;
  position?: string;
}

/** Extended state fields that the extension may relay for queue features */
interface QueueExtendedState {
  autoNominateMode?: boolean;
  skippedPlayerIds?: number[];
  espnNominationQueue?: NominationQueueEntry[];
}

type ExtendedDraftLiveState = DraftLiveState & QueueExtendedState;

// ---- Props ----

interface QueueTabProps {
  state: DraftLiveState | null;
  engineSignals: EngineSignals | null;
  sendControl: (action: string, payload?: unknown) => void;
  extensionConnected: boolean;
}

// ---- Helpers ----

function RiskBadge({ pressure }: { pressure: number }) {
  if (pressure > 0.75) {
    return (
      <span className="ml-2 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-800 text-red-200">
        HIGH RISK
      </span>
    );
  }
  if (pressure > 0.5) {
    return (
      <span className="ml-2 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-yellow-800 text-yellow-200">
        CAUTION
      </span>
    );
  }
  return (
    <span className="ml-2 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-green-900 text-green-300">
      SAFE
    </span>
  );
}

// ---- Component ----

export default function QueueTab({
  state,
  engineSignals,
  sendControl,
  extensionConnected,
}: QueueTabProps) {
  // Cast to extended state to access optional queue fields
  const extState = state as ExtendedDraftLiveState | null;

  const currentPlayer = state?.currentAuctionPlayer ?? null;
  const autoMode = state?.autoMode ?? false;
  const autoNominateMode = extState?.autoNominateMode ?? false;
  const skippedPlayerIds = extState?.skippedPlayerIds ?? [];
  const nominationQueue: NominationQueueEntry[] =
    extState?.espnNominationQueue ?? [];
  const budgetPressure =
    engineSignals?.budgetCurve?.budgetPressure ?? 0;

  const disabled = !extensionConnected;
  const disabledClass = disabled ? "opacity-50 pointer-events-none" : "";

  const hasCurrentPlayer =
    currentPlayer !== null && currentPlayer.playerId !== undefined;

  return (
    <div className="space-y-4">
      {/* ---- 1. Action Buttons ---- */}
      <div className="space-y-3">
        {/* Force Nominate */}
        <button
          type="button"
          onClick={() => sendControl("FORCE_NOMINATE")}
          disabled={disabled}
          className={`w-full min-h-[56px] rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-lg font-bold uppercase tracking-wide transition-colors ${disabledClass}`}
        >
          Force Nominate
        </button>

        {/* Skip Player */}
        <button
          type="button"
          onClick={() => {
            if (hasCurrentPlayer) {
              sendControl("SKIP_PLAYER", {
                playerId: currentPlayer!.playerId,
                playerName: currentPlayer!.playerName,
              });
            }
          }}
          disabled={disabled || !hasCurrentPlayer}
          className={`w-full min-h-[56px] rounded-xl bg-red-800 hover:bg-red-700 text-white text-lg font-bold uppercase tracking-wide transition-colors ${
            disabled || !hasCurrentPlayer
              ? "opacity-50 pointer-events-none"
              : ""
          }`}
        >
          {hasCurrentPlayer
            ? `Skip ${currentPlayer!.playerName}`
            : "No active nomination"}
        </button>
      </div>

      {/* ---- 2. Autopilot Controls ---- */}
      <div className="bg-neutral-900 rounded-xl p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-3">
          Autopilot Controls
        </p>
        <div className="grid grid-cols-2 gap-3">
          {/* Auto-Bid toggle */}
          <button
            type="button"
            onClick={() => sendControl("SET_AUTO_MODE", !autoMode)}
            disabled={disabled}
            className={`min-h-[56px] rounded-xl text-sm font-bold uppercase tracking-wide transition-colors ${disabledClass} ${
              autoMode
                ? "bg-red-700 hover:bg-red-600 text-white"
                : "bg-neutral-700 hover:bg-neutral-600 text-neutral-300"
            }`}
          >
            <span className="flex flex-col items-center gap-1">
              <span>Auto-Bid {autoMode ? "ON" : "OFF"}</span>
              <RiskBadge pressure={budgetPressure} />
            </span>
          </button>

          {/* Auto-Nominate toggle */}
          <button
            type="button"
            onClick={() =>
              sendControl("SET_AUTO_NOMINATE", !autoNominateMode)
            }
            disabled={disabled}
            className={`min-h-[56px] rounded-xl text-sm font-bold uppercase tracking-wide transition-colors ${disabledClass} ${
              autoNominateMode
                ? "bg-blue-700 hover:bg-blue-600 text-white"
                : "bg-neutral-700 hover:bg-neutral-600 text-neutral-300"
            }`}
          >
            Auto-Nominate {autoNominateMode ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      {/* ---- 3. Skipped Players ---- */}
      {skippedPlayerIds.length > 0 && (
        <div className="bg-neutral-900 rounded-xl p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-3">
            Skipped Players ({skippedPlayerIds.length})
          </p>
          <div className="space-y-1">
            {skippedPlayerIds.map((id) => (
              <div
                key={id}
                className="flex items-center justify-between bg-neutral-800 rounded-lg px-3 py-2"
              >
                <span className="text-sm text-neutral-300 font-mono">
                  Player #{id}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-neutral-600 mt-2">
            Skipped players are excluded from engine recommendations.
          </p>
        </div>
      )}

      {/* ---- 4. Nomination Queue ---- */}
      <div className="bg-neutral-900 rounded-xl p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-3">
          Nomination Queue
        </p>
        {nominationQueue.length > 0 ? (
          <div className="space-y-1">
            {nominationQueue.map((entry, i) => (
              <div
                key={entry.playerId}
                className="flex items-center gap-3 bg-neutral-800 rounded-lg px-3 py-2"
              >
                <span className="text-xs font-mono text-neutral-500 w-5 text-right">
                  {i + 1}
                </span>
                <span className="text-sm text-neutral-100 flex-1">
                  {entry.playerName}
                </span>
                {entry.position && (
                  <span className="text-xs text-neutral-500">
                    {entry.position}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-500 text-center py-3">
            No players in nomination queue. Use the ESPN draft page to add
            players to your queue.
          </p>
        )}
      </div>
    </div>
  );
}
