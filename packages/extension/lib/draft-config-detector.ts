import type { Category, DraftConfiguration } from "@espn-fantasy/shared";

export interface DetectionResult {
  config: DraftConfiguration | null;
  confidence: "high" | "low" | "failed";
  warnings: string[];
}

/**
 * Detect league configuration from ESPN draft page DOM
 * User constraint: Auto-detect from DOM, fallback to 5x5 defaults on failure
 */
export function detectLeagueConfig(): DetectionResult {
  const warnings: string[] = [];

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

  // If any detection failed, return low confidence or failed
  if (!totalTeams || !categories || !rosterSlots) {
    return {
      config: totalTeams && categories && rosterSlots
        ? { totalTeams, categories, rosterSlots }
        : null,
      confidence: totalTeams || categories || rosterSlots ? "low" : "failed",
      warnings,
    };
  }

  return {
    config: { totalTeams, categories, rosterSlots },
    confidence: "high",
    warnings,
  };
}

function detectTeamCount(): number | null {
  // Strategy 1: Count draft board columns (excluding player name column)
  const draftBoard = document.querySelector('[class*="draft-board"]');
  if (draftBoard) {
    const teamColumns = draftBoard.querySelectorAll('[class*="team-column"]');
    if (teamColumns.length > 0) {
      return teamColumns.length;
    }
  }

  // Strategy 2: Parse from league info header
  const leagueInfo = document.querySelector('[class*="league-info"]');
  if (leagueInfo) {
    const text = leagueInfo.textContent || "";
    const match = text.match(/(\d+)\s*teams?/i);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  // Strategy 3: Check URL parameters
  const url = new URL(window.location.href);
  const teams = url.searchParams.get("teams");
  if (teams) {
    return parseInt(teams, 10);
  }

  return null;
}

function detectCategories(): Category[] | null {
  // Strategy 1: Parse from draft board stat columns
  const statHeaders = document.querySelectorAll('[class*="stat-header"]');
  if (statHeaders.length > 0) {
    // Extract category names and map to Category objects
    // This is ESPN-specific and may need updates if ESPN changes DOM
    const categories: Category[] = [];
    statHeaders.forEach((header) => {
      const statName = header.textContent?.trim();
      if (statName) {
        categories.push(mapStatNameToCategory(statName));
      }
    });
    return categories;
  }

  // Strategy 2: Use standard 5x5 roto defaults as fallback
  return getDefault5x5Categories();
}

function detectRosterSlots(): Record<string, number> | null {
  // Strategy 1: Parse from league settings sidebar
  const settingsSidebar = document.querySelector('[class*="roster-settings"]');
  if (settingsSidebar) {
    const rosterLines = settingsSidebar.querySelectorAll('[class*="roster-slot"]');
    const slots: Record<string, number> = {};
    rosterLines.forEach((line) => {
      const text = line.textContent || "";
      const match = text.match(/^([A-Z0-9/]+):\s*(\d+)/);
      if (match) {
        slots[match[1]] = parseInt(match[2], 10);
      }
    });
    if (Object.keys(slots).length > 0) {
      return slots;
    }
  }

  // Strategy 2: Use standard 5x5 roster defaults
  return getDefault5x5Roster();
}

function mapStatNameToCategory(statName: string): Category {
  // Map ESPN stat display names to Category objects
  // This mapping must align with backend category definitions
  const categoryMap: Record<string, Category> = {
    "R": { category_id: "R", stat_key: "R", type: "COUNTING", direction: "HIGHER_BETTER", name: "Runs" },
    "HR": { category_id: "HR", stat_key: "HR", type: "COUNTING", direction: "HIGHER_BETTER", name: "Home Runs" },
    "RBI": { category_id: "RBI", stat_key: "RBI", type: "COUNTING", direction: "HIGHER_BETTER", name: "RBI" },
    "SB": { category_id: "SB", stat_key: "SB", type: "COUNTING", direction: "HIGHER_BETTER", name: "Stolen Bases" },
    "AVG": { category_id: "AVG", stat_key: "AVG", type: "RATE", direction: "HIGHER_BETTER", name: "Batting Average" },
    "W": { category_id: "W", stat_key: "W", type: "COUNTING", direction: "HIGHER_BETTER", name: "Wins" },
    "SV": { category_id: "SV", stat_key: "SV", type: "COUNTING", direction: "HIGHER_BETTER", name: "Saves" },
    "K": { category_id: "K", stat_key: "K", type: "COUNTING", direction: "HIGHER_BETTER", name: "Strikeouts" },
    "ERA": { category_id: "ERA", stat_key: "ERA", type: "RATE", direction: "LOWER_BETTER", name: "ERA" },
    "WHIP": { category_id: "WHIP", stat_key: "WHIP", type: "RATE", direction: "LOWER_BETTER", name: "WHIP" },
  };
  return categoryMap[statName] || {
    category_id: statName,
    stat_key: statName,
    type: "COUNTING",
    direction: "HIGHER_BETTER",
    name: statName,
  };
}

function getDefault5x5Categories(): Category[] {
  return [
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
    "BN": 3,
  };
}
