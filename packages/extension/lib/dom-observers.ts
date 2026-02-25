import type { DraftPick } from "@espn-fantasy/shared";

const DRAFT_BOARD_SELECTORS = [
  ".draftBoardGrid",
  '[class*="draftBoardGrid"]',
  ".draft-board",
  ".draftboard-container",
  '[class*="draftBoard"]',
  '[class*="DraftBoard"]',
  '[data-testid*="draft-board"]',
  '[data-testid*="draftboard"]',
  '[id*="draftBoard"]',
  '[id*="draft-board"]',
  '[class*="draft-room"]',
  '[class*="draftRoom"]',
  '[class*="DraftRoom"]',
  '[data-testid*="draft-room"]',
].join(", ");

const PICK_ROW_SELECTORS = [
  ".draft-board-grid-pick-cell",
  ".draft-board-grid-pick-cell.completedPick",
  ".draft-board-grid-pick-cell.myTeam",
  ".pick-row",
  ".draft-pick",
  '[class*="pickRow"]',
  '[class*="PickRow"]',
  '[class*="draftPick"]',
  '[class*="DraftPick"]',
  '[data-testid*="pick-row"]',
  '[data-testid*="draft-pick"]',
  "[data-player-id]",
].join(", ");

const COMPLETED_PICK_SELECTORS = [
  ".draft-board-grid-pick-cell.completedPick",
  ".completedPick",
  ".pick-row.completed",
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

function findDraftBoardElement(): Element | null {
  const directMatch = document.querySelector(DRAFT_BOARD_SELECTORS);
  if (directMatch) {
    return directMatch;
  }

  const pickElement = document.querySelector(PICK_ROW_SELECTORS);
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
      const pick = parsePickElement(pickElement);
      if (pick) {
        emitPick(pick);
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
            const pick = parsePickElement(pickElement);
            if (pick) {
              await emitPick(pick);
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
 * NOTE: Selectors are placeholders - must be verified against real ESPN draft page
 */
export function parsePickElement(pickElement: Element): DraftPick | null {
  try {
    const playerNameEl = pickElement.querySelector(
      '.player-name, [class*="playerName"], [class*="PlayerName"], [data-testid*="player-name"]',
    );
    const teamEl = pickElement.querySelector(
      '.team-abbrev, [class*="teamAbbrev"], [class*="TeamAbbrev"], [data-testid*="team"]',
    );
    const positionEl = pickElement.querySelector(
      '.player-position, [class*="position"], [class*="Position"], [data-testid*="position"]',
    );

    const firstName = pickElement
      .querySelector(".playerFirstName")
      ?.textContent?.trim();
    const lastName = pickElement
      .querySelector(".playerLastName")
      ?.textContent?.trim();

    const playerName = [
      playerNameEl?.textContent?.trim(),
      [firstName, lastName].filter(Boolean).join(" ").trim(),
    ].find((value) => Boolean(value));

    // Fantasy team name (NOT player's MLB team)
    // Look for team owner/name in various possible locations
    const fantasyTeamEl = pickElement.querySelector(
      '.team-name, .owner-name, .teamName, .ownerName, [class*="teamName"], [class*="ownerName"], [data-testid*="team-name"]',
    );

    // Try to get fantasy team name from parent containers
    const parentTeamEl = pickElement.closest('[data-team-name], [data-owner-name]');

    const teamName =
      fantasyTeamEl?.textContent?.trim() ||
      parentTeamEl?.getAttribute('data-team-name') ||
      parentTeamEl?.getAttribute('data-owner-name') ||
      undefined;

    const positionText =
      positionEl?.textContent?.trim() ||
      pickElement.querySelector(".positionPill")?.textContent?.trim() ||
      "";
    const positions = positionText
      .split("/")
      .flatMap((part) => part.split(","))
      .map((part) => part.trim())
      .filter(Boolean);

    if (!playerName) {
      if (pickElement.classList.contains("upcomingPick")) {
        return null;
      }

      console.warn("[ESPN Draft Assistant] Incomplete pick data:", {
        playerName,
        teamName,
      });
      return null;
    }

    // Extract IDs and pick number from data attributes (if available)
    const playerId = parseInt(
      pickElement.getAttribute("data-player-id") || "0",
      10,
    );
    const pickNumber = parseInt(
      pickElement.getAttribute("data-pick-number") || "0",
      10,
    );
    const rowNumber = parseInt(
      pickElement
        .querySelector(".rowNumber")
        ?.textContent?.replace(/\D/g, "") || "0",
      10,
    );
    const gridArea = parseGridArea(pickElement);

    const teamId =
      pickElement.getAttribute("data-team-id") ||
      (pickElement.classList.contains("myTeam")
        ? "myTeam"
        : gridArea
          ? String(gridArea.column)
          : teamName || "unknown-team");

    // Auction cost (if present)
    const costEl = pickElement.querySelector(
      '.pick-cost, [class*="cost"], [class*="Cost"], [data-testid*="cost"], [data-testid*="bid"]',
    );
    const winningPriceEl = pickElement.querySelector(".winningPrice");
    const parsedCostText = costEl?.textContent || winningPriceEl?.textContent;
    const cost = parsedCostText
      ? parseInt(parsedCostText.replace(/\D/g, "") || "0", 10)
      : undefined;

    const rosterSlot = pickElement
      .querySelector(".rosterSlot")
      ?.textContent?.trim();
    const fallbackPlayerId = hashString(
      `${playerName.toLowerCase()}|${teamId}|${cost ?? ""}|${rosterSlot ?? ""}|${gridArea?.row ?? ""}|${gridArea?.column ?? ""}`,
    );

    const computedPickNumber =
      pickNumber || rowNumber || (gridArea ? gridArea.row : 0);

    // Generate better fallback team names based on position/column
    let finalTeamName = teamName;
    if (!finalTeamName) {
      if (pickElement.classList.contains("myTeam")) {
        finalTeamName = "My Team";
      } else if (gridArea && gridArea.column) {
        // Use column number to generate team name (e.g., "Team 1", "Team 2")
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
    console.error("[ESPN Draft Assistant] Error parsing pick element:", error);
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
