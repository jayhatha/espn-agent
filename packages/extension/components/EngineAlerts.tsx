import React from "react";
import type { DraftAlert } from "../lib/engine";

interface AlertBadgeProps {
  alert: DraftAlert;
}

function AlertBadge({ alert }: AlertBadgeProps) {
  const colorMap: Record<DraftAlert["type"], string> = {
    inflation: "bg-grafana-info/20 border-grafana-info text-grafana-text",
    scarcity: "bg-grafana-negative/20 border-grafana-negative text-grafana-negative",
    category_gap: "bg-grafana-warning/20 border-grafana-warning text-grafana-warning",
    budget: "bg-grafana-info/20 border-grafana-info text-grafana-text",
    tier_break: "bg-grafana-negative/20 border-grafana-negative text-grafana-negative",
  };

  const severityBarColor =
    alert.severity >= 0.85 ? "bg-grafana-negative" :
    alert.severity >= 0.75 ? "bg-grafana-warning" :
    "bg-grafana-info";

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
    <div className="p-3 border-b border-grafana-border">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-body-sm font-semibold text-grafana-text">Engine Alerts</h3>
        <span className="bg-grafana-negative text-grafana-text text-body-xs font-semibold px-1.5 py-0.5 rounded-full leading-none">
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
