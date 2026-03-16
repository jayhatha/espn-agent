import React, { useEffect, useRef, useMemo } from "react";
import { useDraftStore } from "../lib/draft-state";
import { useDraftEngineSignals } from "../lib/use-draft-engine";
import { autoBidController } from "../lib/auto-bid-controller";
import AuctionRecommendations from "./AuctionRecommendations";
import BidVerdict from "./BidVerdict";
import CategoryHeatmap from "./CategoryHeatmap";
import DraftRecommendations from "./DraftRecommendations";
import EngineInsights from "./EngineInsights";
import NextNominee from "./NextNominee";
import NominationDiagnostics from "./NominationDiagnostics";
import PositionSupplyHeatmap from "./PositionSupplyHeatmap";
import RosterSummary from "./RosterSummary";
import SignalStrip from "./SignalStrip";
import SnakeTurnPairs from "./SnakeTurnPairs";
import { ErrorBoundary } from "./ErrorBoundary";


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
    pitcherHitterSplit,
    autoMode,
    setAutoMode,
    espnNominationQueue,
    autoNominateMode,
    skippedPlayerIds,
    allPicks,
    leagueCategories,
    myTeamId,
    detectedRosterSlots,
  } = useDraftStore();

  const engineSignals = useDraftEngineSignals();

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
          idealRoster: engineSignals.idealRoster
            ? {
                players: engineSignals.idealRoster.players.map((p) => ({
                  name: p.name,
                  positions: p.positions,
                  dollars: p.dollars,
                  tier: p.tier,
                  slot: p.slot,
                  isDrafted: p.isDrafted,
                  externalRank: p.externalRank,
                })),
                totalSGPValue: engineSignals.idealRoster.totalSGPValue,
                budgetUsed: engineSignals.idealRoster.budgetUsed,
                unfilledSlots: engineSignals.idealRoster.unfilledSlots,
                anchorCount: engineSignals.idealRoster.anchorCount,
                coreCount: engineSignals.idealRoster.coreCount,
                valueCount: engineSignals.idealRoster.valueCount,
                categoryProgress: engineSignals.idealRoster.categoryProgress,
              }
            : null,
          scarcity: engineSignals.scarcity
            ? engineSignals.scarcity
                .filter((s) => s.scarcityIndex > 0.3)
                .map((s) => ({
                  position: s.position,
                  supply: s.supply,
                  demand: s.demand,
                  tierDropValue: s.tierDropValue,
                  scarcityIndex: s.scarcityIndex,
                }))
            : null,
          // TODO: wire BuildArchetypeSignal when available
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
        espnNominationQueue,
        autoNominateMode,
        skippedPlayerIds,
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
    espnNominationQueue,
    autoNominateMode,
    skippedPlayerIds,
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

  // Value captured running total (header)
  const valueCaptured = useMemo(() => {
    return myRoster.reduce((sum, p) => {
      const marketVal = p.playerId !== undefined
        ? (auctionValues.find(av => av.playerId === p.playerId)?.dollarValue ?? 0)
        : 0;
      return sum + (marketVal - (p.cost ?? 0));
    }, 0);
  }, [myRoster, auctionValues]);

  // SP count for signal strip
  const spCount = myRoster.filter(p =>
    p.positions?.some(pos => pos.toUpperCase().includes('SP'))
  ).length;
  const totalSpSlots = detectedRosterSlots?.SP ?? 5;

  // Next nominee derivation
  const nextNominee = engineSignals?.simulation?.nominationStrategy?.[0] ?? null;

  // Nominating state (per research pattern)
  const isNominating = autoMode && !currentAuctionPlayer && nextNominee != null;

  if (!sidebarVisible) {
    return (
      <button
        onClick={toggleSidebar}
        className="fixed top-4 right-4 bg-grafana-info text-white px-3 py-2 rounded-lg shadow-lg hover:bg-grafana-info/80"
      >
        Show Assistant
      </button>
    );
  }

  return (
    <div className="h-full bg-grafana-bg flex flex-col">
      {/* Header */}
      <div className="bg-grafana-panel border-b border-grafana-border p-3 flex justify-between items-start">
        <div>
          <h1 className="text-base font-semibold text-grafana-text">ESPN Draft Assistant</h1>
          <p className="text-body-sm text-grafana-muted">
            League {leagueId} &bull; {draftFormat === "snake" ? "Snake" : "Auction"}{" "}
            Draft
          </p>
          {draftFormat === "auction" && (
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-h3 text-grafana-text">${remainingBudget}</span>
              <span className="text-grafana-muted text-body-xs">remaining</span>
              {valueCaptured !== 0 && (
                <span className={`text-body-xs font-semibold ${valueCaptured >= 0 ? "text-grafana-positive" : "text-grafana-negative"}`}>
                  {valueCaptured >= 0 ? "+" : "-"}${Math.abs(Math.round(valueCaptured))} value
                </span>
              )}
              <span className="text-grafana-muted text-body-xs">{myRoster.length} rostered</span>
            </div>
          )}
          {draftFormat === "snake" && (
            <div className="mt-1 text-body-xs text-grafana-muted">Pick #{currentPick} &bull; {myRoster.length} rostered</div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            className="text-grafana-muted text-xs hover:bg-grafana-border px-2 py-1 rounded border border-grafana-border"
          >
            Refresh
          </button>
          <button
            onClick={handleDockLeft}
            className="text-grafana-muted text-xs hover:bg-grafana-border px-2 py-1 rounded border border-grafana-border"
          >
            Left
          </button>
          <button
            onClick={handleDockRight}
            className="text-grafana-muted text-xs hover:bg-grafana-border px-2 py-1 rounded border border-grafana-border"
          >
            Right
          </button>
          <button
            onClick={handlePopOut}
            className="text-grafana-muted text-xs hover:bg-grafana-border px-2 py-1 rounded border border-grafana-border"
          >
            Pop Out
          </button>
          <button
            onClick={toggleSidebar}
            className="text-grafana-muted hover:bg-grafana-border px-2 py-1 rounded"
          >
            &#10005;
          </button>
        </div>
      </div>

      {/* Config Detection Warning Banner */}
      {configWarnings.length > 0 && (
        <div className="bg-grafana-warning/10 border-l-4 border-grafana-warning p-4 relative">
          <button
            onClick={dismissConfigWarnings}
            className="absolute top-2 right-2 text-grafana-warning hover:text-grafana-warning/70 text-sm px-1"
            aria-label="Dismiss warnings"
          >
            &#10005;
          </button>
          <p className="text-sm text-grafana-warning pr-6">
            <strong>Warning:</strong> League config detection incomplete. Using 5x5 defaults.
          </p>
          <ul className="text-xs text-grafana-warning mt-2">
            {configWarnings.map((warning, i) => (
              <li key={i}>&bull; {warning}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Auto-Pilot toggle — auction only, above scroll area */}
      {draftFormat === "auction" && (
        <div className="px-4 py-2 bg-grafana-panel border-b border-grafana-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-body-xs font-semibold text-grafana-text">Auto-Pilot</span>
              {autoMode && currentAuctionPlayer && engineSignals?.optimization && (
                <span className="text-body-xs text-grafana-muted">
                  (max ${engineSignals.optimization.maxBid})
                </span>
              )}
            </div>
            <button
              onClick={() => setAutoMode(!autoMode)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                autoMode ? "bg-grafana-positive" : "bg-grafana-border"
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
              <div className="mt-1 text-body-xs text-grafana-warning">
                Auto-pilot: bidding +1 up to engine max bid
              </div>
            ) : (
              <div className="mt-1 text-body-xs text-grafana-positive">
                Waiting to nominate...
              </div>
            )
          )}
        </div>
      )}

      {/* Nominated Player Banner + BidVerdict — auction only, fixed above scroll */}
      {draftFormat === "auction" && currentAuctionPlayer && (() => {
        const matchedAuction = auctionValues.find(av =>
          av.playerId === currentAuctionPlayer.playerId ||
          av.playerName.toLowerCase() === currentAuctionPlayer.playerName.toLowerCase()
        );

        const marketVal = matchedAuction?.dollarValue;

        // Derive tier badge from market value
        const tierLabel = marketVal !== undefined
          ? (marketVal > 20 ? "anchor" : marketVal >= 5 ? "core" : "value")
          : null;

        const tierBadgeClass = tierLabel === "anchor"
          ? "bg-grafana-warning/20 text-grafana-warning"
          : tierLabel === "core"
          ? "bg-grafana-info/20 text-grafana-info"
          : "bg-grafana-border text-grafana-muted";

        return (
          <div className="bg-grafana-panel/50 border-b-2 border-grafana-border px-4 py-3">
            <div className="text-body-xs text-grafana-muted uppercase tracking-wide mb-1">Now Nominated</div>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-body-sm font-semibold text-grafana-text">
                  {currentAuctionPlayer.playerName}
                </div>
                {currentAuctionPlayer.positions && currentAuctionPlayer.positions.length > 0 && (
                  <div className="text-grafana-muted text-body-xs">
                    {currentAuctionPlayer.positions.join(" / ")}
                  </div>
                )}
                {tierLabel && (
                  <span className={`mt-1 inline-block text-label font-semibold px-1.5 py-0.5 rounded ${tierBadgeClass}`}>
                    {tierLabel}
                  </span>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                {currentAuctionPlayer.currentBid !== undefined && (
                  <div>
                    <div className="text-xs text-grafana-muted">Current Bid</div>
                    <div className="text-h3 text-grafana-info">
                      ${currentAuctionPlayer.currentBid}
                    </div>
                  </div>
                )}
                <div className="mt-1">
                  <div className="text-xs text-grafana-muted">Market</div>
                  <div className="font-semibold text-sm text-grafana-text">
                    {marketVal !== undefined ? `$${marketVal}` : "--"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* BidVerdict — consolidated bid/pass decision card, auction only */}
      {draftFormat === "auction" && (
        <ErrorBoundary sectionName="Bid Verdict">
          <BidVerdict engineSignals={engineSignals} />
        </ErrorBoundary>
      )}

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        {draftFormat === "auction" ? (
          <>
            {/* Signal Strip */}
            <ErrorBoundary sectionName="Signal Strip">
              <SignalStrip
                endgameMode={engineSignals?.budgetCurve?.endgameMode ?? false}
                inflationBand={engineSignals?.inflation?.inflationBand ?? 'neutral'}
                hitterSpent={engineSignals?.budgetCurve?.hitterSpent ?? 0}
                pitcherSpent={engineSignals?.budgetCurve?.pitcherSpent ?? 0}
                spCount={spCount}
                totalSpSlots={totalSpSlots}
              />
            </ErrorBoundary>

            {/* Next Nominee */}
            <ErrorBoundary sectionName="Next Nominee">
              <NextNominee nominee={nextNominee} isNominating={isNominating} />
            </ErrorBoundary>

            {/* Nomination Diagnostics — kept collapsed below NextNominee */}
            <ErrorBoundary sectionName="Nomination Diagnostics">
              <NominationDiagnostics />
            </ErrorBoundary>

            {/* Category Heatmap */}
            <ErrorBoundary sectionName="Category Heatmap">
              <CategoryHeatmap
                projectedStandings={engineSignals?.projectedStandings ?? null}
                myTeamId={myTeamId}
                leagueCategories={leagueCategories}
              />
            </ErrorBoundary>

            {/* Position Supply Heatmap */}
            <ErrorBoundary sectionName="Position Supply">
              <PositionSupplyHeatmap rankings={rankings} allPicks={allPicks} />
            </ErrorBoundary>

            {/* Engine Insights (wraps IdealRosterPanel) */}
            <ErrorBoundary sectionName="Engine Insights">
              <EngineInsights engineSignals={engineSignals} />
            </ErrorBoundary>

            {/* Auction Recommendations */}
            <ErrorBoundary sectionName="Auction Recommendations">
              <AuctionRecommendations />
            </ErrorBoundary>
          </>
        ) : (
          <>
            <ErrorBoundary sectionName="Roster Summary">
              <RosterSummary />
            </ErrorBoundary>
            <ErrorBoundary sectionName="Snake Turn Pairs">
              <SnakeTurnPairs />
            </ErrorBoundary>
            <ErrorBoundary sectionName="Draft Recommendations">
              <DraftRecommendations />
            </ErrorBoundary>
          </>
        )}
      </div>

      {/* DEV-only performance indicator */}
      {import.meta.env.DEV && engineSignals && (
        <div className="text-body-xs text-grafana-muted p-2 border-t border-grafana-border">
          Engine: {engineSignals.computeTimeMs}ms
        </div>
      )}
    </div>
  );
}
