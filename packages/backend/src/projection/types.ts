import type { StatComponents } from "../../../shared/dist/index.js";

export interface RosteredPlayer {
  playerId: number;
  positions: string[];
  rosterStatus: "active" | "bench" | "il" | "na" | "unknown";
  rosterSlot: string | null;
  projectedComponents: StatComponents | null;
}

export interface SlotAssignment {
  playerId: number;
  slot: string;
  contributionWeight: number; // 1.0 for starters, 0.0 for bench/IL
}

export interface RosterGap {
  slot: string;
  severity: "empty" | "degraded";
  suggestion: string;
}

export interface AllocationInput {
  roster: RosteredPlayer[];
  rosterSlots: Record<string, number>;
  projectionsByPlayerId: Map<number, StatComponents>;
  gsUsed: number;
  gsCap: number | null;
  projectionAsOfDate: string;
  snapshotDate: string;
  seasonEndDate?: string;
}

export interface ConfidenceInterval {
  p10: number;
  p50: number;
  p90: number;
}

export interface AllocationResult {
  batterComponents: StatComponents;
  pitcherComponents: StatComponents;
  assignments: SlotAssignment[];
  gaps: RosterGap[];
  gsScaleFactor: number;
  prorateFactor: number;
  /** Per-stat confidence intervals for counting stats (keyed by stat key) */
  batterConfidence: Record<string, ConfidenceInterval>;
  pitcherConfidence: Record<string, ConfidenceInterval>;
}
