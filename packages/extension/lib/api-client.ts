import baselineRankings from '../assets/baseline-rankings.json';

export interface PlayerRanking {
  playerId: number;
  playerName: string;
  positions: string[];
  primaryPosition: string;
  vbdScore: number;
  tier: number;
  projectedStats: Record<string, number>;
}

export interface AuctionValue {
  playerId: number;
  playerName: string;
  value: number;
  positions: string[];
}

export interface GetRankingsOptions {
  draftFormat?: 'snake' | 'auction';
  scoringType?: 'roto' | 'h2h';
}

export interface GetAuctionValuesOptions {
  budget?: number;
  rosterSize?: number;
}

/**
 * Fetch draft rankings from backend API with fallback to bundled baseline rankings
 */
export async function getRankings(
  leagueId: string,
  options: GetRankingsOptions = {}
): Promise<PlayerRanking[]> {
  try {
    // Get backend URL and auth token from storage
    const { backendUrl, apiToken } = await chrome.storage.local.get([
      'backendUrl',
      'apiToken',
    ]);

    if (!backendUrl || !apiToken) {
      console.warn(
        '[API Client] No backend URL or token configured, using baseline rankings'
      );
      return baselineRankings as PlayerRanking[];
    }

    // Build query params
    const params = new URLSearchParams();
    if (options.draftFormat) params.set('format', options.draftFormat);
    if (options.scoringType) params.set('scoring', options.scoringType);

    const url = `${backendUrl}/api/leagues/${leagueId}/draft/rankings?${params}`;

    // Fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data.rankings || [];
  } catch (error) {
    console.warn(
      '[API Client] Failed to fetch rankings from backend, using baseline data:',
      error instanceof Error ? error.message : String(error)
    );
    return baselineRankings as PlayerRanking[];
  }
}

/**
 * Fetch auction values from backend API with fallback to bundled baseline
 */
export async function getAuctionValues(
  leagueId: string,
  options: GetAuctionValuesOptions = {}
): Promise<AuctionValue[]> {
  try {
    // Get backend URL and auth token from storage
    const { backendUrl, apiToken } = await chrome.storage.local.get([
      'backendUrl',
      'apiToken',
    ]);

    if (!backendUrl || !apiToken) {
      console.warn(
        '[API Client] No backend URL or token configured, generating baseline values'
      );
      return generateBaselineAuctionValues();
    }

    // Build query params
    const params = new URLSearchParams();
    if (options.budget) params.set('budget', options.budget.toString());
    if (options.rosterSize) params.set('rosterSize', options.rosterSize.toString());

    const url = `${backendUrl}/api/leagues/${leagueId}/draft/auction?${params}`;

    // Fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data.values || [];
  } catch (error) {
    console.warn(
      '[API Client] Failed to fetch auction values from backend, using baseline data:',
      error instanceof Error ? error.message : String(error)
    );
    return generateBaselineAuctionValues();
  }
}

/**
 * Generate baseline auction values from rankings (simple linear scale)
 */
function generateBaselineAuctionValues(): AuctionValue[] {
  const rankings = baselineRankings as PlayerRanking[];
  const maxValue = 50; // Top player worth $50
  const minValue = 1; // Bottom ranked player worth $1

  return rankings.map((player, index) => {
    // Linear scale from max to min based on ranking
    const value = Math.round(
      maxValue - (index / (rankings.length - 1)) * (maxValue - minValue)
    );

    return {
      playerId: player.playerId,
      playerName: player.playerName,
      positions: player.positions,
      value: Math.max(value, minValue),
    };
  });
}
