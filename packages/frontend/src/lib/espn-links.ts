/**
 * ESPN Fantasy Baseball Deep Link Generators
 *
 * These URLs are inferred from ESPN's web app behavior and are not officially documented.
 * They may need adjustment based on ESPN's URL structure changes.
 */

export function getESPNLeagueUrl(leagueId: number, season: number): string {
  return `https://fantasy.espn.com/baseball/league?leagueId=${leagueId}&seasonId=${season}`;
}

export function getESPNTransactionsUrl(leagueId: number, season: number): string {
  return `https://fantasy.espn.com/baseball/league/transactions?leagueId=${leagueId}&seasonId=${season}`;
}

export function getESPNFreeAgentsUrl(leagueId: number, season: number): string {
  return `https://fantasy.espn.com/baseball/players/add?leagueId=${leagueId}&seasonId=${season}`;
}

export function getESPNTradeUrl(leagueId: number, season: number, teamId?: number): string {
  return `https://fantasy.espn.com/baseball/league/trade?leagueId=${leagueId}&seasonId=${season}`;
}

export function getESPNTeamUrl(leagueId: number, season: number, teamId: number): string {
  return `https://fantasy.espn.com/baseball/team?leagueId=${leagueId}&seasonId=${season}&teamId=${teamId}`;
}
