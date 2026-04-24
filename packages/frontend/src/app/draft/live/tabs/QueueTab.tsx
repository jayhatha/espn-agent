"use client";

import type {
  DraftLiveState,
  EngineSignals,
  ControlActionMap,
  ControlActionName,
  NominationQueueEntry,
} from "../useDraftLiveSocket";

// ---- Props ----

interface QueueTabProps {
  state: DraftLiveState | null;
  engineSignals: EngineSignals | null;
  sendControl: <A extends ControlActionName>(
    action: A,
    ...args: ControlActionMap[A] extends undefined ? [] : [ControlActionMap[A]]
  ) => void;
  extensionConnected: boolean;
}

// ---- Helpers ----

function RiskBadge({ pressure }: { pressure: number }) {
  if (pressure > 0.75) {
    return (
      <span className="ml-2 text-caption font-bold uppercase px-1.5 py-0.5 rounded bg-grafana-negative text-grafana-text">
        HIGH RISK
      </span>
    );
  }
  if (pressure > 0.5) {
    return (
      <span className="ml-2 text-caption font-bold uppercase px-1.5 py-0.5 rounded bg-grafana-warning text-grafana-text">
        CAUTION
      </span>
    );
  }
  return (
    <span className="ml-2 text-caption font-bold uppercase px-1.5 py-0.5 rounded bg-grafana-positive text-positive-dark">
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
  const currentPlayer = state?.currentAuctionPlayer ?? null;
  const autoMode = state?.autoMode ?? false;
  const autoNominateMode = state?.autoNominateMode ?? false;
  const skippedPlayerIds = state?.skippedPlayerIds ?? [];
  const nominationQueue: NominationQueueEntry[] =
    state?.espnNominationQueue ?? [];
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
          className={`w-full min-h-[56px] rounded-xl bg-info hover:bg-info/80 text-white text-lg font-bold uppercase tracking-wide transition-colors ${disabledClass}`}
        >
          Force Nominate
        </button>

        {/* Skip Player */}
        <button
          type="button"
          onClick={() => {
            if (currentPlayer?.playerId !== undefined) {
              sendControl("SKIP_PLAYER", {
                playerId: currentPlayer.playerId!,
                playerName: currentPlayer.playerName,
              });
            }
          }}
          disabled={disabled || !hasCurrentPlayer}
          className={`w-full min-h-[56px] rounded-xl bg-grafana-negative hover:bg-grafana-negative/80 text-white text-lg font-bold uppercase tracking-wide transition-colors ${
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
      <div className="bg-grafana-bg rounded-xl p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-grafana-muted mb-3">
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
                ? "bg-grafana-negative hover:bg-grafana-negative/80 text-white"
                : "bg-grafana-border hover:bg-grafana-border/80 text-grafana-muted"
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
                ? "bg-info hover:bg-info/80 text-white"
                : "bg-grafana-border hover:bg-grafana-border/80 text-grafana-muted"
            }`}
          >
            Auto-Nominate {autoNominateMode ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      {/* ---- 3. Skipped Players ---- */}
      {skippedPlayerIds.length > 0 && (
        <div className="bg-grafana-bg rounded-xl p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-grafana-muted mb-3">
            Skipped Players ({skippedPlayerIds.length})
          </p>
          <div className="space-y-1">
            {skippedPlayerIds.map((id) => (
              <div
                key={id}
                className="flex items-center justify-between bg-grafana-panel rounded-lg px-3 py-2"
              >
                <span className="text-sm text-grafana-muted font-mono">
                  Player #{id}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-grafana-muted mt-2">
            Skipped players are excluded from engine recommendations.
          </p>
        </div>
      )}

      {/* ---- 4. Nomination Queue ---- */}
      <div className="bg-grafana-bg rounded-xl p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-grafana-muted mb-3">
          Nomination Queue
        </p>
        {nominationQueue.length > 0 ? (
          <div className="space-y-1">
            {nominationQueue.map((entry, i) => (
              <div
                key={entry.playerId}
                className="flex items-center gap-3 bg-grafana-panel rounded-lg px-3 py-2"
              >
                <span className="text-xs font-mono text-grafana-muted w-5 text-right">
                  {i + 1}
                </span>
                <span className="text-sm text-grafana-text flex-1">
                  {entry.playerName}
                </span>
                {entry.position && (
                  <span className="text-xs text-grafana-muted">
                    {entry.position}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-grafana-muted text-center py-3">
            No players in nomination queue. Use the ESPN draft page to add
            players to your queue.
          </p>
        )}
      </div>
    </div>
  );
}
