import type { ScoringFormat } from "../../../shared/dist/index.js";

export interface CanonicalAcquisitionRules {
  waiver_type?: string | number;
  acquisition_limit?: number;
  trade_deadline?: string | number;
  gs_cap: number | null;
  faab_budget: number | null;
}

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function gsLimitValue(value: unknown): number | null {
  if (typeof value !== "object" || value === null) return positiveNumber(value);
  const limit = value as { statId?: unknown; limitValue?: unknown };
  if (limit.statId !== undefined && Number(limit.statId) !== 33) return null;
  return positiveNumber(limit.limitValue);
}

export function normalizeScoringFormat(value: unknown): ScoringFormat | null {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized === "roto" || normalized === "rotisserie") return "roto";
  if (
    normalized === "h2h_category" ||
    normalized === "h2h_categories" ||
    normalized === "headtohead" ||
    normalized === "head_to_head"
  ) {
    return "h2h_category";
  }
  if (
    normalized === "points" ||
    normalized === "h2h_points" ||
    normalized === "head_to_head_points"
  ) {
    return "points";
  }
  return null;
}

export function normalizeAcquisitionRules(
  settings: Record<string, any>,
): CanonicalAcquisitionRules {
  const acquisition = settings?.acquisitionSettings ?? {};
  const roster = settings?.rosterSettings ?? {};
  const lineupStatLimits = roster.lineupSlotStatLimits ?? {};
  const lineupSlotCounts = roster.lineupSlotCounts ?? {};
  const gsCap =
    ["13", "14"]
      .filter((slotId) => positiveNumber(lineupSlotCounts[slotId]) !== null)
      .map((slotId) => gsLimitValue(lineupStatLimits[slotId]))
      .find((limit): limit is number => limit !== null) ?? null;

  const usesFaab = acquisition.isUsingAcquisitionBudget === true;
  const faabBudget = usesFaab
    ? positiveNumber(acquisition.acquisitionBudget)
    : null;

  return {
    waiver_type: acquisition.waiverProcessDays,
    acquisition_limit:
      positiveNumber(acquisition.acquisitionLimit) ?? undefined,
    trade_deadline: settings?.tradeSettings?.deadlineDate,
    gs_cap: gsCap,
    faab_budget: faabBudget,
  };
}

export function getGsCap(
  settings: unknown,
  rawEspnSettings?: Record<string, any>,
): number | null {
  const json = (settings ?? {}) as Record<string, any>;
  const acquisition = json.acquisition_rules ?? json.acquisitionRules ?? {};
  const candidates = [
    acquisition.gs_cap,
    acquisition.gsCap,
    acquisition.max_starts,
    acquisition.maxStarts,
    json.gs_cap,
    json.roster_slots?.GS_LIMIT,
  ];

  for (const value of candidates) {
    if (value === null) return null;
    const parsed = positiveNumber(value);
    if (parsed !== null) return parsed;
  }
  return rawEspnSettings
    ? normalizeAcquisitionRules(rawEspnSettings).gs_cap
    : null;
}

export function getFaabBudget(settings: unknown): number | null {
  const json = (settings ?? {}) as Record<string, any>;
  const acquisition = json.acquisition_rules ?? json.acquisitionRules ?? {};
  const candidates = [
    acquisition.faab_budget,
    acquisition.faabBudget,
    acquisition.acquisition_budget,
    acquisition.acquisitionBudget,
    json.faab_budget,
    json.acquisitionBudget,
  ];
  for (const value of candidates) {
    if (value === null) return null;
    const parsed = positiveNumber(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export interface SeasonDates {
  startDate: string;
  endDate: string;
  derivedFromFallback: boolean;
}

export function resolveSeasonDates(options: {
  season: number;
  settings?: Record<string, any> | null;
  schedule?: unknown[] | null;
  status?: Record<string, any> | null;
}): SeasonDates {
  const { season, settings = {}, schedule = [], status = {} } = options;
  const scheduleSettings =
    settings?.scheduleSettings ?? settings?.schedule_settings ?? {};
  const explicitStart =
    isoDate(settings?.season_start_date) ??
    isoDate(scheduleSettings.startDate) ??
    isoDate(status?.startDate);
  const explicitEnd =
    isoDate(settings?.season_end_date) ??
    isoDate(scheduleSettings.endDate) ??
    isoDate(status?.endDate);

  const scheduleDates = (schedule ?? [])
    .flatMap((entry: any) => [entry?.date, entry?.startDate, entry?.endDate])
    .map(isoDate)
    .filter((value): value is string => value !== null)
    .sort();

  const fallbackStart = `${season}-03-20`;
  const startDate = explicitStart ?? scheduleDates[0] ?? fallbackStart;
  const finalPeriod = positiveNumber(
    status?.finalScoringPeriod ?? scheduleSettings.finalScoringPeriod,
  );
  let calculatedEnd: string | null = null;
  if (finalPeriod !== null) {
    const end = new Date(`${startDate}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + finalPeriod - 1);
    calculatedEnd = end.toISOString().slice(0, 10);
  }
  const endDate =
    explicitEnd ?? scheduleDates.at(-1) ?? calculatedEnd ?? `${season}-10-01`;

  return {
    startDate,
    endDate,
    derivedFromFallback: explicitStart === null && scheduleDates.length === 0,
  };
}
