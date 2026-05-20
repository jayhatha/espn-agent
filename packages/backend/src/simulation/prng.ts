/**
 * Seeded pseudo-random number generator (mulberry32).
 * Provides deterministic sequences for Monte Carlo simulation (OPS-01).
 */

/**
 * mulberry32 PRNG — returns uniform [0, 1) values from a 32-bit seed.
 * Fast and statistically adequate for simulation purposes.
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function () {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Box-Muller transform: converts two uniform [0,1] samples to N(0,1).
 */
function boxMuller(u1: number, u2: number): number {
  return (
    Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2)
  );
}

export interface Rng {
  /** Standard uniform [0, 1) */
  uniform(): number;
  /** Standard normal N(0, 1) */
  normal(): number;
}

/**
 * Create a seeded RNG.
 * seed = 0 → uses Math.random() (non-reproducible).
 * seed > 0 → mulberry32 PRNG (reproducible across identical seeds).
 */
export function createRng(seed: number): Rng {
  const raw = seed === 0 ? Math.random : mulberry32(seed);
  let spareNormal: number | null = null;

  return {
    uniform: raw,
    normal(): number {
      if (spareNormal !== null) {
        const v = spareNormal;
        spareNormal = null;
        return v;
      }
      const u1 = raw();
      const u2 = raw();
      const z0 = boxMuller(u1, u2);
      const z1 = boxMuller(u2, u1);
      spareNormal = z1;
      return z0;
    },
  };
}
