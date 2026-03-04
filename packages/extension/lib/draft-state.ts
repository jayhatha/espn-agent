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
  remainingBudget: number; // Auction only (detected from ESPN or default 260)

  // All picks (across all teams)
  allPicks: DraftPick[];

  // Rankings and recommendations
  rankings: DraftRanking[];
  auctionValues: AuctionValue[];
  projectedStandings: ProjectedStandingsSnapshot | null;

  // User ranking overrides (playerID -> adjusted rank)
  userRankingOverrides: Record<number, number>;

  // Team rosters accumulated during draft (teamId -> roster data)
  teamRosters: Map<string, { teamId: string; teamName: string; playerIds: number[] }>;

  // Current auction player (session-only, not persisted)
  currentAuctionPlayer: {
    playerName: string;
    currentBid?: number;
    positions?: string[];
    playerId?: number;
  } | null;

  // ESPN DOM-scraped auction values (playerId -> dollar value)
  // Scraped from the fixedDataTable on the draft page — more accurate than
  // backend API values. Merged incrementally as the user scrolls the table.
  espnDomAuctionValues: Record<number, number>;

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
    budget?: number; // Detected from ESPN DOM (default: 260)
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
  dismissConfigWarnings: () => void;
  updateTeamRoster: (teamId: string, teamName: string, playerId: number) => void;
  setAllTeamRosters: (rosters: Map<string, { teamId: string; teamName: string; playerIds: number[] }>) => void;
  clearTeamRosters: () => void;
  setCurrentAuctionPlayer: (player: DraftState['currentAuctionPlayer']) => void;
  setEspnDomAuctionValues: (values: Record<number, number>) => void;
  setMyTeamId: (teamId: string) => void;
  setRemainingBudget: (budget: number) => void;
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
      remainingBudget: 260, // Default value, overridden by config on initialization
      allPicks: [],
      rankings: [],
      auctionValues: [],
      projectedStandings: null,
      userRankingOverrides: {},
      teamRosters: new Map(),
      currentAuctionPlayer: null,
      espnDomAuctionValues: {},
      sidebarVisible: true,
      selectedPosition: null,
      showOnlyNeeds: false,
      configWarnings: [],

      // Actions
      initializeDraft: (config) => {
        const current = get();
        const sameLeague = current.leagueId === config.leagueId;

        set({
          leagueId: config.leagueId,
          draftFormat: config.draftFormat,
          totalTeams: config.totalTeams,
          rosterSize: config.rosterSize,
          myTeamId: config.myTeamId,
          // Preserve budget/roster state on reload (same league)
          remainingBudget: sameLeague && current.myRoster.length > 0
            ? current.remainingBudget
            : config.budget || 260,
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
      dismissConfigWarnings: () => set({ configWarnings: [] }),

      updateTeamRoster: (teamId, teamName, playerId) => {
        set((state) => {
          const newRosters = new Map(state.teamRosters);
          const existingRoster = newRosters.get(teamId);

          if (existingRoster) {
            // Check if player already on roster (dedupe)
            if (!existingRoster.playerIds.includes(playerId)) {
              existingRoster.playerIds.push(playerId);
            }
          } else {
            // Create new roster entry
            newRosters.set(teamId, {
              teamId,
              teamName,
              playerIds: [playerId],
            });
          }

          return { teamRosters: newRosters };
        });
      },

      setAllTeamRosters: (rosters) => set({ teamRosters: rosters }),

      clearTeamRosters: () => set({ teamRosters: new Map() }),

      setCurrentAuctionPlayer: (player) => set({ currentAuctionPlayer: player }),

      setEspnDomAuctionValues: (values) =>
        set((state) => ({
          espnDomAuctionValues: { ...state.espnDomAuctionValues, ...values },
        })),

      setMyTeamId: (teamId) => set({ myTeamId: teamId }),

      setRemainingBudget: (budget) => set({ remainingBudget: budget }),

      reset: () =>
        set({
          allPicks: [],
          myRoster: [],
          currentPick: 1,
          remainingBudget: 260,
          rankings: [],
          auctionValues: [],
          projectedStandings: null,
          teamRosters: new Map(),
          currentAuctionPlayer: null,
          espnDomAuctionValues: {},
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

        // Deserialize teamRosters from array back to Map
        const teamRostersArray = (state as any).teamRosters;
        const teamRosters = teamRostersArray
          ? new Map(teamRostersArray)
          : new Map();

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
          teamRosters,
        };
      },
      partialize: (state) => ({
        // Draft progress (survives reload)
        leagueId: state.leagueId,
        draftFormat: state.draftFormat,
        totalTeams: state.totalTeams,
        rosterSize: state.rosterSize,
        currentPick: state.currentPick,
        myRoster: state.myRoster,
        remainingBudget: state.remainingBudget,
        allPicks: state.allPicks,
        // User preferences
        userRankingOverrides: state.userRankingOverrides,
        selectedPosition: state.selectedPosition,
        showOnlyNeeds: state.showOnlyNeeds,
        teamRosters: Array.from(state.teamRosters.entries()), // Serialize Map to array
        // ESPN DOM-scraped values (accumulated across page sessions)
        espnDomAuctionValues: state.espnDomAuctionValues,
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
