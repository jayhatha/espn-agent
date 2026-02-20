"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ErrorAlert } from "@/components/ui/ErrorAlert";

interface AuctionValue {
  playerId: number;
  playerName: string;
  positions: string[];
  primaryPosition: string;
  dollarValue: number;
  vbdScore: number;
  sgpTotal: number;
  inflationAdjustedValue?: number;
}

interface AuctionValuationsResponse {
  valuations: AuctionValue[];
  meta: {
    leagueId: number;
    leagueName: string;
    totalTeams: number;
    budget: number;
    minBid: number;
    playersAboveReplacement: number;
    generatedAt: string;
  };
}

const POSITIONS = ["ALL", "C", "1B", "2B", "3B", "SS", "OF", "SP", "RP", "DH"];

const getDollarValueColor = (value: number): string => {
  if (value >= 20) return "text-green-700 font-bold";
  if (value >= 10) return "text-gray-900 font-semibold";
  return "text-gray-500";
};

export default function AuctionValuationPage() {
  const params = useParams();
  const leagueId = params.id as string;
  const [position, setPosition] = useState<string>("ALL");
  const [budget, setBudget] = useState<number>(260);
  const [minBid, setMinBid] = useState<number>(1);

  const { data, isLoading, error, refetch } = useQuery<AuctionValuationsResponse>({
    queryKey: ["draft-auction", leagueId, position, budget, minBid],
    queryFn: async () => {
      const positionParam = position !== "ALL" ? `&position=${position}` : "";
      const response = await api.get(
        `/api/leagues/${leagueId}/draft/auction?budget=${budget}&minBid=${minBid}&limit=300${positionParam}`,
      );
      return response;
    },
  });

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <PageHeader
        title="Auction Values"
        subtitle={
          data?.meta.budget
            ? `Budget: $${data.meta.budget} per team`
            : "Dollar valuations for auction drafts"
        }
        backLink={{ href: `/leagues/${leagueId}`, label: "Back to League" }}
      />

      {/* Controls */}
      <div className="mb-6 space-y-4">
        {/* Budget Controls Row */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <div className="flex items-center gap-3">
            <label
              htmlFor="budget-input"
              className="text-sm font-medium text-gray-700"
            >
              Budget:
            </label>
            <input
              id="budget-input"
              type="number"
              min="100"
              max="500"
              step="10"
              value={budget}
              onChange={(e) => setBudget(parseInt(e.target.value, 10))}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-3">
            <label
              htmlFor="minbid-input"
              className="text-sm font-medium text-gray-700"
            >
              Min Bid:
            </label>
            <input
              id="minbid-input"
              type="number"
              min="1"
              max="5"
              step="1"
              value={minBid}
              onChange={(e) => setMinBid(parseInt(e.target.value, 10))}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm w-20 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-3">
            <label
              htmlFor="position-filter"
              className="text-sm font-medium text-gray-700"
            >
              Position:
            </label>
            <select
              id="position-filter"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {POSITIONS.map((pos) => (
                <option key={pos} value={pos}>
                  {pos}
                </option>
              ))}
            </select>
          </div>

          <Link
            href={`/leagues/${leagueId}/draft/rankings`}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            View Draft Rankings
          </Link>
        </div>

        {/* Meta Display */}
        {data && (
          <div className="flex flex-wrap gap-4 text-sm text-gray-600">
            <span>
              <span className="font-medium">Players above replacement:</span>{" "}
              {data.meta.playersAboveReplacement}
            </span>
            <span>
              <span className="font-medium">Total spending:</span> $
              {data.meta.budget * data.meta.totalTeams}
            </span>
          </div>
        )}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      )}

      {/* Error State */}
      {error && (
        <ErrorAlert
          message={
            error instanceof Error
              ? error.message
              : "Failed to load auction valuations"
          }
          onRetry={() => refetch()}
        />
      )}

      {/* Empty State */}
      {!isLoading && !error && data?.valuations.length === 0 && (
        <div className="text-center py-12">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            No valuations available
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Upload projections first to generate auction valuations.
          </p>
        </div>
      )}

      {/* Valuations Table */}
      {!isLoading && !error && data && data.valuations.length > 0 && (
        <div className="bg-white shadow-sm rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Player
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Position
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Value
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    VBD
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    SGP
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.valuations.map((valuation, index) => (
                  <tr
                    key={valuation.playerId}
                    className="even:bg-gray-50 hover:bg-blue-50"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {index + 1}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {valuation.playerName}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {valuation.positions.join("/")}
                    </td>
                    <td
                      className={`px-4 py-3 whitespace-nowrap text-sm text-right ${getDollarValueColor(valuation.dollarValue)}`}
                    >
                      ${valuation.dollarValue}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 text-right">
                      {valuation.vbdScore.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 text-right">
                      {valuation.sgpTotal.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Meta Info */}
          <div className="bg-gray-50 px-4 py-3 border-t border-gray-200">
            <p className="text-xs text-gray-500">
              Showing {data.valuations.length} player
              {data.valuations.length !== 1 ? "s" : ""} for{" "}
              {data.meta.totalTeams}-team league with ${data.meta.budget}{" "}
              budget
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
