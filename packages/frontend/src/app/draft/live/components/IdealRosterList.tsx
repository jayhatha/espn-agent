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
  anchor: { bg: "bg-amber-600", text: "text-amber-100", letter: "A" },
  core:   { bg: "bg-blue-600",  text: "text-blue-100",  letter: "C" },
  value:  { bg: "bg-neutral-600", text: "text-neutral-200", letter: "V" },
};

export function IdealRosterList({ players, anchorCount, coreCount, valueCount }: IdealRosterListProps) {
  return (
    <div>
      {/* Summary line */}
      <p className="text-xs text-neutral-400 mb-2">
        <span className="text-amber-400 font-semibold">{anchorCount}</span> anchors{" / "}
        <span className="text-blue-400 font-semibold">{coreCount}</span> core{" / "}
        <span className="text-neutral-300 font-semibold">{valueCount}</span> value
      </p>

      {/* Player rows */}
      <div className="space-y-0">
        {players.map((p, i) => {
          const tier = TIER_STYLES[p.tier] ?? TIER_STYLES.value;
          const rowBg = i % 2 === 0 ? "bg-neutral-900" : "bg-neutral-800/50";

          return (
            <div
              key={`${p.name}-${p.slot}-${i}`}
              className={`flex items-center gap-2 px-2 py-1.5 rounded ${rowBg} ${
                p.isDrafted ? "border-l-2 border-green-500" : ""
              }`}
            >
              {/* Tier badge */}
              <span
                className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${tier.bg} ${tier.text}`}
              >
                {tier.letter}
              </span>

              {/* Player info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span
                    className={`text-sm truncate ${
                      p.isDrafted ? "font-bold text-green-300" : "text-neutral-100"
                    }`}
                  >
                    {p.name}
                  </span>
                  {p.isDrafted && (
                    <span className="text-green-400 text-xs flex-shrink-0">
                      &#10003;
                    </span>
                  )}
                  {p.externalRank !== undefined && (
                    <span className="text-[10px] text-neutral-500 flex-shrink-0">
                      #{p.externalRank}
                    </span>
                  )}
                </div>
                <span className="text-xs text-neutral-500">{p.slot}</span>
              </div>

              {/* Dollar value */}
              <span className="text-sm font-mono text-neutral-300 flex-shrink-0">
                ${Math.round(p.dollars)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
