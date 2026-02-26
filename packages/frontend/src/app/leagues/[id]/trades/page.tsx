"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingSkeleton } from "@/components/ui/LoadingSpinner";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { PlayerRow } from "@/components/league/PlayerRow";
import { getESPNTradeUrl } from "@/lib/espn-links";

interface ProposedTrade {
  givePlayers: Array<{ playerId: number; playerName: string }>;
  receivePlayers: Array<{ playerId: number; playerName: string }>;
}

interface CategoryImpact {
  categoryName: string;
  currentRank: number;
  projectedRank: number;
  deltaRank: number;
  currentPoints: number;
  projectedPoints: number;
  deltaPoints: number;
}

interface TradeImpactAnalysis {
  trade: ProposedTrade;
  currentOverallPoints: number;
  projectedOverallPoints: number;
  deltaOverallPoints: number;
  categoryImpacts: CategoryImpact[];
  fairnessScore: number;
  recommendation: "accept" | "decline" | "consider";
  explanation: string;
}

interface PositionalContext {
  positionGained: string[];
  positionLost: string[];
  fillsNeed: boolean;
  needPositions: string[];
  positionalBonus: number;
}

interface TradeCandidate {
  trade: ProposedTrade;
  partnerTeamId: number;
  partnerTeamName: string;
  deltaOverallPoints: number;
  categoryImpacts: CategoryImpact[];
  fairnessScore: number;
  likelihood: "high" | "medium" | "low";
  explanation: string;
  positionalContext?: PositionalContext;
}

interface RosterPlayer {
  playerId: number;
  playerName: string;
  espnPlayerId: number;
  mlbTeam: string | null;
  positions: string[];
  rosterStatus: string;
  rosterSlot: string;
  projections: {
    R?: number;
    HR?: number;
    RBI?: number;
    SB?: number;
    AVG?: number;
    OBP?: number;
    W?: number;
    SV?: number;
    K?: number;
    ERA?: number;
    WHIP?: number;
  } | null;
}

interface Team {
  id: number;
  name: string;
  espn_team_id: number;
}

export default function TradesPage() {
  const params = useParams();
  const leagueId = params.id as string;
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [showAnalyzer, setShowAnalyzer] = useState(true);
  const [selectedPartnerId, setSelectedPartnerId] = useState<number | null>(
    null,
  );
  const [givePlayerIds, setGivePlayerIds] = useState<number[]>([]);
  const [receivePlayerIds, setReceivePlayerIds] = useState<number[]>([]);
  const [tradeAnalysis, setTradeAnalysis] =
    useState<TradeImpactAnalysis | null>(null);
  const [validationResult, setValidationResult] = useState<{
    isLegal: boolean;
    issues: string[];
  } | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  // Load selected team from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(`league_${leagueId}_team`);
    if (stored) {
      setSelectedTeamId(parseInt(stored, 10));
    }
  }, [leagueId]);

  // Real-time validation with debounce
  useEffect(() => {
    // Only validate when both sides have at least 1 player selected
    if (givePlayerIds.length === 0 || receivePlayerIds.length === 0) {
      setValidationResult(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsValidating(true);
      try {
        const result = await api.validateTrade(
          parseInt(leagueId, 10),
          selectedTeamId!,
          { givePlayers: givePlayerIds, receivePlayers: receivePlayerIds },
        );
        setValidationResult(result);
      } catch (err) {
        // Silently ignore validation errors (non-blocking)
        setValidationResult(null);
      } finally {
        setIsValidating(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [givePlayerIds, receivePlayerIds, leagueId, selectedTeamId]);

  // Fetch league status for ESPN links
  const { data: leagueStatus } = useQuery({
    queryKey: ['league', leagueId],
    queryFn: () => api.getLeagueStatus(parseInt(leagueId, 10)),
  });
  const espnLeagueId = leagueStatus?.league?.espn_league_id;
  const season = leagueStatus?.league?.season;

  // Fetch trade partners
  const { data: partnersData } = useQuery({
    queryKey: ["trade-partners", leagueId, selectedTeamId],
    queryFn: async () => {
      return api.getTradePartners(
        parseInt(leagueId, 10),
        selectedTeamId!,
      ) as Promise<{ partners: Team[] }>;
    },
    enabled: !!selectedTeamId,
  });

  // Fetch both rosters when partner is selected
  const { data: rostersData, isLoading: rostersLoading } = useQuery({
    queryKey: ["trade-rosters", leagueId, selectedTeamId, selectedPartnerId],
    queryFn: async () => {
      return api.getTradeRosters(
        parseInt(leagueId, 10),
        selectedTeamId!,
        selectedPartnerId!,
      ) as Promise<{
        snapshotDate: string;
        userTeam: { id: number; name: string; roster: RosterPlayer[] };
        partnerTeam: { id: number; name: string; roster: RosterPlayer[] };
      }>;
    },
    enabled: !!selectedTeamId && !!selectedPartnerId,
  });

  const {
    data: candidatesData,
    isLoading: candidatesLoading,
    error: candidatesError,
  } = useQuery({
    queryKey: ["trade-candidates", leagueId, selectedTeamId],
    queryFn: async () => {
      return api.getTradeRecommendations(
        parseInt(leagueId, 10),
        selectedTeamId!,
      ) as Promise<{ candidates: TradeCandidate[] }>;
    },
    enabled: !!selectedTeamId && !showAnalyzer,
  });

  const analyzeTradeM = useMutation({
    mutationFn: async (trade: ProposedTrade) => {
      return api.analyzeTradeImpact(
        parseInt(leagueId, 10),
        selectedTeamId!,
        {
          givePlayers: trade.givePlayers.map((p) => p.playerId),
          receivePlayers: trade.receivePlayers.map((p) => p.playerId),
        },
      ) as Promise<{ analysis: TradeImpactAnalysis }>;
    },
    onSuccess: (data) => {
      setTradeAnalysis(data.analysis);
    },
  });

  const handleAnalyzeTrade = () => {
    if (
      !rostersData ||
      givePlayerIds.length === 0 ||
      receivePlayerIds.length === 0
    ) {
      alert("Please select at least one player to give and receive");
      return;
    }

    const givePlayers = givePlayerIds.map((id) => {
      const player = rostersData.userTeam.roster.find(
        (p) => p.playerId === id,
      );
      return {
        playerId: id,
        playerName: player?.playerName || `Player ${id}`,
      };
    });

    const receivePlayers = receivePlayerIds.map((id) => {
      const player = rostersData.partnerTeam.roster.find(
        (p) => p.playerId === id,
      );
      return {
        playerId: id,
        playerName: player?.playerName || `Player ${id}`,
      };
    });

    analyzeTradeM.mutate({ givePlayers, receivePlayers });
  };

  const getRecommendationColor = (
    rec: "accept" | "decline" | "consider",
  ) => {
    if (rec === "accept")
      return "bg-green-100 text-green-800 border-green-300";
    if (rec === "decline") return "bg-red-100 text-red-800 border-red-300";
    return "bg-yellow-100 text-yellow-800 border-yellow-300";
  };

  const getLikelihoodColor = (likelihood: "high" | "medium" | "low") => {
    if (likelihood === "high") return "text-green-600";
    if (likelihood === "medium") return "text-yellow-600";
    return "text-red-600";
  };

  const renderDeltaColor = (value: number) =>
    value > 0
      ? "text-green-600"
      : value < 0
        ? "text-red-600"
        : "text-gray-600";

  if (!selectedTeamId) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ErrorAlert
          variant="warning"
          message="Please select your team on the league page to access trade analysis."
          backLink={{
            href: `/leagues/${leagueId}`,
            label: "Go to League Page",
          }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <PageHeader
        title="Trade Analyzer"
        subtitle="Analyze trade impacts and discover beneficial trade opportunities"
        backLink={{ href: `/leagues/${leagueId}`, label: "Back to League" }}
      />

      {/* Mode Toggle */}
      <div className="mb-6 bg-white shadow rounded-lg p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => {
              setShowAnalyzer(true);
              setTradeAnalysis(null);
              setGivePlayerIds([]);
              setReceivePlayerIds([]);
            }}
            className={`flex-1 px-4 py-3 rounded-lg font-medium transition-colors ${
              showAnalyzer
                ? "bg-blue-600 text-white shadow-md"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Build & Analyze Trade
          </button>
          <button
            onClick={() => setShowAnalyzer(false)}
            className={`flex-1 px-4 py-3 rounded-lg font-medium transition-colors ${
              !showAnalyzer
                ? "bg-blue-600 text-white shadow-md"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Browse AI Suggestions
          </button>
        </div>
      </div>

      {/* Build & Analyze Trade */}
      {showAnalyzer && (
        <div className="space-y-6">
          {/* Partner Selection */}
          <div className="bg-white shadow rounded-lg p-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Select Trade Partner
            </label>
            <select
              value={selectedPartnerId || ""}
              onChange={(e) => {
                setSelectedPartnerId(
                  e.target.value ? parseInt(e.target.value, 10) : null,
                );
                setGivePlayerIds([]);
                setReceivePlayerIds([]);
                setTradeAnalysis(null);
                setValidationResult(null);
              }}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-4 py-2 border"
            >
              <option value="">-- Choose a team --</option>
              {partnersData?.partners.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>

          {/* Trade Builder */}
          {selectedPartnerId && (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Build Trade
              </h2>

              {rostersLoading || !rostersData ? (
                <LoadingSkeleton lines={1} />
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Your Team */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      You Give ({givePlayerIds.length}/3 selected) - {rostersData.userTeam.name}
                    </label>
                    <div className="space-y-2 max-h-96 overflow-y-auto border border-gray-200 rounded-lg p-3">
                      {rostersData.userTeam.roster.map((player) => (
                        <label
                          key={player.playerId}
                          className="flex items-center border border-gray-200 rounded-lg cursor-pointer"
                        >
                          <div className="pl-3">
                            <input
                              type="checkbox"
                              checked={givePlayerIds.includes(player.playerId)}
                              disabled={givePlayerIds.length >= 3 && !givePlayerIds.includes(player.playerId)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setGivePlayerIds([
                                    ...givePlayerIds,
                                    player.playerId,
                                  ]);
                                } else {
                                  setGivePlayerIds(
                                    givePlayerIds.filter(
                                      (id) => id !== player.playerId,
                                    ),
                                  );
                                }
                                setTradeAnalysis(null);
                              }}
                              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          </div>
                          <div className="flex-1">
                            <PlayerRow
                              player={{
                                id: player.playerId,
                                name: player.playerName,
                                position: player.positions.join(", "),
                                team: player.mlbTeam,
                              }}
                              selected={givePlayerIds.includes(
                                player.playerId,
                              )}
                              variant="drop"
                            />
                          </div>
                        </label>
                      ))}
                    </div>
                    {givePlayerIds.length >= 3 && (
                      <div className="mt-2 text-xs text-amber-600 font-medium">
                        Maximum 3 players
                      </div>
                    )}
                  </div>

                  {/* Partner Team */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      You Receive ({receivePlayerIds.length}/3 selected) - {rostersData.partnerTeam.name}
                    </label>
                    <div className="space-y-2 max-h-96 overflow-y-auto border border-gray-200 rounded-lg p-3">
                      {rostersData.partnerTeam.roster.map((player) => (
                        <label
                          key={player.playerId}
                          className="flex items-center border border-gray-200 rounded-lg cursor-pointer"
                        >
                          <div className="pl-3">
                            <input
                              type="checkbox"
                              checked={receivePlayerIds.includes(
                                player.playerId,
                              )}
                              disabled={receivePlayerIds.length >= 3 && !receivePlayerIds.includes(player.playerId)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setReceivePlayerIds([
                                    ...receivePlayerIds,
                                    player.playerId,
                                  ]);
                                } else {
                                  setReceivePlayerIds(
                                    receivePlayerIds.filter(
                                      (id) => id !== player.playerId,
                                    ),
                                  );
                                }
                                setTradeAnalysis(null);
                              }}
                              className="h-4 w-4 text-green-600 border-gray-300 rounded focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          </div>
                          <div className="flex-1">
                            <PlayerRow
                              player={{
                                id: player.playerId,
                                name: player.playerName,
                                position: player.positions.join(", "),
                                team: player.mlbTeam,
                              }}
                              selected={receivePlayerIds.includes(
                                player.playerId,
                              )}
                              variant="add"
                            />
                          </div>
                        </label>
                      ))}
                    </div>
                    {receivePlayerIds.length >= 3 && (
                      <div className="mt-2 text-xs text-amber-600 font-medium">
                        Maximum 3 players
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Validation Status */}
              {givePlayerIds.length > 0 && receivePlayerIds.length > 0 && (
                <div className="mt-4">
                  {isValidating ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                      </svg>
                      Checking roster validity...
                    </div>
                  ) : validationResult ? (
                    validationResult.isLegal ? (
                      <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                        </svg>
                        Trade is roster-legal
                      </div>
                    ) : (
                      <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-red-700 mb-1">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/>
                          </svg>
                          Roster issues detected
                        </div>
                        <ul className="list-disc list-inside text-sm text-red-600 space-y-1">
                          {validationResult.issues.map((issue, i) => (
                            <li key={i}>{issue}</li>
                          ))}
                        </ul>
                      </div>
                    )
                  ) : null}
                </div>
              )}

              <div className="mt-6">
                <button
                  onClick={handleAnalyzeTrade}
                  disabled={
                    analyzeTradeM.isPending ||
                    givePlayerIds.length === 0 ||
                    receivePlayerIds.length === 0 ||
                    (validationResult !== null && !validationResult.isLegal) ||
                    isValidating
                  }
                  className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {analyzeTradeM.isPending
                    ? "Analyzing..."
                    : isValidating
                      ? "Validating..."
                      : validationResult && !validationResult.isLegal
                        ? "Fix Roster Issues First"
                        : `Analyze ${givePlayerIds.length}-for-${receivePlayerIds.length} Trade`}
                </button>
              </div>

              {analyzeTradeM.isError && (
                <div className="mt-4">
                  <ErrorAlert
                    message={(analyzeTradeM.error as Error).message}
                  />
                  {(analyzeTradeM.error as Error).message.includes(
                    "projected standings",
                  ) && (
                    <div className="mt-3">
                      <p className="text-sm text-red-700 mb-3">
                        Trade analysis requires projections. Please contact your
                        administrator to upload projections.
                      </p>
                      <Link
                        href={`/leagues/${leagueId}`}
                        className="inline-flex items-center px-3 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
                      >
                        Go to League Page
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Trade Analysis Result */}
          {tradeAnalysis && (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Trade Analysis
              </h2>

              {/* Overall Impact */}
              <div className="mb-6 p-4 border-2 rounded-lg bg-gradient-to-br from-blue-50 to-white">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <div className="text-sm text-gray-500 mb-1">
                      Overall Point Change
                    </div>
                    <div
                      className={`text-3xl font-bold ${renderDeltaColor(tradeAnalysis.deltaOverallPoints)}`}
                    >
                      {tradeAnalysis.deltaOverallPoints > 0 ? "+" : ""}
                      {tradeAnalysis.deltaOverallPoints.toFixed(1)} pts
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      {tradeAnalysis.currentOverallPoints.toFixed(1)} &rarr;{" "}
                      {tradeAnalysis.projectedOverallPoints.toFixed(1)}
                    </div>
                  </div>

                  <div
                    className={`px-4 py-2 border-2 rounded-lg font-medium uppercase text-sm ${getRecommendationColor(tradeAnalysis.recommendation)}`}
                  >
                    {tradeAnalysis.recommendation}
                  </div>
                </div>

                <div className="mt-4 p-3 bg-white rounded-lg border border-gray-200">
                  <div className="text-sm font-medium text-gray-700 mb-1">
                    Analysis
                  </div>
                  <p className="text-sm text-gray-600">
                    {tradeAnalysis.explanation}
                  </p>
                </div>

                <div className="mt-3 text-xs text-gray-500">
                  Fairness Score:{" "}
                  <span className="font-semibold">
                    {tradeAnalysis.fairnessScore.toFixed(2)}
                  </span>{" "}
                  (Range: -1 to 1, closer to 0 is more balanced)
                </div>

                {/* ESPN Link */}
                {espnLeagueId && season && (
                  <div className="mt-3">
                    <a
                      href={getESPNTradeUrl(espnLeagueId, season)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium text-sm gap-2"
                    >
                      Propose on ESPN
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                )}
              </div>

              {/* Category Breakdown */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
                  Category Impact
                </h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Category
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                          Rank Change
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          Point Change
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {tradeAnalysis.categoryImpacts.map((cat) => (
                        <tr key={cat.categoryName}>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            {cat.categoryName}
                          </td>
                          <td className="px-4 py-3 text-sm text-center">
                            <span
                              className={`font-semibold ${renderDeltaColor(cat.deltaRank * -1)}`}
                            >
                              {cat.currentRank} &rarr; {cat.projectedRank}
                              {cat.deltaRank !== 0 &&
                                ` (${cat.deltaRank > 0 ? "+" : ""}${cat.deltaRank})`}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-right">
                            <span
                              className={`font-semibold ${renderDeltaColor(cat.deltaPoints)}`}
                            >
                              {cat.deltaPoints > 0 ? "+" : ""}
                              {cat.deltaPoints.toFixed(1)} pts
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI Trade Suggestions */}
      {!showAnalyzer && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            AI-Generated Trade Suggestions
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            These are trades that would improve your projected standings
          </p>

          {candidatesData &&
            candidatesData.candidates.length > 0 &&
            candidatesData.candidates[0]?.positionalContext?.needPositions &&
            candidatesData.candidates[0].positionalContext.needPositions.length >
              0 && (
              <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-sm font-medium text-blue-800">
                  Positions of need:{" "}
                  {candidatesData.candidates[0].positionalContext.needPositions.join(
                    ", ",
                  )}
                </div>
                <div className="text-xs text-blue-600 mt-1">
                  Trades filling these positions are ranked higher
                </div>
              </div>
            )}

          {candidatesLoading ? (
            <LoadingSkeleton lines={3} />
          ) : candidatesError ? (
            <div>
              <ErrorAlert message={(candidatesError as Error).message} />
              {(candidatesError as Error).message.includes(
                "projected standings",
              ) && (
                <div className="mt-4">
                  <p className="text-sm text-red-700 mb-3">
                    Trade suggestions require projections. Please contact your
                    administrator to upload projections.
                  </p>
                  <Link
                    href={`/leagues/${leagueId}`}
                    className="inline-flex items-center px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Go to League Page
                  </Link>
                </div>
              )}
            </div>
          ) : candidatesData && candidatesData.candidates.length > 0 ? (
            <div className="space-y-4">
              {candidatesData.candidates.map((candidate, idx) => (
                <div
                  key={idx}
                  className="border border-gray-200 rounded-lg p-4 sm:p-6 hover:shadow-lg transition-shadow"
                >
                  {/* Header */}
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                    <div>
                      <div className="text-sm text-gray-500">
                        Trade Partner
                      </div>
                      <div className="text-lg font-bold text-gray-900">
                        {candidate.partnerTeamName}
                      </div>
                    </div>
                    <div className="text-left sm:text-right">
                      <div className="text-sm text-gray-500">
                        Projected Gain
                      </div>
                      <div className="text-xl font-bold text-green-600">
                        +{candidate.deltaOverallPoints.toFixed(1)} pts
                      </div>
                    </div>
                  </div>

                  {/* Trade Details */}
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 mb-4">
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <div className="text-xs font-semibold text-red-600 uppercase mb-1">
                        You Give
                      </div>
                      {candidate.trade.givePlayers.map((p, i) => (
                        <div
                          key={i}
                          className="text-sm font-medium text-gray-900 truncate"
                        >
                          {p.playerName}
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-center">
                      <svg
                        className="w-6 h-6 text-gray-400 rotate-90 sm:rotate-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17 8l4 4m0 0l-4 4m4-4H3"
                        />
                      </svg>
                    </div>

                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <div className="text-xs font-semibold text-green-600 uppercase mb-1">
                        You Get
                      </div>
                      {candidate.trade.receivePlayers.map((p, i) => (
                        <div
                          key={i}
                          className="text-sm font-medium text-gray-900 truncate"
                        >
                          {p.playerName}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Positional Context Badges */}
                  {candidate.positionalContext?.fillsNeed && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                        Fills need:{" "}
                        {candidate.positionalContext.needPositions
                          .filter((pos) =>
                            candidate.positionalContext!.positionGained.includes(
                              pos,
                            ),
                          )
                          .join(", ")}
                      </span>
                      {candidate.positionalContext.positionalBonus >= 1.0 && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">
                          High positional value
                        </span>
                      )}
                    </div>
                  )}

                  {/* Metadata */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm">
                    <div>
                      <span className="text-gray-500">
                        Acceptance Likelihood:{" "}
                      </span>
                      <span
                        className={`font-semibold ${getLikelihoodColor(candidate.likelihood)}`}
                      >
                        {candidate.likelihood.charAt(0).toUpperCase() +
                          candidate.likelihood.slice(1)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Fairness: </span>
                      <span className="font-semibold text-gray-700">
                        {candidate.fairnessScore.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-gray-600">
                    {candidate.explanation}
                  </div>

                  {/* ESPN Link */}
                  {espnLeagueId && season && (
                    <div className="mt-3">
                      <a
                        href={getESPNTradeUrl(espnLeagueId, season)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium text-sm gap-2"
                      >
                        Propose on ESPN
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p>No beneficial trade opportunities found at this time.</p>
              <p className="text-sm mt-2">
                Try the manual trade builder to evaluate specific proposals.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
