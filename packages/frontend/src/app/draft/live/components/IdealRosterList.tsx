"use client";

// Types defined locally — Plan 41-03 may add these to useDraftLiveSocket.ts later
export interface IdealRosterPlayer {
  name: string;
  positions: string[];
  dollars: number;
  tier: "anchor" | "core" | "value";
  sgpValue: number;
  slot: string;
  isDrafted: boolean;
  externalRank?: number;
}

interface IdealRosterListProps {
  players: IdealRosterPlayer[];
  anchorCount: number;
  coreCount: number;
  valueCount: number;
}

const TIER_STYLES: Record<string, { bg: string; text: string; letter: string }> = {
  anchor: { bg: "bg-grafana-warning", text: "text-grafana-text", letter: "A" },
  core:   { bg: "bg-info",  text: "text-grafana-text",  letter: "C" },
  value:  { bg: "bg-grafana-border", text: "text-grafana-text", letter: "V" },
};

export function IdealRosterList({ players, anchorCount, coreCount, valueCount }: IdealRosterListProps) {
  return (
    <div>
      {/* Summary line */}
      <p className="text-xs text-grafana-muted mb-2">
        <span className="text-grafana-warning font-semibold">{anchorCount}</span> anchors{" / "}
        <span className="text-info-dark font-semibold">{coreCount}</span> core{" / "}
        <span className="text-grafana-muted font-semibold">{valueCount}</span> value
      </p>

      {/* Player rows */}
      <div className="space-y-0">
        {players.map((p, i) => {
          const tier = TIER_STYLES[p.tier] ?? TIER_STYLES.value;
          const rowBg = i % 2 === 0 ? "bg-grafana-bg" : "bg-grafana-panel/50";

          return (
            <div
              key={`${p.name}-${p.slot}-${i}`}
              className={`flex items-center gap-2 px-2 py-1.5 rounded ${rowBg} ${
                p.isDrafted ? "border-l-2 border-grafana-positive" : ""
              }`}
            >
              {/* Tier badge */}
              <span
                className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-caption font-bold ${tier.bg} ${tier.text}`}
              >
                {tier.letter}
              </span>

              {/* Player info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span
                    className={`text-sm truncate ${
                      p.isDrafted ? "font-bold text-positive-dark" : "text-grafana-text"
                    }`}
                  >
                    {p.name}
                  </span>
                  {p.isDrafted && (
                    <span className="text-positive-dark text-xs flex-shrink-0">
                      &#10003;
                    </span>
                  )}
                  {p.externalRank !== undefined && (
                    <span className="text-caption text-grafana-muted flex-shrink-0">
                      #{p.externalRank}
                    </span>
                  )}
                </div>
                <span className="text-xs text-grafana-muted">{p.slot}</span>
              </div>

              {/* Dollar value */}
              <span className="text-sm font-mono text-grafana-muted flex-shrink-0">
                ${Math.round(p.dollars)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
