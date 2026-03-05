import React, { useRef } from "react";
import { useDraftStore } from "../lib/draft-state";

export default function StrategySetup() {
  const strategy = useDraftStore((state) => state.strategy);
  const setStrategy = useDraftStore((state) => state.setStrategy);

  // Debounce timer ref to avoid constant state updates on keystroke
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const anchorPlayerName = strategy?.anchorPlayerName ?? "";
  const fallbackPaths = strategy?.fallbackPaths?.join(", ") ?? "";
  const strategyState = strategy?.strategyState ?? "nominal";

  const handleAnchorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setStrategy({
        anchorPlayerName: value || null,
        anchorAcquired: strategy?.anchorAcquired ?? false,
        fallbackPaths: strategy?.fallbackPaths ?? [],
        strategyState: strategy?.strategyState ?? "nominal",
      });
    }, 500);
  };

  const handleFallbackChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const paths = value
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      setStrategy({
        anchorPlayerName: strategy?.anchorPlayerName ?? null,
        anchorAcquired: strategy?.anchorAcquired ?? false,
        fallbackPaths: paths,
        strategyState: strategy?.strategyState ?? "nominal",
      });
    }, 500);
  };

  const handleClear = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setStrategy(null);
  };

  const strategyStateColor =
    strategyState === "anchor_lost"
      ? "text-negative"
      : strategyState === "pivot_needed"
      ? "text-warning"
      : "text-content-secondary";

  return (
    <div className="border-b border-surface-tertiary">
      <details>
        <summary className="px-3 py-2 cursor-pointer flex items-center justify-between bg-surface-secondary hover:bg-surface-tertiary/50 select-none">
          <div className="flex items-center gap-2">
            <span className="text-body-sm font-semibold text-content">Strategy</span>
            {strategy?.anchorPlayerName && (
              <span className="text-body-xs text-content-secondary truncate max-w-[8rem]">
                {strategy.anchorPlayerName}
              </span>
            )}
          </div>
          <span className="text-body-xs text-content-secondary">▾</span>
        </summary>

        <div className="px-3 py-2 bg-surface space-y-2">
          {/* Anchor player input */}
          <div>
            <input
              type="text"
              defaultValue={anchorPlayerName}
              placeholder="Anchor player name..."
              onChange={handleAnchorChange}
              className="w-full text-body-sm bg-surface-secondary border border-surface-tertiary rounded px-2 py-1 text-content placeholder:text-content-secondary focus:outline-none focus:border-accent/50"
            />
            <p className="text-body-xs text-content-secondary mt-1">
              Set your must-have player. We'll alert you if outbid.
            </p>
          </div>

          {/* Strategy state badge (only shown when strategy is set) */}
          {strategy && (
            <div className="flex items-center gap-1">
              <span className="text-body-xs text-content-secondary">Status:</span>
              <span className={`text-body-xs font-semibold ${strategyStateColor}`}>
                {strategyState}
              </span>
            </div>
          )}

          {/* Fallback paths input */}
          <div>
            <input
              type="text"
              defaultValue={fallbackPaths}
              placeholder="e.g., power-speed, pitching-heavy"
              onChange={handleFallbackChange}
              className="w-full text-body-sm bg-surface-secondary border border-surface-tertiary rounded px-2 py-1 text-content placeholder:text-content-secondary focus:outline-none focus:border-accent/50"
            />
          </div>

          {/* Clear button */}
          {strategy && (
            <button
              onClick={handleClear}
              className="text-body-xs text-content-secondary hover:text-content border border-surface-tertiary rounded px-2 py-0.5"
            >
              Clear strategy
            </button>
          )}
        </div>
      </details>
    </div>
  );
}
