/**
 * useNarrator: Hook managing narrator trigger logic, debounce, session cap, and manual advice.
 *
 * Trigger conditions (from 22-CONTEXT.md):
 *   1. Any alert severity > 0.65
 *   2. Archetype label changes (only when picksAnalyzed >= 3)
 *   3. Budget pacing status changes
 *   4. Manual "Ask for advice" via requestAdvice()
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
 */
function buildDedupeKey(
  signals: DraftEngineSignals,
  triggerReason: string
): string {
  const alertIds = signals.alerts
    .map((a) => a.id)
    .sort()
    .join(",");
  const archetype = signals.archetype?.archetypeLabel ?? "null";
  const pacing = signals.budgetCurve.pacingStatus;
  return `${alertIds}|${archetype}|${pacing}|${triggerReason}`;
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
  strategy: {
    anchorPlayerName: string | null;
    anchorAcquired: boolean;
    fallbackPaths: string[];
    strategyState: "nominal" | "anchor_lost" | "pivot_needed";
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

  // Build archetype section if available
  let archetype: NarratorPayload["archetype"] = null;
  if (signals.archetype) {
    const a = signals.archetype;
    archetype = {
      archetypeLabel: a.archetypeLabel,
      archetypeConfidence: a.archetypeConfidence,
      puntedCategories: a.ceilings
        .filter((c) => c.isPunted)
        .map((c) => c.stat_key),
      pivotPlayers: a.pivotPlayers.map((p) => ({
        playerName: p.playerName,
        dollarValue: p.dollarValue,
        category: p.category,
      })),
    };
  }

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
    archetype,
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
    triggerReason,
    strategy: context.strategy,
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
    strategy,
    leagueCategories,
    auctionValues,
    allPicks,
    espnDomAuctionValues,
  } = useDraftStore();

  // Refs for debounce, in-flight cancellation, and deduplication
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastDedupeKeyRef = useRef<string>("");
  const prevArchetypeRef = useRef<string | null>(null);
  const prevPacingRef = useRef<string | null>(null);

  const fireNarration = useCallback(
    async (
      signals: DraftEngineSignals,
      triggerReason: NarratorPayload["triggerReason"]
    ) => {
      // CRITICAL: Read sessionCallCount from getState() to avoid stale closure
      // (Pitfall #6 from 22-RESEARCH.md — debounced callback captures stale count)
      const currentCount = useNarratorStore.getState().sessionCallCount;
      if (currentCount >= SESSION_CAP) return;

      const dedupeKey = buildDedupeKey(signals, triggerReason);
      if (dedupeKey === lastDedupeKeyRef.current) return; // duplicate — skip
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
          strategy,
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
      strategy,
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

    // Trigger 1: Any alert with severity > 0.65
    const highAlerts = engineSignals.alerts.filter((a) => a.severity > 0.65);
    if (highAlerts.length > 0) {
      triggerReason = "alert";
    }

    // Trigger 2: Archetype label changed (only after 3+ picks to avoid noise)
    const newArchetype = engineSignals.archetype?.archetypeLabel ?? null;
    if (
      newArchetype !== prevArchetypeRef.current &&
      (engineSignals.archetype?.picksAnalyzed ?? 0) >= 3
    ) {
      triggerReason = "archetype_change";
      prevArchetypeRef.current = newArchetype;
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
    engineSignals?.archetype,
    engineSignals?.budgetCurve.pacingStatus,
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
