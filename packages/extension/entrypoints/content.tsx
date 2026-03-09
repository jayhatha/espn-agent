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
  scrapeESPNNominationQueue,
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
import { ErrorBoundary } from "../components/ErrorBoundary";
import contentStyles from "../styles/content.css?inline";
import { logger } from "../lib/logger";
import { calculateProjectedStandingsFromState } from "../lib/value-calculations";
import { autoBidController } from "../lib/auto-bid-controller";
import { normalizeName as normalizePlayerName } from "../lib/engine/normalizer";
import { resetEngineCache } from "../lib/engine";

const SIDEBAR_ROOT_ID = "espn-draft-assistant-root";
const SIDEBAR_DOCK_STORAGE_KEY = "assistantDockSide";

// Cache league config for auto-refresh (detected once at page load)
let cachedLeagueConfig: DraftConfiguration | null = null;
let configDetectionWarnings: string[] = [];


export default defineContentScript({
  matches: ["https://fantasy.espn.com/baseball/draft*"],
  runAt: "document_idle",

  async main() {
    logger.log("[ESPN Draft Assistant] Content script loaded");

    // Parse draft metadata from page
    const leagueId = parseLeagueIdFromUrl();
    const urlParams = new URLSearchParams(window.location.search);
    const teamId = urlParams.get("teamId");
    const detectedDraftFormat = detectDraftFormat();

    if (!leagueId) {
      logger.warn("[ESPN Draft Assistant] Could not parse league ID from URL");
      return;
    }

    logger.log("[ESPN Draft Assistant] Draft detected:", {
      leagueId,
      draftFormat: detectedDraftFormat,
    });

    // Listen for CONTROL commands from the background service worker (relayed from mobile)
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type !== "CONTROL") return false;

      const store = useDraftStore.getState();

      switch (message.action) {
        case "SET_AUTO_MODE":
          store.setAutoMode(message.payload as boolean);
          break;
        case "SET_POSITION_FILTER":
          store.setPositionFilter(message.payload as string | null);
          break;
        case "TOGGLE_SIDEBAR":
          store.toggleSidebar();
          break;
        case "SET_PITCHER_HITTER_SPLIT":
          store.setPitcherHitterSplit(message.payload as number);
          break;
      }

      sendResponse({ ok: true });
      return false;
    });

    // Expose diagnostic functions for debugging (development only)
    if (import.meta.env.DEV) {
      (window as any).espnDraftAssistant = {
        diagnose: diagnoseDOMStructure,
        testPick: testParsePick,
        diagnoseRosters: () => {
          // Show stored state instead of parsing DOM
          const { teamRosters } = useDraftStore.getState();
          logger.log("Stored Team Rosters:", Array.from(teamRosters.entries()));

          // Also parse DOM for comparison
          const domRosters = parseTeamRostersFromDOM();
          logger.log("DOM-Parsed Rosters:", Array.from(domRosters.entries()));
        },
        // Nomination diagnostics — call during a live draft to inspect controller state
        nominationDiag: () => autoBidController.getNominationDiagnostics(),
        forceNominate: () => autoBidController.forceNominate(),
        populateQueue: () => autoBidController.populateQueue(),
        turnCheck: () => {
          // Return the last turn detection result from the nomination controller
          const diag = autoBidController.getNominationDiagnostics();
          return diag.lastTurnDetectionResult;
        },
        version: "1.0.0",
      };
      logger.log(
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
        logger.log("[ESPN Draft Assistant] Using mapped backend league:", {
          espnLeagueId: leagueId,
          backendLeagueId: resolvedBackendLeagueId,
        });
      } else {
        logger.log("[ESPN Draft Assistant] No backend league mapping found", {
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
    logger.log("[ESPN Draft Assistant] Store hydration complete");

    // Store warnings for UI display
    useDraftStore.getState().setConfigWarnings(detection.warnings);

    if (detection.config) {
      cachedLeagueConfig = detection.config;
      logger.log("[ESPN Draft Assistant] Config detected:", {
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
      logger.warn("[ESPN Draft Assistant] Config detection failed, using 5x5 defaults");
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

    // Reset engine caches on draft initialization to prevent stale recommendations
    // from a previous session leaking into the current draft.
    resetEngineCache();

    // Detect whether state was preserved from a same-draft reload.
    // initializeDraft preserves allPicks when it detects isSameDraft, so if
    // allPicks is non-empty after initialization it means we are resuming an
    // existing draft session rather than starting fresh.
    const statePreserved = useDraftStore.getState().allPicks.length > 0;

    logger.log("[ESPN Draft Assistant] Draft state initialized", {
      statePreserved,
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
    // Grid column for my team (1-based position in pick train → grid column number).
    // DOM-parsed picks use gridArea.column as teamId, which differs from the pick
    // train's number prefix (e.g., column "3" vs teamId "13"). We need both for matching.
    let myGridColumn: string | null = null;
    if (myTeamDetection) {
      useDraftStore.getState().setMyTeamId(myTeamDetection.teamId);
      useDraftStore.getState().setRemainingBudget(myTeamDetection.remainingBudget);
      myGridColumn = myTeamDetection.gridColumn ? String(myTeamDetection.gridColumn) : null;
      logger.log("[ESPN Draft Assistant] My team set from pick train:", myTeamDetection);
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
          logger.log("[ESPN Draft Assistant] Roster slots detected on retry");
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
        pick.teamName === "My Team" ||
        (myGridColumn !== null && pick.teamId === myGridColumn);

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
        // Only re-scrape picks from DOM if store has no picks (fresh start or post-reset).
        // When state is preserved from a same-draft reload, skip DOM scraping to avoid
        // contaminating myRoster with other teams' players due to teamId matching issues.
        const existingPicks = useDraftStore.getState().allPicks;
        const shouldScrapePicksFromDom = existingPicks.length === 0;

        if (shouldScrapePicksFromDom) {
          // Clear stale roster data before re-collecting from DOM
          const initialBudget = cachedLeagueConfig?.budget || 260;
          useDraftStore.getState().resetDraftPicks(initialBudget);
        }

        const latestBackendLeagueId = await resolveBackendLeagueMapping();
        const currentState = useDraftStore.getState();

        try {
          const rankings = await getRankings(leagueId.toString(), {
            draftFormat: currentState.draftFormat,
            backendLeagueId: latestBackendLeagueId || undefined,
          });
          useDraftStore.getState().setRankings(rankings);
        } catch (error) {
          logger.error("[ESPN Draft Assistant] Refresh rankings failed:", error);
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
            logger.error(
              "[ESPN Draft Assistant] Refresh auction values failed:",
              error,
            );
          }
        }

        // Always reconcile picks from DOM — scan for picks not already in allPicks.
        // This catches picks missed during reload or between MutationObserver gaps.
        // addPick() and alreadyInRoster checks prevent duplicates.
        {
          const domPicks = collectCompletedPicksSnapshot();
          const currentAllPicks = useDraftStore.getState().allPicks;
          const knownPlayerIds = new Set(currentAllPicks.map(p => p.playerId));
          const knownNames = new Set(
            currentAllPicks.map(p => normalizePlayerName(p.playerName))
          );
          const missedPicks = domPicks.filter(
            p => !knownPlayerIds.has(p.playerId) &&
                 !knownNames.has(normalizePlayerName(p.playerName))
          );

          if (missedPicks.length > 0) {
            logger.log(
              `[ESPN Draft Assistant] Refresh reconciliation: found ${missedPicks.length} new picks from DOM`
            );
            missedPicks.forEach(pick => processDetectedPick(pick));
          }
        }

        // Reconcile myRoster from allPicks — rebuild to match current teamId/gridColumn.
        {
          const currentState = useDraftStore.getState();
          const myTeamId = currentState.myTeamId;
          const isMyPickFilter = (p: DraftPick) =>
            p.teamId === myTeamId ||
            p.teamId === "myTeam" ||
            p.teamName === "My Team" ||
            (myGridColumn !== null && p.teamId === myGridColumn);
          const myPicksFromStore = currentState.allPicks.filter(isMyPickFilter);

          if (currentState.myRoster.length !== myPicksFromStore.length) {
            logger.log(
              "[ESPN Draft Assistant] Roster reconciliation: roster had",
              currentState.myRoster.length,
              "players but",
              myPicksFromStore.length,
              "picks match myTeamId/gridColumn"
            );
            const rebuiltRoster = myPicksFromStore.map((pick) => {
              const existing = currentState.myRoster.find(
                (r) => r.playerId === pick.playerId
              );
              if (existing) return existing;

              const matchingRanking = currentState.rankings.find(
                (ranking) => ranking.playerId === pick.playerId
              );
              return {
                playerId: pick.playerId,
                playerName: pick.playerName,
                positions: pick.positions,
                pickNumber: pick.pickNumber,
                cost: pick.cost,
                projectedStats: matchingRanking?.projectedStats || {},
              };
            });
            useDraftStore.setState({ myRoster: rebuiltRoster });
          }
        }

        // Update projected standings from stored roster state (no API call, no DOM parsing)
        const standings = calculateProjectedStandingsFromState();
        useDraftStore.getState().setProjectedStandings(standings);

        if (standings) {
          logger.log(
            "[ESPN Draft Assistant] Projected standings computed from stored state for",
            standings.overallStandings.length,
            "teams"
          );
        }
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
          <ErrorBoundary sectionName="Draft Sidebar">
            <div className="h-full bg-surface text-content font-sans">
              <DraftSidebar />
            </div>
          </ErrorBoundary>,
        );

        applySidebarPosition(currentDockSide);

        logger.log("[ESPN Draft Assistant] Sidebar rendered");
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
        logger.warn("[ESPN Draft Assistant] Popout blocked by browser");
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
        <ErrorBoundary sectionName="Draft Sidebar (Popout)">
          <div className="h-full bg-surface text-content font-sans">
            <DraftSidebar />
          </div>
        </ErrorBoundary>,
      );

      popup.addEventListener("beforeunload", () => {
        isPopoutOpen = false;
        popoutRootInstance = null;
        popoutWindow = null;
        mountSidebar();
      });
    };

    mountSidebar();
    autoBidController.start();

    // Observe current auction player (auction only)
    let auctionPlayerCleanup: (() => void) | null = null;
    let auctionTableScrapeInterval: ReturnType<typeof setInterval> | null = null;
    let queueScrapeInterval: ReturnType<typeof setInterval> | null = null;
    let queuePopulateInterval: ReturnType<typeof setInterval> | null = null;

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
        logger.error(
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
      logger.log("[ESPN Draft Assistant] Started ESPN auction table scraper (10s interval)");
    };

    const runQueueScrape = () => {
      try {
        const queue = scrapeESPNNominationQueue();
        useDraftStore.getState().setEspnNominationQueue(queue);
      } catch (err) {
        logger.error("[ESPN Draft Assistant] Failed to scrape nomination queue:", err);
      }
    };

    const startQueueScraping = () => {
      if (queueScrapeInterval) return; // Already running
      runQueueScrape(); // Initial scrape
      queueScrapeInterval = setInterval(runQueueScrape, 3_000);
      logger.log("[ESPN Draft Assistant] Started nomination queue scraper (3s interval)");
    };

    const startQueuePopulating = () => {
      if (queuePopulateInterval) return; // Already running
      // 15s interval — matches QUEUE_POPULATE_COOLDOWN_MS in AutoBidController.
      // The internal cooldown is the real rate limiter; this interval ensures
      // periodic triggering even when engine signals are not changing.
      queuePopulateInterval = setInterval(() => {
        try {
          autoBidController.populateQueue();
        } catch (err) {
          logger.error("[ESPN Draft Assistant] Failed to populate queue:", err);
        }
      }, 15_000);
      logger.log("[ESPN Draft Assistant] Started queue population interval (15s)");
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
            logger.log(`[ESPN Draft Assistant] Team count updated from pick train: ${allBudgets.length}`);
          }
          if (import.meta.env.DEV) {
            logger.log("[ESPN Draft Assistant] All team budgets:", allBudgets);
          }
        }
        // Update rosterSize from Position Tracker if not yet detected
        const tracker = detectRosterSizeFromPositionTracker();
        if (tracker && tracker.rosterSize !== useDraftStore.getState().rosterSize) {
          useDraftStore.setState({ rosterSize: tracker.rosterSize });
          logger.log(`[ESPN Draft Assistant] Roster size updated from Position Tracker: ${tracker.rosterSize}`);
        }
      }, 5_000);
      logger.log("[ESPN Draft Assistant] Started pick train budget polling (5s interval)");
    };

    if (resolvedDraftFormat === "auction") {
      auctionPlayerCleanup = observeCurrentAuctionPlayer((player) => {
        useDraftStore.getState().setCurrentAuctionPlayer(player);
      });
      startAuctionTableScraping();
      startQueueScraping();
      startQueuePopulating();
      startPickTrainBudgetPolling();
    }

    const sidebarMountObserver = new MutationObserver(() => {
      if (!document.getElementById(SIDEBAR_ROOT_ID)) {
        mountSidebar();
      }
    });

    if (document.body) {
      sidebarMountObserver.observe(document.body, {
        childList: true,
        subtree: false,  // sidebar root is a direct body child
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
        logger.log(
          "[ESPN Draft Assistant] Initialized rosters for",
          initialRosters.size,
          "teams from DOM"
        );
      }
    } catch (error) {
      logger.error("[ESPN Draft Assistant] Failed to initialize rosters:", error);
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
        logger.log("[ESPN Draft Assistant] Started auction player observer after delayed detection");
      }

      // Start table scraping if not already running
      startAuctionTableScraping();

      // Start queue scraping if not already running
      startQueueScraping();

      // Start queue population if not already running
      startQueuePopulating();

      // Start pick train budget polling if not already running
      startPickTrainBudgetPolling();

      refreshAssistantData(); // Throttled, will respect 3s minimum
    }, 2000);

    // Start observing draft board for picks.
    // Pass skipInitialScan when state was preserved from a same-draft reload —
    // this prevents re-scanning all completed picks and contaminating myRoster
    // with other teams' players due to unreliable ESPN DOM teamId matching.
    const cleanup = observeDraftBoard(
      (pick) => processDetectedPick(pick),
      { skipInitialScan: statePreserved }
    );

    // On same-draft reload, reconcile picks that happened during the reload window.
    // The MutationObserver above only catches DOM mutations going forward, but picks
    // that completed while the extension was reloading are already rendered in the DOM.
    // Only process picks NOT already in persisted allPicks to avoid roster contamination.
    if (statePreserved) {
      const domPicks = collectCompletedPicksSnapshot();
      const currentAllPicks = useDraftStore.getState().allPicks;
      const knownPlayerIds = new Set(currentAllPicks.map(p => p.playerId));
      const knownNames = new Set(
        currentAllPicks.map(p => normalizePlayerName(p.playerName))
      );
      const missedPicks = domPicks.filter(
        p => !knownPlayerIds.has(p.playerId) &&
             !knownNames.has(normalizePlayerName(p.playerName))
      );

      if (missedPicks.length > 0) {
        logger.log(
          `[ESPN Draft Assistant] Reconciliation: found ${missedPicks.length} picks missed during reload`
        );
        missedPicks.forEach(pick => processDetectedPick(pick));
      } else {
        logger.log("[ESPN Draft Assistant] Reconciliation: no missed picks during reload");
      }
    }

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
          logger.error(
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
      autoBidController.stop();
      if (auctionTableScrapeInterval) {
        clearInterval(auctionTableScrapeInterval);
      }
      if (queueScrapeInterval) {
        clearInterval(queueScrapeInterval);
      }
      if (queuePopulateInterval) {
        clearInterval(queuePopulateInterval);
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
