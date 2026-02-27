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
} from "../lib/dom-observers";
import { useDraftStore } from "../lib/draft-state";
import {
  getRankings,
  getAuctionValues,
  getProjectedStandings,
  resolveBackendLeagueId,
  getRankingsWithRetry,
  getAuctionValuesWithRetry,
  throttle,
} from "../lib/api-client";
import { detectLeagueConfig } from "../lib/draft-config-detector";
import type { DraftConfiguration } from "@espn-fantasy/shared";
import DraftSidebar from "../components/DraftSidebar";
import contentStyles from "../styles/content.css?inline";
import { calculateProjectedStandingsLocal } from "../lib/value-calculations";

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

/**
 * Refresh rankings and projections with cached config
 * User constraint: auto-refresh after each pick, keep stale data on failure
 * Throttled to 3s minimum between calls to prevent 429 errors
 */
const refreshRankingsAndProjections = throttle(
  async (espnLeagueId: string) => {
    const state = useDraftStore.getState();

    // Use cached config (don't re-detect per user constraint)
    if (!cachedLeagueConfig) {
      console.warn("[ESPN Draft Assistant] No league config available for refresh");
      return;
    }

    try {
      // Fetch with retry logic
      const [rankings, auctionValues] = await Promise.all([
        getRankingsWithRetry(espnLeagueId, {
          draftFormat: state.draftFormat,
        }),
        state.draftFormat === "auction"
          ? getAuctionValuesWithRetry(espnLeagueId, {
              budget: state.remainingBudget,
              rosterSize: state.rosterSize,
            })
          : Promise.resolve([]),
      ]);

      // Update state
      state.setRankings(rankings);
      if (state.draftFormat === "auction") {
        state.setAuctionValues(auctionValues);
      }

      console.log("[ESPN Draft Assistant] Rankings refreshed successfully", {
        rankingsCount: rankings.length,
        auctionValuesCount: auctionValues.length,
      });
    } catch (error) {
      // User constraint: keep stale data on failure after retries
      console.error(
        "[ESPN Draft Assistant] Failed to refresh rankings after retries, keeping stale data",
        error
      );
      // Don't throw - UI keeps showing stale rankings
    }
  },
  3000 // 3 seconds minimum between refreshes (backend limit: 50/min = 1.2s per request, use 3s for safety)
);

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

    // Expose diagnostic functions for debugging
    // Usage: window.espnDraftAssistant.diagnose()
    // Usage: window.espnDraftAssistant.testPick(element)
    // Usage: window.espnDraftAssistant.diagnoseRosters()
    (window as any).espnDraftAssistant = {
      diagnose: diagnoseDOMStructure,
      testPick: testParsePick,
      diagnoseRosters: logRosterDiagnostics,
      version: "1.0.0",
    };
    console.log(
      "[ESPN Draft Assistant] Diagnostic tools available at window.espnDraftAssistant",
    );

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
          { category_id: "AVG", stat_key: "AVG", type: "RATE", direction: "HIGHER_BETTER", name: "Batting Average" },
          { category_id: "W", stat_key: "W", type: "COUNTING", direction: "HIGHER_BETTER", name: "Wins" },
          { category_id: "SV", stat_key: "SV", type: "COUNTING", direction: "HIGHER_BETTER", name: "Saves" },
          { category_id: "K", stat_key: "K", type: "COUNTING", direction: "HIGHER_BETTER", name: "Strikeouts" },
          { category_id: "ERA", stat_key: "ERA", type: "RATE", direction: "LOWER_BETTER", name: "ERA" },
          { category_id: "WHIP", stat_key: "WHIP", type: "RATE", direction: "LOWER_BETTER", name: "WHIP" },
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
      budget: 260, // Auction only
    });
    useDraftStore.setState({ sidebarVisible: true });

    let reactRootInstance: ReturnType<typeof createRoot> | null = null;
    let popoutWindow: Window | null = null;
    let popoutRootInstance: ReturnType<typeof createRoot> | null = null;
    let isPopoutOpen = false;
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

      // Auto-refresh rankings after each pick (user constraint)
      await refreshRankingsAndProjections(leagueId.toString());
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
              budget: 260,
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

        try {
          const standings = await getProjectedStandings(leagueId.toString(), {
            backendLeagueId: latestBackendLeagueId || undefined,
          });
          useDraftStore.getState().setProjectedStandings(standings);
        } catch (apiError) {
          console.log(
            "[ESPN Draft Assistant] API standings failed, falling back to DOM parsing",
          );

          try {
            // Fallback: parse rosters from DOM and compute locally
            const teamRosters = parseTeamRostersFromDOM();
            const { rankings } = useDraftStore.getState();

            if (teamRosters.size > 0 && rankings.length > 0) {
              const localStandings = calculateProjectedStandingsLocal(
                teamRosters,
                rankings,
              );
              useDraftStore.getState().setProjectedStandings(localStandings);
              console.log(
                "[ESPN Draft Assistant] Local standings computed for",
                teamRosters.size,
                "teams",
              );
            } else {
              useDraftStore.getState().setProjectedStandings(null);
            }
          } catch (domError) {
            console.error(
              "[ESPN Draft Assistant] DOM fallback failed:",
              domError,
            );
            useDraftStore.getState().setProjectedStandings(null);
          }
        }

        const completedPicks = collectCompletedPicksSnapshot();
        completedPicks.forEach((pick) => processDetectedPick(pick));
      },
      3000 // 3 seconds minimum between refreshes
    );

    const mountSidebar = () => {
      if (isPopoutOpen) {
        return;
      }

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
        <div
          style={{
            height: "100%",
            background: "#ffffff",
            color: "#111827",
            fontFamily:
              'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          }}
        >
          <DraftSidebar />
        </div>,
      );

      applySidebarPosition(currentDockSide);

      console.log("[ESPN Draft Assistant] Sidebar rendered");
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

      const styleSheet = popupDocument.createElement("style");
      styleSheet.textContent = contentStyles;
      popupDocument.head.appendChild(styleSheet);

      const mountNode = popupDocument.createElement("div");
      mountNode.style.height = "100vh";
      popupDocument.body.appendChild(mountNode);

      popoutRootInstance = createRoot(mountNode);
      popoutRootInstance.render(
        <div
          style={{
            height: "100%",
            background: "#ffffff",
            color: "#111827",
            fontFamily:
              'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          }}
        >
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
        budget: latestState.remainingBudget || 260,
      });

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
