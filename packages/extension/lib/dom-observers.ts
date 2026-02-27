import type { DraftPick } from "@espn-fantasy/shared";

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
  // Primary: ESPN's typical draft board containers
  ".draftBoardContainer",
  '[class*="draftBoard"]',
  '[class*="DraftBoard"]',
  '[id*="draftBoard"]',

  // Fallback: Broader draft-related containers
  '[class*="draft"][class*="board"]',
  '[class*="draft"][class*="container"]',
  ".draft-content-wrapper",
  '[class*="draft-columns"]',

  // Last resort: Look for grid-styled containers with pick cells
  '[style*="grid-template"]',
  '[data-testid*="draft"]',
].join(", ");

const PICK_ROW_SELECTORS = [
  // Primary: Cells with grid positioning (ESPN uses inline grid-area styles)
  '[style*="grid-area"]',

  // Secondary: Pick cells by class
  ".draftBoardCell",
  ".pickCell",
  '[class*="pickCell"]',
  '[class*="PickCell"]',
  '[class*="draftCell"]',

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
  '[data-completed="true"]',
  '[data-status="completed"]',

  // Secondary: Picks that contain player data are likely completed
  '[data-player-id]:not([data-player-id=""])',
  '[style*="grid-area"]:has(.playerCard)',
  '[style*="grid-area"]:has([class*="player"])',

  // Fallback: Any cell with player name elements (defensive)
  ':has(.playerName)',
  ':has([class*="playerName"])',
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
        // Primary selector failed, but fallback succeeded
        console.warn(
          `[ESPN Draft Assistant] Primary ${selectorName} selector failed, using fallback #${i + 1}: "${selector}"`,
        );
      }
      return element;
    }
  }

  // All selectors failed - log error with DOM snapshot
  console.error(
    `[ESPN Draft Assistant] All ${selectorName} selectors failed. ESPN DOM may have changed.`,
  );
  console.error(
    "[ESPN Draft Assistant] Document body classes:",
    document.body?.className || "none",
  );
  console.error(
    "[ESPN Draft Assistant] Document body children count:",
    document.body?.children.length || 0,
  );

  // Log first 5 elements with their classes for debugging
  if (document.body) {
    const elements = Array.from(document.body.querySelectorAll("*")).slice(
      0,
      5,
    );
    console.error(
      "[ESPN Draft Assistant] First 5 elements:",
      elements.map((el) => ({
        tag: el.tagName,
        class: el.className,
        id: el.id,
      })),
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
 * Observes ESPN draft board for new picks
 * Returns cleanup function to disconnect observer
 * Updated to support async pick handlers for auto-refresh
 */
export function observeDraftBoard(
  onPick: (pick: DraftPick) => void | Promise<void>,
): () => void {
  let observedBoard: Element | null = null;
  const emittedPickKeys = new Set<string>();

  const emitPick = async (pick: DraftPick) => {
    const key = getPickDedupKey(pick);
    if (emittedPickKeys.has(key)) {
      return;
    }

    emittedPickKeys.add(key);
    console.log("[ESPN Draft Assistant] Detected pick:", pick);
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
        console.error(
          "[ESPN Draft Assistant] Error parsing pick element:",
          error,
        );
        console.error(
          "[ESPN Draft Assistant] Pick element structure:",
          {
            tag: pickElement.tagName,
            classes: pickElement.className,
            childCount: pickElement.children.length,
          },
        );
        // Continue observing despite extraction failure
      }
    });
  };

  const scanEntireDocument = () => {
    scanCompletedPicks(document);
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        // Check for new pick rows
        mutation.addedNodes.forEach((node) => {
          const pickElements = getPickCandidatesFromNode(node);

          pickElements.forEach(async (pickElement) => {
            try {
              const pick = parsePickElement(pickElement);
              if (pick) {
                await emitPick(pick);
              }
            } catch (error) {
              console.error(
                "[ESPN Draft Assistant] Error parsing pick from mutation:",
                error,
              );
              console.error(
                "[ESPN Draft Assistant] Pick element context:",
                {
                  tag: pickElement.tagName,
                  classes: pickElement.className,
                  parentTag: pickElement.parentElement?.tagName,
                },
              );
              // Continue observing despite extraction failure
            }
          });
        });
      }
    }
  });

  const startObservingBoard = (board: Element) => {
    if (observedBoard === board) {
      return;
    }

    observedBoard = board;
    console.log("[ESPN Draft Assistant] Observing draft board:", board);
    observer.observe(board, {
      childList: true,
      subtree: true,
    });

    scanCompletedPicks(board);
  };

  const existingBoard = findDraftBoardElement();
  if (existingBoard) {
    startObservingBoard(existingBoard);
  } else {
    console.warn(
      "[ESPN Draft Assistant] Draft board not found yet. Watching for async load.",
    );
  }

  // Capture already-rendered picks even if board observer attaches late.
  scanEntireDocument();

  const bootstrapObserver = new MutationObserver(() => {
    if (observedBoard) {
      return;
    }

    const board = findDraftBoardElement();
    if (board) {
      console.log("[ESPN Draft Assistant] Draft board found after async load");
      startObservingBoard(board);
      bootstrapObserver.disconnect();
      clearTimeout(bootstrapTimeout);
    }
  });

  if (!observedBoard && document.body) {
    bootstrapObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  const bootstrapTimeout = setTimeout(() => {
    if (!observedBoard) {
      console.warn(
        "[ESPN Draft Assistant] Draft board still not found after waiting for page render.",
      );
    }
    bootstrapObserver.disconnect();
  }, 15000);

  // ESPN can repaint grid cells without adding/removing the board node.
  // Poll completed picks as a safety net; dedupe keeps this cheap and safe.
  const periodicScan = setInterval(() => {
    scanEntireDocument();
  }, 2000);

  // Return cleanup function
  return () => {
    observer.disconnect();
    bootstrapObserver.disconnect();
    clearTimeout(bootstrapTimeout);
    clearInterval(periodicScan);
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
    // Strategy 1: Look for player name in various ESPN patterns
    const playerNameSelectors = [
      ".playerName",
      '[class*="playerName"]',
      '[class*="PlayerName"]',
      ".player-name",
      ".name",
      '[class*="name"]',
      '[data-testid*="player-name"]',
    ];

    let playerNameEl: Element | null = null;
    for (const selector of playerNameSelectors) {
      playerNameEl = pickElement.querySelector(selector);
      if (playerNameEl?.textContent?.trim()) break;
    }

    // Strategy 2: Try first/last name split pattern
    const firstName = pickElement
      .querySelector(".playerFirstName, .firstName, [class*='firstName']")
      ?.textContent?.trim();
    const lastName = pickElement
      .querySelector(".playerLastName, .lastName, [class*='lastName']")
      ?.textContent?.trim();

    const playerName = [
      playerNameEl?.textContent?.trim(),
      [firstName, lastName].filter(Boolean).join(" ").trim(),
    ].find((value) => Boolean(value));

    // Strategy 3: Extract MLB team abbreviation (NOT fantasy team)
    const teamEl = pickElement.querySelector(
      '.teamAbbrev, .team-abbrev, [class*="teamAbbrev"], [class*="team"][class*="abbrev"], [data-testid*="team"]',
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
      '[data-team-name], [data-owner-name], [data-team-id]',
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

      console.warn(
        "[ESPN Draft Assistant] Failed to parse player name from pick element",
        {
          element: pickElement.tagName,
          classes: pickElement.className,
          hasPlayerNameEl: !!playerNameEl,
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
        pickElement.querySelector(".pickNumber, [class*='pickNumber']")
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
    const computedPickNumber =
      pickNumber || (gridArea ? gridArea.row : 0);

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
    console.error(
      "[ESPN Draft Assistant] Error parsing pick element:",
      error instanceof Error ? error.message : error,
    );
    console.error("[ESPN Draft Assistant] Pick element details:", {
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

  // Default to snake
  return "snake";
}
