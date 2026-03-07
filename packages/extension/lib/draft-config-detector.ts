import type { Category, DraftConfiguration } from "@espn-fantasy/shared";

/**
 * Detect roster slots from the ESPN players-table DOM.
 *
 * ESPN renders each active roster row as a <tr> in the players-table body.
 * The first <td> in each row contains a <div title="C"> (or "1B", "2B/SS", etc.)
 * that identifies the slot type.
 *
 * Returns { rosterSlots, benchCount } or null if the table isn't found / zero rows detected.
 */
export function detectRosterSlotsFromPlayersTable(): {
  rosterSlots: Record<string, number>;
  benchCount: number;
} | null {
  const table =
    document.querySelector(".ResponsiveTable.players-table") ??
    document.querySelector(".players-table");

  if (!table) {
    return null;
  }

  const rows = table.querySelectorAll("tbody tr");
  if (rows.length === 0) {
    return null;
  }

  const rosterSlots: Record<string, number> = {};
  let benchCount = 0;

  rows.forEach((row) => {
    const firstTd = row.querySelector("td");
    if (!firstTd) return;

    const titleDiv = firstTd.querySelector("div[title]");
    if (!titleDiv) return;

    const rawLabel = (titleDiv.getAttribute("title") || "").trim();
    if (!rawLabel) return;

    // Map ESPN slot labels to engine slot keys
    let slotKey: string;
    if (rawLabel === "2B/SS") {
      slotKey = "MI";
    } else if (rawLabel === "1B/3B") {
      slotKey = "CI";
    } else if (rawLabel === "BE") {
      slotKey = "BN";
      benchCount++;
    } else {
      slotKey = rawLabel;
    }

    rosterSlots[slotKey] = (rosterSlots[slotKey] ?? 0) + 1;
  });

  if (Object.keys(rosterSlots).length === 0 && benchCount === 0) {
    return null;
  }

  console.log(
    `[ESPN Draft Assistant] Roster slots detected from players-table: ${JSON.stringify(rosterSlots)} (bench: ${benchCount})`,
  );

  return { rosterSlots, benchCount };
}

/**
 * Detect roster size and position list from ESPN Position Tracker DOM.
 *
 * DOM structure:
 *   .roster-limits
 *     div > "Position Tracker" | "X/N Players"   ← N is total roster size
 *     div > [position divs: "C<span>0</span>", "1B<span>1</span>", ...]
 *
 * The span values are FILLED counts (not slot limits), but the "X/N Players"
 * header gives us the total roster size and the position names tell us which
 * positions this league uses.
 */
export function detectRosterSizeFromPositionTracker(): {
  rosterSize: number;
  positions: string[];
} | null {
  const container = document.querySelector(".roster-limits");
  if (!container) {
    return null;
  }

  // Parse "X/N Players" from text content
  const text = container.textContent || "";
  const match = text.match(/(\d+)\s*\/\s*(\d+)\s*Players/i);
  if (!match) {
    return null;
  }

  const rosterSize = parseInt(match[2], 10);
  if (!rosterSize || rosterSize < 10 || rosterSize > 50) {
    return null; // Sanity check
  }

  // Extract position names from child divs (e.g., "C", "1B", "OF", "SP")
  const positions: string[] = [];
  const positionDivs = container.querySelectorAll(".dib");
  positionDivs.forEach((div) => {
    // Text content is like "C0" or "OF3" — position name is before the span
    const posText = div.childNodes[0]?.textContent?.trim();
    if (posText && /^[A-Z0-9/]+$/i.test(posText)) {
      positions.push(posText.toUpperCase());
    }
  });

  console.log(
    `[ESPN Draft Assistant] Position Tracker: rosterSize=${rosterSize}, positions=[${positions.join(", ")}]`,
  );

  return { rosterSize, positions };
}

export interface DetectionResult {
  config: (DraftConfiguration & { budget?: number }) | null;
  confidence: "high" | "low" | "failed";
  warnings: string[];
  isPracticeDraft: boolean;
}

/**
 * Detect if this is a practice draft (no real league data)
 * Practice drafts may have different DOM structure or limited data
 */
export function isPracticeDraft(): boolean {
  // Strategy 1: Check page title/heading
  const headingSelectors = ["h1", "h2", ".page-title", '[class*="title"]'];

  for (const selector of headingSelectors) {
    const heading = document.querySelector(selector);
    if (heading?.textContent?.toLowerCase().includes("practice")) {
      console.log(
        "[ESPN Draft Assistant] Practice draft detected from heading",
      );
      return true;
    }
  }

  // Strategy 2: Check URL for practice indicators
  const url = window.location.href.toLowerCase();
  if (url.includes("practice") || url.includes("mock")) {
    console.log("[ESPN Draft Assistant] Practice draft detected from URL");
    return true;
  }

  // Strategy 3: Check for practice draft indicators in page content
  const bodyText = document.body?.textContent?.toLowerCase() || "";
  if (
    bodyText.includes("practice draft") ||
    bodyText.includes("mock draft")
  ) {
    console.log(
      "[ESPN Draft Assistant] Practice draft detected from page content",
    );
    return true;
  }

  return false;
}

/**
 * Detect auction budget from ESPN draft page DOM
 * Multi-strategy detection with 100-500 validation range
 */
function detectAuctionBudget(): number {
  // Strategy 1: Look for budget display in draft settings panel
  const settingsSelectors = [
    '[class*="budget"]',
    '[class*="auction"][class*="settings"]',
    '.draft-settings',
    '[class*="settings"]',
  ];

  for (const selector of settingsSelectors) {
    const settingsPanel = document.querySelector(selector);
    if (settingsPanel) {
      const text = settingsPanel.textContent || "";
      // Pattern: "Budget: $260" or "$260 Budget" or "260" near "budget" text
      const budgetMatch = text.match(/(?:budget[:\s]*\$?\s*(\d+)|\$?(\d+)\s*budget)/i);
      if (budgetMatch) {
        const budgetValue = parseInt(budgetMatch[1] || budgetMatch[2], 10);
        if (budgetValue >= 100 && budgetValue <= 500) {
          console.log(`[ESPN Draft Assistant] Auction budget detected from settings: $${budgetValue}`);
          return budgetValue;
        }
      }
    }
  }

  // Strategy 2: Parse from roster display showing remaining budget
  // Pattern: "$243 remaining of $260" or "$243/$260"
  const budgetDisplaySelectors = [
    '[class*="budget"]',
    '[class*="remaining"]',
    '[class*="auction"]',
  ];

  for (const selector of budgetDisplaySelectors) {
    const budgetDisplay = document.querySelector(selector);
    if (budgetDisplay) {
      const text = budgetDisplay.textContent || "";
      // Match patterns like "243 remaining of 260" or "243/260"
      const remainingMatch = text.match(/(\d+)\s*(?:remaining|left).*?of.*?\$?(\d+)/i);
      const slashMatch = text.match(/\$?(\d+)\s*\/\s*\$?(\d+)/);

      const totalBudget = remainingMatch
        ? parseInt(remainingMatch[2], 10)
        : slashMatch
        ? parseInt(slashMatch[2], 10)
        : null;

      if (totalBudget && totalBudget >= 100 && totalBudget <= 500) {
        console.log(`[ESPN Draft Assistant] Auction budget detected from remaining display: $${totalBudget}`);
        return totalBudget;
      }
    }
  }

  // Strategy 3: URL parameter (some ESPN drafts include ?budget=260)
  const url = new URL(window.location.href);
  const urlBudget = url.searchParams.get("budget");
  if (urlBudget) {
    const budgetValue = parseInt(urlBudget, 10);
    if (budgetValue >= 100 && budgetValue <= 500) {
      console.log(`[ESPN Draft Assistant] Auction budget detected from URL: $${budgetValue}`);
      return budgetValue;
    }
  }

  // Strategy 4: Default to 260 if all strategies fail
  console.warn("[ESPN Draft Assistant] Could not detect auction budget - using default $260");
  return 260;
}

/**
 * Detect league configuration from ESPN draft page DOM
 * User constraint: Auto-detect from DOM, fallback to 5x5 defaults on failure
 */
export function detectLeagueConfig(): DetectionResult {
  const warnings: string[] = [];
  const isPractice = isPracticeDraft();

  if (isPractice) {
    warnings.push("Practice draft detected - using DOM-based detection");
  }

  // 1. Detect total teams
  const totalTeams = detectTeamCount();
  if (!totalTeams) {
    warnings.push("Could not detect team count from draft board");
  }

  // 2. Detect scoring categories
  const categories = detectCategories();
  if (!categories || categories.length === 0) {
    warnings.push("Could not detect scoring categories from league settings");
  }

  // 3. Detect roster slots
  const rosterSlots = detectRosterSlots();
  if (!rosterSlots || Object.keys(rosterSlots).length === 0) {
    warnings.push("Could not detect roster slots from league settings");
  }

  // 4. Detect auction budget
  const budget = detectAuctionBudget();

  // If any detection failed, return low confidence or failed
  if (!totalTeams || !categories || !rosterSlots) {
    return {
      config: totalTeams && categories && rosterSlots
        ? { totalTeams, categories, rosterSlots, budget }
        : null,
      confidence: totalTeams || categories || rosterSlots ? "low" : "failed",
      warnings,
      isPracticeDraft: isPractice,
    };
  }

  return {
    config: { totalTeams, categories, rosterSlots, budget },
    confidence: "high",
    warnings,
    isPracticeDraft: isPractice,
  };
}

/**
 * Detect the user's own team from the auction pick train.
 * ESPN marks the user's team with the CSS class `auction-pick-component--own`
 * on the `.content` div inside the pick train.
 *
 * Returns `{ teamName, teamId, remainingBudget }` or null if not found.
 */
export function detectMyTeam(): {
  teamName: string;
  teamId: string;
  remainingBudget: number;
} | null {
  // The own-team marker is on the .content div inside .auction-pick-component
  const ownContent = document.querySelector(".auction-pick-component--own");
  if (!ownContent) {
    return null;
  }

  const teamNameEl = ownContent.querySelector(".team-name");
  const cashEl = ownContent.querySelector(".cash");

  if (!teamNameEl || !cashEl) {
    return null;
  }

  const rawTeamName = (teamNameEl.textContent || "").trim();
  const cashText = (cashEl.textContent || "").trim();

  // Parse budget: "$112" → 112
  const budgetMatch = cashText.match(/\$?(\d+)/);
  const remainingBudget = budgetMatch ? parseInt(budgetMatch[1], 10) : 0;

  // Strip number prefix: "13. Nathan Fielders" → "Nathan Fielders"
  // Use the number as teamId for uniqueness
  const prefixMatch = rawTeamName.match(/^(\d+)\.\s*(.+)$/);
  const teamId = prefixMatch ? prefixMatch[1] : rawTeamName;
  const teamName = prefixMatch ? prefixMatch[2] : rawTeamName;

  console.log(
    `[ESPN Draft Assistant] My team detected from pick train: "${teamName}" (id: ${teamId}, budget: $${remainingBudget})`,
  );

  return { teamName, teamId, remainingBudget };
}

/**
 * Detect all teams' current budgets from the auction pick train.
 * Useful for monitoring budget changes during the draft.
 *
 * Returns an array of `{ teamName, remainingBudget }` in pick-train order.
 */
export function detectAllTeamBudgets(): Array<{
  teamName: string;
  remainingBudget: number;
}> {
  // Try multiple container selectors for the pick train
  const containerSelectors = [
    ".pick-train__content__picks-container",
    "ul.picklist",
    ".picklist",
  ];
  let items: NodeListOf<Element> | null = null;
  for (const selector of containerSelectors) {
    const container = document.querySelector(selector);
    if (container) {
      const found = container.querySelectorAll(".picklist--item");
      if (found.length > 0) {
        items = found;
        break;
      }
    }
  }

  // Fallback: any picklist--item on the page
  if (!items || items.length === 0) {
    items = document.querySelectorAll(".picklist--item");
  }

  if (items.length === 0) {
    return [];
  }

  return Array.from(items).flatMap((item) => {
    const teamNameEl = item.querySelector(".team-name");
    const cashEl = item.querySelector(".cash");
    if (!teamNameEl || !cashEl) return [];
    const rawName = (teamNameEl.textContent || "").trim();
    const cashText = (cashEl.textContent || "").trim();
    const budgetMatch = cashText.match(/\$?(\d+)/);
    const remainingBudget = budgetMatch ? parseInt(budgetMatch[1], 10) : 0;
    const prefixMatch = rawName.match(/^(\d+)\.\s*(.+)$/);
    const teamName = prefixMatch ? prefixMatch[2] : rawName;
    return [{ teamName, remainingBudget }];
  });
}

/**
 * Detect total team count from ESPN draft page
 * Multiple strategies with validation to handle ESPN DOM variations
 */
function detectTeamCount(): number | null {
  // Strategy 0: Count auction-pick elements or picklist items in the pick train
  // Try multiple container selectors — ESPN uses different wrappers across draft versions
  const containerSelectors = [
    ".pick-train__content__picks-container",
    "ul.picklist",
    ".picklist",
  ];
  for (const selector of containerSelectors) {
    const container = document.querySelector(selector);
    if (container) {
      const pickItems = container.querySelectorAll(".picklist--item");
      if (pickItems.length >= 2 && pickItems.length <= 20) {
        console.log(
          `[ESPN Draft Assistant] Team count detected from ${selector}: ${pickItems.length}`,
        );
        return pickItems.length;
      }
    }
  }

  // Fallback: count [data-testid="auction-pick"] elements (one per team)
  const auctionPicks = document.querySelectorAll('[data-testid="auction-pick"]');
  if (auctionPicks.length >= 2 && auctionPicks.length <= 20) {
    console.log(
      `[ESPN Draft Assistant] Team count detected from auction-pick elements: ${auctionPicks.length}`,
    );
    return auctionPicks.length;
  }

  // Fallback: any .picklist--item elements on the page (no container)
  const anyPickItems = document.querySelectorAll(".picklist--item");
  if (anyPickItems.length >= 2 && anyPickItems.length <= 20) {
    console.log(
      `[ESPN Draft Assistant] Team count detected from picklist items: ${anyPickItems.length}`,
    );
    return anyPickItems.length;
  }

  // Strategy 1: Count unique grid columns in completed picks (most reliable)
  const pickElements = document.querySelectorAll('[style*="grid-area"]');
  if (pickElements.length > 0) {
    const columns = new Set<number>();
    pickElements.forEach((el) => {
      const styleValue = (el.getAttribute("style") || "").toLowerCase();
      const match = styleValue.match(/grid-area\s*:\s*\d+\s*\/\s*(\d+)/);
      if (match) {
        columns.add(parseInt(match[1], 10));
      }
    });
    if (columns.size >= 2) {
      // Reasonable team count (2-20)
      console.log(
        `[ESPN Draft Assistant] Team count detected from grid columns: ${columns.size}`,
      );
      return columns.size;
    }
  }

  // Strategy 2: Count roster dropdown options (practice drafts and real drafts)
  const dropdownSelectors = [
    "select.dropdown__select",
    'select[class*="dropdown"]',
    'select[class*="team"]',
    "select",
  ];

  for (const selector of dropdownSelectors) {
    const rosterDropdown = document.querySelector(selector);
    if (rosterDropdown) {
      const options = rosterDropdown.querySelectorAll("option");
      // Filter out placeholder options (empty value or text like "Select team")
      const teamOptions = Array.from(options).filter((opt) => {
        const value = opt.getAttribute("value") || "";
        const text = (opt.textContent || "").trim();
        // Valid if has value, non-empty text, doesn't say "select"
        return (
          value &&
          value !== "" &&
          text &&
          !text.toLowerCase().includes("select") &&
          text.length > 0
        );
      });
      if (teamOptions.length >= 2) {
        console.log(
          `[ESPN Draft Assistant] Team count detected from dropdown: ${teamOptions.length}`,
        );
        return teamOptions.length;
      }
    }
  }

  // Strategy 3: Count team header elements in draft board
  const headerSelectors = [
    '[class*="teamHeader"]',
    '[class*="team"][class*="header"]',
    '[class*="owner"][class*="header"]',
    '[data-testid*="team-header"]',
  ];

  for (const selector of headerSelectors) {
    const teamHeaders = document.querySelectorAll(selector);
    if (teamHeaders.length >= 2) {
      console.log(
        `[ESPN Draft Assistant] Team count detected from headers: ${teamHeaders.length}`,
      );
      return teamHeaders.length;
    }
  }

  // Strategy 4: Parse from league info text (e.g., "12 Team League")
  const leagueInfoSelectors = [
    '[class*="league"][class*="info"]',
    '[class*="leagueInfo"]',
    ".draft-header",
    "header",
    "h1",
  ];

  for (const selector of leagueInfoSelectors) {
    const leagueInfo = document.querySelector(selector);
    if (leagueInfo) {
      const text = leagueInfo.textContent || "";
      const match = text.match(/(\d+)\s*team/i);
      if (match) {
        const count = parseInt(match[1], 10);
        if (count >= 2 && count <= 20) {
          console.log(
            `[ESPN Draft Assistant] Team count detected from text: ${count}`,
          );
          return count;
        }
      }
    }
  }

  // Strategy 5: Check URL parameters
  const url = new URL(window.location.href);
  const urlTeams =
    url.searchParams.get("teams") || url.searchParams.get("teamCount");
  if (urlTeams) {
    const count = parseInt(urlTeams, 10);
    if (count >= 2 && count <= 20) {
      console.log(
        `[ESPN Draft Assistant] Team count detected from URL: ${count}`,
      );
      return count;
    }
  }

  console.warn(
    "[ESPN Draft Assistant] Could not detect team count - tried grid columns, dropdowns, headers, text, and URL",
  );
  return null;
}

/**
 * Detect scoring categories from ESPN draft page
 * Fallback to standard 5x5 if detection fails
 */
function detectCategories(): Category[] | null {
  // Strategy 1: Parse from draft board stat column headers
  const statHeaderSelectors = [
    '[class*="statHeader"]',
    '[class*="stat"][class*="header"]',
    '[class*="category"][class*="header"]',
    '[data-testid*="stat"]',
    'th[class*="stat"]',
  ];

  for (const selector of statHeaderSelectors) {
    const statHeaders = document.querySelectorAll(selector);
    if (statHeaders.length > 0) {
      const categories: Category[] = [];
      statHeaders.forEach((header) => {
        const statName = header.textContent?.trim();
        if (statName && statName.length <= 5) {
          // ESPN uses short codes (R, HR, RBI, etc.)
          categories.push(mapStatNameToCategory(statName));
        }
      });

      if (categories.length >= 5) {
        // Valid category set
        console.log(
          `[ESPN Draft Assistant] Categories detected from headers: ${categories.map((c) => c.stat_key).join(", ")}`,
        );
        return categories;
      }
    }
  }

  // Strategy 2: Look for settings panel or league info
  const settingsSelectors = [
    '[class*="settings"]',
    '[class*="leagueSettings"]',
    '[class*="scoring"]',
    ".sidebar",
  ];

  for (const selector of settingsSelectors) {
    const settingsPanel = document.querySelector(selector);
    if (settingsPanel) {
      const text = settingsPanel.textContent || "";
      // Look for category patterns like "R, HR, RBI, SB, AVG"
      const categoryPattern = /\b([A-Z]{1,5})\b/g;
      const matches = text.match(categoryPattern);

      if (matches && matches.length >= 5) {
        const categories = matches
          .filter(
            (stat) =>
              stat.length <= 5 &&
              !["ESPN", "MLB", "NBA", "NFL"].includes(stat),
          )
          .slice(0, 12) // Max reasonable categories
          .map(mapStatNameToCategory);

        if (categories.length >= 5) {
          console.log(
            `[ESPN Draft Assistant] Categories detected from settings: ${categories.map((c) => c.stat_key).join(", ")}`,
          );
          return categories;
        }
      }
    }
  }

  // Strategy 3: Parse from URL parameters (some ESPN drafts include this)
  const url = new URL(window.location.href);
  const scoringParam = url.searchParams.get("scoring");
  if (scoringParam) {
    const categoryKeys = scoringParam.split(",");
    if (categoryKeys.length >= 5) {
      const categories = categoryKeys.map(mapStatNameToCategory);
      console.log(
        `[ESPN Draft Assistant] Categories detected from URL: ${categories.map((c) => c.stat_key).join(", ")}`,
      );
      return categories;
    }
  }

  // Strategy 4: Use standard 5x5 roto defaults as fallback
  console.warn(
    "[ESPN Draft Assistant] Could not detect categories - using standard 5x5 defaults",
  );
  return getDefault5x5Categories();
}

/**
 * Detect roster slots from ESPN draft page
 * Fallback to standard 5x5 roster if detection fails
 */
function detectRosterSlots(): Record<string, number> | null {
  // Strategy 1: Parse from roster settings sidebar or panel
  const settingsSelectors = [
    '[class*="rosterSettings"]',
    '[class*="roster"][class*="settings"]',
    '[class*="roster"][class*="config"]',
    ".roster-limits",
    '[data-testid*="roster"]',
  ];

  for (const selector of settingsSelectors) {
    const settingsPanel = document.querySelector(selector);
    if (settingsPanel) {
      // Look for lines like "C: 1", "1B: 1", "OF: 3", etc.
      const rosterLineSelectors = [
        '[class*="rosterSlot"]',
        '[class*="roster"][class*="line"]',
        "li",
        "div",
      ];

      for (const lineSelector of rosterLineSelectors) {
        const rosterLines =
          settingsPanel.querySelectorAll(lineSelector);
        const slots: Record<string, number> = {};

        rosterLines.forEach((line) => {
          const text = line.textContent || "";
          // Match patterns like "C: 1", "OF: 3", "SP/RP: 2"
          const match = text.match(/^([A-Z0-9/]+):\s*(\d+)/);
          if (match) {
            const position = match[1];
            const count = parseInt(match[2], 10);
            if (count > 0 && count <= 10) {
              // Reasonable slot count
              slots[position] = count;
            }
          }
        });

        if (Object.keys(slots).length >= 5) {
          console.log(
            `[ESPN Draft Assistant] Roster slots detected: ${JSON.stringify(slots)}`,
          );
          return slots;
        }
      }
    }
  }

  // Strategy 2: Parse from roster limits display (often shown at bottom)
  const limitsSelectors = [
    ".roster-limits",
    '[class*="limits"]',
    '[class*="roster"][class*="summary"]',
  ];

  for (const selector of limitsSelectors) {
    const limitsPanel = document.querySelector(selector);
    if (limitsPanel) {
      const text = limitsPanel.textContent || "";
      const slots: Record<string, number> = {};

      // Match all patterns in text
      const matches = text.matchAll(/([A-Z0-9/]+):\s*(\d+)/g);
      for (const match of matches) {
        const position = match[1];
        const count = parseInt(match[2], 10);
        if (
          count > 0 &&
          count <= 10 &&
          position.length <= 5 &&
          /[A-Z]/.test(position)
        ) {
          slots[position] = count;
        }
      }

      if (Object.keys(slots).length >= 5) {
        console.log(
          `[ESPN Draft Assistant] Roster slots detected from limits: ${JSON.stringify(slots)}`,
        );
        return slots;
      }
    }
  }

  // Strategy 3: Infer from position counts in completed picks
  const pickElements = document.querySelectorAll('[style*="grid-area"]');
  if (pickElements.length > 10) {
    // Need reasonable sample size
    const positionCounts: Record<string, number> = {};

    pickElements.forEach((pick) => {
      const positionEl = pick.querySelector(
        '.position, [class*="position"], .positionPill',
      );
      const position = positionEl?.textContent?.trim();
      if (position) {
        positionCounts[position] = (positionCounts[position] || 0) + 1;
      }
    });

    // This gives us a rough idea but not exact slots
    // Only use if we have multiple positions
    if (Object.keys(positionCounts).length >= 5) {
      console.log(
        `[ESPN Draft Assistant] Position distribution detected: ${JSON.stringify(positionCounts)} (using defaults for slots)`,
      );
      // We know positions exist but not exact slots - use defaults
      return getDefault5x5Roster();
    }
  }

  // Strategy 4: Use standard 5x5 roster defaults
  console.warn(
    "[ESPN Draft Assistant] Could not detect roster slots - using standard 5x5 defaults",
  );
  return getDefault5x5Roster();
}

export function mapStatNameToCategory(statName: string): Category {
  // Map ESPN stat display names to Category objects
  // This mapping must align with backend category definitions
  const categoryMap: Record<string, Category> = {
    "R": { category_id: "R", stat_key: "R", type: "COUNTING", direction: "HIGHER_BETTER", name: "Runs" },
    "HR": { category_id: "HR", stat_key: "HR", type: "COUNTING", direction: "HIGHER_BETTER", name: "Home Runs" },
    "RBI": { category_id: "RBI", stat_key: "RBI", type: "COUNTING", direction: "HIGHER_BETTER", name: "RBI" },
    "SB": { category_id: "SB", stat_key: "SB", type: "COUNTING", direction: "HIGHER_BETTER", name: "Stolen Bases" },
    "AVG": { category_id: "AVG", stat_key: "AVG", type: "RATE", direction: "HIGHER_BETTER", name: "Batting Average", formula_id: "avg", required_components: ["AB", "H"] },
    "OBP": { category_id: "OBP", stat_key: "OBP", type: "RATE", direction: "HIGHER_BETTER", name: "On Base Percentage", formula_id: "obp", required_components: ["H", "BB", "HBP", "AB", "SF"] },
    "OPS": { category_id: "OPS", stat_key: "OPS", type: "RATE", direction: "HIGHER_BETTER", name: "On-Base Plus Slugging", formula_id: "ops", required_components: ["H", "BB", "HBP", "AB", "SF", "TB"] },
    "SLG": { category_id: "SLG", stat_key: "SLG", type: "RATE", direction: "HIGHER_BETTER", name: "Slugging Percentage", formula_id: "slg", required_components: ["AB", "TB"] },
    "W": { category_id: "W", stat_key: "W", type: "COUNTING", direction: "HIGHER_BETTER", name: "Wins" },
    "SV": { category_id: "SV", stat_key: "SV", type: "COUNTING", direction: "HIGHER_BETTER", name: "Saves" },
    "K": { category_id: "K", stat_key: "K", type: "COUNTING", direction: "HIGHER_BETTER", name: "Strikeouts" },
    "ERA": { category_id: "ERA", stat_key: "ERA", type: "RATE", direction: "LOWER_BETTER", name: "ERA", formula_id: "era", required_components: ["ER", "IP"] },
    "WHIP": { category_id: "WHIP", stat_key: "WHIP", type: "RATE", direction: "LOWER_BETTER", name: "WHIP", formula_id: "whip", required_components: ["IP", "H", "BB"] },
  };
  return categoryMap[statName] || {
    category_id: statName,
    stat_key: statName,
    type: "COUNTING",
    direction: "HIGHER_BETTER",
    name: statName,
  };
}

export function getDefault5x5Categories(): Category[] {
  return [
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
  ];
}

function getDefault5x5Roster(): Record<string, number> {
  return {
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
    "BN": 5,
  };
}
