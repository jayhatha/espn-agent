import React from "react";
import type { DraftAlert } from "../lib/engine";

interface AlertBadgeProps {
  alert: DraftAlert;
}

function AlertBadge({ alert }: AlertBadgeProps) {
  const colorMap: Record<DraftAlert["type"], string> = {
    inflation: "bg-info-light border-info-border text-info",
    scarcity: "bg-negative-light border-negative text-negative",
    category_gap: "bg-warning-light border-warning text-warning",
    budget: "bg-info-light border-info-border text-info",
    tier_break: "bg-negative-light border-negative text-negative",
  };

  const severityBarColor =
    alert.severity >= 0.85 ? "bg-negative" :
    alert.severity >= 0.75 ? "bg-warning" :
    "bg-info";

  const colorClasses = colorMap[alert.type];

  return (
    <div className={`${colorClasses} border rounded px-2.5 py-1.5 text-body-xs`}>
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <span className="font-semibold text-body-xs">{alert.title}</span>
        <span className="text-body-xs opacity-70 whitespace-nowrap">
          {Math.round(alert.severity * 100)}%
        </span>
      </div>
      <div className="text-body-xs opacity-80 mb-1">{alert.detail}</div>
      {/* Severity bar */}
      <div className="w-full bg-black/10 rounded-full h-1">
        <div
          className={`${severityBarColor} h-1 rounded-full`}
          style={{ width: `${Math.round(alert.severity * 100)}%` }}
        />
      </div>
    </div>
  );
}

interface EngineAlertsProps {
  alerts: DraftAlert[];
}

export default function EngineAlerts({ alerts }: EngineAlertsProps) {
  // Only render alerts above the severity threshold (already filtered by engine,
  // but we double-check here for safety)
  const visibleAlerts = alerts.filter((a) => a.severity > 0.65);

  if (visibleAlerts.length === 0) {
    return null;
  }

  return (
    <div className="p-3 border-b border-surface-tertiary">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-body-sm font-semibold text-content">Engine Alerts</h3>
        <span className="bg-negative text-white text-body-xs font-semibold px-1.5 py-0.5 rounded-full leading-none">
          {visibleAlerts.length}
        </span>
      </div>
      <div className="space-y-1.5">
        {visibleAlerts.map((alert) => (
          <AlertBadge key={alert.id} alert={alert} />
        ))}
      </div>
    </div>
  );
}
