import { EventEmitter } from "events";

/**
 * In-process EventEmitter for fan-out of standings change events to SSE clients.
 * Singleton: imported by both the orchestrator (emit) and SSE route (subscribe).
 * Single-process architecture — swap for Redis pub/sub if multi-process scaling needed.
 */
export const changeLogEmitter = new EventEmitter();
changeLogEmitter.setMaxListeners(100); // allow up to 100 concurrent SSE clients

export const CHANGE_LOG_EVENT = "standings_change";

export interface ChangeLogSignal {
  leagueId: number;
  snapshotDate: string;
  eventCount: number;
}

export const LIVE_POLL_EVENT = "live_poll";

export interface LivePollSignal {
  leagueId: number;
  polledAt: string; // ISO string
  eventCount: number;
}
