import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  DraftPick,
  DraftedPlayer,
  DraftRanking,
  AuctionValue,
} from "@espn-fantasy/shared";

export interface ProjectedOverallRow {
  team_id: number;
  teamName: string;
  projected_overall_rank: number;
  projected_overall_points: number;
}

export interface CurrentOverallRow {
  team_id: number;
  teamName: string;
  overall_rank: number;
  overall_points: number;
}

export interface ProjectedStandingsSnapshot {
  snapshotDate: string;
  overallStandings: ProjectedOverallRow[];
  currentOverallStandings: CurrentOverallRow[];
}

interface DraftState {
  // Draft metadata
  leagueId: number | null;
  draftFormat: "snake" | "auction";
  totalTeams: number;
  currentPick: number;
  rosterSize: number;

  // User's team
  myTeamId: string | null;
  myRoster: DraftedPlayer[];
  remainingBudget: number; // Auction only

  // All picks (across all teams)
  allPicks: DraftPick[];

  // Rankings and recommendations
  rankings: DraftRanking[];
  auctionValues: AuctionValue[];
  projectedStandings: ProjectedStandingsSnapshot | null;

  // User ranking overrides (playerID -> adjusted rank)
  userRankingOverrides: Record<number, number>;

  // UI state
  sidebarVisible: boolean;
  selectedPosition: string | null;
  showOnlyNeeds: boolean;
  configWarnings: string[];

  // Actions
  initializeDraft: (config: {
    leagueId: number;
    draftFormat: "snake" | "auction";
    totalTeams: number;
    rosterSize: number;
    myTeamId: string;
    budget?: number;
  }) => void;
  addPick: (pick: DraftPick) => void;
  updateRoster: (player: DraftedPlayer) => void;
  setRankings: (rankings: DraftRanking[]) => void;
  setAuctionValues: (values: AuctionValue[]) => void;
  setProjectedStandings: (standings: ProjectedStandingsSnapshot | null) => void;
  toggleSidebar: () => void;
  setPositionFilter: (position: string | null) => void;
  toggleNeedsFilter: () => void;
  setPlayerOverrideRank: (playerId: number, newRank: number) => void;
  clearPlayerOverride: (playerId: number) => void;
  clearAllOverrides: () => void;
  setConfigWarnings: (warnings: string[]) => void;
  reset: () => void;
}

export const useDraftStore = create<DraftState>()(
  persist(
    (set, get) => ({
      // Initial state
      leagueId: null,
      draftFormat: "snake",
      totalTeams: 12,
      currentPick: 1,
      rosterSize: 25,
      myTeamId: null,
      myRoster: [],
      remainingBudget: 260,
      allPicks: [],
      rankings: [],
      auctionValues: [],
      projectedStandings: null,
      userRankingOverrides: {},
      sidebarVisible: true,
      selectedPosition: null,
      showOnlyNeeds: false,
      configWarnings: [],

      // Actions
      initializeDraft: (config) => {
        set({
          leagueId: config.leagueId,
          draftFormat: config.draftFormat,
          totalTeams: config.totalTeams,
          rosterSize: config.rosterSize,
          myTeamId: config.myTeamId,
          remainingBudget: config.budget || 260,
        });
      },

      addPick: (pick) => {
        set((state) => {
          const existingPick = state.allPicks.find(
            (existing) =>
              existing.playerId === pick.playerId &&
              existing.teamId === pick.teamId &&
              existing.cost === pick.cost,
          );

          if (existingPick) {
            return state;
          }

          return {
            allPicks: [...state.allPicks, pick],
            currentPick: state.currentPick + 1,
          };
        });
      },

      updateRoster: (player) => {
        set((state) => {
          const alreadyOnRoster = state.myRoster.some(
            (existing) => existing.playerId === player.playerId,
          );

          if (alreadyOnRoster) {
            return state;
          }

          return {
            myRoster: [...state.myRoster, player],
            remainingBudget:
              state.draftFormat === "auction"
                ? state.remainingBudget - (player.cost || 0)
                : state.remainingBudget,
          };
        });
      },

      setRankings: (rankings) => set({ rankings }),
      setAuctionValues: (values) => set({ auctionValues: values }),
      setProjectedStandings: (projectedStandings) =>
        set({ projectedStandings }),
      toggleSidebar: () =>
        set((state) => ({ sidebarVisible: !state.sidebarVisible })),
      setPositionFilter: (position) => set({ selectedPosition: position }),
      toggleNeedsFilter: () =>
        set((state) => ({ showOnlyNeeds: !state.showOnlyNeeds })),

      setPlayerOverrideRank: (playerId, newRank) => {
        set((state) => ({
          userRankingOverrides: {
            ...state.userRankingOverrides,
            [playerId]: newRank,
          },
        }));
      },

      clearPlayerOverride: (playerId) => {
        set((state) => {
          const overrides = { ...state.userRankingOverrides };
          delete overrides[playerId];
          return { userRankingOverrides: overrides };
        });
      },

      clearAllOverrides: () => set({ userRankingOverrides: {} }),

      setConfigWarnings: (warnings) => set({ configWarnings: warnings }),

      reset: () =>
        set({
          allPicks: [],
          myRoster: [],
          currentPick: 1,
          remainingBudget: 260,
          rankings: [],
          auctionValues: [],
          projectedStandings: null,
          sidebarVisible: true,
          selectedPosition: null,
          showOnlyNeeds: false,
        }),
    }),
    {
      name: "espn-draft-assistant-state",
      version: 2,
      migrate: (persistedState) => {
        const state = (persistedState as Partial<DraftState>) ?? {};

        return {
          ...state,
          leagueId: null,
          draftFormat: "snake",
          totalTeams: 12,
          currentPick: 1,
          rosterSize: 25,
          myTeamId: null,
          myRoster: [],
          remainingBudget: 260,
          allPicks: [],
          rankings: [],
          auctionValues: [],
          projectedStandings: null,
        };
      },
      partialize: (state) => ({
        userRankingOverrides: state.userRankingOverrides,
        selectedPosition: state.selectedPosition,
        showOnlyNeeds: state.showOnlyNeeds,
      }),
      storage: {
        getItem: async (name) => {
          const result = await chrome.storage.local.get(name);
          const value = result[name];
          return value ? JSON.parse(value) : null;
        },
        setItem: async (name, value) => {
          await chrome.storage.local.set({ [name]: JSON.stringify(value) });
        },
        removeItem: async (name) => {
          await chrome.storage.local.remove(name);
        },
      },
    },
  ),
);
