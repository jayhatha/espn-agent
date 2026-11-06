import type { StatComponents } from "../../../shared/dist/index.js";

/**
 * Scale all numeric fields in stat components by a factor.
 * Undefined fields are left undefined (not set to 0).
 */
export function scaleComponents(
  components: StatComponents,
  factor: number,
): StatComponents {
  const scaled: StatComponents = {};
  for (const [key, value] of Object.entries(components)) {
    if (typeof value === "number") {
      scaled[key] = value * factor;
    }
    // undefined values are not included (left absent)
  }
  return scaled;
}

interface SPProjection {
  playerId: number;
  components: StatComponents;
  projectedGS: number | null; // null = not parsed from CSV
  positions?: string[];
  role?: string | null;
}

/**
 * Estimate GS from IP when GS column was not ingested.
 * Fallback: GS ~ IP / 6 for SP with IP > 80.
 * Returns 0 for relievers (IP <= 80) or missing IP.
 */
function estimateGS(components: StatComponents, forceStarter = false): number {
  const ip = components.IP ?? 0;
  if (forceStarter || ip > 80) return Math.round(ip / 6);
  return 0;
}

function isExplicitReliever(projection: SPProjection): boolean {
  const role = projection.role?.toUpperCase();
  const positions = new Set(
    projection.positions?.map((position) => position.toUpperCase()),
  );
  return (
    role === "RP" ||
    role === "RELIEVER" ||
    (positions.has("RP") && !positions.has("SP"))
  );
}

function projectedStarts(projection: SPProjection): number {
  if (isExplicitReliever(projection)) return 0;
  if ((projection.projectedGS ?? 0) > 0) return projection.projectedGS!;
  const role = projection.role?.toUpperCase();
  const positions = new Set(
    projection.positions?.map((position) => position.toUpperCase()),
  );
  return estimateGS(
    projection.components,
    role === "SP" || role === "STARTER" || positions.has("SP"),
  );
}

/**
 * GS cap enforcement for starting pitchers.
 *
 * If total projected remaining GS > gsRemaining (gsCap - gsUsed),
 * scale ALL SP counting components by gsRemaining / totalProjectedGS.
 *
 * RP projections are NEVER scaled by GS cap — callers must filter
 * SPs from RPs before calling this function.
 *
 * @param gsUsed - GS already used by this team in the current season
 * @param gsCap - Maximum GS allowed per season (typically 200)
 * @param spProjections - Starting pitcher projections to scale
 *
 * Returns: { scaledProjections, scaleFactor }
 */
export function applyGsCap(
  gsUsed: number,
  gsCap: number | null,
  spProjections: SPProjection[],
): {
  scaledProjections: Array<{
    playerId: number;
    scaledComponents: StatComponents;
  }>;
  scaleFactor: number;
} {
  const gsRemaining =
    gsCap === null ? Number.POSITIVE_INFINITY : Math.max(0, gsCap - gsUsed);

  if (spProjections.length === 0) {
    return { scaledProjections: [], scaleFactor: 1.0 };
  }

  const startsByPlayer = spProjections.map(projectedStarts);
  const totalProjectedGS = startsByPlayer.reduce(
    (sum, starts) => sum + starts,
    0,
  );

  // If projected GS fits within remaining budget, no scaling needed
  if (totalProjectedGS <= gsRemaining) {
    return {
      scaledProjections: spProjections.map((sp) => ({
        playerId: sp.playerId,
        scaledComponents: { ...sp.components },
      })),
      scaleFactor: 1.0,
    };
  }

  // Scale factor: how much of projected GS budget is available
  const scaleFactor = totalProjectedGS > 0 ? gsRemaining / totalProjectedGS : 0;

  return {
    scaledProjections: spProjections.map((sp, index) => ({
      playerId: sp.playerId,
      scaledComponents:
        startsByPlayer[index] > 0
          ? scaleComponents(sp.components, scaleFactor)
          : { ...sp.components },
    })),
    scaleFactor,
  };
}
