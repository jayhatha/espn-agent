import React from "react";
import { useDraftStore } from "../lib/draft-state";
import { calculateBudgetPacing } from "../lib/value-calculations";
import AuctionBudgetTracker from "./AuctionBudgetTracker";
import AuctionRecommendations from "./AuctionRecommendations";
import DraftRecommendations from "./DraftRecommendations";
import PickValueTracker from "./PickValueTracker";
import ProjectedStandingsPanel from "./ProjectedStandingsPanel";
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
        <div className="bg-warning-light border-l-4 border-warning p-4">
          <p className="text-sm text-warning">
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

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        <ProjectedStandingsPanel />
        {draftFormat === "auction" ? (
          <>
            <AuctionBudgetTracker />
            <AuctionRecommendations />
            <PickValueTracker />
          </>
        ) : (
          <>
            <RosterSummary />
            <SnakeTurnPairs />
            <DraftRecommendations />
            <PickValueTracker />
          </>
        )}
      </div>
    </div>
  );
}
