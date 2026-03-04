import React, { useMemo } from "react";
import { useDraftStore } from "../lib/draft-state";
import { computePositionScarcity, type PositionScarcityAlert } from "../lib/position-scarcity";

function AlertBadge({ alert }: { alert: PositionScarcityAlert }) {
  const isCritical = alert.severity === "critical";

  const bgClass = isCritical ? "bg-negative-light" : "bg-warning-light";
  const borderClass = isCritical ? "border-negative" : "border-warning";
  const textClass = isCritical ? "text-negative" : "text-warning";
  const needsHighlight = alert.myTeamNeeds
    ? "ring-1 ring-accent"
    : "";

  return (
    <div
      className={`${bgClass} ${borderClass} ${needsHighlight} border rounded px-2.5 py-1.5 text-body-xs`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`font-semibold ${textClass}`}>
          {alert.position}
          {alert.myTeamNeeds && (
            <span className="ml-1 text-accent font-normal">(you need)</span>
          )}
        </span>
        <span className={`${textClass} whitespace-nowrap`}>
          {alert.topPlayersLeft === 0
            ? "no elite left"
            : `${alert.topPlayersLeft} elite left`}
        </span>
      </div>
      <div className="text-content-secondary text-body-xs mt-0.5">
        {alert.teamsNeeding} teams need &middot; {alert.totalAvailable} total available
      </div>
    </div>
  );
}

export default function PositionScarcityAlerts() {
  const {
    rankings,
    allPicks,
    teamRosters,
    totalTeams,
    myRoster,
    myTeamId,
  } = useDraftStore();

  const alerts = useMemo(
    () =>
      computePositionScarcity(
        rankings,
        allPicks,
        teamRosters,
        totalTeams,
        myRoster,
        myTeamId,
      ),
    [rankings, allPicks, teamRosters, totalTeams, myRoster, myTeamId],
  );

  if (alerts.length === 0) {
    return null;
  }

  return (
    <div className="p-3 border-b border-surface-tertiary">
      <h3 className="text-body-sm font-semibold text-content mb-2">
        Position Scarcity
      </h3>
      <div className="space-y-1.5">
        {alerts.map((alert) => (
          <AlertBadge key={alert.position} alert={alert} />
        ))}
      </div>
    </div>
  );
}
