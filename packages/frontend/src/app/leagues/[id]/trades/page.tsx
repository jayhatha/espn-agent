"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ArrowRightLeft, ExternalLink, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { Container } from "@/components/ui/Container";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingSkeleton } from "@/components/ui/LoadingSpinner";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { PlayerRow } from "@/components/league/PlayerRow";
import { getESPNTradeUrl } from "@/lib/espn-links";
import { cn } from "@/lib/cn";

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
  givePlayerAsv?: number | null;
  receivePlayerAsv?: number | null;
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
  const [showAnalyzer, setShowAnalyzer] = useState(false);
  const [expandedCandidate, setExpandedCandidate] = useState<number | null>(null);
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
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed)) setSelectedTeamId(parsed);
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

  const getRecommendationVariant = (
    rec: "accept" | "decline" | "consider",
  ): "positive" | "negative" | "warning" => {
    if (rec === "accept") return "positive";
    if (rec === "decline") return "negative";
    return "warning";
  };

  const getLikelihoodColor = (likelihood: "high" | "medium" | "low") => {
    if (likelihood === "high") return "text-positive";
    if (likelihood === "medium") return "text-warning";
    return "text-negative";
  };

  const renderDeltaColor = (value: number) =>
    value > 0
      ? "text-positive"
      : value < 0
        ? "text-negative"
        : "text-content-secondary";

  if (!selectedTeamId) {
    return (
      <Container size="wide" className="py-8">
        <ErrorAlert
          variant="warning"
          message="Please select your team on the league page to access trade analysis."
          backLink={{
            href: `/leagues/${leagueId}`,
            label: "Go to League Page",
          }}
        />
      </Container>
    );
  }

  return (
    <Container size="wide" className="py-6 sm:py-8">
      <PageHeader
        title="Trade Analyzer"
        subtitle="Analyze trade impacts and discover beneficial trade opportunities"
        backLink={{ href: `/leagues/${leagueId}`, label: "Back to League" }}
      />

      {/* Mode Toggle */}
      <div className="mb-6">
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant={!showAnalyzer ? "primary" : "secondary"}
                className="flex-1"
                onClick={() => {
                  setShowAnalyzer(false);
                  setExpandedCandidate(null);
                }}
              >
                Auto Trade Finder
              </Button>
              <Button
                variant={showAnalyzer ? "primary" : "secondary"}
                className="flex-1"
                onClick={() => {
                  setShowAnalyzer(true);
                  setTradeAnalysis(null);
                  setGivePlayerIds([]);
                  setReceivePlayerIds([]);
                }}
              >
                <ArrowRightLeft className="h-4 w-4 mr-2" />
                Manual Trade Builder
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Build & Analyze Trade */}
      {showAnalyzer && (
        <div className="space-y-6">
          {/* Partner Selection */}
          <Card>
            <CardContent>
              <label className="block text-body-sm font-medium text-content mb-3">
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
                className="block w-full rounded-lg border border-neutral-200 dark:border-shell-border bg-white dark:bg-shell-bg text-content dark:text-shell-text focus:border-accent focus:ring-accent px-4 py-2"
              >
                <option value="">-- Choose a team --</option>
                {partnersData?.partners.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </CardContent>
          </Card>

          {/* Trade Builder */}
          {selectedPartnerId && (
            <Card>
              <CardHeader>
                <Heading level={3}>Build Trade</Heading>
              </CardHeader>
              <CardContent>
                {rostersLoading || !rostersData ? (
                  <LoadingSkeleton lines={1} />
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Your Team */}
                    <div>
                      <label className="block text-body-sm font-medium text-content mb-3">
                        You Give ({givePlayerIds.length}/3 selected) - {rostersData.userTeam.name}
                      </label>
                      <div className="space-y-2 max-h-96 overflow-y-auto border border-neutral-200 dark:border-shell-border rounded-lg p-3">
                        {rostersData.userTeam.roster.map((player) => (
                          <label
                            key={player.playerId}
                            className="flex items-center border border-neutral-200 dark:border-shell-border rounded-lg cursor-pointer"
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
                                className="h-4 w-4 text-accent border-neutral-300 rounded focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
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
                        <div className="mt-2 text-data text-warning font-medium">
                          Maximum 3 players
                        </div>
                      )}
                    </div>

                    {/* Partner Team */}
                    <div>
                      <label className="block text-body-sm font-medium text-content mb-3">
                        You Receive ({receivePlayerIds.length}/3 selected) - {rostersData.partnerTeam.name}
                      </label>
                      <div className="space-y-2 max-h-96 overflow-y-auto border border-neutral-200 dark:border-shell-border rounded-lg p-3">
                        {rostersData.partnerTeam.roster.map((player) => (
                          <label
                            key={player.playerId}
                            className="flex items-center border border-neutral-200 dark:border-shell-border rounded-lg cursor-pointer"
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
                                className="h-4 w-4 text-positive border-neutral-300 rounded focus:ring-positive disabled:opacity-50 disabled:cursor-not-allowed"
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
                        <div className="mt-2 text-data text-warning font-medium">
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
                      <div className="flex items-center gap-2 text-body-sm text-content-secondary">
                        <Loader2 className="animate-spin h-4 w-4" />
                        Checking roster validity...
                      </div>
                    ) : validationResult ? (
                      validationResult.isLegal ? (
                        <div className="flex items-center gap-2 text-body-sm text-positive bg-positive-light border border-positive-border rounded-lg px-3 py-2">
                          <CheckCircle className="h-4 w-4" />
                          Trade is roster-legal
                        </div>
                      ) : (
                        <div className="bg-negative-light border border-negative-border rounded-lg px-3 py-2">
                          <div className="flex items-center gap-2 text-body-sm font-medium text-negative mb-1">
                            <AlertTriangle className="h-4 w-4" />
                            Roster issues detected
                          </div>
                          <ul className="list-disc list-inside text-body-sm text-negative space-y-1">
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
                  <Button
                    variant="primary"
                    onClick={handleAnalyzeTrade}
                    disabled={
                      analyzeTradeM.isPending ||
                      givePlayerIds.length === 0 ||
                      receivePlayerIds.length === 0 ||
                      (validationResult !== null && !validationResult.isLegal) ||
                      isValidating
                    }
                  >
                    {analyzeTradeM.isPending
                      ? "Analyzing..."
                      : isValidating
                        ? "Validating..."
                        : validationResult && !validationResult.isLegal
                          ? "Fix Roster Issues First"
                          : `Analyze ${givePlayerIds.length}-for-${receivePlayerIds.length} Trade`}
                  </Button>
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
                        <p className="text-body-sm text-negative mb-3">
                          Trade analysis requires projections. Please contact your
                          administrator to upload projections.
                        </p>
                        <Link
                          href={`/leagues/${leagueId}`}
                          className="inline-flex items-center px-3 py-2 bg-negative text-white text-body-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
                        >
                          Go to League Page
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Trade Analysis Result */}
          {tradeAnalysis && (
            <Card>
              <CardHeader>
                <Heading level={3}>Trade Analysis</Heading>
              </CardHeader>
              <CardContent>
                {/* Overall Impact */}
                <div className="mb-6 p-4 border border-neutral-200 dark:border-shell-border rounded-lg bg-surface-secondary dark:bg-shell-bg">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <div className="text-body-sm text-content-secondary mb-1">
                        Net Roto Point Impact
                      </div>
                      <div
                        className={cn("text-3xl font-bold", renderDeltaColor(tradeAnalysis.deltaOverallPoints))}
                      >
                        {tradeAnalysis.deltaOverallPoints > 0 ? "+" : ""}
                        {tradeAnalysis.deltaOverallPoints.toFixed(1)} roto pts
                      </div>
                      <div className="text-body-sm text-content-secondary mt-1">
                        {tradeAnalysis.currentOverallPoints.toFixed(1)} &rarr;{" "}
                        {tradeAnalysis.projectedOverallPoints.toFixed(1)}
                      </div>
                    </div>

                    <Badge
                      variant={getRecommendationVariant(tradeAnalysis.recommendation)}
                      className="uppercase text-sm px-4 py-2 rounded-lg"
                    >
                      {tradeAnalysis.recommendation}
                    </Badge>
                  </div>

                  <div className="mt-4 p-3 bg-white dark:bg-shell-panel rounded-lg border border-neutral-200 dark:border-shell-border">
                    <div className="text-body-sm font-medium text-content mb-1">
                      Analysis
                    </div>
                    <p className="text-body-sm text-content-secondary">
                      {tradeAnalysis.deltaOverallPoints > 0
                        ? `This trade gains you ${tradeAnalysis.deltaOverallPoints.toFixed(1)} roto points. `
                        : tradeAnalysis.deltaOverallPoints < 0
                          ? `This trade costs you ${Math.abs(tradeAnalysis.deltaOverallPoints).toFixed(1)} roto points. `
                          : ""}
                      {tradeAnalysis.explanation}
                    </p>
                  </div>

                  {/* ESPN Link */}
                  {espnLeagueId && season && (
                    <div className="mt-3">
                      <a
                        href={getESPNTradeUrl(espnLeagueId, season)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center px-4 py-2 bg-accent text-content-inverse rounded-lg hover:bg-accent-hover font-medium text-body-sm gap-2"
                      >
                        Propose on ESPN
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  )}
                </div>

                {/* Category Breakdown */}
                <div>
                  <Heading level={4} className="uppercase tracking-wider mb-3 text-body-sm text-content-secondary font-semibold">
                    Category Impact
                  </Heading>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-neutral-200 dark:divide-shell-border">
                      <thead className="bg-surface-secondary dark:bg-shell-bg">
                        <tr>
                          <th className="px-4 py-3 text-left text-data font-medium text-content-secondary uppercase">
                            Category
                          </th>
                          <th className="px-4 py-3 text-center text-data font-medium text-content-secondary uppercase">
                            Rank Change
                          </th>
                          <th className="px-4 py-3 text-right text-data font-medium text-content-secondary uppercase">
                            Point Change
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 dark:divide-shell-border">
                        {[...tradeAnalysis.categoryImpacts]
                          .sort((a, b) => Math.abs(b.deltaPoints) - Math.abs(a.deltaPoints))
                          .map((cat) => (
                          <tr key={cat.categoryName} className={cn(
                            "hover:bg-surface-secondary dark:hover:bg-shell-bg",
                            cat.deltaPoints > 0 && "bg-positive-light/30",
                            cat.deltaPoints < 0 && "bg-negative-light/30",
                          )}>
                            <td className="px-4 py-3 text-body-sm font-medium text-content">
                              {cat.categoryName}
                            </td>
                            <td className="px-4 py-3 text-body-sm text-center">
                              <span
                                className={cn("font-semibold text-data", renderDeltaColor(cat.deltaRank * -1))}
                              >
                                {cat.currentRank} &rarr; {cat.projectedRank}
                                {cat.deltaRank !== 0 &&
                                  ` (${cat.deltaRank > 0 ? "+" : ""}${cat.deltaRank})`}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-body-sm text-right">
                              <span
                                className={cn("font-semibold text-data", renderDeltaColor(cat.deltaPoints))}
                              >
                                {cat.deltaPoints > 0 ? "+" : ""}
                                {cat.deltaPoints.toFixed(1)} roto pts
                              </span>
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-surface-secondary dark:bg-shell-bg font-semibold">
                          <td className="px-4 py-3 text-body-sm text-content">Total</td>
                          <td className="px-4 py-3" />
                          <td className="px-4 py-3 text-body-sm text-right">
                            <span className={cn("text-data", renderDeltaColor(tradeAnalysis.deltaOverallPoints))}>
                              {tradeAnalysis.deltaOverallPoints > 0 ? "+" : ""}
                              {tradeAnalysis.deltaOverallPoints.toFixed(1)} roto pts
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Auto Trade Finder */}
      {!showAnalyzer && (
        <Card>
          <CardHeader>
            <Heading level={3}>Auto Trade Finder</Heading>
            <p className="text-body-sm text-content-secondary mt-1">
              Scanning all 12 teams for roto-point-positive 1-for-1 swaps
            </p>
          </CardHeader>
          <CardContent>
            {candidatesData &&
              candidatesData.candidates.length > 0 &&
              candidatesData.candidates[0]?.positionalContext?.needPositions &&
              candidatesData.candidates[0].positionalContext.needPositions.length >
                0 && (
                <div className="mb-4 px-4 py-3 bg-info-light border border-info-border rounded-lg">
                  <div className="text-body-sm font-medium text-info">
                    Positions of need:{" "}
                    {candidatesData.candidates[0].positionalContext.needPositions.join(
                      ", ",
                    )}
                  </div>
                  <div className="text-data text-info mt-1">
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
                    <p className="text-body-sm text-negative mb-3">
                      Trade suggestions require projections. Please contact your
                      administrator to upload projections.
                    </p>
                    <Link
                      href={`/leagues/${leagueId}`}
                      className="inline-flex items-center px-4 py-2 bg-negative text-white text-body-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
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
                    className="border border-neutral-200 dark:border-shell-border rounded-lg p-4 sm:p-6 hover:shadow-card-hover transition-shadow cursor-pointer"
                    onClick={() => setExpandedCandidate(expandedCandidate === idx ? null : idx)}
                  >
                    {/* Header with prominent roto delta */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                      <div className={cn(
                        "inline-flex items-center px-3 py-1.5 rounded-lg font-bold text-lg font-mono",
                        "bg-positive-light text-positive border border-positive-border"
                      )}>
                        +{candidate.deltaOverallPoints.toFixed(1)} roto pts
                      </div>
                      <div className="flex-1">
                        <div className="text-data text-content-secondary">
                          Trade with
                        </div>
                        <div className="text-h4 font-bold text-content">
                          {candidate.partnerTeamName}
                        </div>
                      </div>
                      <div className="text-body-sm">
                        <span className="text-content-secondary">
                          Likelihood:{" "}
                        </span>
                        <span
                          className={cn("font-semibold", getLikelihoodColor(candidate.likelihood))}
                        >
                          {candidate.likelihood.charAt(0).toUpperCase() +
                            candidate.likelihood.slice(1)}
                        </span>
                      </div>
                    </div>

                    {/* Trade Details */}
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 mb-4">
                      <div className="bg-negative-light border border-negative-border rounded-lg p-3">
                        <div className="text-data font-semibold text-negative uppercase mb-1">
                          You Give
                        </div>
                        {candidate.trade.givePlayers.map((p, i) => (
                          <div
                            key={i}
                            className="text-body-sm font-medium text-content truncate"
                          >
                            {p.playerName}
                          </div>
                        ))}
                        {candidate.givePlayerAsv != null && (
                          <div className="mt-2 pt-2 border-t border-negative-border text-data font-mono text-content-secondary">
                            ESPN Value: <span className="font-semibold text-content dark:text-shell-text">${Math.round(candidate.givePlayerAsv)}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-center">
                        <ArrowRight className="w-6 h-6 text-content-tertiary rotate-90 sm:rotate-0" />
                      </div>

                      <div className="bg-positive-light border border-positive-border rounded-lg p-3">
                        <div className="text-data font-semibold text-positive uppercase mb-1">
                          You Get
                        </div>
                        {candidate.trade.receivePlayers.map((p, i) => (
                          <div
                            key={i}
                            className="text-body-sm font-medium text-content truncate"
                          >
                            {p.playerName}
                          </div>
                        ))}
                        {candidate.receivePlayerAsv != null && (
                          <div className="mt-2 pt-2 border-t border-positive-border text-data font-mono text-content-secondary">
                            ESPN Value: <span className="font-semibold text-content dark:text-shell-text">${Math.round(candidate.receivePlayerAsv)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Positional Context Badges */}
                    {candidate.positionalContext?.fillsNeed && (
                      <div className="mb-3 flex flex-wrap gap-2">
                        <Badge variant="info">
                          Fills need:{" "}
                          {candidate.positionalContext.needPositions
                            .filter((pos) =>
                              candidate.positionalContext!.positionGained.includes(
                                pos,
                              ),
                            )
                            .join(", ")}
                        </Badge>
                        {candidate.positionalContext.positionalBonus >= 1.0 && (
                          <Badge variant="default">
                            High positional value
                          </Badge>
                        )}
                      </div>
                    )}

                    <div className="text-data text-content-secondary">
                      {candidate.explanation}
                    </div>

                    {/* Expandable Category Breakdown */}
                    {expandedCandidate === idx && (
                      <div className="mt-4 border-t border-neutral-200 dark:border-shell-border pt-4">
                        <div className="text-body-sm font-medium text-content-secondary mb-2 uppercase tracking-wider">
                          Category Impact
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-neutral-200 dark:divide-shell-border">
                            <thead className="bg-surface-secondary dark:bg-shell-bg">
                              <tr>
                                <th className="px-3 py-2 text-left text-data font-medium text-content-secondary">
                                  Category
                                </th>
                                <th className="px-3 py-2 text-center text-data font-medium text-content-secondary">
                                  Rank
                                </th>
                                <th className="px-3 py-2 text-right text-data font-medium text-content-secondary">
                                  Points
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100 dark:divide-shell-border">
                              {candidate.categoryImpacts
                                .filter((cat) => cat.deltaPoints !== 0)
                                .sort((a, b) => Math.abs(b.deltaPoints) - Math.abs(a.deltaPoints))
                                .map((cat) => (
                                  <tr key={cat.categoryName} className={cn(
                                    cat.deltaPoints > 0 && "bg-positive-light/30",
                                    cat.deltaPoints < 0 && "bg-negative-light/30",
                                  )}>
                                    <td className="px-3 py-2 text-body-sm font-medium text-content">
                                      {cat.categoryName}
                                    </td>
                                    <td className="px-3 py-2 text-body-sm text-center">
                                      <span className={cn("font-mono text-data", renderDeltaColor(cat.deltaRank * -1))}>
                                        {cat.currentRank} &rarr; {cat.projectedRank}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-body-sm text-right">
                                      <span className={cn("font-semibold font-mono text-data", renderDeltaColor(cat.deltaPoints))}>
                                        {cat.deltaPoints > 0 ? "+" : ""}{cat.deltaPoints.toFixed(1)}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>

                        {/* ESPN Link */}
                        {espnLeagueId && season && (
                          <div className="mt-3">
                            <a
                              href={getESPNTradeUrl(espnLeagueId, season)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center px-4 py-2 bg-accent text-content-inverse rounded-lg hover:bg-accent-hover font-medium text-body-sm gap-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Propose on ESPN
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Expand hint */}
                    <div className="mt-2 text-data text-content-tertiary text-center">
                      {expandedCandidate === idx ? "Click to collapse" : "Click to see category breakdown"}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <ErrorAlert
                variant="info"
                message="No trade recommendations available. Upload projections data to analyze potential trades."
                action={{ label: "Upload Projections", href: "/admin" }}
              />
            )}
          </CardContent>
        </Card>
      )}
    </Container>
  );
}
