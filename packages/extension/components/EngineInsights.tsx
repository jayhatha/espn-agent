import React from "react";
import type { DraftEngineSignals } from "../lib/engine";
import IdealRosterPanel from "./IdealRosterPanel";

interface EngineInsightsProps {
  engineSignals: DraftEngineSignals | null;
}

export default function EngineInsights({ engineSignals }: EngineInsightsProps) {
  if (!engineSignals) {
    return null;
  }

  return (
    <div className="border-b border-grafana-border">
      <IdealRosterPanel idealRoster={engineSignals.idealRoster} />
    </div>
  );
}
