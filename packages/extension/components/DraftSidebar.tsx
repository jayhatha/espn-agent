import React from "react";
import { useDraftStore } from "../lib/draft-state";
import { calculateBudgetPacing } from "../lib/value-calculations";
import AuctionBudgetTracker from "./AuctionBudgetTracker";
import AuctionRecommendations from "./AuctionRecommendations";
import DraftRecommendations from "./DraftRecommendations";
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
    rosterSize,
    configWarnings,
    dismissConfigWarnings,
    currentAuctionPlayer,
    rankings,
    auctionValues,
  } = useDraftStore();

  const pacing = calculateBudgetPacing(260, myRoster, rosterSize);

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
              ${pacing.remainingBudget} remaining
            </span>
          )}
        </div>
        <div className="mt-2 text-sm text-content-secondary">
          Roster: {myRoster.length} players
        </div>
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
                if (!matchedAuction && !matchedRanking?.tierName && !matchedRanking?.externalRank) return null;
                return (
                  <div className="mt-1 space-y-0.5">
                    {matchedAuction?.dollarValue !== undefined && (
                      <div className="text-xs text-content-secondary">
                        ESPN Value: <span className="font-semibold">${matchedAuction.dollarValue}</span>
                      </div>
                    )}
                    {(matchedRanking?.tierName || matchedRanking?.externalRank) && (
                      <div className="flex items-center gap-1 justify-end">
                        {matchedRanking.tierName && (
                          <span className="text-xs bg-surface-tertiary text-content-secondary px-1.5 py-0.5 rounded">
                            {matchedRanking.tierName}
                          </span>
                        )}
                        {matchedRanking.externalRank && (
                          <span className="text-xs text-content-secondary">
                            PL #{matchedRanking.externalRank}
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

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        {draftFormat === "auction" ? (
          <>
            <AuctionBudgetTracker />
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
    </div>
  );
}
