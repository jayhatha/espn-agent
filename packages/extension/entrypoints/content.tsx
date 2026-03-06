import { createRoot } from "react-dom/client";
import type { DraftPick } from "@espn-fantasy/shared";
import {
  observeDraftBoard,
  parseLeagueIdFromUrl,
  detectDraftFormat,
  collectCompletedPicksSnapshot,
  diagnoseDOMStructure,
  testParsePick,
  parseTeamRostersFromDOM,
  logRosterDiagnostics,
  observeCurrentAuctionPlayer,
  scrapeESPNAuctionTable,
} from "../lib/dom-observers";
import { useDraftStore } from "../lib/draft-state";
import {
  getRankings,
  getAuctionValues,
  resolveBackendLeagueId,
  throttle,
} from "../lib/api-client";
import { detectLeagueConfig, detectMyTeam, detectAllTeamBudgets, detectRosterSlotsFromPlayersTable, detectRosterSizeFromPositionTracker } from "../lib/draft-config-detector";
import type { DraftConfiguration } from "@espn-fantasy/shared";
import DraftSidebar from "../components/DraftSidebar";
import contentStyles from "../styles/content.css?inline";
import { calculateProjectedStandingsFromState } from "../lib/value-calculations";

const SIDEBAR_ROOT_ID = "espn-draft-assistant-root";
const SIDEBAR_DOCK_STORAGE_KEY = "assistantDockSide";

// Cache league config for auto-refresh (detected once at page load)
let cachedLeagueConfig: DraftConfiguration | null = null;
let configDetectionWarnings: string[] = [];

function normalizePlayerName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(jr|sr)\.?\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}


export default defineContentScript({
  matches: ["https://fantasy.espn.com/baseball/draft*"],
  runAt: "document_idle",

  async main() {
    console.log("[ESPN Draft Assistant] Content script loaded");

    // Parse draft metadata from page
    const leagueId = parseLeagueIdFromUrl();
    const urlParams = new URLSearchParams(window.location.search);
    const teamId = urlParams.get("teamId");
    const detectedDraftFormat = detectDraftFormat();

    if (!leagueId) {
      console.warn("[ESPN Draft Assistant] Could not parse league ID from URL");
      return;
    }

    console.log("[ESPN Draft Assistant] Draft detected:", {
      leagueId,
      draftFormat: detectedDraftFormat,
    });

    // Expose diagnostic functions for debugging (development only)
    if (import.meta.env.DEV) {
      (window as any).espnDraftAssistant = {
        diagnose: diagnoseDOMStructure,
        testPick: testParsePick,
        diagnoseRosters: () => {
          // Show stored state instead of parsing DOM
          const { teamRosters } = useDraftStore.getState();
          console.log("Stored Team Rosters:", Array.from(teamRosters.entries()));

          // Also parse DOM for comparison
          const domRosters = parseTeamRostersFromDOM();
          console.log("DOM-Parsed Rosters:", Array.from(domRosters.entries()));
        },
        version: "1.0.0",
      };
      console.log(
        "[ESPN Draft Assistant] Diagnostic tools available at window.espnDraftAssistant",
      );
    }

    const draftPageTitle =
      document.querySelector("h1.title")?.textContent?.trim() ||
      document.querySelector("h1")?.textContent?.trim() ||
      document.title;

    let resolvedBackendLeagueId: string | null = null;

    const resolveBackendLeagueMapping = async () => {
      resolvedBackendLeagueId = await resolveBackendLeagueId(
        leagueId.toString(),
        draftPageTitle,
      );

      if (resolvedBackendLeagueId) {
        console.log("[ESPN Draft Assistant] Using mapped backend league:", {
          espnLeagueId: leagueId,
          backendLeagueId: resolvedBackendLeagueId,
        });
      } else {
        console.log("[ESPN Draft Assistant] No backend league mapping found", {
          espnLeagueId: leagueId,
          draftPageTitle,
        });
      }

      return resolvedBackendLeagueId;
    };

    await resolveBackendLeagueMapping();

    // Detect league config once at page load (user constraint)
    const detection = detectLeagueConfig();
    configDetectionWarnings = detection.warnings;

    // Wait for Zustand persist to finish hydrating from chrome.storage.local
    // before touching store state. Without this, initializeDraft() clears
    // myRoster/allPicks but the async merge() overwrites with stale data.
    const waitForHydration = (): Promise<void> => {
      return new Promise<void>((resolve) => {
        if (useDraftStore.persist.hasHydrated()) {
          resolve();
          return;
        }
        const unsub = useDraftStore.persist.onFinishHydration(() => {
          unsub();
          resolve();
        });
      });
    };

    await waitForHydration();
    console.log("[ESPN Draft Assistant] Store hydration complete");

    // Store warnings for UI display
    useDraftStore.getState().setConfigWarnings(detection.warnings);

    if (detection.config) {
      cachedLeagueConfig = detection.config;
      console.log("[ESPN Draft Assistant] Config detected:", {
        confidence: detection.confidence,
        totalTeams: detection.config.totalTeams,
        categories: detection.config.categories.length,
        rosterSlots: Object.keys(detection.config.rosterSlots).length,
      });
    } else {
      // Use default 5x5 config per user constraint
      cachedLeagueConfig = {
        totalTeams: 12,
        categories: [
          { category_id: "R", stat_key: "R", type: "COUNTING", direction: "HIGHER_BETTER", name: "Runs" },
          { category_id: "HR", stat_key: "HR", type: "COUNTING", direction: "HIGHER_BETTER", name: "Home Runs" },
          { category_id: "RBI", stat_key: "RBI", type: "COUNTING", direction: "HIGHER_BETTER", name: "RBI" },
          { category_id: "SB", stat_key: "SB", type: "COUNTING", direction: "HIGHER_BETTER", name: "Stolen Bases" },
          { category_id: "AVG", stat_key: "AVG", type: "RATE", direction: "HIGHER_BETTER", name: "Batting Average", formula_id: "avg", required_components: ["AB", "H"] },
          { category_id: "W", stat_key: "W", type: "COUNTING", direction: "HIGHER_BETTER", name: "Wins" },
          { category_id: "SV", stat_key: "SV", type: "COUNTING", direction: "HIGHER_BETTER", name: "Saves" },
          { category_id: "K", stat_key: "K", type: "COUNTING", direction: "HIGHER_BETTER", name: "Strikeouts" },
          { category_id: "ERA", stat_key: "ERA", type: "RATE", direction: "LOWER_BETTER", name: "ERA", formula_id: "era", required_components: ["ER", "IP"] },
          { category_id: "WHIP", stat_key: "WHIP", type: "RATE", direction: "LOWER_BETTER", name: "WHIP", formula_id: "whip", required_components: ["IP", "H", "BB"] },
        ],
        rosterSlots: {
          "C": 1,
          "1B": 1,
          "2B": 1,
          "3B": 1,
          "SS": 1,
          "OF": 3,
          "UTIL": 1,
          "SP": 4,
          "RP": 2,
          "P": 2,
          "BN": 3,
        },
        budget: 260,
      };
      console.warn("[ESPN Draft Assistant] Config detection failed, using 5x5 defaults");
    }

    // Always initialize draft state from current URL context
    const state = useDraftStore.getState();
    const resolvedDraftFormat: "snake" | "auction" =
      detectedDraftFormat === "auction" ||
      (state.leagueId === leagueId && state.draftFormat === "auction")
        ? "auction"
        : "snake";

    const totalRosterSize = cachedLeagueConfig
      ? Object.values(cachedLeagueConfig.rosterSlots).reduce((a, b) => a + b, 0)
      : 25;

    state.initializeDraft({
      leagueId,
      draftFormat: resolvedDraftFormat,
      totalTeams: cachedLeagueConfig?.totalTeams || 12,
      rosterSize: totalRosterSize,
      myTeamId: teamId ?? "user",
      budget: cachedLeagueConfig?.budget || 260, // Auction only - detected from ESPN or default
    });
    console.log("[ESPN Draft Assistant] Draft state initialized (roster cleared)", {
      myRoster: useDraftStore.getState().myRoster.length,
      allPicks: useDraftStore.getState().allPicks.length,
    });
    // Store league categories for the deterministic draft engine
    if (cachedLeagueConfig) {
      useDraftStore.getState().setLeagueCategories(cachedLeagueConfig.categories);
    }
    useDraftStore.setState({ sidebarVisible: true });

    // Detect user's own team from the auction pick train
    const myTeamDetection = detectMyTeam();
    if (myTeamDetection) {
      useDraftStore.getState().setMyTeamId(myTeamDetection.teamId);
      useDraftStore.getState().setRemainingBudget(myTeamDetection.remainingBudget);
      console.log("[ESPN Draft Assistant] My team set from pick train:", myTeamDetection);
    }

    // Detect roster slots from players-table DOM (more accurate than settings panel)
    const playersTableSlots = detectRosterSlotsFromPlayersTable();
    if (playersTableSlots) {
      useDraftStore.getState().setDetectedRosterSlots(playersTableSlots.rosterSlots);
    }

    // Detect roster size from Position Tracker DOM (e.g., "10/28 Players")
    const positionTracker = detectRosterSizeFromPositionTracker();
    if (positionTracker) {
      useDraftStore.setState({ rosterSize: positionTracker.rosterSize });
    }

    // Retry roster slot detection after DOM stabilizes (players-table may load late)
    setTimeout(() => {
      if (!useDraftStore.getState().detectedRosterSlots) {
        const retrySlots = detectRosterSlotsFromPlayersTable();
        if (retrySlots) {
          useDraftStore.getState().setDetectedRosterSlots(retrySlots.rosterSlots);
          console.log("[ESPN Draft Assistant] Roster slots detected on retry");
        }
      }
      // Also retry position tracker detection
      if (!positionTracker) {
        const retryTracker = detectRosterSizeFromPositionTracker();
        if (retryTracker) {
          useDraftStore.setState({ rosterSize: retryTracker.rosterSize });
        }
      }
    }, 3000);

    let reactRootInstance: ReturnType<typeof createRoot> | null = null;
    let popoutWindow: Window | null = null;
    let popoutRootInstance: ReturnType<typeof createRoot> | null = null;
    let isPopoutOpen = false;
    let isMounting = false;
    let pickTrainBudgetInterval: ReturnType<typeof setInterval> | null = null;
    const { [SIDEBAR_DOCK_STORAGE_KEY]: storedDockSide } =
      await chrome.storage.local.get(SIDEBAR_DOCK_STORAGE_KEY);
    let currentDockSide: "left" | "right" =
      storedDockSide === "left" ? "left" : "right";

    const applySidebarPosition = (side: "left" | "right") => {
      const sidebarRoot = document.getElementById(SIDEBAR_ROOT_ID);
      if (!sidebarRoot) {
        return;
      }

      if (side === "left") {
        sidebarRoot.style.left = "16px";
        sidebarRoot.style.right = "auto";
      } else {
        sidebarRoot.style.right = "16px";
        sidebarRoot.style.left = "auto";
      }
    };

    const closePopout = () => {
      if (popoutRootInstance) {
        popoutRootInstance.unmount();
        popoutRootInstance = null;
      }

      if (popoutWindow && !popoutWindow.closed) {
        popoutWindow.close();
      }

      popoutWindow = null;
      isPopoutOpen = false;
      mountSidebar();
    };

    const processDetectedPick = async (pick: DraftPick) => {
      useDraftStore.getState().addPick(pick);

      const currentState = useDraftStore.getState();
      const isMyPick =
        pick.teamId === currentState.myTeamId ||
        pick.teamId === "myTeam" ||
        pick.teamName === "My Team";

      if (isMyPick) {
        const alreadyInRoster = currentState.myRoster.some(
          (player) => player.playerId === pick.playerId,
        );
        if (!alreadyInRoster) {
          const matchingRanking = currentState.rankings.find((ranking) => {
            if (ranking.playerId === pick.playerId) {
              return true;
            }

            return (
              normalizePlayerName(ranking.playerName) ===
              normalizePlayerName(pick.playerName)
            );
          });

          const draftedPlayer = {
            playerId: pick.playerId,
            playerName: pick.playerName,
            positions: pick.positions,
            pickNumber: pick.pickNumber,
            cost: pick.cost,
            projectedStats: matchingRanking?.projectedStats || {},
          };
          useDraftStore.getState().updateRoster(draftedPlayer);
        }
      }

      // Update team roster state
      if (pick.teamId && pick.playerId) {
        useDraftStore.getState().updateTeamRoster(
          pick.teamId,
          pick.teamName || `Team ${pick.teamId}`,
          pick.playerId
        );

        // Recompute standings from updated state
        const standings = calculateProjectedStandingsFromState();
        useDraftStore.getState().setProjectedStandings(standings);
      }

      // Rankings/auction values are static pre-draft data — no need to re-fetch per pick.
      // The deterministic engine recomputes inflation, scarcity, etc. client-side from draft state.
    };

    const refreshAssistantData = throttle(
      async () => {
        const latestBackendLeagueId = await resolveBackendLeagueMapping();
        const currentState = useDraftStore.getState();

        try {
          const rankings = await getRankings(leagueId.toString(), {
            draftFormat: currentState.draftFormat,
            backendLeagueId: latestBackendLeagueId || undefined,
          });
          useDraftStore.getState().setRankings(rankings);
        } catch (error) {
          console.error("[ESPN Draft Assistant] Refresh rankings failed:", error);
        }

        if (currentState.draftFormat === "auction") {
          try {
            const values = await getAuctionValues(leagueId.toString(), {
              budget: cachedLeagueConfig?.budget || 260,
              rosterSize: currentState.rosterSize,
              backendLeagueId: latestBackendLeagueId || undefined,
            });
            useDraftStore.getState().setAuctionValues(values);
          } catch (error) {
            console.error(
              "[ESPN Draft Assistant] Refresh auction values failed:",
              error,
            );
          }
        }

        // Update projected standings from stored roster state (no API call, no DOM parsing)
        const standings = calculateProjectedStandingsFromState();
        useDraftStore.getState().setProjectedStandings(standings);

        if (standings) {
          console.log(
            "[ESPN Draft Assistant] Projected standings computed from stored state for",
            standings.overallStandings.length,
            "teams"
          );
        }

        const completedPicks = collectCompletedPicksSnapshot();
        completedPicks.forEach((pick) => processDetectedPick(pick));
      },
      3000 // 3 seconds minimum between refreshes
    );

    const mountSidebar = () => {
      if (isPopoutOpen || isMounting) {
        return;
      }

      isMounting = true;

      try {
        if (!document.body) {
          return;
        }

        const existingRoot = document.getElementById(SIDEBAR_ROOT_ID);
        if (existingRoot) {
          const existingShadowRoot = existingRoot.shadowRoot;
          const existingMountPoint = existingShadowRoot?.querySelector(
            '[data-espn-assistant-mount="true"]',
          );

          if (existingMountPoint && existingMountPoint.childElementCount > 0) {
            return;
          }

          existingRoot.remove();
        }

        const sidebarRoot = document.createElement("div");
        sidebarRoot.id = SIDEBAR_ROOT_ID;
        sidebarRoot.style.cssText = `
        position: fixed;
        top: 0;
        width: 400px;
        height: 100vh;
        z-index: 999999;
        box-shadow: -2px 0 8px rgba(0,0,0,0.1);
      `;

        const shadowRoot = sidebarRoot.attachShadow({ mode: "open" });

        const styleSheet = document.createElement("style");
        styleSheet.textContent = contentStyles;
        shadowRoot.appendChild(styleSheet);

        const reactRoot = document.createElement("div");
        reactRoot.setAttribute("data-espn-assistant-mount", "true");
        shadowRoot.appendChild(reactRoot);

        document.body.appendChild(sidebarRoot);

        reactRootInstance = createRoot(reactRoot);
        reactRootInstance.render(
          <div className="h-full bg-surface text-content font-sans">
            <DraftSidebar />
          </div>,
        );

        applySidebarPosition(currentDockSide);

        console.log("[ESPN Draft Assistant] Sidebar rendered");
      } finally {
        isMounting = false;
      }
    };

    const openPopout = () => {
      const popup = window.open(
        "",
        "espnDraftAssistantPopup",
        "popup=yes,width=440,height=900,resizable=yes,scrollbars=yes",
      );

      if (!popup) {
        console.warn("[ESPN Draft Assistant] Popout blocked by browser");
        return;
      }

      isPopoutOpen = true;
      popoutWindow = popup;

      const sidebarRoot = document.getElementById(SIDEBAR_ROOT_ID);
      if (sidebarRoot) {
        sidebarRoot.remove();
      }
      reactRootInstance?.unmount();
      reactRootInstance = null;

      const popupDocument = popup.document;
      popupDocument.title = "ESPN Draft Assistant";
      popupDocument.body.innerHTML = "";
      popupDocument.body.style.margin = "0";
      popupDocument.body.style.background = "#ffffff";
      popupDocument.body.style.height = "100vh";

      const fontLink = popupDocument.createElement("link");
      fontLink.rel = "stylesheet";
      fontLink.href = "https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Inter:wght@400;500;600;700&display=swap";
      popupDocument.head.appendChild(fontLink);

      const styleSheet = popupDocument.createElement("style");
      styleSheet.textContent = contentStyles;
      popupDocument.head.appendChild(styleSheet);

      const mountNode = popupDocument.createElement("div");
      mountNode.style.height = "100vh";
      popupDocument.body.appendChild(mountNode);

      popoutRootInstance = createRoot(mountNode);
      popoutRootInstance.render(
        <div className="h-full bg-surface text-content font-sans">
          <DraftSidebar />
        </div>,
      );

      popup.addEventListener("beforeunload", () => {
        isPopoutOpen = false;
        popoutRootInstance = null;
        popoutWindow = null;
        mountSidebar();
      });
    };

    mountSidebar();

    // Observe current auction player (auction only)
    let auctionPlayerCleanup: (() => void) | null = null;
    let auctionTableScrapeInterval: ReturnType<typeof setInterval> | null = null;

    const runAuctionTableScrape = () => {
      try {
        const scraped = scrapeESPNAuctionTable();
        if (scraped.size > 0) {
          const valuesRecord: Record<number, number> = {};
          scraped.forEach((entry, playerId) => {
            // Prefer ASV (Average Salary = league-wide market price) over $ column
            valuesRecord[playerId] = entry.asvValue ?? entry.espnValue;
          });
          useDraftStore.getState().setEspnDomAuctionValues(valuesRecord);
        }
      } catch (err) {
        console.error(
          "[ESPN Draft Assistant] Failed to scrape ESPN auction table:",
          err,
        );
      }
    };

    const startAuctionTableScraping = () => {
      if (auctionTableScrapeInterval) {
        return; // Already running
      }
      // Initial scrape
      runAuctionTableScrape();
      // Re-scrape every 10 seconds to catch newly scrolled rows
      auctionTableScrapeInterval = setInterval(runAuctionTableScrape, 10_000);
      console.log("[ESPN Draft Assistant] Started ESPN auction table scraper (10s interval)");
    };

    const startPickTrainBudgetPolling = () => {
      if (pickTrainBudgetInterval) return; // Already running
      pickTrainBudgetInterval = setInterval(() => {
        const myTeam = detectMyTeam();
        if (myTeam) {
          useDraftStore.getState().setMyTeamId(myTeam.teamId);
          useDraftStore.getState().setRemainingBudget(myTeam.remainingBudget);
        }
        // Collect all team budgets for engine inflation model
        const allBudgets = detectAllTeamBudgets();
        if (allBudgets.length > 0) {
          useDraftStore.getState().setAllTeamBudgets(allBudgets);
          // Update totalTeams from pick train — detectTeamCount() runs once at page load
          // before the pick train renders, so pick train is the reliable source
          if (allBudgets.length >= 2 && allBudgets.length !== useDraftStore.getState().totalTeams) {
            useDraftStore.setState({ totalTeams: allBudgets.length });
            console.log(`[ESPN Draft Assistant] Team count updated from pick train: ${allBudgets.length}`);
          }
          if (import.meta.env.DEV) {
            console.log("[ESPN Draft Assistant] All team budgets:", allBudgets);
          }
        }
        // Update rosterSize from Position Tracker if not yet detected
        const tracker = detectRosterSizeFromPositionTracker();
        if (tracker && tracker.rosterSize !== useDraftStore.getState().rosterSize) {
          useDraftStore.setState({ rosterSize: tracker.rosterSize });
          console.log(`[ESPN Draft Assistant] Roster size updated from Position Tracker: ${tracker.rosterSize}`);
        }
      }, 5_000);
      console.log("[ESPN Draft Assistant] Started pick train budget polling (5s interval)");
    };

    if (resolvedDraftFormat === "auction") {
      auctionPlayerCleanup = observeCurrentAuctionPlayer((player) => {
        useDraftStore.getState().setCurrentAuctionPlayer(player);
      });
      startAuctionTableScraping();
      startPickTrainBudgetPolling();
    }

    const sidebarMountObserver = new MutationObserver(() => {
      if (!document.getElementById(SIDEBAR_ROOT_ID)) {
        mountSidebar();
      }
    });

    if (document.documentElement) {
      sidebarMountObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    }

    const sidebarHeartbeat = window.setInterval(() => {
      if (!isPopoutOpen && !document.getElementById(SIDEBAR_ROOT_ID)) {
        mountSidebar();
      }
    }, 1200);

    const popoutHeartbeat = window.setInterval(() => {
      if (!isPopoutOpen) {
        return;
      }

      if (!popoutWindow || popoutWindow.closed) {
        isPopoutOpen = false;
        popoutRootInstance = null;
        popoutWindow = null;
        mountSidebar();
      }
    }, 1000);

    // Initialize team rosters from DOM on page load
    try {
      const initialRosters = parseTeamRostersFromDOM();
      if (initialRosters.size > 0) {
        useDraftStore.getState().setAllTeamRosters(initialRosters);
        console.log(
          "[ESPN Draft Assistant] Initialized rosters for",
          initialRosters.size,
          "teams from DOM"
        );
      }
    } catch (error) {
      console.error("[ESPN Draft Assistant] Failed to initialize rosters:", error);
    }

    refreshAssistantData();

    // Check format once after page stabilizes (not every 1.5s)
    setTimeout(() => {
      const latestDetection = detectDraftFormat();
      if (latestDetection !== "auction") return;

      const latestState = useDraftStore.getState();
      if (latestState.draftFormat === "auction") return;

      latestState.initializeDraft({
        leagueId,
        draftFormat: "auction",
        totalTeams: latestState.totalTeams,
        rosterSize: latestState.rosterSize,
        myTeamId: latestState.myTeamId || teamId || "user",
        budget: latestState.remainingBudget || cachedLeagueConfig?.budget || 260,
      });

      // Start auction player observer since we just switched to auction format
      if (!auctionPlayerCleanup) {
        auctionPlayerCleanup = observeCurrentAuctionPlayer((player) => {
          useDraftStore.getState().setCurrentAuctionPlayer(player);
        });
        console.log("[ESPN Draft Assistant] Started auction player observer after delayed detection");
      }

      // Start table scraping if not already running
      startAuctionTableScraping();

      // Start pick train budget polling if not already running
      startPickTrainBudgetPolling();

      refreshAssistantData(); // Throttled, will respect 3s minimum
    }, 2000);

    // Start observing draft board for picks
    const cleanup = observeDraftBoard((pick) => processDetectedPick(pick));

    const refreshHandler = () => {
      refreshAssistantData();
    };

    const dockHandler = (event: Event) => {
      const customEvent = event as CustomEvent<{ side?: "left" | "right" }>;
      const requestedSide = customEvent.detail?.side;
      if (requestedSide !== "left" && requestedSide !== "right") {
        return;
      }

      currentDockSide = requestedSide;

      chrome.storage.local
        .set({ [SIDEBAR_DOCK_STORAGE_KEY]: requestedSide })
        .catch((error) => {
          console.error(
            "[ESPN Draft Assistant] Failed to persist dock side:",
            error,
          );
        });

      applySidebarPosition(requestedSide);
    };

    const popoutHandler = () => {
      if (isPopoutOpen) {
        closePopout();
        return;
      }

      openPopout();
    };

    window.addEventListener("espn-draft-assistant-refresh", refreshHandler);
    window.addEventListener(
      "espn-draft-assistant-dock",
      dockHandler as EventListener,
    );
    window.addEventListener("espn-draft-assistant-popout", popoutHandler);

    // Cleanup on page unload
    window.addEventListener("beforeunload", () => {
      cleanup();
      auctionPlayerCleanup?.();
      if (auctionTableScrapeInterval) {
        clearInterval(auctionTableScrapeInterval);
      }
      if (pickTrainBudgetInterval) {
        clearInterval(pickTrainBudgetInterval);
      }
      window.clearInterval(sidebarHeartbeat);
      window.clearInterval(popoutHeartbeat);
      sidebarMountObserver.disconnect();
      window.removeEventListener(
        "espn-draft-assistant-refresh",
        refreshHandler,
      );
      window.removeEventListener(
        "espn-draft-assistant-dock",
        dockHandler as EventListener,
      );
      window.removeEventListener("espn-draft-assistant-popout", popoutHandler);
      closePopout();
      reactRootInstance?.unmount();
    });
  },
});
