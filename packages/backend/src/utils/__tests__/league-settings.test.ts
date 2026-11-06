import { describe, expect, it } from "vitest";
import {
  getFaabBudget,
  getGsCap,
  normalizeAcquisitionRules,
  normalizeScoringFormat,
  resolveSeasonDates,
} from "../league-settings.js";
import { EspnDataNormalizer } from "../../adapters/espn/normalizer.js";

describe("league settings normalization", () => {
  it("normalizes a direct ESPN aggregate P season GS cap", () => {
    const rules = normalizeAcquisitionRules({
      rosterSettings: {
        lineupSlotCounts: { "13": 9, "16": 3 },
        lineupSlotStatLimits: { "13": 180 },
      },
      acquisitionSettings: {
        isUsingAcquisitionBudget: true,
        acquisitionBudget: 250,
        acquisitionLimit: 7,
      },
    });

    expect(rules).toMatchObject({
      gs_cap: 180,
      faab_budget: 250,
      acquisition_limit: 7,
    });
    expect(getGsCap({ acquisition_rules: rules })).toBe(180);
    expect(getFaabBudget({ acquisition_rules: rules })).toBe(250);
  });

  it("normalizes ESPN object-shaped lineup stat limits", () => {
    const rawSettings = {
      rosterSettings: {
        lineupSlotCounts: { "13": 9 },
        lineupSlotStatLimits: {
          "13": { statId: 33, limitValue: 200 },
        },
      },
    };

    expect(normalizeAcquisitionRules(rawSettings).gs_cap).toBe(200);
    expect(getGsCap({ acquisition_rules: {} }, rawSettings)).toBe(200);
  });

  it("ignores non-GS object-shaped lineup stat limits", () => {
    expect(
      normalizeAcquisitionRules({
        rosterSettings: {
          lineupSlotCounts: { "13": 9 },
          lineupSlotStatLimits: {
            "13": { statId: 81, limitValue: 162 },
          },
        },
      }).gs_cap,
    ).toBeNull();
  });

  it("normalizes a direct ESPN SP season GS cap without a P slot", () => {
    const rules = normalizeAcquisitionRules({
      rosterSettings: {
        lineupSlotCounts: { "14": 5, "15": 3, "16": 3 },
        lineupSlotStatLimits: { "14": 175 },
      },
    });

    expect(rules.gs_cap).toBe(175);
  });

  it("represents no cap explicitly and does not infer one from RP", () => {
    const rules = normalizeAcquisitionRules({
      rosterSettings: {
        lineupSlotCounts: { "15": 3, "16": 3 },
        lineupSlotStatLimits: { "15": 160 },
      },
      acquisitionSettings: { isUsingAcquisitionBudget: false },
    });
    expect(rules.gs_cap).toBeNull();
    expect(rules.faab_budget).toBeNull();
    expect(getGsCap({ acquisition_rules: rules })).toBeNull();
  });

  it("normalizes supported ESPN scoring formats", () => {
    expect(normalizeScoringFormat("ROTO")).toBe("roto");
    expect(normalizeScoringFormat("H2H_POINTS")).toBe("points");
    expect(normalizeScoringFormat("H2H_CATEGORY")).toBe("h2h_category");
  });

  it("derives season dates from schedule data for any season", () => {
    const dates = resolveSeasonDates({
      season: 2028,
      schedule: [
        { date: "2028-03-28T17:00:00Z" },
        { date: "2028-10-02T17:00:00Z" },
      ],
    });
    expect(dates).toEqual({
      startDate: "2028-03-28",
      endDate: "2028-10-02",
      derivedFromFallback: false,
    });
  });

  it("persists normalized ESPN settings", () => {
    const result = new EspnDataNormalizer().normalizeLeagueData({
      seasonId: 2029,
      status: { finalScoringPeriod: 190 },
      settings: {
        name: "League",
        scoringSettings: { scoringType: "ROTO" },
        rosterSettings: {
          lineupSlotCounts: { 13: 9, 14: 3 },
          lineupSlotStatLimits: { 13: 175 },
        },
        acquisitionSettings: {
          isUsingAcquisitionBudget: true,
          acquisitionBudget: 100,
        },
      },
      teams: [],
      schedule: [],
    });

    expect(result.settings.scoringFormat).toBe("roto");
    expect(result.settings.acquisitionRules.gs_cap).toBe(175);
    expect(result.settings.acquisitionRules.faab_budget).toBe(100);
    expect(result.settings.seasonStartDate.startsWith("2029-")).toBe(true);
    expect(result.settings.seasonEndDate.startsWith("2029-")).toBe(true);
  });
});
