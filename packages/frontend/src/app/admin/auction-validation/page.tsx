"use client";

import { useState } from "react";
import { AdminRoute } from "@/components/ProtectedRoute";
import { api } from "@/lib/api";
import { Container } from "@/components/ui/Container";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { Input } from "@/components/ui/Input";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { cn } from "@/lib/cn";
import { XCircle } from "lucide-react";

interface PlayerComparison {
  playerId: number;
  playerName: string;
  positions: string[];
  espnValue: number;
  ourValue: number;
  absoluteDelta: number;
  percentDelta: number;
  ratio: number;
}

interface ValidationResponse {
  summary: {
    totalCompared: number;
    meanDelta: number;
    medianDelta: number;
    rmse: number;
    correlation: number;
    ourTopPlayer: { name: string; value: number };
    espnTopPlayer: { name: string; value: number };
  };
  comparisons: PlayerComparison[];
}

interface Category {
  category_id: number;
  stat_key: string;
  name: string;
  type: "COUNTING" | "RATE";
  direction: "HIGHER_BETTER" | "LOWER_BETTER";
  formula_id?: string;
}

interface RosterSlot {
  key: string;
  label: string;
  defaultCount: number;
  group: "batting" | "pitching";
}

// Available categories
const AVAILABLE_CATEGORIES: Category[] = [
  { category_id: 1, stat_key: "R", name: "R", type: "COUNTING", direction: "HIGHER_BETTER" },
  { category_id: 2, stat_key: "HR", name: "HR", type: "COUNTING", direction: "HIGHER_BETTER" },
  { category_id: 3, stat_key: "RBI", name: "RBI", type: "COUNTING", direction: "HIGHER_BETTER" },
  { category_id: 4, stat_key: "SB", name: "SB", type: "COUNTING", direction: "HIGHER_BETTER" },
  { category_id: 5, stat_key: "AVG", name: "AVG", type: "RATE", direction: "HIGHER_BETTER", formula_id: "avg" },
  { category_id: 6, stat_key: "OBP", name: "OBP", type: "RATE", direction: "HIGHER_BETTER", formula_id: "obp" },
  { category_id: 7, stat_key: "SLG", name: "SLG", type: "RATE", direction: "HIGHER_BETTER", formula_id: "slg" },
  { category_id: 8, stat_key: "OPS", name: "OPS", type: "RATE", direction: "HIGHER_BETTER", formula_id: "ops" },
  { category_id: 16, stat_key: "K", name: "K", type: "COUNTING", direction: "HIGHER_BETTER" },
  { category_id: 17, stat_key: "W", name: "W", type: "COUNTING", direction: "HIGHER_BETTER" },
  { category_id: 18, stat_key: "SV", name: "SV", type: "COUNTING", direction: "HIGHER_BETTER" },
  { category_id: 19, stat_key: "ERA", name: "ERA", type: "RATE", direction: "LOWER_BETTER", formula_id: "era" },
  { category_id: 20, stat_key: "WHIP", name: "WHIP", type: "RATE", direction: "LOWER_BETTER", formula_id: "whip" },
  { category_id: 21, stat_key: "QS", name: "QS", type: "COUNTING", direction: "HIGHER_BETTER" },
  { category_id: 22, stat_key: "HLD", name: "HLD", type: "COUNTING", direction: "HIGHER_BETTER" },
];

// Available roster slots
const AVAILABLE_SLOTS: RosterSlot[] = [
  { key: "C", label: "Catcher", defaultCount: 1, group: "batting" },
  { key: "1B", label: "First Base", defaultCount: 1, group: "batting" },
  { key: "2B", label: "Second Base", defaultCount: 1, group: "batting" },
  { key: "3B", label: "Third Base", defaultCount: 1, group: "batting" },
  { key: "SS", label: "Shortstop", defaultCount: 1, group: "batting" },
  { key: "OF", label: "Outfield", defaultCount: 3, group: "batting" },
  { key: "UTIL", label: "Utility", defaultCount: 1, group: "batting" },
  { key: "SP", label: "Starting Pitcher", defaultCount: 3, group: "pitching" },
  { key: "RP", label: "Relief Pitcher", defaultCount: 2, group: "pitching" },
  { key: "P", label: "Pitcher", defaultCount: 2, group: "pitching" },
  { key: "Bench", label: "Bench", defaultCount: 5, group: "pitching" },
];

// Standard 5x5 categories (pre-selected by default)
const STANDARD_5X5_STAT_KEYS = ["R", "HR", "RBI", "SB", "AVG", "K", "W", "SV", "ERA", "WHIP"];

function AuctionValidationPageContent() {
  // Form state
  const [numTeams, setNumTeams] = useState<number>(12);

  // Categories state (checkboxes)
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set(STANDARD_5X5_STAT_KEYS)
  );

  // Roster slots state (checkboxes with counts)
  const [selectedSlots, setSelectedSlots] = useState<Map<string, number>>(
    new Map([
      ["C", 1], ["1B", 1], ["2B", 1], ["3B", 1], ["SS", 1],
      ["OF", 3], ["UTIL", 1], ["SP", 3], ["RP", 2], ["P", 2], ["Bench", 5]
    ])
  );

  const [budget, setBudget] = useState<number>(260);
  const [minBid, setMinBid] = useState<number>(1);
  const [limit, setLimit] = useState<number>(100);
  const [espnLeagueId, setEspnLeagueId] = useState<string>("");
  const [espnSeason, setEspnSeason] = useState<number>(2025);
  const [espnSwid, setEspnSwid] = useState<string>("");
  const [espnS2, setEspnS2] = useState<string>("");

  // Results state
  const [results, setResults] = useState<ValidationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Category checkbox handler
  const handleCategoryToggle = (statKey: string) => {
    const newSelected = new Set(selectedCategories);
    if (newSelected.has(statKey)) {
      newSelected.delete(statKey);
    } else {
      newSelected.add(statKey);
    }
    setSelectedCategories(newSelected);
  };

  // Roster slot checkbox handler
  const handleSlotToggle = (key: string, defaultCount: number) => {
    const newSlots = new Map(selectedSlots);
    if (newSlots.has(key)) {
      newSlots.delete(key);
    } else {
      newSlots.set(key, defaultCount);
    }
    setSelectedSlots(newSlots);
  };

  // Roster slot count handler
  const handleSlotCountChange = (key: string, count: number) => {
    const newSlots = new Map(selectedSlots);
    newSlots.set(key, count);
    setSelectedSlots(newSlots);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResults(null);
    setLoading(true);

    try {
      // Validate ESPN league ID
      if (!espnLeagueId || espnLeagueId.trim() === "") {
        throw new Error("ESPN League ID is required");
      }

      // Build categories JSON from selections
      const categoriesArray = AVAILABLE_CATEGORIES
        .filter(cat => selectedCategories.has(cat.stat_key))
        .map(cat => ({
          category_id: cat.category_id,
          stat_key: cat.stat_key,
          name: cat.name,
          type: cat.type,
          direction: cat.direction,
          ...(cat.formula_id && { formula_id: cat.formula_id }),
        }));

      // Build roster slots JSON from selections
      const rosterSlotsObj = Object.fromEntries(selectedSlots);

      const params = {
        numTeams,
        categories: JSON.stringify(categoriesArray),
        rosterSlots: JSON.stringify(rosterSlotsObj),
        budget,
        minBid,
        limit,
        espnLeagueId: parseInt(espnLeagueId, 10),
        espnSeason,
        ...(espnSwid && espnSwid.trim() !== "" && { espnSwid }),
        ...(espnS2 && espnS2.trim() !== "" && { espnS2 }),
      };

      const data = await api.validateAuctionValues(params);
      setResults(data);
    } catch (err: any) {
      setError(err.message || "Failed to validate auction values");
    } finally {
      setLoading(false);
    }
  };

  const getDeltaClass = (delta: number): string => {
    if (delta > 0) return "text-positive";
    if (delta < 0) return "text-negative";
    return "text-content-secondary";
  };

  return (
    <Container size="wide" className="py-8">
      <div className="mb-8">
        <Heading level={1}>Auction Value Validation</Heading>
        <p className="text-body-sm text-content-secondary mt-2">
          Compare VBD-based auction values against ESPN's pre-draft baseline values
        </p>
      </div>

      {/* Configuration Form */}
      <Card className="mb-8">
        <CardHeader>
          <Heading level={2}>Validation Parameters</Heading>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            {/* Draft Settings */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div>
                <label className="block text-body-sm font-medium text-content mb-2">
                  Number of Teams
                </label>
                <Input
                  type="number"
                  value={numTeams}
                  onChange={(e) => setNumTeams(parseInt(e.target.value, 10))}
                  min="2"
                  max="30"
                  required
                />
              </div>

              <div>
                <label className="block text-body-sm font-medium text-content mb-2">
                  Auction Budget ($)
                </label>
                <Input
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(parseInt(e.target.value, 10))}
                  min="100"
                  max="1000"
                  required
                />
              </div>

              <div>
                <label className="block text-body-sm font-medium text-content mb-2">
                  Minimum Bid ($)
                </label>
                <Input
                  type="number"
                  value={minBid}
                  onChange={(e) => setMinBid(parseInt(e.target.value, 10))}
                  min="1"
                  max="10"
                  required
                />
              </div>
            </div>

            {/* ESPN Context */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-body-sm font-medium text-content mb-2">
                  ESPN League ID *
                </label>
                <Input
                  type="text"
                  value={espnLeagueId}
                  onChange={(e) => setEspnLeagueId(e.target.value)}
                  placeholder="e.g., 123456"
                  required
                />
              </div>

              <div>
                <label className="block text-body-sm font-medium text-content mb-2">
                  ESPN Season
                </label>
                <Input
                  type="number"
                  value={espnSeason}
                  onChange={(e) => setEspnSeason(parseInt(e.target.value, 10))}
                  min="2020"
                  max={new Date().getFullYear() + 1}
                  required
                />
              </div>

              <div>
                <label className="block text-body-sm font-medium text-content mb-2">
                  ESPN SWID (optional)
                </label>
                <Input
                  type="text"
                  value={espnSwid}
                  onChange={(e) => setEspnSwid(e.target.value)}
                  placeholder="For private leagues"
                />
              </div>

              <div>
                <label className="block text-body-sm font-medium text-content mb-2">
                  ESPN S2 (optional)
                </label>
                <Input
                  type="text"
                  value={espnS2}
                  onChange={(e) => setEspnS2(e.target.value)}
                  placeholder="For private leagues"
                />
              </div>
            </div>

            {/* Advanced Settings */}
            <div className="mb-6">
              <label className="block text-body-sm font-medium text-content mb-2">
                Maximum Players to Compare
              </label>
              <Input
                type="number"
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value, 10))}
                min="10"
                max="500"
                required
                className="max-w-xs"
              />
            </div>

            {/* Categories Selection */}
            <div className="mb-6">
              <Heading level={3} className="mb-4">Scoring Categories</Heading>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Batting Categories */}
                <div className="border border-neutral-200 rounded-card p-4">
                  <h4 className="text-body-sm font-semibold text-content mb-3">
                    Batting Categories
                  </h4>
                  <div className="space-y-2">
                    {AVAILABLE_CATEGORIES
                      .filter(cat => ["R", "HR", "RBI", "SB", "AVG", "OBP", "SLG", "OPS"].includes(cat.stat_key))
                      .map(cat => (
                        <label key={cat.stat_key} className="flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedCategories.has(cat.stat_key)}
                            onChange={() => handleCategoryToggle(cat.stat_key)}
                            className="h-4 w-4 text-accent focus:ring-accent border-neutral-300 rounded"
                          />
                          <span className="ml-2 text-body-sm text-content">
                            {cat.name} ({cat.type})
                          </span>
                        </label>
                      ))}
                  </div>
                </div>

                {/* Pitching Categories */}
                <div className="border border-neutral-200 rounded-card p-4">
                  <h4 className="text-body-sm font-semibold text-content mb-3">
                    Pitching Categories
                  </h4>
                  <div className="space-y-2">
                    {AVAILABLE_CATEGORIES
                      .filter(cat => ["K", "W", "SV", "HLD", "QS", "ERA", "WHIP"].includes(cat.stat_key))
                      .map(cat => (
                        <label key={cat.stat_key} className="flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedCategories.has(cat.stat_key)}
                            onChange={() => handleCategoryToggle(cat.stat_key)}
                            className="h-4 w-4 text-accent focus:ring-accent border-neutral-300 rounded"
                          />
                          <span className="ml-2 text-body-sm text-content">
                            {cat.name} ({cat.type})
                          </span>
                        </label>
                      ))}
                  </div>
                </div>
              </div>

              {selectedCategories.size === 0 && (
                <p className="mt-2 text-body-sm text-negative">
                  Please select at least one category
                </p>
              )}
            </div>

            {/* Roster Slots Selection */}
            <div className="mb-6">
              <Heading level={3} className="mb-4">Roster Slots</Heading>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Position Players */}
                <div className="border border-neutral-200 rounded-card p-4">
                  <h4 className="text-body-sm font-semibold text-content mb-3">
                    Position Players
                  </h4>
                  <div className="space-y-2">
                    {AVAILABLE_SLOTS
                      .filter(slot => slot.group === "batting")
                      .map(slot => (
                        <div key={slot.key} className="flex items-center justify-between">
                          <label className="flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedSlots.has(slot.key)}
                              onChange={() => handleSlotToggle(slot.key, slot.defaultCount)}
                              className="h-4 w-4 text-accent focus:ring-accent border-neutral-300 rounded"
                            />
                            <span className="ml-2 text-body-sm text-content">
                              {slot.label}
                            </span>
                          </label>
                          {selectedSlots.has(slot.key) && (
                            <Input
                              type="number"
                              value={selectedSlots.get(slot.key)}
                              onChange={(e) => handleSlotCountChange(slot.key, parseInt(e.target.value, 10))}
                              className="w-16 h-8 px-2 text-body-sm"
                              min="1"
                              max="10"
                            />
                          )}
                        </div>
                      ))}
                  </div>
                </div>

                {/* Pitchers */}
                <div className="border border-neutral-200 rounded-card p-4">
                  <h4 className="text-body-sm font-semibold text-content mb-3">
                    Pitchers & Bench
                  </h4>
                  <div className="space-y-2">
                    {AVAILABLE_SLOTS
                      .filter(slot => slot.group === "pitching")
                      .map(slot => (
                        <div key={slot.key} className="flex items-center justify-between">
                          <label className="flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedSlots.has(slot.key)}
                              onChange={() => handleSlotToggle(slot.key, slot.defaultCount)}
                              className="h-4 w-4 text-accent focus:ring-accent border-neutral-300 rounded"
                            />
                            <span className="ml-2 text-body-sm text-content">
                              {slot.label}
                            </span>
                          </label>
                          {selectedSlots.has(slot.key) && (
                            <Input
                              type="number"
                              value={selectedSlots.get(slot.key)}
                              onChange={(e) => handleSlotCountChange(slot.key, parseInt(e.target.value, 10))}
                              className="w-16 h-8 px-2 text-body-sm"
                              min="1"
                              max="10"
                            />
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              {selectedSlots.size === 0 && (
                <p className="mt-2 text-body-sm text-negative">
                  Please select at least one roster slot
                </p>
              )}
            </div>

            {/* Submit Button */}
            <div className="flex justify-end">
              <Button
                type="submit"
                variant="primary"
                disabled={loading}
              >
                {loading ? "Validating..." : "Validate Values"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <div className="bg-negative-light border border-negative-border rounded-card p-4 mb-8">
          <div className="flex">
            <XCircle className="h-5 w-5 text-negative mr-2 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-body-sm font-medium text-negative">Validation Error</h3>
              <p className="mt-1 text-body-sm text-negative opacity-75">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Loading Spinner */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner />
        </div>
      )}

      {/* Results Display */}
      {results && !loading && (
        <>
          {/* Summary Statistics */}
          <Card className="mb-8">
            <CardHeader>
              <Heading level={2}>Summary Statistics</Heading>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-surface-secondary rounded-card p-4 border border-neutral-100">
                  <div className="text-body-sm text-content-secondary mb-1">Players Compared</div>
                  <div className="text-2xl font-bold text-content">
                    {results.summary.totalCompared}
                  </div>
                </div>

                <div className="bg-surface-secondary rounded-card p-4 border border-neutral-100">
                  <div className="text-body-sm text-content-secondary mb-1">Mean Delta</div>
                  <div className={cn("text-2xl font-bold", getDeltaClass(results.summary.meanDelta))}>
                    ${results.summary.meanDelta.toFixed(2)}
                  </div>
                </div>

                <div className="bg-surface-secondary rounded-card p-4 border border-neutral-100">
                  <div className="text-body-sm text-content-secondary mb-1">Median Delta</div>
                  <div className={cn("text-2xl font-bold", getDeltaClass(results.summary.medianDelta))}>
                    ${results.summary.medianDelta.toFixed(2)}
                  </div>
                </div>

                <div className="bg-surface-secondary rounded-card p-4 border border-neutral-100">
                  <div className="text-body-sm text-content-secondary mb-1">RMSE</div>
                  <div className="text-2xl font-bold text-content">
                    ${results.summary.rmse.toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-surface-secondary rounded-card p-4 border border-neutral-100">
                  <div className="text-body-sm text-content-secondary mb-1">Correlation</div>
                  <div className="text-2xl font-bold text-content">
                    {results.summary.correlation.toFixed(3)}
                  </div>
                </div>

                <div className="bg-surface-secondary rounded-card p-4 border border-neutral-100">
                  <div className="text-body-sm text-content-secondary mb-1">Our Top Player</div>
                  <div className="text-lg font-semibold text-content">
                    {results.summary.ourTopPlayer.name}
                  </div>
                  <div className="text-body-sm text-content-secondary mt-1">
                    ${results.summary.ourTopPlayer.value}
                  </div>
                </div>

                <div className="bg-surface-secondary rounded-card p-4 border border-neutral-100">
                  <div className="text-body-sm text-content-secondary mb-1">ESPN Top Player</div>
                  <div className="text-lg font-semibold text-content">
                    {results.summary.espnTopPlayer.name}
                  </div>
                  <div className="text-body-sm text-content-secondary mt-1">
                    ${results.summary.espnTopPlayer.value}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Comparison Table */}
          <Card>
            <CardHeader>
              <Heading level={2}>Player-by-Player Comparison</Heading>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-100">
                  <thead className="bg-surface-secondary">
                    <tr>
                      <th className="px-6 py-3 text-left text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                        Player
                      </th>
                      <th className="px-6 py-3 text-left text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                        Positions
                      </th>
                      <th className="px-6 py-3 text-right text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                        ESPN Value
                      </th>
                      <th className="px-6 py-3 text-right text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                        Our Value
                      </th>
                      <th className="px-6 py-3 text-right text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                        Delta ($)
                      </th>
                      <th className="px-6 py-3 text-right text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                        Delta (%)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-neutral-100">
                    {results.comparisons.map((comp, idx) => (
                      <tr key={idx} className="hover:bg-surface-secondary transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-body-sm font-medium text-content">
                          {comp.playerName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-body-sm text-content-secondary">
                          {comp.positions.join(", ")}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-body-sm text-content text-right">
                          ${comp.espnValue}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-body-sm text-content text-right">
                          ${comp.ourValue}
                        </td>
                        <td className={cn(
                          "px-6 py-4 whitespace-nowrap text-data font-medium text-right",
                          getDeltaClass(comp.absoluteDelta)
                        )}>
                          {comp.absoluteDelta > 0 ? '+' : ''}${comp.absoluteDelta.toFixed(2)}
                        </td>
                        <td className={cn(
                          "px-6 py-4 whitespace-nowrap text-data text-right",
                          getDeltaClass(comp.percentDelta)
                        )}>
                          {comp.percentDelta > 0 ? '+' : ''}{comp.percentDelta.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {results.comparisons.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-body-sm text-content-secondary">No players found to compare</p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </Container>
  );
}

export default function AuctionValidationPage() {
  return (
    <AdminRoute>
      <AuctionValidationPageContent />
    </AdminRoute>
  );
}
