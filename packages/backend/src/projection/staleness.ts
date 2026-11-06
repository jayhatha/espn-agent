/**
 * Staleness prorating for FanGraphs RoS projections.
 *
 * prorateFactor = remainingDaysFromToday / remainingDaysFromAsOfDate
 *
 * Same-day upload = 1.0, past season end = 0.0
 */
export function computeProrateFactor(
  asOfDate: string,
  today: string,
  seasonEndDate: string = `${new Date(today).getUTCFullYear()}-10-01`,
): number {
  const asOf = new Date(asOfDate);
  const now = new Date(today);
  const end = new Date(seasonEndDate);

  const remainingFromAsOf = Math.max(
    0,
    (end.getTime() - asOf.getTime()) / (1000 * 60 * 60 * 24),
  );
  const remainingFromToday = Math.max(
    0,
    (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (remainingFromAsOf <= 0) return 0;
  if (now <= asOf) return 1.0;

  return Math.min(1.0, remainingFromToday / remainingFromAsOf);
}

/**
 * Apply prorate factor to all numeric fields in stat components.
 */
export function prorateComponents(
  components: Record<string, number | undefined>,
  factor: number,
): Record<string, number | undefined> {
  const result: Record<string, number | undefined> = {};
  for (const [key, value] of Object.entries(components)) {
    result[key] = typeof value === "number" ? value * factor : undefined;
  }
  return result;
}
