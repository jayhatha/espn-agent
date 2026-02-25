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
        className="fixed top-4 right-4 bg-blue-600 text-white px-3 py-2 rounded-lg shadow-lg hover:bg-blue-700"
      >
        Show Assistant
      </button>
    );
  }

  return (
    <div className="h-full bg-white flex flex-col">
      {/* Header */}
      <div className="bg-blue-600 text-white p-4 flex justify-between items-center">
        <div>
          <h1 className="text-lg font-bold">ESPN Draft Assistant</h1>
          <p className="text-sm opacity-90">
            League {leagueId} • {draftFormat === "snake" ? "Snake" : "Auction"}{" "}
            Draft
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            className="text-white text-xs hover:bg-blue-700 px-2 py-1 rounded border border-blue-300"
          >
            Refresh
          </button>
          <button
            onClick={handleDockLeft}
            className="text-white text-xs hover:bg-blue-700 px-2 py-1 rounded border border-blue-300"
          >
            Left
          </button>
          <button
            onClick={handleDockRight}
            className="text-white text-xs hover:bg-blue-700 px-2 py-1 rounded border border-blue-300"
          >
            Right
          </button>
          <button
            onClick={handlePopOut}
            className="text-white text-xs hover:bg-blue-700 px-2 py-1 rounded border border-blue-300"
          >
            Pop Out
          </button>
          <button
            onClick={toggleSidebar}
            className="text-white hover:bg-blue-700 px-2 py-1 rounded"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Config Detection Warning Banner */}
      {configWarnings.length > 0 && (
        <div className="bg-yellow-100 border-l-4 border-yellow-500 p-4">
          <p className="text-sm text-yellow-700">
            <strong>Warning:</strong> League config detection incomplete. Using 5x5 defaults.
          </p>
          <ul className="text-xs text-yellow-600 mt-2">
            {configWarnings.map((warning, i) => (
              <li key={i}>• {warning}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Draft Status */}
      <div className="bg-gray-100 p-4 border-b">
        <div className="flex justify-between text-sm">
          <span>Pick #{currentPick}</span>
          {draftFormat === "auction" && (
            <span className="font-semibold">
              ${pacing.remainingBudget} remaining
            </span>
          )}
        </div>
        <div className="mt-2 text-sm text-gray-600">
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
