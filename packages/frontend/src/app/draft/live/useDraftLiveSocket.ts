"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ---- Types matching the extension's MobileStateSnapshot and MobileEngineSignals ----

export interface CurrentAuctionPlayer {
  id: number;
  name: string;
  position: string;
  currentBid?: number;
  nominatingTeam?: string;
}

export interface RemainingSlot {
  position: string;
  count: number;
}

export interface DraftLiveState {
  currentAuctionPlayer: CurrentAuctionPlayer | null;
  myRosterCount: number;
  remainingBudget: number;
  autoMode: boolean;
  pitcherHitterSplit: number;
  draftFormat: string;
  allPicksCount: number;
  currentPick: number;
}

export interface InflationSignal {
  inflationFactor: number;
  marketAdjustment: number;
}

export interface BudgetCurveSignal {
  budgetPressure: number;
  recommendedSpend: number;
  overspent: boolean;
}

export interface Alert {
  id: string;
  severity: number;
  message: string;
  category?: string;
}

export interface OptimizationSignal {
  maxBid: number;
  shouldBid: boolean;
  valueSurplus: number;
  expectedMarketPrice: number;
}

export interface SimulationDecisionEntry {
  label: string;
  outcome: {
    expectedFinish: number;
    winProbability?: number;
    top3Probability?: number;
  };
}

export interface WinProbabilityOutcome {
  winProbability: number;
  expectedFinish: number;
  top3Probability: number;
}

export interface SimulationSignal {
  winProbability: WinProbabilityOutcome | null;
  currentDecision: {
    decisions: SimulationDecisionEntry[];
  } | null;
}

export interface EngineSignals {
  inflation: InflationSignal | null;
  budgetCurve: BudgetCurveSignal | null;
  alerts: Alert[] | null;
  optimization: OptimizationSignal | null;
  simulation: SimulationSignal | null;
  remainingSlots: RemainingSlot[] | null;
  computeTimeMs: number;
}

// ---- Hook ----

interface UseDraftLiveSocketResult {
  state: DraftLiveState | null;
  engineSignals: EngineSignals | null;
  connected: boolean;
  sendControl: (action: string, payload?: unknown) => void;
}

export function useDraftLiveSocket(wsUrl: string): UseDraftLiveSocketResult {
  const [state, setState] = useState<DraftLiveState | null>(null);
  const [engineSignals, setEngineSignals] = useState<EngineSignals | null>(null);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!wsUrl) return;

    let closed = false;

    function connect() {
      if (closed) return;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        // Clear any pending reconnect since we connected successfully
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (!closed) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, 3000);
        }
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            type: string;
            payload?: DraftLiveState;
            engineSignals?: EngineSignals;
          };
          if (msg.type === "STATE_SNAPSHOT") {
            if (msg.payload) {
              setState(msg.payload);
            }
            if (msg.engineSignals) {
              setEngineSignals(msg.engineSignals);
            }
          }
        } catch {
          // Malformed message — ignore
          console.error("[useDraftLiveSocket] Failed to parse message:", event.data);
        }
      };

      ws.onerror = () => {
        // close handler will fire next and trigger reconnect
        console.error("[useDraftLiveSocket] WebSocket error");
      };
    }

    connect();

    return () => {
      closed = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [wsUrl]);

  const sendControl = useCallback((action: string, payload?: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "CONTROL", action, payload }));
    }
  }, []);

  return { state, engineSignals, connected, sendControl };
}
