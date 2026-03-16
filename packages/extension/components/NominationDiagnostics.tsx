import React, { useState, useEffect } from "react";
import { autoBidController } from "../lib/auto-bid-controller";
import type { NominationDiagnostics as NominationDiagnosticsState } from "../lib/auto-bid-controller";

/**
 * NominationDiagnostics — live nomination controller status panel.
 *
 * Polls autoBidController.getNominationDiagnostics() every 500ms since the
 * controller state is not reactive (not Zustand). Shows nomination readiness,
 * last candidate, turn detection result, attempt counter, cooldown, and a
 * Force Nominate button.
 *
 * Only visible in auction drafts. Start collapsed — click to expand.
 */
export default function NominationDiagnostics() {
  const [diag, setDiag] = useState<NominationDiagnosticsState | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // Initial poll
    setDiag(autoBidController.getNominationDiagnostics());

    const interval = setInterval(() => {
      setDiag(autoBidController.getNominationDiagnostics());
    }, 500);

    return () => clearInterval(interval);
  }, []);

  if (!diag) return null;

  // Derive status line
  const getStatusLabel = (): string => {
    if (!diag.autoMode) return "Auto-pilot OFF";
    if (diag.currentAuctionPlayer != null) return "Auction active";
    if (diag.nominationAttempts >= diag.maxAttempts) return "Backed off (max attempts)";
    if (diag.cooldownRemainingMs > 0) return `Cooldown (${Math.ceil(diag.cooldownRemainingMs / 1000)}s)`;
    return "Waiting to nominate...";
  };

  const statusLabel = getStatusLabel();
  const isActive = diag.isActive;
  const attemptsAtMax = diag.nominationAttempts >= diag.maxAttempts;

  const handleForceNominate = () => {
    autoBidController.forceNominate();
  };

  return (
    <div className="border-b border-grafana-border bg-grafana-panel">
      {/* Collapsed summary row — always visible */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-4 py-1.5 text-left hover:bg-grafana-border/50 transition-colors"
      >
        <div className="flex items-center gap-1.5">
          <span className="text-body-xs text-grafana-muted uppercase tracking-wide">Nomination</span>
          <span
            className={`text-label font-semibold ${
              !diag.autoMode
                ? "text-grafana-muted"
                : isActive
                ? "text-grafana-info"
                : attemptsAtMax
                ? "text-grafana-negative"
                : "text-grafana-text"
            }`}
          >
            {statusLabel}
          </span>
          {diag.lastTurnDetectionResult.matched &&
            diag.lastTurnDetectionResult.turnStrategyType === "fallback" && (
              <span className="text-grafana-warning text-body-xs" title="Turn detected via UNTESTED fallback selector">
                ⚠
              </span>
            )}
        </div>
        <span className="text-body-xs text-grafana-muted">{expanded ? "▲" : "▼"}</span>
      </button>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="px-4 pb-3 space-y-1.5">
          {/* Candidate */}
          <div className="flex items-start justify-between">
            <span className="text-body-xs text-grafana-muted w-24 shrink-0">Candidate</span>
            <span className="text-body-xs text-grafana-text text-right">
              {diag.lastCandidateName
                ? <>
                    {diag.lastCandidateName}{" "}
                    <span className={diag.lastCandidateSource === 'queue' ? 'text-grafana-positive font-semibold' : ''}>
                      ({diag.lastCandidateSource ?? "unknown"})
                    </span>
                  </>
                : "None"}
            </span>
          </div>

          {/* Turn detection */}
          <div className="flex items-start justify-between">
            <span className="text-body-xs text-grafana-muted w-24 shrink-0">Turn</span>
            <span className="text-body-xs text-grafana-text text-right">
              {diag.lastTurnDetectionResult.matched ? (
                <>
                  {diag.lastTurnDetectionResult.strategy?.replace(/\s*\[.*?\]/g, "")}
                  {diag.lastTurnDetectionResult.turnStrategyType === "fallback" && (
                    <span
                      className="ml-1 text-grafana-warning text-body-xs font-semibold"
                      title="UNTESTED fallback strategy fired — verify selector in SELECTOR-MAP.md"
                    >
                      [UNTESTED]
                    </span>
                  )}
                  {diag.lastTurnDetectionResult.turnStrategyType === "primary" && (
                    <span className="ml-1 text-grafana-positive text-body-xs">✓</span>
                  )}
                </>
              ) : (
                `Not detected (checked ${diag.lastTurnDetectionResult.strategiesChecked.length} strategies)`
              )}
            </span>
          </div>

          {/* Attempts */}
          <div className="flex items-center justify-between">
            <span className="text-body-xs text-grafana-muted w-24 shrink-0">Attempts</span>
            <span
              className={`text-body-xs font-semibold ${
                attemptsAtMax ? "text-grafana-negative" : "text-grafana-positive"
              }`}
            >
              {diag.nominationAttempts}/{diag.maxAttempts}
            </span>
          </div>

          {/* Cooldown */}
          <div className="flex items-center justify-between">
            <span className="text-body-xs text-grafana-muted w-24 shrink-0">Cooldown</span>
            <span className="text-body-xs text-grafana-text">
              {diag.cooldownRemainingMs > 0
                ? `${Math.ceil(diag.cooldownRemainingMs / 1000)}s remaining`
                : "Ready"}
            </span>
          </div>

          {/* Queue population */}
          <div className="flex items-center justify-between">
            <span className="text-body-xs text-grafana-muted w-24 shrink-0">Queue</span>
            <span className="text-body-xs text-grafana-text">
              {diag.queuePopulationCount > 0
                ? `${diag.queuePopulationCount} queued this session`
                : "Empty"}
              {diag.lastQueuePopulateTime != null && (
                <span className="text-body-xs text-grafana-muted ml-1">
                  ({Math.round((Date.now() - diag.lastQueuePopulateTime) / 1000)}s ago)
                </span>
              )}
            </span>
          </div>

          {/* Last result */}
          {diag.lastAttemptResult && (
            <div className="flex items-start justify-between">
              <span className="text-body-xs text-grafana-muted w-24 shrink-0">Last result</span>
              <span className="text-body-xs text-grafana-text text-right">{diag.lastAttemptResult}</span>
            </div>
          )}

          {/* Force Nominate button — only when auto-pilot is ON */}
          {diag.autoMode && (
            <button
              onClick={handleForceNominate}
              className="mt-1 text-xs bg-grafana-info text-white px-2 py-1 rounded hover:bg-grafana-info/80 w-full"
            >
              Force Nominate
            </button>
          )}
        </div>
      )}
    </div>
  );
}
