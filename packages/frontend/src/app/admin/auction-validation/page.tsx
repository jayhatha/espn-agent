"use client";

import { useState } from "react";
import { AdminRoute } from "@/components/ProtectedRoute";
import { api } from "@/lib/api";

interface PlayerComparison {
  name: string;
  positions: string[];
  espnValue: number;
  ourValue: number;
  delta: number;
  deltaPercent: number;
  absoluteDelta: number;
}

interface ValidationResponse {
  summary: {
    totalCompared: number;
    meanDelta: number;
    medianDelta: number;
    rmse: number;
    correlation: number;
    ourTopPlayer: string;
    espnTopPlayer: string;
  };
  comparisons: PlayerComparison[];
}

interface Category {
  category_id: number;
  stat_key: string;
  name: string;
  type: "counting" | "rate";
  direction: "high" | "low";
}

interface RosterSlot {
  key: string;
  label: string;
  defaultCount: number;
  group: "batting" | "pitching";
}

// Available categories
const AVAILABLE_CATEGORIES: Category[] = [
  { category_id: 1, stat_key: "R", name: "R", type: "counting", direction: "high" },
  { category_id: 2, stat_key: "HR", name: "HR", type: "counting", direction: "high" },
  { category_id: 3, stat_key: "RBI", name: "RBI", type: "counting", direction: "high" },
  { category_id: 4, stat_key: "SB", name: "SB", type: "counting", direction: "high" },
  { category_id: 5, stat_key: "AVG", name: "AVG", type: "rate", direction: "high" },
  { category_id: 6, stat_key: "OBP", name: "OBP", type: "rate", direction: "high" },
  { category_id: 7, stat_key: "SLG", name: "SLG", type: "rate", direction: "high" },
  { category_id: 8, stat_key: "OPS", name: "OPS", type: "rate", direction: "high" },
  { category_id: 16, stat_key: "K", name: "K", type: "counting", direction: "high" },
  { category_id: 17, stat_key: "W", name: "W", type: "counting", direction: "high" },
  { category_id: 18, stat_key: "SV", name: "SV", type: "counting", direction: "high" },
  { category_id: 19, stat_key: "ERA", name: "ERA", type: "rate", direction: "low" },
  { category_id: 20, stat_key: "WHIP", name: "WHIP", type: "rate", direction: "low" },
  { category_id: 21, stat_key: "QS", name: "QS", type: "counting", direction: "high" },
  { category_id: 22, stat_key: "HLD", name: "HLD", type: "counting", direction: "high" },
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

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Auction Value Validation
        </h1>
        <p className="text-gray-600 mb-8">
          Compare VBD-based auction values against ESPN's pre-draft baseline values
        </p>

        {/* Configuration Form */}
        <div className="bg-white shadow rounded-lg p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Validation Parameters
          </h2>

          <form onSubmit={handleSubmit}>
            {/* Draft Settings */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Number of Teams
                </label>
                <input
                  type="number"
                  value={numTeams}
                  onChange={(e) => setNumTeams(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  min="2"
                  max="30"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Auction Budget ($)
                </label>
                <input
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  min="100"
                  max="1000"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Minimum Bid ($)
                </label>
                <input
                  type="number"
                  value={minBid}
                  onChange={(e) => setMinBid(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  min="1"
                  max="10"
                  required
                />
              </div>
            </div>

            {/* ESPN Context */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ESPN League ID *
                </label>
                <input
                  type="text"
                  value={espnLeagueId}
                  onChange={(e) => setEspnLeagueId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="e.g., 123456"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ESPN Season
                </label>
                <input
                  type="number"
                  value={espnSeason}
                  onChange={(e) => setEspnSeason(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  min="2020"
                  max={new Date().getFullYear() + 1}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ESPN SWID (optional)
                </label>
                <input
                  type="text"
                  value={espnSwid}
                  onChange={(e) => setEspnSwid(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="For private leagues"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ESPN S2 (optional)
                </label>
                <input
                  type="text"
                  value={espnS2}
                  onChange={(e) => setEspnS2(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="For private leagues"
                />
              </div>
            </div>

            {/* Advanced Settings */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Maximum Players to Compare
              </label>
              <input
                type="number"
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                min="10"
                max="500"
                required
              />
            </div>

            {/* Categories Selection */}
            <div className="mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Scoring Categories
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Batting Categories */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">
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
                            className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                          />
                          <span className="ml-2 text-sm text-gray-700">
                            {cat.name} ({cat.type})
                          </span>
                        </label>
                      ))}
                  </div>
                </div>

                {/* Pitching Categories */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">
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
                            className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                          />
                          <span className="ml-2 text-sm text-gray-700">
                            {cat.name} ({cat.type})
                          </span>
                        </label>
                      ))}
                  </div>
                </div>
              </div>

              {selectedCategories.size === 0 && (
                <p className="mt-2 text-sm text-red-600">
                  Please select at least one category
                </p>
              )}
            </div>

            {/* Roster Slots Selection */}
            <div className="mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Roster Slots
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Position Players */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">
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
                              className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                            />
                            <span className="ml-2 text-sm text-gray-700">
                              {slot.label}
                            </span>
                          </label>
                          {selectedSlots.has(slot.key) && (
                            <input
                              type="number"
                              value={selectedSlots.get(slot.key)}
                              onChange={(e) => handleSlotCountChange(slot.key, parseInt(e.target.value, 10))}
                              className="w-16 px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                              min="1"
                              max="10"
                            />
                          )}
                        </div>
                      ))}
                  </div>
                </div>

                {/* Pitchers */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">
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
                              className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                            />
                            <span className="ml-2 text-sm text-gray-700">
                              {slot.label}
                            </span>
                          </label>
                          {selectedSlots.has(slot.key) && (
                            <input
                              type="number"
                              value={selectedSlots.get(slot.key)}
                              onChange={(e) => handleSlotCountChange(slot.key, parseInt(e.target.value, 10))}
                              className="w-16 px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
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
                <p className="mt-2 text-sm text-red-600">
                  Please select at least one roster slot
                </p>
              )}
            </div>

            {/* Submit Button */}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-purple-600 text-white font-medium rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Validating..." : "Validate Values"}
              </button>
            </div>
          </form>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
            <div className="flex">
              <svg
                className="h-5 w-5 text-red-400 mr-2"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <h3 className="text-sm font-medium text-red-800">Validation Error</h3>
                <p className="mt-1 text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Loading Spinner */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <svg
              className="animate-spin h-12 w-12 text-purple-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          </div>
        )}

        {/* Results Display */}
        {results && !loading && (
          <>
            {/* Summary Statistics */}
            <div className="bg-white shadow rounded-lg p-6 mb-8">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Summary Statistics</h2>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">Players Compared</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {results.summary.totalCompared}
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">Mean Delta</div>
                  <div className="text-2xl font-bold text-gray-900">
                    ${results.summary.meanDelta.toFixed(2)}
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">Median Delta</div>
                  <div className="text-2xl font-bold text-gray-900">
                    ${results.summary.medianDelta.toFixed(2)}
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">RMSE</div>
                  <div className="text-2xl font-bold text-gray-900">
                    ${results.summary.rmse.toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">Correlation</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {results.summary.correlation.toFixed(3)}
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">Our Top Player</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {results.summary.ourTopPlayer}
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">ESPN Top Player</div>
                  <div className="text-lg font-semibold text-gray-900">
                    {results.summary.espnTopPlayer}
                  </div>
                </div>
              </div>
            </div>

            {/* Comparison Table */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                Player-by-Player Comparison
              </h2>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Player
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Positions
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        ESPN Value
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Our Value
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Delta ($)
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Delta (%)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {results.comparisons.map((comp, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {comp.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {comp.positions.join(", ")}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                          ${comp.espnValue}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                          ${comp.ourValue}
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium text-right ${
                          comp.delta > 0 ? 'text-green-600' : comp.delta < 0 ? 'text-red-600' : 'text-gray-600'
                        }`}>
                          {comp.delta > 0 ? '+' : ''}${comp.delta.toFixed(2)}
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm text-right ${
                          comp.deltaPercent > 0 ? 'text-green-600' : comp.deltaPercent < 0 ? 'text-red-600' : 'text-gray-600'
                        }`}>
                          {comp.deltaPercent > 0 ? '+' : ''}{comp.deltaPercent.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {results.comparisons.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500">No players found to compare</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function AuctionValidationPage() {
  return (
    <AdminRoute>
      <AuctionValidationPageContent />
    </AdminRoute>
  );
}
