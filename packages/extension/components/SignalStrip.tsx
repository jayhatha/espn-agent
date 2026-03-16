import React from "react";

interface SignalStripProps {
  endgameMode: boolean;
  inflationBand: "overspending" | "neutral" | "buying_window" | "strong_value";
  hitterSpent: number;
  pitcherSpent: number;
  spCount: number;
  totalSpSlots: number;
}

const INFLATION_BAND_CONFIG = {
  overspending: {
    label: "OVERSPEND",
    className: "bg-grafana-inflation-overspending text-white",
  },
  neutral: {
    label: "NEUTRAL",
    className: "bg-grafana-inflation-neutral text-white",
  },
  buying_window: {
    label: "BUY WINDOW",
    className: "bg-grafana-inflation-buying text-white",
  },
  strong_value: {
    label: "STRONG VALUE",
    className: "bg-grafana-inflation-strong text-white",
  },
} as const;

export default function SignalStrip({
  endgameMode,
  inflationBand,
  hitterSpent,
  pitcherSpent,
  spCount,
  totalSpSlots,
}: SignalStripProps) {
  const totalSpent = hitterSpent + pitcherSpent;
  const actualHitPct =
    totalSpent > 0 ? Math.round((hitterSpent / totalSpent) * 100) : 75;

  const inflationConfig = INFLATION_BAND_CONFIG[inflationBand];

  const pillBase =
    "text-label font-semibold px-2 py-0.5 rounded whitespace-nowrap";

  return (
    <div className="flex flex-wrap gap-1.5 px-3 py-2 bg-grafana-panel border-b border-grafana-border">
      {/* Endgame badge — always visible */}
      <span
        className={`${pillBase} ${
          endgameMode
            ? "bg-grafana-endgame-active text-white"
            : "bg-grafana-endgame-normal text-white"
        }`}
      >
        {endgameMode ? "ENDGAME" : "NORMAL"}
      </span>

      {/* Inflation band badge */}
      <span className={`${pillBase} ${inflationConfig.className}`}>
        {inflationConfig.label}
      </span>

      {/* Budget split badge */}
      <span
        className={`${pillBase} bg-grafana-panel border border-grafana-border text-grafana-text`}
      >
        HIT {actualHitPct}%
      </span>

      {/* SP tier badge */}
      <span
        className={`${pillBase} bg-grafana-panel border border-grafana-border text-grafana-text`}
      >
        SP {spCount}/{totalSpSlots}
      </span>
    </div>
  );
}
