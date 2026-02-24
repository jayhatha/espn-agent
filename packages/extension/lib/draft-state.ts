import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DraftPick, DraftedPlayer, DraftRanking, AuctionValue } from '@espn-fantasy/shared';

interface DraftState {
  // Draft metadata
  leagueId: number | null;
  draftFormat: 'snake' | 'auction';
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

  // UI state
  sidebarVisible: boolean;
  selectedPosition: string | null;
  showOnlyNeeds: boolean;

  // Actions
  initializeDraft: (config: {
    leagueId: number;
    draftFormat: 'snake' | 'auction';
    totalTeams: number;
    rosterSize: number;
    myTeamId: string;
    budget?: number;
  }) => void;
  addPick: (pick: DraftPick) => void;
  updateRoster: (player: DraftedPlayer) => void;
  setRankings: (rankings: DraftRanking[]) => void;
  setAuctionValues: (values: AuctionValue[]) => void;
  toggleSidebar: () => void;
  setPositionFilter: (position: string | null) => void;
  toggleNeedsFilter: () => void;
  reset: () => void;
}

export const useDraftStore = create<DraftState>()(
  persist(
    (set, get) => ({
      // Initial state
      leagueId: null,
      draftFormat: 'snake',
      totalTeams: 12,
      currentPick: 1,
      rosterSize: 25,
      myTeamId: null,
      myRoster: [],
      remainingBudget: 260,
      allPicks: [],
      rankings: [],
      auctionValues: [],
      sidebarVisible: true,
      selectedPosition: null,
      showOnlyNeeds: false,

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
        set((state) => ({
          allPicks: [...state.allPicks, pick],
          currentPick: state.currentPick + 1,
        }));
      },

      updateRoster: (player) => {
        set((state) => ({
          myRoster: [...state.myRoster, player],
          remainingBudget: state.draftFormat === 'auction'
            ? state.remainingBudget - (player.cost || 1)
            : state.remainingBudget,
        }));
      },

      setRankings: (rankings) => set({ rankings }),
      setAuctionValues: (values) => set({ auctionValues: values }),
      toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),
      setPositionFilter: (position) => set({ selectedPosition: position }),
      toggleNeedsFilter: () => set((state) => ({ showOnlyNeeds: !state.showOnlyNeeds })),

      reset: () => set({
        allPicks: [],
        myRoster: [],
        currentPick: 1,
        remainingBudget: 260,
        rankings: [],
        auctionValues: [],
        sidebarVisible: true,
        selectedPosition: null,
        showOnlyNeeds: false,
      }),
    }),
    {
      name: 'espn-draft-assistant-state',
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
    }
  )
);
