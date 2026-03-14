"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ---- Types matching the extension's MobileStateSnapshot and MobileEngineSignals ----

export interface CurrentAuctionPlayer {
  playerId?: number;
  playerName: string;
  positions?: string[];
  currentBid?: number;
  nominatingTeam?: string;
}

export interface RemainingSlot {
  position: string;
  count: number;
}

export interface RosterPlayer {
  playerName: string;
  positions: string[];
  cost?: number;
}

export interface NominationQueueEntry {
  playerId: number;
  playerName: string;
  position: string;
  queuePosition: number;
}

export interface DraftLiveState {
  currentAuctionPlayer: CurrentAuctionPlayer | null;
  myRosterCount: number;
  roster?: RosterPlayer[];
  remainingBudget: number;
  autoMode: boolean;
  pitcherHitterSplit: number;
  draftFormat: string;
  allPicksCount: number;
  currentPick: number;
  espnNominationQueue: NominationQueueEntry[];
  autoNominateMode: boolean;
  skippedPlayerIds: number[];
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

export interface IdealRosterPlayer {
  name: string;
  positions: string[];
  dollars: number;
  tier: "anchor" | "core" | "value";
  slot: string;
  isDrafted: boolean;
  externalRank?: number;
}

export interface CategoryProgress {
  statKey: string;
  label: string;
  target: number;
  projected: number;
  percent: number;
  direction: "HIGHER_BETTER" | "LOWER_BETTER";
}

export interface IdealRosterSignal {
  players: IdealRosterPlayer[];
  totalSGPValue: number;
  budgetUsed: number;
  unfilledSlots: number;
  anchorCount: number;
  coreCount: number;
  valueCount: number;
  categoryProgress?: CategoryProgress[];
}

export interface ScarcitySignal {
  position: string;
  supply: number;
  demand: number;
  tierDropValue: number;
  scarcityIndex: number;
}

export interface EngineSignals {
  inflation: InflationSignal | null;
  budgetCurve: BudgetCurveSignal | null;
  alerts: Alert[] | null;
  optimization: OptimizationSignal | null;
  simulation: SimulationSignal | null;
  remainingSlots: RemainingSlot[] | null;
  computeTimeMs: number;
  idealRoster: IdealRosterSignal | null;
  scarcity: ScarcitySignal[] | null;
}

// ---- Typed Control Actions ----

export type ControlActionMap = {
  SET_AUTO_MODE: boolean;
  SET_AUTO_NOMINATE: boolean;
  SET_POSITION_FILTER: string | null;
  SET_PITCHER_HITTER_SPLIT: number;
  SET_BUDGET_OVERRIDE: number;
  FORCE_NOMINATE: undefined;
  SKIP_PLAYER: { playerId: number; playerName: string };
  TOGGLE_SIDEBAR: undefined;
  REORDER_QUEUE: number[];
};

export type ControlActionName = keyof ControlActionMap;

// ---- Hook ----

export interface UseDraftLiveSocketResult {
  state: DraftLiveState | null;
  engineSignals: EngineSignals | null;
  connected: boolean;
  extensionConnected: boolean;
  sendControl: <A extends ControlActionName>(
    action: A,
    ...args: ControlActionMap[A] extends undefined ? [] : [ControlActionMap[A]]
  ) => void;
}

export function useDraftLiveSocket(wsUrl: string): UseDraftLiveSocketResult {
  const [state, setState] = useState<DraftLiveState | null>(null);
  const [engineSignals, setEngineSignals] = useState<EngineSignals | null>(null);
  const [connected, setConnected] = useState(false);
  const [extensionConnected, setExtensionConnected] = useState(false);

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
        setExtensionConnected(false);
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
            connected?: boolean;
          };

          if (msg.type === "EXTENSION_STATUS") {
            setExtensionConnected(msg.connected as boolean);
            return;
          }

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

  const sendControl = useCallback(<A extends ControlActionName>(
    action: A,
    ...args: ControlActionMap[A] extends undefined ? [] : [ControlActionMap[A]]
  ) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const payload = args.length > 0 ? args[0] : undefined;
      wsRef.current.send(JSON.stringify({ type: "CONTROL", action, payload }));
    }
  }, []);

  return { state, engineSignals, connected, extensionConnected, sendControl };
}
