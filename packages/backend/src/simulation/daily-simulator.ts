import type { StatComponents } from "../../../shared/dist/index.js";
import { combineComponents } from "../../../shared/dist/index.js";
import { applyGsCap, scaleComponents } from "../projection/pitcher-scaling.js";
import { canFillSlot } from "../projection/slot-eligibility.js";
import { samplePlayerComponents } from "./opportunity.js";
import {
  REPLACEMENT_HITTER_DAILY,
  REPLACEMENT_PITCHER_DAILY,
} from "./churn.js";
import type { Rng } from "./prng.js";
import type {
  TeamOpportunityStream,
  PlayerOpportunity,
  TeamRunResult,
} from "./types.js";

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
function opportunityVolume(components: StatComponents): number {
  return components.IP ?? components.AB ?? 0;
}

/**
 * Route missed starter days to bench players then replacement level.
 * Each bench player covers an equal share of missed days (CHURN-01).
 */
function coverMissedOpportunities(
  benchPlayers: PlayerOpportunity[],
  demands: Array<{ volume: number; slot: string | null; gs?: number }>,
  replacementDaily: StatComponents,
  rng: Rng | null,
): {
  components: StatComponents;
  benchVolume: number;
  replacementVolume: number;
} {
  const components: StatComponents = {};
  const missedVolume = demands.reduce((sum, demand) => sum + demand.volume, 0);

  if (missedVolume <= 0) {
    return { components, benchVolume: 0, replacementVolume: 0 };
  }

  const benchState = benchPlayers
    .map((player) => ({
      player,
      sampled: scaleComponents(
        samplePlayerComponents(player.rosComponents, rng),
        Math.max(0, Math.min(1, player.availabilityRate)),
      ),
    }))
    .map((state) => ({
      ...state,
      remaining: opportunityVolume(state.sampled),
    }));
  let benchVolume = 0;
  let replacementVolume = 0;
  const replacementUnit = opportunityVolume(replacementDaily) || 1;

  for (const demand of demands) {
    let remaining = demand.volume;
    for (const bench of benchState) {
      if (remaining <= 0) break;
      if (bench.remaining <= 0) continue;
      if (demand.slot && !canFillSlot(bench.player.positions, demand.slot))
        continue;
      const available = opportunityVolume(bench.sampled);
      if (available <= 0) continue;
      const used = Math.min(remaining, bench.remaining);
      addComp(components, scaleComponents(bench.sampled, used / available));
      bench.remaining -= used;
      remaining -= used;
      benchVolume += used;
    }
    if (remaining > 0) {
      const replacement = scaleComponents(
        replacementDaily,
        remaining / replacementUnit,
      );
      if (demand.gs !== undefined && demand.volume > 0) {
        replacement.GS = demand.gs * (remaining / demand.volume);
      }
      addComp(components, replacement);
      replacementVolume += remaining;
    }
  }

  return { components, benchVolume, replacementVolume };
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
  gsCap: number | null,
  rng: Rng | null,
): TeamRunResult {
  const { hitters, pitchers, bench } = stream;

  // ── Step 1+2: Sample + availability-scale hitters ────────────────────────
  const batterRoS: StatComponents = {};
  const missedHitterOpportunities: Array<{
    volume: number;
    slot: string | null;
  }> = [];

  for (const h of hitters) {
    const sampled = samplePlayerComponents(h.rosComponents, rng);
    addComp(batterRoS, scaleComponents(sampled, h.availabilityRate));
    missedHitterOpportunities.push({
      volume: (h.rosComponents.AB ?? 0) * (1 - h.availabilityRate),
      slot: h.activeSlot,
    });
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
      positions: p.positions,
    };
  });

  const pitcherRoS: StatComponents = {};
  const missedStarterOpportunities: Array<{
    volume: number;
    slot: string | null;
    gs: number;
  }> = spPlayers.map((sp) => ({
    volume: (sp.rosComponents.IP ?? 0) * (1 - sp.availabilityRate),
    slot: sp.activeSlot,
    gs: (sp.rosComponents.GS ?? 0) * (1 - sp.availabilityRate),
  }));
  const missedRelieverOpportunities: Array<{
    volume: number;
    slot: string | null;
  }> = [];

  // RP: no GS cap (GS-01: RP opportunity is distinct from SP pacing)
  for (const rp of rpPlayers) {
    const sampled = samplePlayerComponents(rp.rosComponents, rng);
    addComp(pitcherRoS, scaleComponents(sampled, rp.availabilityRate));
    missedRelieverOpportunities.push({
      volume: (rp.rosComponents.IP ?? 0) * (1 - rp.availabilityRate),
      slot: rp.activeSlot,
    });
  }

  // ── Step 3: Cover missed hitter days (CHURN-01) ───────────────────────────
  const benchHitters = bench.filter((b) => (b.rosComponents.IP ?? 0) === 0);
  let benchDaysTotal = 0;
  let replacementDaysTotal = 0;

  if (missedHitterOpportunities.some((demand) => demand.volume > 0)) {
    const coverage = coverMissedOpportunities(
      benchHitters,
      missedHitterOpportunities,
      REPLACEMENT_HITTER_DAILY,
      rng,
    );
    addComp(batterRoS, coverage.components);
    benchDaysTotal += coverage.benchVolume / 3.5;
    replacementDaysTotal += coverage.replacementVolume / 3.5;
  }

  // ── Step 4: Cover missed pitcher days (CHURN-01) ─────────────────────────
  const benchStarters = bench.filter(
    (player) => player.isSP && (player.rosComponents.IP ?? 0) > 0,
  );
  if (missedStarterOpportunities.some((demand) => demand.volume > 0)) {
    const starterCoverage = coverMissedOpportunities(
      benchStarters,
      missedStarterOpportunities,
      REPLACEMENT_PITCHER_DAILY,
      rng,
    );
    spProjections.push({
      playerId: -1,
      components: starterCoverage.components,
      projectedGS: starterCoverage.components.GS ?? 0,
      positions: ["SP"],
    });
    benchDaysTotal += starterCoverage.benchVolume;
    replacementDaysTotal += starterCoverage.replacementVolume;
  }

  const { scaledProjections: cappedSPs } = applyGsCap(
    gsUsed,
    gsCap,
    spProjections,
  );
  for (const sp of cappedSPs) {
    addComp(pitcherRoS, sp.scaledComponents);
  }

  const benchRelievers = bench.filter(
    (player) => !player.isSP && (player.rosComponents.IP ?? 0) > 0,
  );
  if (missedRelieverOpportunities.some((demand) => demand.volume > 0)) {
    const relieverCoverage = coverMissedOpportunities(
      benchRelievers,
      missedRelieverOpportunities,
      REPLACEMENT_PITCHER_DAILY,
      rng,
    );
    addComp(pitcherRoS, relieverCoverage.components);
    benchDaysTotal += relieverCoverage.benchVolume;
    replacementDaysTotal += relieverCoverage.replacementVolume;
  }

  // ── Step 6: Combine RoS with season-to-date actuals ─────────────────────
  const batterComponents = combineComponents(
    currentBatterComponents,
    batterRoS,
  );
  const pitcherComponents = combineComponents(
    currentPitcherComponents,
    pitcherRoS,
  );

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
