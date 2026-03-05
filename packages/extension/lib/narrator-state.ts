/**
 * Narrator Zustand store — intentionally non-persisted (session-only).
 *
 * CRITICAL: This store does NOT use the `persist` middleware. The sessionCallCount
 * resets on page reload, which is the correct behavior for a per-draft-session cap.
 * Persisting the call count would carry it over incorrectly to the next draft session.
 *
 * See: 22-RESEARCH.md Pitfall #4
 */
import { create } from "zustand";

interface NarratorState {
  /** Current narrator text displayed in the sidebar. Empty string = no narration yet. */
  narration: string;

  /** True while a narrator API call is in-flight. */
  isLoading: boolean;

  /** Number of narrator API calls made this draft session. Resets on page reload. */
  sessionCallCount: number;

  /** Unix timestamp (ms) of the last successful narrator call, or null if none. */
  lastTriggeredAt: number | null;

  // Actions
  setNarration: (text: string) => void;
  setLoading: (loading: boolean) => void;
  incrementCallCount: () => void;
  resetSession: () => void;
}

// Plain create() with no persist middleware — session-only state
export const useNarratorStore = create<NarratorState>((set) => ({
  narration: "",
  isLoading: false,
  sessionCallCount: 0,
  lastTriggeredAt: null,

  setNarration: (text) => set({ narration: text, isLoading: false }),

  setLoading: (loading) => set({ isLoading: loading }),

  incrementCallCount: () =>
    set((state) => ({
      sessionCallCount: state.sessionCallCount + 1,
      lastTriggeredAt: Date.now(),
    })),

  resetSession: () =>
    set({ narration: "", sessionCallCount: 0, lastTriggeredAt: null }),
}));
