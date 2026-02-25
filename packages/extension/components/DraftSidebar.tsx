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
