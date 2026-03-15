import type { DraftPick } from "@espn-fantasy/shared";
import { logger } from "./logger";

/**
 * Find the first matching element from an ordered selector list.
 * Returns the matching element and logs a warning if a fallback (non-primary) selector matched.
 *
 * @param selectors - Array of CSS selectors, ordered from most to least preferred
 * @param context - Optional context label for log messages
 */
export function findFirstMatchingSelector(
  selectors: { selector: string; label: string; confirmed: boolean }[],
  context: string,
): Element | null {
  for (const { selector, label, confirmed } of selectors) {
    const el = document.querySelector(selector);
    if (el) {
      if (!confirmed) {
        logger.warn(
          `[ESPN Draft Assistant] ${context}: using UNTESTED selector "${selector}" (${label}) — update SELECTOR-MAP if this works`,
        );
      }
      return el;
    }
  }
  logger.warn(`[ESPN Draft Assistant] ${context}: all selectors failed`);
  return null;
}

/**
 * ESPN Draft Board Selectors - ordered by specificity
 *
 * ESPN's draft board structure (as of 2026):
 * - Main container: typically has "draft" or "board" in class/id
 * - Pick cells: Grid-based layout with style="grid-area: row / column"
 * - Completed picks: Marked with specific classes or contain player data
 * - ESPN uses JSX-generated class names (e.g., .jsx-XXXXX) that may vary
 *
 * Strategy: Primary selectors target stable ESPN patterns, fallbacks use
 * broader matches for resilience against ESPN DOM changes.
 */
const DRAFT_BOARD_SELECTORS = [
  // CONFIRMED (MCP verified 2026-03-14): Primary targets
  ".draft-content-wrapper", // unique, stable — 1 match
  '[class*="draftBoard"]', // 3 matches: draftBoard, draftBoardGrid__container, draftBoardGrid

  // CONFIRMED: Secondary
  '[class*="draft-columns"]', // 1 match
  ".players-table", // 5 matches

  // FAILED selectors removed: .draftBoardContainer, [class*="DraftBoard"], [id*="draftBoard"], .draft-board, #draft-content
].join(", ");

const PICK_ROW_SELECTORS = [
  // CONFIRMED (MCP verified 2026-03-14): Primary pick cell selectors
  ".draft-board-grid-pick-cell", // 364 matches — actual pick cell class
  '[style*="grid-area"]', // 377 matches — CSS Grid positioning

  // FAILED selectors removed: .draftBoardCell, .pickCell

  // Tertiary: Data attributes (ESPN sometimes uses these)
  "[data-player-id]",
  "[data-pick-number]",
  '[data-testid*="pick"]',

  // Fallback: Broader pick-related patterns
  '[class*="pick"][class*="row"]',
  '[class*="draft"][class*="pick"]',
].join(", ");

const COMPLETED_PICK_SELECTORS = [
  // Primary: ESPN marks completed picks with specific classes or data
  ".completedPick",
  '[class*="completed"]',
  // CONFIRMED (MCP verified 2026-03-14)
  '[data-player-id]:not([data-player-id=""])',

  // FAILED selectors removed: [data-completed="true"], [data-status="completed"], :has(.playerName)
].join(", ");

function parseGridArea(
  pickElement: Element,
): { row: number; column: number } | null {
  const styleValue = (pickElement.getAttribute("style") || "").toLowerCase();
  const match = styleValue.match(/grid-area\s*:\s*(\d+)\s*\/\s*(\d+)/);
  if (!match) {
    return null;
  }

  const row = Number.parseInt(match[1], 10);
  const column = Number.parseInt(match[2], 10);
  if (!Number.isFinite(row) || !Number.isFinite(column)) {
    return null;
  }

  return { row, column };
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}

function getPickDedupKey(pick: DraftPick): string {
  return `${pick.playerId}:${pick.teamId}:${pick.cost ?? ""}:${pick.pickNumber}:${pick.playerName.toLowerCase()}`;
}

function getPickCandidatesFromNode(node: Node): Element[] {
  if (!(node instanceof HTMLElement)) {
    return [];
  }

  const candidates: Element[] = [];

  if (node.matches(PICK_ROW_SELECTORS)) {
    candidates.push(node);
  }

  const nestedCandidates = node.querySelectorAll(PICK_ROW_SELECTORS);
  nestedCandidates.forEach((candidate) => candidates.push(candidate));

  return candidates;
}

/**
 * Validate selector array and find first matching element
 * Logs warnings if primary selector fails but fallback succeeds
 * Logs errors if all selectors fail with DOM structure snapshot
 */
// Track whether we've logged the "all selectors failed" error to avoid spam
let selectorFailureLogged = new Set<string>();

function validateAndFindElement(
  selectorArray: string,
  selectorName: string,
): Element | null {
  const selectors = selectorArray.split(", ");

  for (let i = 0; i < selectors.length; i++) {
    const selector = selectors[i];
    const element = document.querySelector(selector);

    if (element) {
      if (i > 0) {
        logger.warn(
          `[ESPN Draft Assistant] Primary ${selectorName} selector failed, using fallback #${i + 1}: "${selector}"`,
        );
      }
      // Clear failure flag on success
      selectorFailureLogged.delete(selectorName);
      return element;
    }
  }

  // Only log once per selector name to avoid spam during bootstrap
  if (!selectorFailureLogged.has(selectorName)) {
    selectorFailureLogged.add(selectorName);
    logger.warn(
      `[ESPN Draft Assistant] ${selectorName} selectors not found yet (ESPN may still be loading)`,
    );
  }

  return null;
}

function findDraftBoardElement(): Element | null {
  const directMatch = validateAndFindElement(
    DRAFT_BOARD_SELECTORS,
    "draft board",
  );
  if (directMatch) {
    return directMatch;
  }

  const pickElement = validateAndFindElement(PICK_ROW_SELECTORS, "pick row");
  if (!pickElement) {
    return null;
  }

  return (
    pickElement.closest(".draft-board, .draftboard-container") ||
    pickElement.parentElement ||
    null
  );
}

/**
 * Options for observeDraftBoard
 *
 * skipInitialScan: When true, skips the initial full-document scan and the
 * periodic safety-net scan. Use this on same-draft reloads where Zustand
 * persist has already restored allPicks/myRoster — re-scanning the entire
 * DOM would re-add picks from other teams (due to unreliable ESPN DOM teamId
 * matching) and contaminate myRoster. The MutationObserver still runs so
 * genuinely NEW picks that arrive during the session are captured.
 */
export interface ObserveDraftBoardOptions {
  skipInitialScan?: boolean;
}

/**
 * Observes ESPN draft board for new picks
 * Returns cleanup function to disconnect observer
 * Updated to support async pick handlers for auto-refresh
 */
export function observeDraftBoard(
  onPick: (pick: DraftPick) => void | Promise<void>,
  options: ObserveDraftBoardOptions = {},
): () => void {
  const { skipInitialScan = false } = options;
  let observedBoard: Element | null = null;
  const emittedPickKeys = new Set<string>();

  const emitPick = async (pick: DraftPick) => {
    const key = getPickDedupKey(pick);
    if (emittedPickKeys.has(key)) {
      return;
    }

    emittedPickKeys.add(key);
    logger.log("[ESPN Draft Assistant] Detected pick:", pick);
    await onPick(pick); // Support async handlers
  };

  const scanCompletedPicks = (scope: ParentNode) => {
    const completedPickElements = scope.querySelectorAll(
      COMPLETED_PICK_SELECTORS,
    );
    completedPickElements.forEach((pickElement) => {
      try {
        const pick = parsePickElement(pickElement);
        if (pick) {
          emitPick(pick);
        }
      } catch (error) {
        logger.error(
          "[ESPN Draft Assistant] Error parsing pick element:",
          error,
        );
        logger.error("[ESPN Draft Assistant] Pick element structure:", {
          tag: pickElement.tagName,
          classes: pickElement.className,
          childCount: pickElement.children.length,
        });
        // Continue observing despite extraction failure
      }
    });
  };

  const scanEntireDocument = () => {
    scanCompletedPicks(document);
  };

  const observer = new MutationObserver(async (mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        // Check for new pick rows
        for (const node of mutation.addedNodes) {
          const pickElements = getPickCandidatesFromNode(node);

          const pickPromises = pickElements.map(async (pickElement) => {
            try {
              const pick = parsePickElement(pickElement);
              if (pick) {
                await emitPick(pick);
              }
            } catch (error) {
              logger.error(
                "[ESPN Draft Assistant] Error parsing pick from mutation:",
                error,
                { element: pickElement },
              );
            }
          });

          try {
            await Promise.all(pickPromises);
          } catch (error) {
            logger.error(
              "[ESPN Draft Assistant] Error processing pick batch:",
              error,
            );
          }
        }
      }
    }
  });

  const startObservingBoard = (board: Element) => {
    if (observedBoard === board) {
      return;
    }

    observedBoard = board;
    logger.log("[ESPN Draft Assistant] Observing draft board:", board);
    observer.observe(board, {
      childList: true,
      subtree: true,
    });

    // Skip initial scan when state was preserved from a same-draft reload.
    // The MutationObserver above will capture new picks without re-processing
    // the historical completed picks that are already in allPicks.
    if (!skipInitialScan) {
      scanCompletedPicks(board);
    }
  };

  const existingBoard = findDraftBoardElement();
  if (existingBoard) {
    startObservingBoard(existingBoard);
  } else {
    logger.warn(
      "[ESPN Draft Assistant] Draft board not found yet. Watching for async load.",
    );
  }

  // Capture already-rendered picks even if board observer attaches late.
  // Skip on same-draft reloads where state was preserved — re-scanning the
  // entire DOM would contaminate myRoster with picks from other teams.
  if (!skipInitialScan) {
    scanEntireDocument();
  } else {
    logger.log(
      "[ESPN Draft Assistant] Skipping initial DOM scan (state preserved from same-draft reload)",
    );
  }

  const bootstrapObserver = new MutationObserver(() => {
    if (observedBoard) {
      return;
    }

    const board = findDraftBoardElement();
    if (board) {
      logger.log("[ESPN Draft Assistant] Draft board found after async load");
      startObservingBoard(board);
      bootstrapObserver.disconnect();
      clearTimeout(bootstrapTimeout);
    }
  });

  if (!observedBoard) {
    // CONFIRMED (MCP verified 2026-03-14): ESPN draft board bootstrap targets.
    // Try narrower containers first to reduce mutation noise.
    const bootstrapTarget =
      document.querySelector(".draft-content-wrapper") ||
      document.querySelector('[class*="draftBoard"]') ||
      document.querySelector(".players-table") ||
      document.body;

    if (bootstrapTarget) {
      bootstrapObserver.observe(bootstrapTarget, {
        childList: true,
        subtree: true,
      });
    }
  }

  const bootstrapTimeout = setTimeout(() => {
    if (!observedBoard) {
      logger.warn(
        "[ESPN Draft Assistant] Draft board still not found after waiting for page render.",
      );
    }
    bootstrapObserver.disconnect();
  }, 15000);

  // ESPN can repaint grid cells without adding/removing the board node.
  // Poll completed picks as a safety net; dedupe keeps this cheap and safe.
  // Skip periodic scan on same-draft reloads to prevent continuous re-adding
  // of already-processed picks that would contaminate myRoster.
  let periodicScan: ReturnType<typeof setInterval> | null = null;
  if (!skipInitialScan) {
    periodicScan = setInterval(() => {
      scanEntireDocument();
    }, 5000);
  } else {
    logger.log(
      "[ESPN Draft Assistant] Periodic DOM scan disabled (state preserved from same-draft reload)",
    );
  }

  // Return cleanup function
  return () => {
    observer.disconnect();
    bootstrapObserver.disconnect();
    clearTimeout(bootstrapTimeout);
    if (periodicScan !== null) {
      clearInterval(periodicScan);
    }
  };
}

/**
 * Extract pick data from ESPN DOM element
 *
 * ESPN DOM patterns (as of 2026):
 * - Player name: May be split (first/last) or combined in single element
 * - Team abbrev: MLB team (e.g., "LAD", "NYY") - usually in separate element
 * - Position: Often in "pill" elements, may be comma or slash separated
 * - Fantasy team: The team making the pick - may be in parent or sibling
 * - Grid position: Inferred from style="grid-area: row / column"
 *
 * Fallback strategy: Try multiple selector patterns, log specific failures
 */
export function parsePickElement(pickElement: Element): DraftPick | null {
  try {
    // Skip non-pick elements (ESPN buttons like "Dequeue" match broad selectors)
    if (pickElement.tagName === "BUTTON") {
      return null;
    }

    // CONFIRMED (MCP verified 2026-03-14): ESPN uses .playerFirstName + .playerLastName inside .pickCellMiddle
    const firstName = pickElement
      .querySelector(".playerFirstName")
      ?.textContent?.trim();
    const lastName = pickElement
      .querySelector(".playerLastName")
      ?.textContent?.trim();

    const playerName = [firstName, lastName].filter(Boolean).join(" ").trim() || undefined;

    // CONFIRMED (MCP verified 2026-03-14): ESPN uses .playerProTeam inside .pickCellBottom
    const teamEl = pickElement.querySelector(
      '.playerProTeam, .playerinfo__playerteam',
    );

    // Strategy 4: Extract position(s) with multiple fallbacks
    const positionSelectors = [
      ".positionPill",
      ".position",
      '[class*="position"]',
      '[class*="Position"]',
      '[data-testid*="position"]',
    ];

    let positionEl: Element | null = null;
    for (const selector of positionSelectors) {
      positionEl = pickElement.querySelector(selector);
      if (positionEl?.textContent?.trim()) break;
    }

    const positionText = positionEl?.textContent?.trim() || "";
    // ESPN may use "/" or "," to separate positions (e.g., "1B/OF" or "OF, 1B")
    const positions = positionText
      .split("/")
      .flatMap((part) => part.split(","))
      .map((part) => part.trim())
      .filter(Boolean);

    // Strategy 5: Fantasy team name (NOT player's MLB team)
    // ESPN displays the team making the pick - could be in cell, header, or parent
    const fantasyTeamSelectors = [
      ".teamName",
      ".ownerName",
      ".owner",
      '[class*="teamName"]',
      '[class*="ownerName"]',
      '[class*="owner"]',
      '[data-testid*="team-name"]',
    ];

    let fantasyTeamEl: Element | null = null;
    for (const selector of fantasyTeamSelectors) {
      fantasyTeamEl = pickElement.querySelector(selector);
      if (fantasyTeamEl?.textContent?.trim()) break;
    }

    // Try parent containers for team data attributes
    const parentTeamEl = pickElement.closest(
      "[data-team-name], [data-owner-name], [data-team-id]",
    );

    const teamName =
      fantasyTeamEl?.textContent?.trim() ||
      parentTeamEl?.getAttribute("data-team-name") ||
      parentTeamEl?.getAttribute("data-owner-name") ||
      undefined;

    // Early exit for incomplete picks
    if (!playerName) {
      // Don't log warnings for upcoming picks (these are expected to be incomplete)
      if (
        pickElement.classList.contains("upcomingPick") ||
        pickElement.classList.contains("upcoming") ||
        pickElement.hasAttribute("data-upcoming")
      ) {
        return null;
      }

      logger.warn(
        "[ESPN Draft Assistant] Failed to parse player name from pick element",
        {
          element: pickElement.tagName,
          classes: pickElement.className,
          hasFirstName: !!firstName,
          hasLastName: !!lastName,
        },
      );
      return null;
    }

    // Strategy 6: Extract IDs and pick numbers from various sources
    const playerId = parseInt(
      pickElement.getAttribute("data-player-id") ||
        pickElement.getAttribute("data-playerid") ||
        "0",
      10,
    );

    const pickNumber = parseInt(
      pickElement.getAttribute("data-pick-number") ||
        pickElement.getAttribute("data-pick") ||
        pickElement
          .querySelector(".pickNumber, [class*='pickNumber']")
          ?.textContent?.replace(/\D/g, "") ||
        "0",
      10,
    );

    // ESPN uses grid-area for positioning in CSS Grid layout
    const gridArea = parseGridArea(pickElement);

    // Strategy 7: Determine team ID with multiple fallbacks
    const teamId =
      pickElement.getAttribute("data-team-id") ||
      parentTeamEl?.getAttribute("data-team-id") ||
      (pickElement.classList.contains("myTeam") ||
      pickElement.classList.contains("my-team")
        ? "myTeam"
        : gridArea
          ? String(gridArea.column)
          : teamName || "unknown-team");

    // Strategy 8: Auction cost (if auction draft)
    const costSelectors = [
      ".winningPrice",
      ".cost",
      ".bid",
      '[class*="winningPrice"]',
      '[class*="cost"]',
      '[class*="Cost"]',
      '[class*="bid"]',
      '[data-testid*="cost"]',
      '[data-testid*="price"]',
    ];

    let costEl: Element | null = null;
    for (const selector of costSelectors) {
      costEl = pickElement.querySelector(selector);
      if (costEl?.textContent?.trim()) break;
    }

    const parsedCostText = costEl?.textContent;
    const cost = parsedCostText
      ? parseInt(parsedCostText.replace(/\D/g, "") || "0", 10) || undefined
      : undefined;

    // Strategy 9: Roster slot (if displayed)
    const rosterSlot = pickElement
      .querySelector(".rosterSlot, [class*='rosterSlot'], [class*='slot']")
      ?.textContent?.trim();

    // Generate deterministic fallback player ID if ESPN doesn't provide one
    const fallbackPlayerId = hashString(
      `${playerName.toLowerCase()}|${teamId}|${cost ?? ""}|${rosterSlot ?? ""}|${gridArea?.row ?? ""}|${gridArea?.column ?? ""}`,
    );

    // Compute pick number from multiple sources (priority order)
    const computedPickNumber = pickNumber || (gridArea ? gridArea.row : 0);

    // Strategy 10: Generate intelligent team name fallbacks
    let finalTeamName = teamName;
    if (!finalTeamName) {
      if (
        pickElement.classList.contains("myTeam") ||
        pickElement.classList.contains("my-team") ||
        teamId === "myTeam"
      ) {
        finalTeamName = "My Team";
      } else if (gridArea && gridArea.column) {
        // Use column number to generate team name (e.g., "Team 1", "Team 2")
        // This works because ESPN's grid layout uses columns for teams
        finalTeamName = `Team ${gridArea.column}`;
      } else if (teamId && teamId !== "unknown-team" && teamId !== "myTeam") {
        // Use teamId as fallback if it looks like a number or identifier
        finalTeamName = `Team ${teamId}`;
      } else {
        finalTeamName = "Unknown Team";
      }
    }

    return {
      playerId: playerId || fallbackPlayerId,
      playerName,
      teamId,
      teamName: finalTeamName,
      pickNumber: computedPickNumber,
      timestamp: Date.now(),
      cost,
      positions,
    };
  } catch (error) {
    logger.error(
      "[ESPN Draft Assistant] Error parsing pick element:",
      error instanceof Error ? error.message : error,
    );
    logger.error("[ESPN Draft Assistant] Pick element details:", {
      tag: pickElement.tagName,
      classes: pickElement.className,
      id: pickElement.id,
      childrenCount: pickElement.children.length,
      textContent: pickElement.textContent?.slice(0, 100),
    });
    return null;
  }
}

export function collectCompletedPicksSnapshot(): DraftPick[] {
  const completedPickElements = document.querySelectorAll(
    COMPLETED_PICK_SELECTORS,
  );
  const dedupeKeys = new Set<string>();
  const picks: DraftPick[] = [];

  completedPickElements.forEach((pickElement) => {
    const pick = parsePickElement(pickElement);
    if (!pick) {
      return;
    }

    const key = getPickDedupKey(pick);
    if (dedupeKeys.has(key)) {
      return;
    }

    dedupeKeys.add(key);
    picks.push(pick);
  });

  return picks;
}

/**
 * Parse league ID from ESPN draft page URL
 * Example: https://fantasy.espn.com/baseball/draft?leagueId=123456
 */
export function parseLeagueIdFromUrl(): number | null {
  const urlParams = new URLSearchParams(window.location.search);
  const leagueId = urlParams.get("leagueId");
  return leagueId ? parseInt(leagueId, 10) : null;
}

/**
 * Detect draft format from ESPN page
 * Heuristic: look for auction-specific UI elements or URL params
 */
export function detectDraftFormat(): "snake" | "auction" {
  // Check URL for format param
  const urlParams = new URLSearchParams(window.location.search);
  const format = urlParams.get("draftType") || urlParams.get("format");
  if (format?.toLowerCase().includes("auction")) {
    return "auction";
  }

  // Check for auction-specific elements
  const auctionIndicators = document.querySelectorAll(
    '[class*="auction"], [class*="bid"]',
  );
  if (auctionIndicators.length > 0) {
    return "auction";
  }

  // ESPN auction board uses winningPrice cells with dollar amounts.
  const winningPriceEls = document.querySelectorAll(
    '.winningPrice, [class*="winningPrice"]',
  );
  if (winningPriceEls.length > 0) {
    return "auction";
  }

  const draftBoardText = document.body?.innerText || "";
  if (
    /\$\d+/.test(draftBoardText) &&
    draftBoardText.toLowerCase().includes("remaining")
  ) {
    return "auction";
  }

  // Strategy: Nomination queue detection
  const nominationEls = document.querySelectorAll(
    '[class*="nominat"], [class*="Nominat"], [class*="queue"], [class*="Queue"]',
  );
  if (nominationEls.length > 0) {
    return "auction";
  }

  // Strategy: Budget/dollar display text anywhere on page
  if (/\$\d+\s*(remaining|left|budget)/i.test(draftBoardText)) {
    return "auction";
  }

  // Strategy: Bid/Offer button detection (ESPN uses "Offer $X" buttons)
  const hasBidButton = Array.from(document.querySelectorAll("button")).some(
    (btn) => /bid|offer\s*\$/i.test(btn.textContent || ""),
  );
  if (hasBidButton) {
    return "auction";
  }

  // Strategy: ESPN-specific auction selectors
  const espnAuctionEls = document.querySelectorAll(
    '.pickArea, [data-testid="player-selected"], .bidding-form__container, .current-amount, .playerinfo__playername',
  );
  if (espnAuctionEls.length > 0) {
    return "auction";
  }

  // Strategy: Nomination-related text patterns
  if (
    /up for bid|current (offer|nomination)|place.*bid|nominating|pre-draft val/i.test(
      draftBoardText,
    )
  ) {
    return "auction";
  }

  // Default to snake
  return "snake";
}

/**
 * Diagnostic function to check ESPN DOM structure health
 * Useful for debugging selector issues on live ESPN pages
 * Call from console: window.espnDraftAssistant?.diagnose()
 */
export function diagnoseDOMStructure(): {
  draftBoardFound: boolean;
  pickRowsCount: number;
  completedPicksCount: number;
  selectorHealth: Record<string, boolean>;
  recommendations: string[];
} {
  const result = {
    draftBoardFound: false,
    pickRowsCount: 0,
    completedPicksCount: 0,
    selectorHealth: {} as Record<string, boolean>,
    recommendations: [] as string[],
  };

  // Test draft board selectors
  const draftBoard = findDraftBoardElement();
  result.draftBoardFound = !!draftBoard;
  result.selectorHealth["draftBoard"] = result.draftBoardFound;

  if (!result.draftBoardFound) {
    result.recommendations.push(
      "Draft board not found - page may not be fully loaded or ESPN changed structure",
    );
  }

  // Test pick row selectors
  const pickRows = document.querySelectorAll(PICK_ROW_SELECTORS);
  result.pickRowsCount = pickRows.length;
  result.selectorHealth["pickRows"] = result.pickRowsCount > 0;

  if (result.pickRowsCount === 0) {
    result.recommendations.push(
      "No pick rows found - check if draft has started or inspect element classes",
    );
  }

  // Test completed pick selectors
  const completedPicks = document.querySelectorAll(COMPLETED_PICK_SELECTORS);
  result.completedPicksCount = completedPicks.length;
  result.selectorHealth["completedPicks"] = result.completedPicksCount > 0;

  if (result.pickRowsCount > 0 && result.completedPicksCount === 0) {
    result.recommendations.push(
      "Pick rows found but no completed picks - draft may not have started",
    );
  }

  // Test for grid-based layout (ESPN's common pattern)
  const gridElements = document.querySelectorAll('[style*="grid-area"]');
  result.selectorHealth["gridLayout"] = gridElements.length > 0;

  if (gridElements.length === 0 && result.pickRowsCount > 0) {
    result.recommendations.push(
      "Picks found but no grid layout detected - ESPN may have changed to different layout system",
    );
  }

  // Log detailed diagnostics
  logger.log("[ESPN Draft Assistant] DOM Structure Diagnostic Report:");
  logger.log("  Draft Board Found:", result.draftBoardFound);
  logger.log("  Pick Rows Count:", result.pickRowsCount);
  logger.log("  Completed Picks Count:", result.completedPicksCount);
  logger.log("  Grid Elements:", gridElements.length);
  logger.log("  Selector Health:", result.selectorHealth);

  if (result.recommendations.length > 0) {
    logger.warn(
      "[ESPN Draft Assistant] Recommendations:",
      result.recommendations,
    );
  } else {
    logger.log(
      "[ESPN Draft Assistant] All selectors working - DOM structure healthy",
    );
  }

  // Sample first few elements for manual inspection
  if (pickRows.length > 0) {
    logger.log("[ESPN Draft Assistant] Sample pick row structure:", {
      tag: pickRows[0].tagName,
      classes: pickRows[0].className,
      id: pickRows[0].id,
      attributes: Array.from(pickRows[0].attributes).map((attr) => ({
        name: attr.name,
        value: attr.value.slice(0, 50),
      })),
      childrenCount: pickRows[0].children.length,
    });
  }

  return result;
}

/**
 * Test parsePickElement on a specific element from console
 * Usage: testParsePick(document.querySelector('[style*="grid-area"]'))
 */
export function testParsePick(element: Element): void {
  logger.log("[ESPN Draft Assistant] Testing pick element parsing...");
  logger.log("Element:", {
    tag: element.tagName,
    classes: element.className,
    id: element.id,
  });

  const result = parsePickElement(element);

  if (result) {
    logger.log("[ESPN Draft Assistant] Parse successful:", result);
  } else {
    logger.error(
      "[ESPN Draft Assistant] Parse failed - check console warnings above for details",
    );
  }
}

/**
 * Read the roster dropdown to map grid column → {espnTeamId, teamName}.
 *
 * CONFIRMED (MCP verified 2026-03-14): ESPN's draft board uses a <select>
 * dropdown whose option order matches the grid column order exactly.
 * Column 1 = first option, column 2 = second option, etc.
 * Option value = ESPN team ID (e.g., "22"), option text = team name.
 */
export function getTeamColumnMapping(): Map<
  number,
  { teamId: string; teamName: string }
> {
  const mapping = new Map<number, { teamId: string; teamName: string }>();
  const dropdown = document.querySelector("select");
  if (!dropdown) {
    logger.warn("[ESPN Draft Assistant] Team dropdown not found — cannot map columns to teams");
    return mapping;
  }

  Array.from(dropdown.options).forEach((option, index) => {
    mapping.set(index + 1, {
      teamId: option.value,
      teamName: option.text,
    });
  });

  return mapping;
}

/**
 * Parse team rosters from ESPN draft DOM using grid column → team mapping.
 *
 * CONFIRMED (MCP verified 2026-03-14): Completed picks use
 * .draft-board-grid-pick-cell.completedPick with grid-area: row / col.
 * Grid column maps to team via the roster <select> dropdown order.
 */
export function parseTeamRostersFromDOM(): Map<
  string,
  { teamId: string; teamName: string; playerIds: number[] }
> {
  const columnMap = getTeamColumnMapping();
  const picks = collectCompletedPicksSnapshot();
  const teamRosters = new Map<
    string,
    { teamId: string; teamName: string; playerIds: number[] }
  >();

  for (const pick of picks) {
    // parsePickElement sets teamId to the grid column string when no data-team-id exists
    const colNum = parseInt(pick.teamId, 10);
    const mapped = !isNaN(colNum) ? columnMap.get(colNum) : undefined;

    const teamId = mapped?.teamId || pick.teamId || "unknown";
    const teamName = mapped?.teamName || pick.teamName || `Team ${teamId}`;

    let roster = teamRosters.get(teamId);
    if (!roster) {
      roster = { teamId, teamName, playerIds: [] };
      teamRosters.set(teamId, roster);
    }

    if (!roster.playerIds.includes(pick.playerId)) {
      roster.playerIds.push(pick.playerId);
    }
  }

  logger.log(
    `[ESPN Draft Assistant] Parsed ${teamRosters.size} team rosters from DOM (${picks.length} total picks, ${columnMap.size} teams mapped)`,
  );

  return teamRosters;
}

/**
 * Diagnostic function to log roster parsing results
 * Useful for debugging roster detection on live ESPN pages
 * Call from console: window.espnDraftAssistant?.diagnoseRosters()
 */
export function logRosterDiagnostics(): void {
  const rosters = parseTeamRostersFromDOM();

  logger.log("[ESPN Draft Assistant] Roster Diagnostic Report:");
  logger.log(`  Total teams: ${rosters.size}`);

  if (rosters.size === 0) {
    logger.warn("  No teams found - draft may not have started");
    return;
  }

  // Log each team
  rosters.forEach((roster, teamId) => {
    logger.log(
      `  Team "${roster.teamName}" (ID: ${teamId}): ${roster.playerIds.length} players`,
    );
  });

  // Show sample roster (first team)
  const firstTeam = Array.from(rosters.values())[0];
  if (firstTeam) {
    logger.log("\n  Sample roster (first team):");
    logger.log(`    Team: ${firstTeam.teamName}`);
    logger.log(`    Players: ${firstTeam.playerIds.length}`);
    logger.log(
      `    Player IDs: ${firstTeam.playerIds.slice(0, 5).join(", ")}${firstTeam.playerIds.length > 5 ? "..." : ""}`,
    );
  }
}

/**
 * Current auction player selector strategies
 * ESPN displays the current player up for auction with bidding UI
 *
 * Real ESPN DOM (2026):
 *   div.pickArea > div[data-testid="player-selected"].player-selected
 *     span.playerinfo__playername  → player name
 *     span.playerinfo__playerpos   → position
 *     span.playerinfo__playerteam  → MLB team
 *     div.current-amount           → "Current offer: $1"
 *     img src="/players/full/42404.png" → player ID
 */
const CURRENT_AUCTION_PLAYER_SELECTORS = [
  // CONFIRMED (MCP verified 2026-03-14): ESPN test ID — most stable
  '[data-testid="player-selected"]',
  // CONFIRMED: class selector
  ".player-selected",
  // CONFIRMED: auction UI container
  ".pickArea",
  // FAILED selectors removed: [class*="currentPlayer"], [class*="activePlayer"]
].join(", ");

export interface CurrentAuctionPlayer {
  playerName: string;
  currentBid?: number;
  positions?: string[];
  playerId?: number;
}

/**
 * Parse current auction player from ESPN DOM element
 * Uses real ESPN selectors verified against live auction draft pages (2026)
 */
export function parseCurrentAuctionPlayer(
  playerElement: Element,
): CurrentAuctionPlayer | null {
  try {
    // CONFIRMED (Phase 39 Group 4): .playerinfo__playername
    // CONFIRMED (Phase 39 Group 4): [class*="playername"] — broader fallback
    const playerNameEl =
      playerElement.querySelector(".playerinfo__playername") ||
      playerElement.querySelector('[class*="playername"]') ||
      playerElement.querySelector('[class*="playerName"]'); // UNTESTED — generic fallback

    const playerName = playerNameEl?.textContent?.trim();
    if (!playerName) {
      return null;
    }

    // CONFIRMED (Phase 39 Group 4): .current-amount
    // CONFIRMED (Phase 39 Group 4): [class*="current-amount"] — broader fallback
    const bidEl =
      playerElement.querySelector(".current-amount") ||
      playerElement.querySelector('[class*="current-amount"]') ||
      playerElement.querySelector('[class*="currentBid"]'); // UNTESTED — generic fallback

    let currentBid: number | undefined;
    const bidText = bidEl?.textContent || "";
    const bidMatch = bidText.match(/\$(\d+)/);
    if (bidMatch) {
      currentBid = parseInt(bidMatch[1], 10);
    }

    // CONFIRMED (Phase 39 Group 4): .playerinfo__playerpos
    // CONFIRMED (Phase 39 Group 4): [class*="playerpos"] — broader fallback
    const positionEl =
      playerElement.querySelector(".playerinfo__playerpos") ||
      playerElement.querySelector('[class*="playerpos"]');

    const positionText = positionEl?.textContent?.trim() || "";
    const positions = positionText
      .split("/")
      .flatMap((part) => part.split(","))
      .map((part) => part.trim())
      .filter(Boolean);

    // CONFIRMED (Phase 39 Group 4): img[src*="/players/full/"] for player ID extraction
    let playerId: number | undefined;
    const headshotImg = playerElement.querySelector(
      'img[src*="/players/full/"]',
    );
    if (headshotImg) {
      const srcMatch = headshotImg
        .getAttribute("src")
        ?.match(/\/players\/full\/(\d+)\./);
      if (srcMatch) {
        playerId = parseInt(srcMatch[1], 10);
      }
    }

    // Fallback: data attributes or hash
    if (!playerId) {
      playerId =
        parseInt(
          playerElement.getAttribute("data-player-id") ||
            playerElement.getAttribute("data-playerid") ||
            "0",
          10,
        ) || hashString(playerName.toLowerCase());
    }

    return {
      playerName,
      currentBid,
      positions: positions.length > 0 ? positions : undefined,
      playerId,
    };
  } catch (error) {
    logger.error(
      "[ESPN Draft Assistant] Error parsing current auction player:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export interface ESPNAuctionTableEntry {
  playerId: number;
  playerName: string;
  espnValue: number;
  position: string;
  team: string;
  /** ESPN Average Salary — league-wide average sale price across all ESPN leagues */
  asvValue: number | null;
}

/**
 * Scrape ESPN auction value table from the fixedDataTable on the draft page.
 *
 * DOM structure:
 *   .fixedDataTableLayout_rowsContainer
 *     .fixedDataTableRowLayout_main[role="row"][aria-rowindex="1"]  <- header (skip)
 *     .fixedDataTableRowLayout_main[role="row"][aria-rowindex="2+"] <- data rows
 *       first .public_fixedDataTableCell_cellContent -> "$XX"
 *       a.player-news[title] -> player name
 *       button[data-player-id] -> ESPN player ID
 *       .positionPill -> position text
 *       .playerinfo__playerteam -> team abbrev
 *
 * Falls back to headshot img URL (/players/full/XXXXX.png) for rows that
 * lack a Queue button (players already owned by a team).
 *
 * Returns a Map keyed by playerId -> ESPNAuctionTableEntry.
 * Returns empty Map when the table is not present on the page.
 */
export function scrapeESPNAuctionTable(): Map<number, ESPNAuctionTableEntry> {
  const result = new Map<number, ESPNAuctionTableEntry>();

  const container = document.querySelector(
    ".fixedDataTableLayout_rowsContainer",
  );
  if (!container) {
    return result;
  }

  const rows = container.querySelectorAll<HTMLElement>(
    '.fixedDataTableRowLayout_main[role="row"]',
  );

  for (const row of Array.from(rows)) {
    // Skip header row (aria-rowindex="1")
    const rowIndex = parseInt(row.getAttribute("aria-rowindex") || "0", 10);
    if (rowIndex <= 1) {
      continue;
    }

    try {
      // Dollar value: first cell content e.g. "$56"
      const firstCell = row.querySelector(
        ".public_fixedDataTableCell_cellContent",
      );
      const valueText = firstCell?.textContent?.trim() || "";
      const valueMatch = valueText.match(/^\$(\d+)/);
      if (!valueMatch) {
        // Not a player row (may be a filler/empty row)
        continue;
      }
      const espnValue = parseInt(valueMatch[1], 10);

      // Player name from the anchor title attribute
      const playerNameAnchor = row.querySelector<HTMLAnchorElement>(
        "a.player-news[title]",
      );
      const playerName = playerNameAnchor?.getAttribute("title")?.trim() || "";
      if (!playerName) {
        continue;
      }

      // Player ID: primary source is Queue button data-player-id
      let playerId = 0;
      const queueButton = row.querySelector<HTMLButtonElement>(
        "button[data-player-id]",
      );
      if (queueButton) {
        playerId = parseInt(
          queueButton.getAttribute("data-player-id") || "0",
          10,
        );
      }

      // Fallback: extract from headshot img URL pattern /players/full/XXXXX.png
      if (!playerId) {
        const headshotImg = row.querySelector<HTMLImageElement>(
          'img[src*="/players/full/"]',
        );
        if (headshotImg) {
          const srcMatch = headshotImg
            .getAttribute("src")
            ?.match(/\/players\/full\/(\d+)\./);
          if (srcMatch) {
            playerId = parseInt(srcMatch[1], 10);
          }
        }
      }

      if (!playerId) {
        // Cannot associate value with a player ID — skip
        continue;
      }

      // Position from .positionPill
      const positionEl = row.querySelector(".positionPill");
      const position = positionEl?.textContent?.trim() || "";

      // Team abbreviation from .playerinfo__playerteam
      const teamEl = row.querySelector(".playerinfo__playerteam");
      const team = teamEl?.textContent?.trim() || "";

      // ASV (Average Salary) from the last cell in the scrollable cell group.
      // DOM layout: fixed group (z-index:2) | scrollable group (z-index:0)
      // ASV is always the rightmost column in the scrollable group.
      let asvValue: number | null = null;
      const cellGroupWrappers = row.querySelectorAll(
        ".fixedDataTableCellGroupLayout_cellGroupWrapper",
      );
      // Second wrapper is the scrollable columns (first is fixed: $, Player, Action)
      if (cellGroupWrappers.length >= 2) {
        const scrollableCells = cellGroupWrappers[1].querySelectorAll(
          ".public_fixedDataTableCell_cellContent",
        );
        if (scrollableCells.length > 0) {
          const lastCellText =
            scrollableCells[scrollableCells.length - 1]?.textContent?.trim() ||
            "";
          const asvMatch = lastCellText.match(/^\$(\d+(?:\.\d+)?)/);
          if (asvMatch) {
            asvValue = parseFloat(asvMatch[1]);
          }
        }
      }

      result.set(playerId, {
        playerId,
        playerName,
        espnValue,
        position,
        team,
        asvValue,
      });
    } catch (err) {
      // Don't let a single row failure abort the rest
      logger.warn(
        "[ESPN Draft Assistant] scrapeESPNAuctionTable: error parsing row",
        err,
      );
    }
  }

  if (result.size > 0) {
    logger.log(
      `[ESPN Draft Assistant] scrapeESPNAuctionTable: scraped ${result.size} entries`,
    );
  }

  return result;
}

export interface ESPNQueueEntry {
  playerId: number;
  playerName: string;
  position: string;
  queuePosition: number;
}

/**
 * Scrape ESPN's nomination queue — players the user has queued for nomination.
 *
 * ESPN DOM evidence:
 * - When a player is queued: their row's button[data-player-id] shows "Dequeue" text
 * - Variants: "dequeue", "deselect", "remove" (ESPN may differ by state)
 * - When not queued: shows "Queue" (not user's turn) or "Select" (user's turn)
 *
 * Returns ordered list of queued players (order matches DOM order, which may
 * match queue insertion order).
 */
export function scrapeESPNNominationQueue(): ESPNQueueEntry[] {
  // Selector priority (Phase 39 SELECTOR-MAP Group 6):
  // CONFIRMED: button.action-btn[data-player-id] — primary, most specific
  // CONFIRMED: button[data-player-id]            — fallback, may match non-action buttons
  const specificButtons = document.querySelectorAll<HTMLButtonElement>(
    "button.action-btn[data-player-id]",
  );
  const allPlayerButtons: NodeListOf<HTMLButtonElement> =
    specificButtons.length > 0
      ? specificButtons
      : document.querySelectorAll<HTMLButtonElement>("button[data-player-id]");

  // UNTESTED button text values: "dequeue" | "deselect" | "remove"
  // These need live verification — ESPN may use different text in 2026
  // Extend this array if live testing reveals additional variants
  const dequeueVariants = ["dequeue", "deselect", "remove"];

  const result: ESPNQueueEntry[] = [];
  let queuePosition = 0;

  for (const btn of Array.from(allPlayerButtons)) {
    const text = btn.textContent?.trim().toLowerCase() || "";
    const isDequeued = dequeueVariants.some((v) => text.includes(v));
    if (!isDequeued) continue;

    const playerIdStr = btn.getAttribute("data-player-id");
    if (!playerIdStr) continue;
    const playerId = parseInt(playerIdStr, 10);
    if (!playerId || isNaN(playerId)) continue;

    // CONFIRMED (Phase 39 Group 5): .fixedDataTableRowLayout_main[role='row'] for row context
    // CONFIRMED (Phase 39 Group 5): a.player-news[title] for player name
    // CONFIRMED (Phase 39 Group 5): .positionPill for position
    const row = btn.closest(".fixedDataTableRowLayout_main, [role='row']");
    const playerName =
      row
        ?.querySelector("a.player-news[title]")
        ?.getAttribute("title")
        ?.trim() || "";
    const position =
      row?.querySelector(".positionPill")?.textContent?.trim() || "";

    result.push({ playerId, playerName, position, queuePosition });
    queuePosition++;
  }

  if (result.length > 0) {
    logger.log(
      `[ESPN Draft Assistant] scrapeESPNNominationQueue: found ${result.length} queued players`,
    );
  }

  return result;
}

/**
 * Observes ESPN auction draft page for current player up for bid
 * Returns cleanup function to disconnect observer
 *
 * Debounces updates since ESPN may refresh DOM rapidly during bidding
 */
export function observeCurrentAuctionPlayer(
  onPlayerChange: (player: CurrentAuctionPlayer | null) => void,
): () => void {
  let lastEmittedPlayer: string | null = null;
  let debounceTimeout: number | null = null;

  const emitPlayerChange = (player: CurrentAuctionPlayer | null) => {
    const playerKey = player
      ? `${player.playerName}:${player.currentBid ?? ""}`
      : null;

    if (playerKey === lastEmittedPlayer) {
      return;
    }

    lastEmittedPlayer = playerKey;

    if (player) {
      logger.log("[ESPN Draft Assistant] Current auction player:", player);
    } else {
      logger.log("[ESPN Draft Assistant] No active auction player");
    }

    onPlayerChange(player);
  };

  const checkCurrentPlayer = () => {
    // Clear pending debounce
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
      debounceTimeout = null;
    }

    // Debounce: ESPN may refresh DOM rapidly during bidding
    debounceTimeout = window.setTimeout(() => {
      const playerContainer = document.querySelector(
        CURRENT_AUCTION_PLAYER_SELECTORS,
      );

      if (!playerContainer) {
        emitPlayerChange(null);
        return;
      }

      const player = parseCurrentAuctionPlayer(playerContainer);
      emitPlayerChange(player);
    }, 200); // 200ms debounce
  };

  // Initial check
  checkCurrentPlayer();

  // Watch for DOM changes
  const observer = new MutationObserver(() => {
    checkCurrentPlayer();
  });

  // Try narrower container for auction UI — reduces mutation events vs. observing document.body.
  // Falls back to document.body if none of the known ESPN auction selectors match.
  // UNTESTED: auction container selectors — need live verification
  const auctionContainer =
    document.querySelector('[class*="auction"]') ||
    document.querySelector('[class*="Auction"]') ||
    document.querySelector(".player-card") ||
    document.body;

  if (auctionContainer) {
    observer.observe(auctionContainer, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "data-player-id", "data-bid"],
    });
  }

  // Return cleanup function — no setInterval to clear (MutationObserver + 200ms debounce is sufficient)
  return () => {
    observer.disconnect();
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }
  };
}
