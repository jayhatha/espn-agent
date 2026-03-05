import React from "react";
import { useNarratorStore } from "../lib/narrator-state";

interface DraftNarratorProps {
  onAskAdvice: () => void;
  sessionCallCount: number;
  sessionCap?: number;
}

export default function DraftNarrator({
  onAskAdvice,
  sessionCallCount,
  sessionCap = 120,
}: DraftNarratorProps) {
  const narration = useNarratorStore((state) => state.narration);
  const isLoading = useNarratorStore((state) => state.isLoading);

  const callsRemaining = sessionCap - sessionCallCount;
  const isDisabled = isLoading || callsRemaining <= 0;

  return (
    <div className="border-b border-surface-tertiary">
      {/* Header bar */}
      <div className="bg-surface-secondary px-3 py-2 flex items-center justify-between">
        <span className="text-body-sm font-semibold text-content">AI Advisor</span>
        <div className="flex items-center gap-2">
          <span className="text-body-xs text-content-secondary">
            {callsRemaining} left
          </span>
          <button
            onClick={onAskAdvice}
            disabled={isDisabled}
            className="text-body-xs text-accent hover:text-accent-hover border border-accent/30 hover:border-accent/60 px-2 py-0.5 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Ask
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="bg-surface px-3 py-2 min-h-[3rem]">
        {isLoading ? (
          <p className="text-body-sm text-content-secondary animate-pulse">
            Analyzing...
          </p>
        ) : narration ? (
          <p className="text-body-sm text-content leading-relaxed">{narration}</p>
        ) : (
          <p className="text-body-xs text-content-secondary italic">
            Waiting for a significant draft moment...
          </p>
        )}
      </div>
    </div>
  );
}
