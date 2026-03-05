/**
 * useNarrator: Hook managing narrator trigger logic, debounce, session cap, and manual advice.
 *
 * Trigger conditions (from 22-CONTEXT.md):
 *   1. Any alert severity > 0.65
 *   2. Budget pacing status changes
 *   3. Manual "Ask for advice" via requestAdvice()
 *
 * Deduplication: buildDedupeKey() prevents identical consecutive calls
 * Debounce: 1500ms window clusters rapid trigger events into one call
 * Session cap: 120 calls per draft session, read via getState() to avoid stale closures
 * Graceful degradation: backend failure = console.warn only, no error shown to user
 */
import { useEffect, useRef, useCallback } from "react";
import type { DraftEngineSignals } from "./engine";
import { useNarratorStore } from "./narrator-state";
import { useDraftStore } from "./draft-state";
import type { NarratorPayload } from "./narrator-types";

const DEBOUNCE_MS = 1500;
const SESSION_CAP = 120;

/**
 * Build a deduplication key from engine signals and trigger reason.
 * Identical key = skip the narrator call (same state already narrated).
 * Includes player name and shouldBid so new nominations always trigger fresh narration.
 */
function buildDedupeKey(
  signals: DraftEngineSignals,
  triggerReason: string,
  currentPlayerName: string | null | undefined
): string {
  const alertIds = signals.alerts
    .map((a) => a.id)
    .sort()
    .join(",");
  const pacing = signals.budgetCurve.pacingStatus;
  const shouldBid = signals.optimization?.shouldBid ?? "";
  const playerName = currentPlayerName ?? "";
  return `${alertIds}|${pacing}|${triggerReason}|${shouldBid}|${playerName}`;
}

/**
 * Derive simulation confidence from the stdDev/EV ratio.
 * < 0.1 = high confidence, < 0.3 = medium, else low.
 * Guards against simulationEV === 0.
 */
function deriveSimulationConfidence(
  simulationEV: number,
  simulationStdDev: number
): "high" | "medium" | "low" {
  if (simulationEV === 0) return "low";
  const ratio = simulationStdDev / simulationEV;
  if (ratio < 0.1) return "high";
  if (ratio < 0.3) return "medium";
  return "low";
}

/**
 * Derive draft phase from number of picks on my roster.
 * Uses the roster pick count (not allPicks) to reflect what's been acquired.
 */
function deriveDraftPhase(
  picksCount: number
): "early" | "mid" | "late" {
  if (picksCount <= 5) return "early";
  if (picksCount <= 15) return "mid";
  return "late";
}

interface NarratorContext {
  remainingBudget: number;
  myRoster: import("@espn-fantasy/shared").DraftedPlayer[];
  currentAuctionPlayer: {
    playerName: string;
    currentBid?: number;
    positions?: string[];
    playerId?: number;
  } | null;
  auctionValues: import("@espn-fantasy/shared").AuctionValue[];
  leagueCategories: import("@espn-fantasy/shared").Category[];
  espnDomAuctionValues: Record<number, number>;
  allPicks: import("@espn-fantasy/shared").DraftPick[];
}

/**
 * Build the NarratorPayload from engine signals and draft store context.
 * Only sends structured summary fields — never raw player arrays.
 */
function buildNarratorPayload(
  signals: DraftEngineSignals,
  triggerReason: NarratorPayload["triggerReason"],
  context: NarratorContext
): NarratorPayload {
  const draftPhase = deriveDraftPhase(context.myRoster.length);

  // Build currentAuctionPlayer with ESPN DOM value and max bid
  let currentAuctionPlayer: NarratorPayload["currentAuctionPlayer"] = null;
  if (context.currentAuctionPlayer) {
    const cap = context.currentAuctionPlayer;
    const espnValue = cap.playerId
      ? context.espnDomAuctionValues[cap.playerId]
      : undefined;

    currentAuctionPlayer = {
      playerName: cap.playerName,
      currentBid: cap.currentBid,
      positions: cap.positions,
      espnValue,
      maxBidRecommendation: signals.budgetCurve.maxBidRecommendation,
    };
  }

  // Map optimization signals to compact payload format
  let optimization: NarratorPayload["optimization"] = null;
  if (signals.optimization !== null) {
    const opt = signals.optimization;

    // topTargets: slice first 3
    const topTargets = opt.topTargets.slice(0, 3).map((t) => ({
      playerName: t.playerName,
      position: t.position,
      sgpValue: t.sgpValue,
      maxBid: t.maxBid,
      expectedMarketPrice: t.expectedMarketPrice,
    }));

    // opponentPressure: convert Record<string, number> to sorted array, top 3
    const opponentPressure = Object.entries(opt.opponentPressure)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([position, competitionFactor]) => ({ position, competitionFactor }));

    optimization = {
      shouldBid: opt.shouldBid,
      maxBid: opt.maxBid,
      valueSurplus: opt.valueSurplus,
      simulationEV: opt.simulationEV,
      simulationConfidence: deriveSimulationConfidence(opt.simulationEV, opt.simulationStdDev),
      topTargets,
      opponentPressure,
    };
  }

  return {
    draftPhase,
    alerts: signals.alerts.map((a) => ({
      type: a.type,
      severity: a.severity,
      title: a.title,
      detail: a.detail,
      position: a.position,
      category: a.category,
    })),
    inflation: {
      percentOverMarket: signals.inflation.percentOverMarket,
      confidence: signals.inflation.confidence,
    },
    budgetSummary: {
      remainingBudget: signals.budgetCurve.remainingBudget,
      pacingStatus: signals.budgetCurve.pacingStatus,
      budgetPressure: signals.budgetCurve.budgetPressure,
      maxBidRecommendation: signals.budgetCurve.maxBidRecommendation,
    },
    topScarcity: signals.scarcity.map((s) => ({
      position: s.position,
      scarcityIndex: s.scarcityIndex,
      myTeamNeeds: s.myTeamNeeds,
      supply: s.supply,
      demand: s.demand,
    })),
    categoryGaps: signals.categoryGaps.map((c) => ({
      category: c.category,
      gapZScore: c.gapZScore,
      categoryRiskScore: c.categoryRiskScore,
    })),
    currentAuctionPlayer,
    optimization,
    triggerReason,
  };
}

/**
 * useNarrator hook.
 *
 * @param engineSignals - Current engine signals from useDraftEngineSignals(), or null if unavailable.
 * @returns requestAdvice - Call to immediately trigger a narrator call with "user_request" reason.
 */
export function useNarrator(engineSignals: DraftEngineSignals | null): {
  requestAdvice: () => void;
} {
  // Read narrator store state
  const { setNarration, setLoading, incrementCallCount } = useNarratorStore();

  // Read draft store context
  const {
    remainingBudget,
    myRoster,
    currentAuctionPlayer,
    leagueCategories,
    auctionValues,
    allPicks,
    espnDomAuctionValues,
  } = useDraftStore();

  // Refs for debounce, in-flight cancellation, and deduplication
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastDedupeKeyRef = useRef<string>("");
  const prevPacingRef = useRef<string | null>(null);
  const prevAuctionPlayerRef = useRef<string | null>(null);

  const fireNarration = useCallback(
    async (
      signals: DraftEngineSignals,
      triggerReason: NarratorPayload["triggerReason"]
    ) => {
      // CRITICAL: Read sessionCallCount from getState() to avoid stale closure
      // (Pitfall #6 from 22-RESEARCH.md — debounced callback captures stale count)
      const currentCount = useNarratorStore.getState().sessionCallCount;
      if (currentCount >= SESSION_CAP) return;

      const dedupeKey = buildDedupeKey(signals, triggerReason, currentAuctionPlayer?.playerName);
      // Skip duplicate auto-triggers, but always honor manual user requests
      if (triggerReason !== "user_request" && dedupeKey === lastDedupeKeyRef.current) return;
      lastDedupeKeyRef.current = dedupeKey;

      // Cancel any in-flight narrator request before starting a new one
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setLoading(true);
      incrementCallCount();

      try {
        // Read backend URL from chrome.storage (same pattern as api-client.ts)
        const { backendUrl } = await chrome.storage.local.get(["backendUrl"]);
        const baseUrl = ((backendUrl as string) || "http://localhost:3001").replace(
          /\/+$/,
          ""
        );

        const payload = buildNarratorPayload(signals, triggerReason, {
          remainingBudget,
          myRoster,
          currentAuctionPlayer,
          auctionValues,
          leagueCategories,
          espnDomAuctionValues,
          allPicks,
        });

        const response = await fetch(`${baseUrl}/api/draft/narrate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        setNarration(data.narration ?? "");
      } catch (err: unknown) {
        // Graceful degradation: AbortError is normal (new trigger fired), ignore silently.
        // Other errors: console.warn only — don't show error to user, keep showing engine signals.
        if (err instanceof Error && err.name !== "AbortError") {
          console.warn("[Narrator] Failed to get narration:", err);
        }
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      setNarration,
      setLoading,
      incrementCallCount,
      remainingBudget,
      myRoster,
      currentAuctionPlayer,
      auctionValues,
      leagueCategories,
      espnDomAuctionValues,
      allPicks,
    ]
  );

  // Watch trigger conditions and fire narrator with debounce
  useEffect(() => {
    if (!engineSignals) return;

    // Read fresh count — effect re-runs when count changes but guard here too
    if (useNarratorStore.getState().sessionCallCount >= SESSION_CAP) return;

    let triggerReason: NarratorPayload["triggerReason"] | null = null;

    // Trigger 1: New player nominated (player name changed and is non-null)
    const newPlayerName = currentAuctionPlayer?.playerName ?? null;
    if (newPlayerName !== null && newPlayerName !== prevAuctionPlayerRef.current) {
      triggerReason = "nomination";
      prevAuctionPlayerRef.current = newPlayerName;
    }

    // Trigger 2: Any alert with severity > 0.65
    const highAlerts = engineSignals.alerts.filter((a) => a.severity > 0.65);
    if (highAlerts.length > 0) {
      triggerReason = "alert";
    }

    // Trigger 3: Budget pacing status changed
    const newPacing = engineSignals.budgetCurve.pacingStatus;
    if (newPacing !== prevPacingRef.current) {
      triggerReason = "budget_pressure";
      prevPacingRef.current = newPacing;
    }

    if (!triggerReason) return;

    // Debounce: cluster rapid trigger events into a single call
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      fireNarration(engineSignals, triggerReason!);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
    // Intentionally use specific sub-fields (not whole object) to prevent
    // unnecessary re-runs from object reference changes on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    engineSignals?.alerts,
    engineSignals?.budgetCurve.pacingStatus,
    currentAuctionPlayer?.playerName,
    fireNarration,
  ]);

  // Manual trigger: "Ask for advice" button — fires immediately, bypasses debounce
  const requestAdvice = useCallback(() => {
    if (!engineSignals) return;
    if (useNarratorStore.getState().sessionCallCount >= SESSION_CAP) return;

    // Cancel any pending debounce timer to give priority to manual request
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    fireNarration(engineSignals, "user_request");
  }, [engineSignals, fireNarration]);

  return { requestAdvice };
}
