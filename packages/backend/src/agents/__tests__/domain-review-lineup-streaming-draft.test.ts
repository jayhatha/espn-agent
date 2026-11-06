import { describe, expect, it } from "vitest";
import type { Category } from "../../../../shared/dist/index.js";
import {
  applyHitterGameContext,
  buildLineupRecommendationDiff,
  groupRosterSlotOccupants,
  optimizeDailyLineup,
  projectDailyComponents,
  scaleProjectionToAppearance,
} from "../lineup-optimizer.js";
import {
  parseDailyBattingContexts,
  type MLBGame,
} from "../../adapters/mlb-statsapi.js";
import {
  countProbablePitcherAppearances,
  scalePitcherProjection,
} from "../streaming-pitcher.js";
import {
  calculateRosterBasedValues,
  canonicalEligiblePositions,
  getDraftableRosterSlots,
  selectRosterFeasiblePlayers,
} from "../draft-value-model.js";

const homeStart = {
  mlbPlayerId: 123,
  fullName: "José Berríos",
  opponent: "Boston Red Sox",
  opponentId: 111,
  isHome: true,
  venue: "Rogers Centre",
  gameDate: "2026-07-17",
  gamePk: 1,
};

describe("remaining fantasy domain review fixes", () => {
  it("groups repeated ESPN slot occupants by canonical slot index", () => {
    const occupants = groupRosterSlotOccupants([
      { player_id: 10, roster_slot: "OF" },
      { player_id: 11, roster_slot: "OF" },
      { player_id: 12, roster_slot: "BE" },
    ]);

    expect(occupants.get("OF")).toEqual([10, 11]);
    expect(occupants.get("BN")).toEqual([12]);
  });

  it("keeps a specialist in a constrained slot and moves a stronger flex player to OF", () => {
    const lineup = optimizeDailyLineup(
      [
        {
          playerId: 1,
          playerName: "Flex Star",
          positions: ["SS", "OF"],
          projectedValue: 100,
          hasGameToday: true,
        },
        {
          playerId: 2,
          playerName: "Shortstop Specialist",
          positions: ["SS"],
          projectedValue: 99,
          hasGameToday: true,
        },
        {
          playerId: 3,
          playerName: "Replacement Outfielder",
          positions: ["OF"],
          projectedValue: 1,
          hasGameToday: true,
        },
      ],
      [
        {
          slotId: "SS",
          slotName: "SS",
          eligiblePositions: [],
          isActive: true,
          currentPlayerId: 1,
        },
        {
          slotId: "OF",
          slotName: "OF",
          eligiblePositions: [],
          isActive: true,
          currentPlayerId: 3,
        },
      ],
    );

    expect(lineup).toEqual(
      new Map([
        ["SS", 2],
        ["OF", 1],
      ]),
    );
  });

  it("preserves occupants across equivalent repeated OF slots", () => {
    const candidates = [
      {
        playerId: 1,
        playerName: "Lower",
        positions: ["OF"],
        projectedValue: 5,
        hasGameToday: true,
      },
      {
        playerId: 2,
        playerName: "Higher",
        positions: ["OF"],
        projectedValue: 10,
        hasGameToday: true,
      },
    ];
    const slots = [
      {
        slotId: "OF_1",
        slotName: "OF",
        eligiblePositions: [],
        isActive: true,
        currentPlayerId: 1,
      },
      {
        slotId: "OF_2",
        slotName: "OF",
        eligiblePositions: [],
        isActive: true,
        currentPlayerId: 2,
      },
    ];

    const lineup = optimizeDailyLineup(candidates, slots);
    expect(lineup).toEqual(
      new Map([
        ["OF_1", 1],
        ["OF_2", 2],
      ]),
    );
    expect(
      buildLineupRecommendationDiff(candidates, slots, lineup).recommendations,
    ).toEqual([]);
  });

  it("leaves active slot unmatched when every eligible daily value is zero", () => {
    const candidates = [
      {
        playerId: 2,
        playerName: "Current SS",
        positions: ["SS"],
        projectedValue: 0,
        hasGameToday: false,
      },
      {
        playerId: 1,
        playerName: "Bench SS",
        positions: ["SS"],
        projectedValue: 0,
        hasGameToday: false,
      },
    ];
    const slots = [
      {
        slotId: "SS",
        slotName: "SS",
        eligiblePositions: [],
        isActive: true,
        currentPlayerId: 2,
      },
      {
        slotId: "BN",
        slotName: "BN",
        eligiblePositions: [],
        isActive: false,
        currentPlayerId: 1,
      },
    ];
    const lineup = optimizeDailyLineup(candidates, slots);

    expect(lineup).toEqual(new Map());
    expect(buildLineupRecommendationDiff(candidates, slots, lineup)).toEqual({
      recommendations: [],
      totalProjectedGain: 0,
    });
  });

  it("never moves a negative-value bench player into an empty active slot", () => {
    const candidates = [
      {
        playerId: 1,
        playerName: "Negative OF",
        positions: ["OF"],
        projectedValue: -1,
        hasGameToday: true,
      },
    ];
    const slots = [
      { slotId: "OF", slotName: "OF", eligiblePositions: [], isActive: true },
      {
        slotId: "BN",
        slotName: "BN",
        eligiblePositions: [],
        isActive: false,
        currentPlayerId: 1,
      },
    ];
    const lineup = optimizeDailyLineup(candidates, slots);

    expect(lineup).toEqual(new Map());
    expect(buildLineupRecommendationDiff(candidates, slots, lineup)).toEqual({
      recommendations: [],
      totalProjectedGain: 0,
    });
  });

  it("suppresses a non-positive atomic lineup diff", () => {
    const candidates = [
      {
        playerId: 1,
        playerName: "Current",
        positions: ["SS"],
        projectedValue: 0,
        hasGameToday: false,
      },
      {
        playerId: 2,
        playerName: "Bench",
        positions: ["SS"],
        projectedValue: 0,
        hasGameToday: false,
      },
    ];
    const slots = [
      {
        slotId: "SS",
        slotName: "SS",
        eligiblePositions: [],
        isActive: true,
        currentPlayerId: 1,
      },
      {
        slotId: "BN",
        slotName: "BN",
        eligiblePositions: [],
        isActive: false,
        currentPlayerId: 2,
      },
    ];

    expect(
      buildLineupRecommendationDiff(candidates, slots, new Map([["SS", 2]])),
    ).toEqual({
      recommendations: [],
      totalProjectedGain: 0,
    });
  });

  it("emits active and bench legs when filling an empty active slot", () => {
    const candidates = [
      {
        playerId: 1,
        playerName: "Bench OF",
        positions: ["OF"],
        projectedValue: 5,
        hasGameToday: true,
      },
    ];
    const slots = [
      { slotId: "OF", slotName: "OF", eligiblePositions: [], isActive: true },
      {
        slotId: "BN",
        slotName: "BN",
        eligiblePositions: [],
        isActive: false,
        currentPlayerId: 1,
      },
    ];
    const diff = buildLineupRecommendationDiff(
      candidates,
      slots,
      optimizeDailyLineup(candidates, slots),
    );

    expect(
      diff.recommendations.map((recommendation) => [
        recommendation.slotId,
        recommendation.currentPlayerId,
        recommendation.recommendedPlayerId,
      ]),
    ).toEqual([
      ["OF", 0, 1],
      ["BN", 1, 0],
    ]);
    expect(diff.totalProjectedGain).toBe(5);
  });

  it("emits every leg of a multi-slot cycle including bench transition", () => {
    const candidates = [
      {
        playerId: 1,
        playerName: "Flex",
        positions: ["1B", "2B"],
        projectedValue: 9,
        hasGameToday: true,
      },
      {
        playerId: 2,
        playerName: "Second",
        positions: ["2B"],
        projectedValue: 8,
        hasGameToday: true,
      },
      {
        playerId: 3,
        playerName: "First",
        positions: ["1B"],
        projectedValue: 10,
        hasGameToday: true,
      },
    ];
    const slots = [
      {
        slotId: "1B",
        slotName: "1B",
        eligiblePositions: [],
        isActive: true,
        currentPlayerId: 1,
      },
      {
        slotId: "2B",
        slotName: "2B",
        eligiblePositions: [],
        isActive: true,
        currentPlayerId: 2,
      },
      {
        slotId: "BN",
        slotName: "BN",
        eligiblePositions: [],
        isActive: false,
        currentPlayerId: 3,
      },
    ];
    const diff = buildLineupRecommendationDiff(
      candidates,
      slots,
      optimizeDailyLineup(candidates, slots),
    );

    expect(
      diff.recommendations.map((recommendation) => [
        recommendation.slotId,
        recommendation.currentPlayerId,
        recommendation.recommendedPlayerId,
      ]),
    ).toEqual([
      ["1B", 1, 3],
      ["2B", 2, 1],
      ["BN", 3, 2],
    ]);
    expect(
      diff.recommendations.find(
        (recommendation) => recommendation.slotId === "BN",
      )?.projectedValueGain,
    ).toBe(0);
  });

  it("scales daily projections by games or starts rather than 162", () => {
    expect(
      scaleProjectionToAppearance({ G: 100, HR: 20, AB: 400 }, false).HR,
    ).toBeCloseTo(0.2);
    expect(
      scaleProjectionToAppearance({ GS: 20, K: 120, IP: 110 }, true).K,
    ).toBeCloseTo(6);
  });

  it("values a scheduled reliever by per-appearance projection and appearance probability", () => {
    const daily = projectDailyComponents(
      { G: 30, GS: 0, IP: 30, K: 36, SV: 12 },
      {
        positions: ["RP"],
        hasTeamGame: true,
        isProbableStarter: false,
        projectedTeamGames: 60,
      },
    );

    expect(daily.hasAppearance).toBe(true);
    expect(daily.components.K).toBeCloseTo(0.6);
    expect(daily.components.SV).toBeCloseTo(0.2);
  });

  it("assigns zero daily value when a player's team has no game", () => {
    const daily = projectDailyComponents(
      { G: 30, GS: 0, IP: 30, K: 36 },
      {
        positions: ["RP"],
        hasTeamGame: false,
        isProbableStarter: false,
        projectedTeamGames: 60,
      },
    );

    expect(daily).toEqual({ components: {}, hasAppearance: false });
  });

  it("gates starters on probable-pitcher status", () => {
    const projection = { G: 20, GS: 20, IP: 120, K: 140 };
    const scheduled = {
      positions: ["SP"],
      hasTeamGame: true,
      projectedTeamGames: 60,
    };

    expect(
      projectDailyComponents(projection, {
        ...scheduled,
        isProbableStarter: false,
      }),
    ).toEqual({ components: {}, hasAppearance: false });
    expect(
      projectDailyComponents(projection, {
        ...scheduled,
        isProbableStarter: true,
      }).components.K,
    ).toBeCloseTo(7);
  });

  it("uses full per-game projection for a confirmed starting hitter", () => {
    const daily = projectDailyComponents(
      { G: 100, AB: 400, H: 100, HR: 20 },
      {
        positions: ["OF"],
        hasTeamGame: true,
        isProbableStarter: false,
        projectedTeamGames: 60,
        hitterLineupStatus: "confirmed",
        isConfirmedHitterStarter: true,
      },
    );

    expect(daily.hasAppearance).toBe(true);
    expect(daily.components.HR).toBeCloseTo(0.2);
  });

  it("zeros a confirmed bench hitter", () => {
    expect(
      projectDailyComponents(
        { G: 100, AB: 400, H: 100, HR: 20 },
        {
          positions: ["OF"],
          hasTeamGame: true,
          isProbableStarter: false,
          projectedTeamGames: 60,
          hitterLineupStatus: "confirmed",
          isConfirmedHitterStarter: false,
        },
      ),
    ).toEqual({ components: {}, hasAppearance: false });
  });

  it("uses projection-based appearance probability when lineup is unavailable", () => {
    const daily = projectDailyComponents(
      { G: 30, AB: 120, H: 30, HR: 6 },
      {
        positions: ["OF"],
        hasTeamGame: true,
        isProbableStarter: false,
        projectedTeamGames: 60,
        hitterLineupStatus: "unavailable",
      },
    );

    expect(daily.hasAppearance).toBe(true);
    expect(daily.components.HR).toBeCloseTo(0.1);
  });

  it("adjusts production stats only when park and platoon evidence exists", () => {
    const adjusted = applyHitterGameContext(
      { AB: 4, H: 1, HR: 0.2, R: 0.5 },
      110,
      0.9,
    );
    expect(adjusted.AB).toBe(4);
    expect(adjusted.H).toBeCloseTo(0.99);
    expect(adjusted.HR).toBeCloseTo(0.198);
    expect(adjusted.R).toBeCloseTo(0.495);
    expect(applyHitterGameContext({ AB: 4, H: 1 })).toEqual({ AB: 4, H: 1 });
  });

  it("parses confirmed starters and opposing pitcher hand from MLB feed", () => {
    const game: MLBGame = {
      gamePk: 99,
      gameDate: "2026-07-17",
      teams: {
        away: {
          team: { id: 147, name: "New York Yankees", abbreviation: "NYY" },
          probablePitcher: { id: 700, fullName: "Away Pitcher" },
        },
        home: {
          team: { id: 111, name: "Boston Red Sox", abbreviation: "BOS" },
          probablePitcher: { id: 701, fullName: "Home Pitcher" },
        },
      },
      venue: { id: 1, name: "Fenway Park" },
      status: { detailedState: "Preview" },
    };
    const contexts = parseDailyBattingContexts(
      [game],
      new Map([
        [
          99,
          {
            gameData: {
              players: { ID701: { pitchHand: { code: "L" } } },
              venue: { parkFactor: 105 },
            },
            liveData: {
              boxscore: {
                teams: {
                  away: {
                    players: {
                      ID10: {
                        person: { id: 10, fullName: "Starting Hitter" },
                        battingOrder: "100",
                      },
                      ID11: { person: { id: 11, fullName: "Bench Hitter" } },
                    },
                  },
                  home: { players: {} },
                },
              },
            },
          },
        ],
      ]),
    );

    expect(contexts[0]).toMatchObject({
      lineupStatus: "confirmed",
      starters: [
        { mlbPlayerId: 10, fullName: "Starting Hitter", battingOrder: 100 },
      ],
      opponentProbablePitcher: { mlbPlayerId: 701, throws: "L" },
      parkFactor: 105,
    });
    expect(contexts[1].lineupStatus).toBe("unavailable");
  });

  it("counts probable appearances by MLB identity with normalized-name fallback", () => {
    const counts = countProbablePitcherAppearances([
      homeStart,
      { ...homeStart, gamePk: 2, gameDate: "2026-07-22" },
      { ...homeStart, mlbPlayerId: 0, fullName: "José  Berríos", gamePk: 3 },
      { ...homeStart, mlbPlayerId: 0, fullName: "Jose Berrios", gamePk: 4 },
    ]);

    expect(counts.get("mlb:123")).toBe(2);
    expect(counts.get("name:joseberrios")).toBe(2);
  });

  it("returns per-start components from projected GS", () => {
    const scaled = scalePitcherProjection({ GS: 10, IP: 60, K: 70, ER: 20 });
    expect(scaled.basis).toBe("per_start");
    expect(scaled.components).toMatchObject({ GS: 1, IP: 6, K: 7, ER: 2 });
  });

  it("adds universal UTIL and P eligibility and excludes IL from draft capacity", () => {
    expect(canonicalEligiblePositions(["SS"], { AB: 500 })).toContain("UTIL");
    expect(canonicalEligiblePositions(["SP"], { IP: 150 })).toContain("P");
    expect(getDraftableRosterSlots({ C: 1, UTIL: 1, P: 1, IL: 3 })).toEqual({
      C: 1,
      UTIL: 1,
      P: 1,
    });
  });

  it("selects a roster-feasible auction pool instead of top N regardless of slots", () => {
    const players = [
      {
        playerId: 1,
        positions: ["OF", "UTIL"],
        projectedStats: { AB: 500 },
        score: 100,
      },
      {
        playerId: 2,
        positions: ["OF", "UTIL"],
        projectedStats: { AB: 500 },
        score: 90,
      },
      {
        playerId: 3,
        positions: ["C", "UTIL"],
        projectedStats: { AB: 400 },
        score: 40,
      },
      {
        playerId: 4,
        positions: ["SP", "P"],
        projectedStats: { IP: 150 },
        score: 30,
      },
    ];
    const selected = selectRosterFeasiblePlayers(
      players,
      { C: 1, UTIL: 1, P: 1, IL: 2 },
      1,
      (player) => player.score,
    );

    expect(selected.map((player) => player.playerId).sort()).toEqual([1, 3, 4]);
  });

  it("matches a 1B/2B flex player away from the only 1B specialist", () => {
    const players = [
      { playerId: 1, positions: ["1B", "2B"], projectedStats: {}, score: 100 },
      { playerId: 2, positions: ["1B"], projectedStats: {}, score: 99 },
    ];
    const selected = selectRosterFeasiblePlayers(
      players,
      { "1B": 1, "2B": 1 },
      1,
      (player) => player.score,
    );

    expect(selected.map((player) => player.playerId).sort()).toEqual([1, 2]);
  });

  it("builds a maximum-weight roster-feasible auction pool across teams", () => {
    const players = [
      { playerId: 1, positions: ["1B", "2B"], projectedStats: {}, score: 100 },
      { playerId: 2, positions: ["1B"], projectedStats: {}, score: 99 },
      { playerId: 3, positions: ["1B", "2B"], projectedStats: {}, score: 98 },
      { playerId: 4, positions: ["1B"], projectedStats: {}, score: 97 },
      { playerId: 5, positions: ["2B"], projectedStats: {}, score: 1 },
    ];
    const selected = selectRosterFeasiblePlayers(
      players,
      { "1B": 1, "2B": 1 },
      2,
      (player) => player.score,
    );

    expect(selected.map((player) => player.playerId).sort()).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it("values player marginal effects against feasible replacement rosters", () => {
    const categories: Category[] = [
      {
        category_id: "hr",
        name: "Home Runs",
        stat_key: "HR",
        type: "COUNTING",
        direction: "HIGHER_BETTER",
      },
    ];
    const values = calculateRosterBasedValues(
      [
        { playerId: 1, positions: ["C"], projectedStats: { AB: 400, HR: 30 } },
        { playerId: 2, positions: ["C"], projectedStats: { AB: 400, HR: 10 } },
        { playerId: 3, positions: ["OF"], projectedStats: { AB: 500, HR: 35 } },
        { playerId: 4, positions: ["OF"], projectedStats: { AB: 500, HR: 20 } },
        { playerId: 5, positions: ["OF"], projectedStats: { AB: 450, HR: 15 } },
        { playerId: 6, positions: ["OF"], projectedStats: { AB: 450, HR: 5 } },
      ],
      categories,
      { C: 1, UTIL: 1 },
      2,
    );

    expect(values.find((value) => value.playerId === 3)?.positions).toContain(
      "UTIL",
    );
    expect(
      values.find((value) => value.playerId === 3)!.sgpTotal,
    ).toBeGreaterThan(values.find((value) => value.playerId === 6)!.sgpTotal);
  });
});
