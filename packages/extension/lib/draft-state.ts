import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  DraftPick,
  DraftedPlayer,
  DraftRanking,
  AuctionValue,
  Category,
} from "@espn-fantasy/shared";

// Import for local use + re-export so existing imports from draft-state continue to work
import { normalizeName } from "./engine/normalizer";
export { normalizeName };

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

export const DEFAULT_CATEGORY_TARGETS: Record<string, number> = {
  R: 1188, HR: 348, RBI: 1132, SB: 247, OPS: 0.789,
  K: 1619, SO: 1619, W: 107, SV: 132, ERA: 3.36, WHIP: 1.11,
};

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

  // Pitcher/hitter budget allocation preference (0-100, default 65 = 65% hitting)
  // Applied as SGP multiplier: hitters get split/50, pitchers get (100-split)/50.
  pitcherHitterSplit: number;

  // Auto-bid mode (session-only, NOT persisted — resets to OFF on page reload for safety)
  autoMode: boolean;

  // ESPN nomination queue (session-only, not persisted — changes every draft)
  espnNominationQueue: Array<{ playerId: number; playerName: string; position: string; queuePosition: number }>;

  // ESPN DOM-scraped auction values (playerId -> dollar value)
  // Scraped from the fixedDataTable on the draft page — more accurate than
  // backend API values. Merged incrementally as the user scrolls the table.
  espnDomAuctionValues: Record<number, number>;

  // All team budgets from pick train DOM scraping (populated every 5s in auction drafts)
  allTeamBudgets: Array<{ teamName: string; remainingBudget: number }>;

  // League categories (set from detected/fallback config at page load, not persisted)
  leagueCategories: Category[];

  // Roster slot breakdown detected from the ESPN players-table DOM.
  // Persisted across reloads since roster config doesn't change mid-draft.
  // null until first successful detection.
  detectedRosterSlots: Record<string, number> | null;

  // Winning category targets for ideal roster progress bars.
  // Defaults to historical winning values; user can customize.
  categoryTargets: Record<string, number>;

  // When true, ideal roster optimizer biases toward players filling category deficits.
  // When false, optimizer uses pure SGP efficiency (default).
  optimizeForTargets: boolean;

  // Players the user has explicitly skipped (mobile command center).
  // Array (not Set) because Sets don't serialize for persist middleware.
  skippedPlayerIds: number[];

  // When true, auto-nominate mode is active (mobile can toggle).
  // Session-only — resets on reload for safety (same as autoMode).
  autoNominateMode: boolean;

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
  resetDraftPicks: (initialBudget: number) => void;
  setCurrentAuctionPlayer: (player: DraftState['currentAuctionPlayer']) => void;
  setEspnDomAuctionValues: (values: Record<number, number>) => void;
  setMyTeamId: (teamId: string) => void;
  setRemainingBudget: (budget: number) => void;
  setAllTeamBudgets: (budgets: Array<{ teamName: string; remainingBudget: number }>) => void;
  setLeagueCategories: (categories: Category[]) => void;
  setDetectedRosterSlots: (slots: Record<string, number>) => void;
  setPitcherHitterSplit: (split: number) => void;
  setAutoMode: (enabled: boolean) => void;
  setEspnNominationQueue: (queue: DraftState['espnNominationQueue']) => void;
  setCategoryTargets: (targets: Record<string, number>) => void;
  setOptimizeForTargets: (enabled: boolean) => void;
  addSkippedPlayer: (playerId: number) => void;
  removeSkippedPlayer: (playerId: number) => void;
  setAutoNominateMode: (enabled: boolean) => void;
  setBudgetOverride: (budget: number) => void;
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
      pitcherHitterSplit: 75,
      autoMode: true,
      espnNominationQueue: [],
      espnDomAuctionValues: {},
      allTeamBudgets: [],
      leagueCategories: [],
      detectedRosterSlots: null,
      categoryTargets: DEFAULT_CATEGORY_TARGETS,
      optimizeForTargets: false,
      skippedPlayerIds: [],
      autoNominateMode: false,
      sidebarVisible: true,
      selectedPosition: null,
      showOnlyNeeds: false,
      configWarnings: [],

      // Actions
      initializeDraft: (config) => {
        const current = get();
        const isSameDraft = current.leagueId === config.leagueId && current.allPicks.length > 0;

        if (isSameDraft) {
          // Same-draft reload: update config only, preserve accumulated draft data.
          // Keep the persisted myTeamId if valid (already detected) — don't overwrite
          // with a hardcoded fallback that may be wrong for practice drafts.
          set({
            draftFormat: config.draftFormat,
            totalTeams: config.totalTeams,
            rosterSize: config.rosterSize,
            myTeamId: current.myTeamId || config.myTeamId,
            remainingBudget: config.budget || current.remainingBudget,
          });
          return;
        }

        // Different draft or fresh start — clear everything
        set({
          leagueId: config.leagueId,
          draftFormat: config.draftFormat,
          totalTeams: config.totalTeams,
          rosterSize: config.rosterSize,
          myTeamId: config.myTeamId,
          remainingBudget: config.budget || 260,
          allPicks: [],
          myRoster: [],
          currentPick: 1,
          teamRosters: new Map(),
          espnDomAuctionValues: {},
          allTeamBudgets: [],
          currentAuctionPlayer: null,
          espnNominationQueue: [],
          skippedPlayerIds: [],
          projectedStandings: null,
          userRankingOverrides: {},
        });
      },

      addPick: (pick) => {
        set((state) => {
          const normalizedIncoming = normalizeName(pick.playerName);
          const existingPick = state.allPicks.find(
            (existing) =>
              (existing.playerId === pick.playerId ||
                normalizeName(existing.playerName) === normalizedIncoming) &&
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
          const normalizedIncoming = normalizeName(player.playerName);
          const alreadyOnRoster = state.myRoster.some(
            (existing) =>
              existing.playerId === player.playerId ||
              normalizeName(existing.playerName) === normalizedIncoming,
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

      resetDraftPicks: (initialBudget) =>
        set({
          myRoster: [],
          allPicks: [],
          teamRosters: new Map(),
          currentPick: 1,
          remainingBudget: initialBudget,
          projectedStandings: null,
        }),

      setCurrentAuctionPlayer: (player) => set({ currentAuctionPlayer: player }),

      setEspnDomAuctionValues: (values) =>
        set((state) => {
          const hasChanges = Object.entries(values).some(
            ([id, val]) => state.espnDomAuctionValues[Number(id)] !== val
          );
          if (!hasChanges) return state;
          return { espnDomAuctionValues: { ...state.espnDomAuctionValues, ...values } };
        }),

      setMyTeamId: (teamId) =>
        set((state) => {
          if (state.myTeamId === teamId) return state;
          // When team ID changes (e.g., practice draft detected late),
          // rebuild myRoster from allPicks to drop picks from the old team
          // and include picks from the newly detected team.
          const myPicks = state.allPicks.filter(
            (p) => p.teamId === teamId || p.teamId === "myTeam" || p.teamName === "My Team"
          );
          const rebuiltRoster = myPicks.map((pick) => {
            const existing = state.myRoster.find((r) => r.playerId === pick.playerId);
            if (existing) return existing;
            return {
              playerId: pick.playerId,
              playerName: pick.playerName,
              positions: pick.positions,
              pickNumber: pick.pickNumber,
              cost: pick.cost,
              projectedStats: {},
            };
          });
          // Recompute remaining budget from roster costs
          const totalSpent = rebuiltRoster.reduce((sum, p) => sum + (p.cost || 0), 0);
          const initialBudget = state.draftFormat === "auction" ? 260 : 0;
          return {
            myTeamId: teamId,
            myRoster: rebuiltRoster,
            remainingBudget: state.draftFormat === "auction" ? initialBudget - totalSpent : state.remainingBudget,
          };
        }),

      setRemainingBudget: (budget) => set({ remainingBudget: budget }),

      setAllTeamBudgets: (budgets) => set({ allTeamBudgets: budgets }),

      setLeagueCategories: (categories) => set({ leagueCategories: categories }),

      setDetectedRosterSlots: (slots) => set({ detectedRosterSlots: slots }),

      setPitcherHitterSplit: (split) => set({ pitcherHitterSplit: Math.max(0, Math.min(100, split)) }),

      setAutoMode: (enabled) => set({ autoMode: enabled }),

      setEspnNominationQueue: (queue) => set({ espnNominationQueue: queue }),

      setCategoryTargets: (targets) => set({ categoryTargets: targets }),

      setOptimizeForTargets: (enabled) => set({ optimizeForTargets: enabled }),

      addSkippedPlayer: (playerId) =>
        set((state) => {
          if (state.skippedPlayerIds.includes(playerId)) return state;
          return { skippedPlayerIds: [...state.skippedPlayerIds, playerId] };
        }),

      removeSkippedPlayer: (playerId) =>
        set((state) => ({
          skippedPlayerIds: state.skippedPlayerIds.filter((id) => id !== playerId),
        })),

      setAutoNominateMode: (enabled) => set({ autoNominateMode: enabled }),

      setBudgetOverride: (budget) => set({ remainingBudget: budget }),

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
          espnNominationQueue: [],
          espnDomAuctionValues: {},
          allTeamBudgets: [],
          leagueCategories: [],
          detectedRosterSlots: null,
          skippedPlayerIds: [],
          sidebarVisible: true,
          selectedPosition: null,
          showOnlyNeeds: false,
        }),
    }),
    {
      name: "espn-draft-assistant-state",
      version: 6,
      migrate: (persistedState, version) => {
        const state = (persistedState as Partial<DraftState>) ?? {};

        // Deserialize teamRosters from array back to Map
        const teamRostersArray = (state as any).teamRosters;
        const teamRosters = teamRostersArray
          ? new Map(teamRostersArray)
          : new Map();

        if (version < 3) {
          // v2 -> v3: leagueCategories and myTeamId added to partialize.
          // For old persisted state, these will be missing — they will be populated
          // on the next setLeagueCategories / setMyTeamId call at page load.
          // Clear accumulated picks so the extension starts fresh (old state didn't
          // preserve same-draft data correctly).
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
            leagueCategories: [],
            categoryTargets: DEFAULT_CATEGORY_TARGETS,
          };
        }

        if (version < 4) {
          // v3 -> v4: categoryTargets added to partialize.
          return {
            ...state,
            teamRosters,
            categoryTargets: DEFAULT_CATEGORY_TARGETS,
            optimizeForTargets: false,
          };
        }

        if (version < 5) {
          // v4 -> v5: optimizeForTargets added to partialize.
          return {
            ...state,
            teamRosters,
            optimizeForTargets: false,
          };
        }

        if (version < 6) {
          // v5 -> v6: pitcherHitterSplit default changed from 65 to 75.
          // The UI slider is being removed in Phase 52, so reset any stale
          // persisted value to the new engine-aligned default.
          return {
            ...state,
            teamRosters,
            pitcherHitterSplit: 75,
          };
        }

        // v6+: pass state through — merge() handles Map deserialization
        return {
          ...state,
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
        pitcherHitterSplit: state.pitcherHitterSplit,
        teamRosters: Array.from(state.teamRosters.entries()), // Serialize Map to array
        // ESPN DOM-scraped values (accumulated across page sessions)
        espnDomAuctionValues: state.espnDomAuctionValues,
        // All team budgets from pick train (persisted across reloads)
        allTeamBudgets: state.allTeamBudgets,
        // Roster slot layout detected from players-table (persisted since it doesn't change mid-draft)
        detectedRosterSlots: state.detectedRosterSlots,
        // Winning category targets for ideal roster progress bars
        categoryTargets: state.categoryTargets,
        // Ideal roster optimization mode (targets vs pure SGP)
        optimizeForTargets: state.optimizeForTargets,
        // Session-stable config — set once at draft start, survives reload
        leagueCategories: state.leagueCategories,
        myTeamId: state.myTeamId,
      }),
      merge: (persisted, current) => {
        const stored = (persisted as any) ?? {};
        // Deserialize teamRosters from array back to Map on every restore
        // (partialize serializes Map → array, but Zustand's default shallow merge
        // doesn't convert back, so updateTeamRoster fails on the raw array)
        const teamRosters = Array.isArray(stored.teamRosters)
          ? new Map(stored.teamRosters)
          : stored.teamRosters instanceof Map
            ? stored.teamRosters
            : new Map();
        return { ...current, ...stored, teamRosters };
      },
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
