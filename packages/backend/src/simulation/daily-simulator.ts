import type { StatComponents } from "../../../shared/dist/index.js";
import { combineComponents } from "../../../shared/dist/index.js";
import { applyGsCap, scaleComponents } from "../projection/pitcher-scaling.js";
import { samplePlayerComponents } from "./opportunity.js";
import {
  REPLACEMENT_HITTER_DAILY,
  REPLACEMENT_PITCHER_DAILY,
} from "./churn.js";
import type { Rng } from "./prng.js";
import type { TeamOpportunityStream, PlayerOpportunity, TeamRunResult } from "./types.js";

function addComp(target: StatComponents, source: StatComponents): void {
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "number") {
      (target as Record<string, number>)[key] =
        ((target as Record<string, number>)[key] ?? 0) + value;
    }
  }
}

/**
 * Estimate how many "active days" a player's prorated RoS components represent.
 * Used to scale bench contributions relative to missed starter days.
 */
function estimateDays(components: StatComponents): number {
  if ((components.IP ?? 0) > 0) return Math.max(1, (components.IP ?? 1) / 1.0);
  if ((components.AB ?? 0) > 0) return Math.max(1, (components.AB ?? 3.5) / 3.5);
  return 1;
}

/**
 * Route missed starter days to bench players then replacement level.
 * Each bench player covers an equal share of missed days (CHURN-01).
 */
function coverMissedDays(
  benchPlayers: PlayerOpportunity[],
  missedDays: number,
  replacementDaily: StatComponents,
  rng: Rng | null,
): { components: StatComponents; benchDays: number; replacementDays: number } {
  const components: StatComponents = {};

  if (missedDays <= 0) {
    return { components, benchDays: 0, replacementDays: 0 };
  }

  let benchDays = 0;

  if (benchPlayers.length > 0) {
    const daysPerBenchPlayer = missedDays / benchPlayers.length;
    for (const bench of benchPlayers) {
      const sampled = samplePlayerComponents(bench.rosComponents, rng);
      const daysTotal = estimateDays(bench.rosComponents);
      const perDayFactor = daysTotal > 0 ? daysPerBenchPlayer / daysTotal : 0;
      addComp(components, scaleComponents(sampled, perDayFactor));
      benchDays += daysPerBenchPlayer;
    }
  }

  const replacementDays = Math.max(0, missedDays - benchDays);
  if (replacementDays > 0) {
    addComp(components, scaleComponents(replacementDaily, replacementDays));
  }

  return { components, benchDays, replacementDays };
}

/**
 * Phase 105: Simulate one team's remaining-season production for one MC run.
 *
 * Execution order:
 *   1. Sample each active player's components with optional noise (Phase 104)
 *   2. Scale sampled components by each player's availabilityRate (Phase 106)
 *   3. Route missed hitter days to bench depth or replacement level (Phase 106)
 *   4. Route missed pitcher days to bench pitchers or replacement level (Phase 106)
 *   5. Apply GS cap to SP totals (LINEUP-01, GS-01)
 *   6. Combine RoS with current season-to-date actuals
 *
 * In deterministic mode (rng = null):
 *   - No noise sampling (step 1 is identity)
 *   - No availability shocks (availabilityRate stays 1.0)
 *   - Output matches existing StandingsProjectionAgent within tolerance (SIM-02)
 */
export function simulateTeamRun(
  stream: TeamOpportunityStream,
  currentBatterComponents: StatComponents,
  currentPitcherComponents: StatComponents,
  gsUsed: number,
  gsCap: number,
  rng: Rng | null,
): TeamRunResult {
  const { hitters, pitchers, bench } = stream;

  // ── Step 1+2: Sample + availability-scale hitters ────────────────────────
  const batterRoS: StatComponents = {};
  let missedHitterDays = 0;

  for (const h of hitters) {
    const sampled = samplePlayerComponents(h.rosComponents, rng);
    addComp(batterRoS, scaleComponents(sampled, h.availabilityRate));
    missedHitterDays += 1 - h.availabilityRate;
  }

  // ── Step 1+2: Sample + availability-scale pitchers (SP and RP) ───────────
  const spPlayers = pitchers.filter((p) => p.isSP);
  const rpPlayers = pitchers.filter((p) => !p.isSP);

  // Collect SP components after sampling + availability scaling
  const spProjections = spPlayers.map((p) => {
    const sampled = samplePlayerComponents(p.rosComponents, rng);
    const scaled = scaleComponents(sampled, p.availabilityRate);
    return {
      playerId: p.playerId,
      components: scaled,
      projectedGS: scaled.GS ?? null,
    };
  });

  // Step 5: Apply GS cap to SP totals (GS-01)
  const { scaledProjections: cappedSPs } = applyGsCap(gsUsed, gsCap, spProjections);

  const pitcherRoS: StatComponents = {};
  for (const sp of cappedSPs) {
    addComp(pitcherRoS, sp.scaledComponents);
  }

  let missedPitcherDays = 0;
  for (const sp of spPlayers) {
    missedPitcherDays += 1 - sp.availabilityRate;
  }

  // RP: no GS cap (GS-01: RP opportunity is distinct from SP pacing)
  for (const rp of rpPlayers) {
    const sampled = samplePlayerComponents(rp.rosComponents, rng);
    addComp(pitcherRoS, scaleComponents(sampled, rp.availabilityRate));
    missedPitcherDays += 1 - rp.availabilityRate;
  }

  // ── Step 3: Cover missed hitter days (CHURN-01) ───────────────────────────
  const benchHitters = bench.filter((b) => (b.rosComponents.IP ?? 0) === 0);
  let benchDaysTotal = 0;
  let replacementDaysTotal = 0;

  if (missedHitterDays > 0) {
    const coverage = coverMissedDays(
      benchHitters,
      missedHitterDays,
      REPLACEMENT_HITTER_DAILY,
      rng,
    );
    addComp(batterRoS, coverage.components);
    benchDaysTotal += coverage.benchDays;
    replacementDaysTotal += coverage.replacementDays;
  }

  // ── Step 4: Cover missed pitcher days (CHURN-01) ─────────────────────────
  const benchPitchers = bench.filter((b) => (b.rosComponents.IP ?? 0) > 0);

  if (missedPitcherDays > 0) {
    const coverage = coverMissedDays(
      benchPitchers,
      missedPitcherDays,
      REPLACEMENT_PITCHER_DAILY,
      rng,
    );
    addComp(pitcherRoS, coverage.components);
    benchDaysTotal += coverage.benchDays;
    replacementDaysTotal += coverage.replacementDays;
  }

  // ── Step 6: Combine RoS with season-to-date actuals ─────────────────────
  const batterComponents = combineComponents(currentBatterComponents, batterRoS);
  const pitcherComponents = combineComponents(currentPitcherComponents, pitcherRoS);

  const starterDays = hitters.length + pitchers.length;

  return {
    teamId: stream.teamId,
    batterComponents,
    pitcherComponents,
    sourceDays: {
      starter: starterDays,
      bench: benchDaysTotal,
      replacement: replacementDaysTotal,
    },
  };
}
