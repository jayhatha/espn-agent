import React, { useState, useEffect } from "react";
import { useNarratorStore } from "../lib/narrator-state";

const NARRATOR_ENABLED_KEY = "espn_draft_narrator_enabled";

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

  const [enabled, setEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem(NARRATOR_ENABLED_KEY);
      return stored !== "false"; // default to enabled
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(NARRATOR_ENABLED_KEY, String(enabled));
    } catch {
      // ignore storage errors
    }
  }, [enabled]);

  const callsRemaining = sessionCap - sessionCallCount;
  const isDisabled = isLoading || callsRemaining <= 0;

  return (
    <div className="border-b border-surface-tertiary">
      {/* Header bar */}
      <div className="bg-surface-secondary px-3 py-2 flex items-center justify-between">
        <span className="text-body-sm font-semibold text-content">AI Advisor</span>
        <div className="flex items-center gap-2">
          {enabled && (
            <>
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
            </>
          )}
          <button
            onClick={() => setEnabled(!enabled)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              enabled ? "bg-accent" : "bg-surface-tertiary"
            }`}
            role="switch"
            aria-checked={enabled}
            aria-label="Toggle AI advisor"
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                enabled ? "translate-x-[18px]" : "translate-x-[2px]"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Content area — only shown when enabled */}
      {enabled && (
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
      )}
    </div>
  );
}
