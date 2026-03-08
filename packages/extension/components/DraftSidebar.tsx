import React, { useEffect, useRef } from "react";
import { useDraftStore } from "../lib/draft-state";
import { useDraftEngineSignals } from "../lib/use-draft-engine";
import { autoBidController } from "../lib/auto-bid-controller";
import { useNarrator } from "../lib/use-narrator";
import { useNarratorStore } from "../lib/narrator-state";
import { calculateFgVsMarket, getValueColorClasses } from "../lib/value-detection";
import AuctionBudgetTracker from "./AuctionBudgetTracker";
import AuctionRecommendations from "./AuctionRecommendations";
import DraftNarrator from "./DraftNarrator";
import DraftRecommendations from "./DraftRecommendations";
import EngineInsights from "./EngineInsights";
import PositionScarcityAlerts from "./PositionScarcityAlerts";
import RosterSummary from "./RosterSummary";
import SnakeTurnPairs from "./SnakeTurnPairs";


export default function DraftSidebar() {
  const {
    sidebarVisible,
    toggleSidebar,
    leagueId,
    draftFormat,
    currentPick,
    myRoster,
    remainingBudget,
    rosterSize,
    configWarnings,
    dismissConfigWarnings,
    currentAuctionPlayer,
    rankings,
    auctionValues,
    espnDomAuctionValues,
    pitcherHitterSplit,
    setPitcherHitterSplit,
    autoMode,
    setAutoMode,
  } = useDraftStore();

  const engineSignals = useDraftEngineSignals();
  const { requestAdvice } = useNarrator(engineSignals);
  const sessionCallCount = useNarratorStore((state) => state.sessionCallCount);

  // Pipe latest engine signals into the AutoBidController so it can evaluate shouldBid/maxBid
  // without needing to call a React hook (controller runs outside React lifecycle)
  useEffect(() => {
    autoBidController.updateSignals(engineSignals);
  }, [engineSignals]);

  // Debounce ref for storage writes
  const storageWriteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Write engine signals and draft state to chrome.storage.local for background SW relay (debounced 150ms)
  useEffect(() => {
    if (storageWriteTimeoutRef.current) {
      clearTimeout(storageWriteTimeoutRef.current);
    }

    storageWriteTimeoutRef.current = setTimeout(() => {
      const storagePayload: Record<string, string> = {};

      // Engine signals (mobile-relevant subset)
      if (engineSignals) {
        storagePayload["draft-engine-signals"] = JSON.stringify({
          inflation: engineSignals.inflation
            ? {
                inflationFactor: engineSignals.inflation.inflationFactor,
                totalRemainingBudget: engineSignals.inflation.totalRemainingBudget,
                percentOverMarket: engineSignals.inflation.percentOverMarket,
              }
            : null,
          budgetCurve: engineSignals.budgetCurve
            ? {
                budgetPressure: engineSignals.budgetCurve.budgetPressure,
                maxBidRecommendation: engineSignals.budgetCurve.maxBidRecommendation,
                optimalRemainingSpend: engineSignals.budgetCurve.optimalRemainingSpend,
              }
            : null,
          alerts: engineSignals.alerts,
          optimization: engineSignals.optimization
            ? {
                maxBid: engineSignals.optimization.maxBid,
                expectedMarketPrice: engineSignals.optimization.expectedMarketPrice,
                valueSurplus: engineSignals.optimization.valueSurplus,
                shouldBid: engineSignals.optimization.shouldBid,
                simulationEV: engineSignals.optimization.simulationEV,
              }
            : null,
          simulation: engineSignals.simulation
            ? {
                winProbability: engineSignals.simulation.winProbability,
                currentDecision: engineSignals.simulation.currentDecision,
                computeTimeMs: engineSignals.simulation.computeTimeMs,
              }
            : null,
          remainingSlots: engineSignals.remainingSlots,
          computeTimeMs: engineSignals.computeTimeMs,
        });
      }

      // Key draft state fields for mobile context
      storagePayload["draft-mobile-state"] = JSON.stringify({
        currentAuctionPlayer,
        rosterLength: myRoster.length,
        roster: myRoster.map((p) => ({
          playerName: p.playerName,
          positions: p.positions,
          cost: p.cost,
        })),
        remainingBudget,
        autoMode,
        pitcherHitterSplit,
        draftFormat,
        picksLength: 0, // allPicks not destructured here — avoid heavy dep
        currentPick,
      });

      // Single write triggers one onChanged event → one WS message
      chrome.storage.local.set(storagePayload).catch((err) => {
        if (import.meta.env.DEV) {
          console.warn("[DraftSidebar] Failed to write mobile state to storage:", err);
        }
      });
    }, 150);

    return () => {
      if (storageWriteTimeoutRef.current) {
        clearTimeout(storageWriteTimeoutRef.current);
      }
    };
  }, [
    engineSignals,
    currentAuctionPlayer,
    myRoster,
    remainingBudget,
    autoMode,
    pitcherHitterSplit,
    draftFormat,
    currentPick,
  ]);

  const dispatchAssistantEvent = (eventName: string, detail?: unknown) => {
    const targetWindow =
      window.opener && !window.opener.closed ? window.opener : window;

    targetWindow.dispatchEvent(new CustomEvent(eventName, { detail }));
  };

  const handleRefresh = () => {
    dispatchAssistantEvent("espn-draft-assistant-refresh");
  };

  const handleDockLeft = () => {
    dispatchAssistantEvent("espn-draft-assistant-dock", { side: "left" });
  };

  const handleDockRight = () => {
    dispatchAssistantEvent("espn-draft-assistant-dock", { side: "right" });
  };

  const handlePopOut = () => {
    dispatchAssistantEvent("espn-draft-assistant-popout");
  };

  if (!sidebarVisible) {
    return (
      <button
        onClick={toggleSidebar}
        className="fixed top-4 right-4 bg-accent text-white px-3 py-2 rounded-lg shadow-lg hover:bg-accent-hover"
      >
        Show Assistant
      </button>
    );
  }

  return (
    <div className="h-full bg-white flex flex-col">
      {/* Header */}
      <div className="bg-surface-secondary text-content p-4 flex justify-between items-center border-b border-surface-tertiary">
        <div>
          <h1 className="text-base font-semibold text-content">ESPN Draft Assistant</h1>
          <p className="text-body-sm text-content-secondary">
            League {leagueId} • {draftFormat === "snake" ? "Snake" : "Auction"}{" "}
            Draft
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            className="text-content-secondary text-xs hover:bg-surface-tertiary px-2 py-1 rounded border border-surface-tertiary"
          >
            Refresh
          </button>
          <button
            onClick={handleDockLeft}
            className="text-content-secondary text-xs hover:bg-surface-tertiary px-2 py-1 rounded border border-surface-tertiary"
          >
            Left
          </button>
          <button
            onClick={handleDockRight}
            className="text-content-secondary text-xs hover:bg-surface-tertiary px-2 py-1 rounded border border-surface-tertiary"
          >
            Right
          </button>
          <button
            onClick={handlePopOut}
            className="text-content-secondary text-xs hover:bg-surface-tertiary px-2 py-1 rounded border border-surface-tertiary"
          >
            Pop Out
          </button>
          <button
            onClick={toggleSidebar}
            className="text-content-secondary hover:bg-surface-tertiary px-2 py-1 rounded"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Config Detection Warning Banner */}
      {configWarnings.length > 0 && (
        <div className="bg-warning-light border-l-4 border-warning p-4 relative">
          <button
            onClick={dismissConfigWarnings}
            className="absolute top-2 right-2 text-warning hover:text-warning/70 text-sm px-1"
            aria-label="Dismiss warnings"
          >
            ✕
          </button>
          <p className="text-sm text-warning pr-6">
            <strong>Warning:</strong> League config detection incomplete. Using 5x5 defaults.
          </p>
          <ul className="text-xs text-warning mt-2">
            {configWarnings.map((warning, i) => (
              <li key={i}>• {warning}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Draft Status */}
      <div className="bg-surface-secondary p-4 border-b border-surface-tertiary">
        <div className="flex justify-between text-sm">
          <span>Pick #{currentPick}</span>
          {draftFormat === "auction" && (
            <span className="font-semibold">
              ${remainingBudget} remaining
            </span>
          )}
        </div>
        <div className="mt-2 text-sm text-content-secondary">
          Roster: {myRoster.length} players
        </div>
        {draftFormat === "auction" && (
          <div className="mt-2 pt-2 border-t border-surface-tertiary">
            <div className="flex items-center justify-between text-body-xs mb-1">
              <span className="text-content-secondary">Hit/Pitch Split</span>
              <span className="font-semibold text-content">{pitcherHitterSplit}/{100 - pitcherHitterSplit}</span>
            </div>
            <input
              type="range"
              min={20}
              max={80}
              value={pitcherHitterSplit}
              onChange={(e) => setPitcherHitterSplit(Number(e.target.value))}
              className="w-full h-1.5 bg-surface-tertiary rounded-full appearance-none cursor-pointer accent-accent"
            />
            <div className="flex justify-between text-body-xs text-content-secondary mt-0.5">
              <span>Pitch</span>
              <span>Hit</span>
            </div>
          </div>
        )}
      </div>

      {/* Nominated Player Banner — fixed position, does not scroll */}
      {draftFormat === "auction" && currentAuctionPlayer && (
        <div className="p-4 bg-accent/5 border-b-2 border-accent">
          <div className="text-xs font-semibold tracking-wide text-accent uppercase mb-1">Now Nominated</div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-base font-semibold text-content">
                {currentAuctionPlayer.playerName}
              </div>
              {currentAuctionPlayer.positions && currentAuctionPlayer.positions.length > 0 && (
                <div className="text-body-sm text-content-secondary">
                  {currentAuctionPlayer.positions.join(" / ")}
                </div>
              )}
            </div>
            <div className="text-right">
              {currentAuctionPlayer.currentBid !== undefined && (
                <div>
                  <div className="text-xs text-content-secondary">Current Bid</div>
                  <div className="text-h3 font-display text-accent">
                    ${currentAuctionPlayer.currentBid}
                  </div>
                </div>
              )}
              {(() => {
                const matchedAuction = auctionValues.find(av =>
                  av.playerId === currentAuctionPlayer.playerId ||
                  av.playerName.toLowerCase() === currentAuctionPlayer.playerName.toLowerCase()
                );
                const matchedRanking = rankings.find(r =>
                  r.playerId === currentAuctionPlayer.playerId ||
                  r.playerName.toLowerCase() === currentAuctionPlayer.playerName.toLowerCase()
                );

                // Prefer DOM-scraped ESPN value for the nominated player
                const domEspnValue =
                  currentAuctionPlayer.playerId !== undefined
                    ? espnDomAuctionValues[currentAuctionPlayer.playerId]
                    : undefined;

                const fgValue = matchedAuction?.dollarValue;

                // Compute FG vs market badge when both values exist
                const fgBadge = (fgValue !== undefined && domEspnValue !== undefined)
                  ? calculateFgVsMarket(fgValue, domEspnValue)
                  : null;

                if (domEspnValue === undefined && fgValue === undefined && !matchedRanking?.tierName && !matchedRanking?.externalRank) return null;
                return (
                  <div className="mt-1 space-y-0.5">
                    {domEspnValue !== undefined ? (
                      <div>
                        <div className="text-xs text-content-secondary">Market Value</div>
                        <div className="font-semibold text-sm text-content">
                          ${domEspnValue}
                          <span className="ml-1 text-positive text-xs">(live)</span>
                        </div>
                        {fgBadge && (() => {
                          const colors = getValueColorClasses(fgBadge.color);
                          return (
                            <span className={`text-xs px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}>
                              {fgBadge.label}
                            </span>
                          );
                        })()}
                      </div>
                    ) : fgValue !== undefined ? (
                      <div>
                        <div className="text-xs text-content-secondary">FG Value</div>
                        <div className="font-semibold text-sm text-content">${fgValue}</div>
                      </div>
                    ) : null}
                    {(matchedRanking?.tierName || matchedRanking?.externalRank) && (
                      <div className="flex items-center gap-1 justify-end">
                        {matchedRanking.tierName && (
                          <span className="text-xs bg-surface-tertiary text-content-secondary px-1.5 py-0.5 rounded">
                            {matchedRanking.tierName}
                          </span>
                        )}
                        {matchedRanking.externalRank && (
                          <span className="text-xs text-content-secondary">
                            {matchedRanking.rankSource || "PL"} #{matchedRanking.externalRank}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

        </div>
      )}

      {/* Auto-Pilot toggle — always visible during auction drafts */}
      {draftFormat === "auction" && (
        <div className="px-4 py-2 bg-surface-secondary border-b border-surface-tertiary">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-body-xs font-semibold text-content">Auto-Pilot</span>
              {autoMode && currentAuctionPlayer && engineSignals?.optimization && (
                <span className="text-body-xs text-content-secondary">
                  (max ${engineSignals.optimization.maxBid})
                </span>
              )}
            </div>
            <button
              onClick={() => setAutoMode(!autoMode)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                autoMode ? "bg-accent" : "bg-surface-tertiary"
              }`}
              role="switch"
              aria-checked={autoMode}
              aria-label="Toggle auto-pilot"
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  autoMode ? "translate-x-[18px]" : "translate-x-[2px]"
                }`}
              />
            </button>
          </div>
          {autoMode && (
            currentAuctionPlayer ? (
              <div className="mt-1 text-body-xs text-warning">
                Auto-pilot: bidding +1 up to engine max bid
              </div>
            ) : (
              <div className="mt-1 text-body-xs text-accent">
                Waiting to nominate...
              </div>
            )
          )}
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        {draftFormat === "auction" ? (
          <>
            {/* AI Advisor -- narrator above data-dense engine signals */}
            <DraftNarrator
              onAskAdvice={requestAdvice}
              sessionCallCount={sessionCallCount}
            />
            <AuctionBudgetTracker engineSignals={engineSignals} />
            <EngineInsights engineSignals={engineSignals} />
            <PositionScarcityAlerts />
            <AuctionRecommendations />
          </>
        ) : (
          <>
            <RosterSummary />
            <PositionScarcityAlerts />
            <SnakeTurnPairs />
            <DraftRecommendations />
          </>
        )}
      </div>

      {/* DEV-only performance indicator */}
      {import.meta.env.DEV && engineSignals && (
        <div className="text-body-xs text-content-secondary p-2 border-t border-surface-tertiary">
          Engine: {engineSignals.computeTimeMs}ms
        </div>
      )}
    </div>
  );
}
