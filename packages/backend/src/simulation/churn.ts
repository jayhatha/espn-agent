import type { StatComponents } from "../../../shared/dist/index.js";
import type { TeamOpportunityStream, PlayerOpportunity } from "./types.js";
import type { Rng } from "./prng.js";

/** Baseline probability an active rostered player is available on any given day */
export const BASE_AVAILABILITY_RATE = 0.93;

/** 1-SD noise around the base availability rate */
const AVAILABILITY_NOISE_SD = 0.03;

/** Replacement-level per-day production (hitters) */
export const REPLACEMENT_HITTER_DAILY: StatComponents = {
  AB: 3.5,
  H: 0.88,
  R: 0.40,
  HR: 0.05,
  RBI: 0.35,
  BB: 0.35,
  TB: 1.20,
  SB: 0.04,
  HBP: 0.03,
  SF: 0.02,
};

/** Replacement-level per-day production (pitchers) */
export const REPLACEMENT_PITCHER_DAILY: StatComponents = {
  IP: 1.0,
  ER: 0.50,
  W: 0.05,
  K: 0.85,
  HA: 1.10,
  BBA: 0.40,
};

/**
 * Phase 106: Apply availability shocks to opportunity streams.
 *
 * For each active player, sample their availability rate from
 * Normal(BASE_AVAILABILITY_RATE, AVAILABILITY_NOISE_SD), clamped to [0, 1].
 *
 * Teams with thinner depth or higher missed-time exposure show lower medians
 * and wider ranges than healthier teams (CHURN-02).
 *
 * When rng is null or enableChurn is false: streams returned unchanged,
 * so disabling the churn layer restores Phase 105 simulator output (CHURN-02).
 */
export function applyChurnLayer(
  stream: TeamOpportunityStream,
  rng: Rng | null,
  enableChurn = true,
): TeamOpportunityStream {
  if (!rng || !enableChurn) return stream;

  return {
    ...stream,
    hitters: stream.hitters.map((p) => ({
      ...p,
      availabilityRate: sampleAvailabilityRate(p, rng),
    })),
    pitchers: stream.pitchers.map((p) => ({
      ...p,
      availabilityRate: sampleAvailabilityRate(p, rng),
    })),
  };
}

function sampleAvailabilityRate(player: PlayerOpportunity, rng: Rng): number {
  if (!player.isActive) return 0;
  const noise = rng.normal() * AVAILABILITY_NOISE_SD;
  return Math.max(0, Math.min(1, BASE_AVAILABILITY_RATE + noise));
}
