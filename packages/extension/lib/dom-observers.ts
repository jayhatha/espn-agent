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
              console.error(
                "[ESPN Draft Assistant] Error parsing pick from mutation:",
                error,
                { element: pickElement },
              );
            }
          });

          try {
            await Promise.all(pickPromises);
          } catch (error) {
            console.error(
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

  // Strategy: Bid button detection
  const hasBidButton = Array.from(document.querySelectorAll("button")).some(
    (btn) => /bid/i.test(btn.textContent || ""),
  );
  if (hasBidButton) {
    return "auction";
  }

  // Strategy: Nomination-related text patterns
  if (/up for bid|current nomination|place.*bid|nominating/i.test(draftBoardText)) {
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
  console.log("[ESPN Draft Assistant] DOM Structure Diagnostic Report:");
  console.log("  Draft Board Found:", result.draftBoardFound);
  console.log("  Pick Rows Count:", result.pickRowsCount);
  console.log("  Completed Picks Count:", result.completedPicksCount);
  console.log("  Grid Elements:", gridElements.length);
  console.log("  Selector Health:", result.selectorHealth);

  if (result.recommendations.length > 0) {
    console.warn(
      "[ESPN Draft Assistant] Recommendations:",
      result.recommendations,
    );
  } else {
    console.log(
      "[ESPN Draft Assistant] All selectors working - DOM structure healthy",
    );
  }

  // Sample first few elements for manual inspection
  if (pickRows.length > 0) {
    console.log(
      "[ESPN Draft Assistant] Sample pick row structure:",
      {
        tag: pickRows[0].tagName,
        classes: pickRows[0].className,
        id: pickRows[0].id,
        attributes: Array.from(pickRows[0].attributes).map((attr) => ({
          name: attr.name,
          value: attr.value.slice(0, 50),
        })),
        childrenCount: pickRows[0].children.length,
      },
    );
  }

  return result;
}

/**
 * Test parsePickElement on a specific element from console
 * Usage: testParsePick(document.querySelector('[style*="grid-area"]'))
 */
export function testParsePick(element: Element): void {
  console.log("[ESPN Draft Assistant] Testing pick element parsing...");
  console.log("Element:", {
    tag: element.tagName,
    classes: element.className,
    id: element.id,
  });

  const result = parsePickElement(element);

  if (result) {
    console.log("[ESPN Draft Assistant] Parse successful:", result);
  } else {
    console.error(
      "[ESPN Draft Assistant] Parse failed - check console warnings above for details",
    );
  }
}

/**
 * Parse team rosters from ESPN draft DOM
 * Returns map of teamId -> team roster data with playerIds
 *
 * Strategy:
 * 1. Collect all completed picks using existing snapshot function
 * 2. Group picks by teamId field (already parsed by parsePickElement)
 * 3. Return Map with entry per team containing teamId/teamName/playerIds
 *
 * Use cases:
 * - Practice drafts: compute projected standings locally without backend API
 * - Fallback when API fails: use DOM state to maintain UI functionality
 */
export function parseTeamRostersFromDOM(): Map<
  string,
  { teamId: string; teamName: string; playerIds: number[] }
> {
  const picks = collectCompletedPicksSnapshot();
  const teamRosters = new Map<
    string,
    { teamId: string; teamName: string; playerIds: number[] }
  >();

  // Group picks by teamId
  for (const pick of picks) {
    // Skip picks with missing teamId (should be rare with fallback logic in parsePickElement)
    if (!pick.teamId) {
      console.warn(
        "[ESPN Draft Assistant] Skipping pick with missing teamId:",
        pick.playerName,
      );
      continue;
    }

    // Get or create team roster entry
    let roster = teamRosters.get(pick.teamId);
    if (!roster) {
      roster = {
        teamId: pick.teamId,
        teamName: pick.teamName || `Team ${pick.teamId}`,
        playerIds: [],
      };
      teamRosters.set(pick.teamId, roster);
    }

    // Add player to roster (dedupe by playerId)
    if (!roster.playerIds.includes(pick.playerId)) {
      roster.playerIds.push(pick.playerId);
    }
  }

  console.log(
    `[ESPN Draft Assistant] Parsed ${teamRosters.size} team rosters from DOM (${picks.length} total picks)`,
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

  console.log("[ESPN Draft Assistant] Roster Diagnostic Report:");
  console.log(`  Total teams: ${rosters.size}`);

  if (rosters.size === 0) {
    console.warn("  No teams found - draft may not have started");
    return;
  }

  // Log each team
  rosters.forEach((roster, teamId) => {
    console.log(
      `  Team "${roster.teamName}" (ID: ${teamId}): ${roster.playerIds.length} players`,
    );
  });

  // Show sample roster (first team)
  const firstTeam = Array.from(rosters.values())[0];
  if (firstTeam) {
    console.log("\n  Sample roster (first team):");
    console.log(`    Team: ${firstTeam.teamName}`);
    console.log(`    Players: ${firstTeam.playerIds.length}`);
    console.log(`    Player IDs: ${firstTeam.playerIds.slice(0, 5).join(", ")}${firstTeam.playerIds.length > 5 ? "..." : ""}`);
  }
}

/**
 * Current auction player selector strategies
 * ESPN displays the current player up for auction with bidding UI
 */
const CURRENT_AUCTION_PLAYER_SELECTORS = [
  // Primary: ESPN's typical current player containers
  ".currentPlayer",
  '[class*="currentPlayer"]',
  '[class*="CurrentPlayer"]',

  // Secondary: Active player containers
  ".activePlayer",
  '[class*="activePlayer"]',
  '[data-testid*="current-player"]',

  // Fallback: Auction header often contains current player
  ".auctionHeader",
  '[class*="auctionHeader"]',
  '[class*="auction-header"]',
].join(", ");

export interface CurrentAuctionPlayer {
  playerName: string;
  currentBid?: number;
  positions?: string[];
  playerId?: number;
}

/**
 * Parse current auction player from ESPN DOM element
 * Extracts player name, current bid, positions
 */
export function parseCurrentAuctionPlayer(
  playerElement: Element,
): CurrentAuctionPlayer | null {
  try {
    // Strategy 1: Extract player name
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
      playerNameEl = playerElement.querySelector(selector);
      if (playerNameEl?.textContent?.trim()) break;
    }

    const playerName = playerNameEl?.textContent?.trim();
    if (!playerName) {
      return null;
    }

    // Strategy 2: Extract current bid
    const bidSelectors = [
      ".currentBid",
      ".bid",
      ".winningPrice",
      '[class*="currentBid"]',
      '[class*="bid"]',
      '[class*="price"]',
      '[data-testid*="bid"]',
      '[data-testid*="price"]',
    ];

    let bidEl: Element | null = null;
    for (const selector of bidSelectors) {
      bidEl = playerElement.querySelector(selector);
      if (bidEl?.textContent?.trim()) break;
    }

    const bidText = bidEl?.textContent;
    const currentBid = bidText
      ? parseInt(bidText.replace(/\D/g, "") || "0", 10) || undefined
      : undefined;

    // Strategy 3: Extract positions
    const positionSelectors = [
      ".positionPill",
      ".position",
      '[class*="position"]',
      '[class*="Position"]',
      '[data-testid*="position"]',
    ];

    let positionEl: Element | null = null;
    for (const selector of positionSelectors) {
      positionEl = playerElement.querySelector(selector);
      if (positionEl?.textContent?.trim()) break;
    }

    const positionText = positionEl?.textContent?.trim() || "";
    const positions = positionText
      .split("/")
      .flatMap((part) => part.split(","))
      .map((part) => part.trim())
      .filter(Boolean);

    // Strategy 4: Extract player ID if available
    const playerId = parseInt(
      playerElement.getAttribute("data-player-id") ||
        playerElement.getAttribute("data-playerid") ||
        "0",
      10,
    ) || undefined;

    // Generate fallback ID if needed
    const fallbackPlayerId = playerId || hashString(playerName.toLowerCase());

    return {
      playerName,
      currentBid,
      positions: positions.length > 0 ? positions : undefined,
      playerId: fallbackPlayerId,
    };
  } catch (error) {
    console.error(
      "[ESPN Draft Assistant] Error parsing current auction player:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
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
    const playerKey = player ? `${player.playerName}:${player.currentBid ?? ""}` : null;

    if (playerKey === lastEmittedPlayer) {
      return;
    }

    lastEmittedPlayer = playerKey;

    if (player) {
      console.log("[ESPN Draft Assistant] Current auction player:", player);
    } else {
      console.log("[ESPN Draft Assistant] No active auction player");
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
      const playerContainer = document.querySelector(CURRENT_AUCTION_PLAYER_SELECTORS);

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

  // Observe body for changes (auction UI updates frequently)
  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-player-id', 'data-bid'],
    });
  }

  // Periodic check as safety net (ESPN may update without DOM mutations)
  const periodicCheck = setInterval(() => {
    checkCurrentPlayer();
  }, 2000);

  // Return cleanup function
  return () => {
    observer.disconnect();
    clearInterval(periodicCheck);
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }
  };
}
