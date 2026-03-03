"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { Container } from "@/components/ui/Container";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { DollarSign } from "lucide-react";

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

const getDollarValueClass = (value: number): string => {
  if (value >= 20) return "text-positive font-semibold";
  if (value >= 10) return "text-content font-medium";
  return "text-content-secondary";
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
    <Container size="wide" className="py-8">
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
              className="text-body-sm font-medium text-content whitespace-nowrap"
            >
              Budget:
            </label>
            <Input
              id="budget-input"
              type="number"
              min="100"
              max="500"
              step="10"
              value={budget}
              onChange={(e) => setBudget(parseInt(e.target.value, 10))}
              className="w-24"
            />
          </div>

          <div className="flex items-center gap-3">
            <label
              htmlFor="minbid-input"
              className="text-body-sm font-medium text-content whitespace-nowrap"
            >
              Min Bid:
            </label>
            <Input
              id="minbid-input"
              type="number"
              min="1"
              max="5"
              step="1"
              value={minBid}
              onChange={(e) => setMinBid(parseInt(e.target.value, 10))}
              className="w-20"
            />
          </div>

          <div className="flex items-center gap-3">
            <label
              htmlFor="position-filter"
              className="text-body-sm font-medium text-content whitespace-nowrap"
            >
              Position:
            </label>
            <select
              id="position-filter"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="border border-neutral-300 rounded-lg px-3 py-2 text-body-sm text-content bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
            className="inline-flex items-center px-4 py-2 border border-neutral-300 rounded-lg text-body-sm font-medium text-content bg-white hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors"
          >
            View Draft Rankings
          </Link>
        </div>

        {/* Meta Display */}
        {data && (
          <div className="flex flex-wrap gap-4 text-body-sm text-content-secondary">
            <span>
              <span className="font-medium text-content">Players above replacement:</span>{" "}
              {data.meta.playersAboveReplacement}
            </span>
            <span>
              <span className="font-medium text-content">Total spending:</span> $
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
          <DollarSign className="mx-auto h-12 w-12 text-content-tertiary" />
          <h3 className="mt-2 text-body-sm font-medium text-content">
            No valuations available
          </h3>
          <p className="mt-1 text-body-sm text-content-secondary">
            Upload projections first to generate auction valuations.
          </p>
        </div>
      )}

      {/* Valuations Table */}
      {!isLoading && !error && data && data.valuations.length > 0 && (
        <div className="rounded-card border border-neutral-200 bg-white shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-100">
              <thead className="bg-surface-secondary sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-4 py-3 text-left text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                    Player
                  </th>
                  <th className="px-4 py-3 text-left text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                    Position
                  </th>
                  <th className="px-4 py-3 text-right text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                    Value
                  </th>
                  <th className="px-4 py-3 text-right text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                    VBD
                  </th>
                  <th className="px-4 py-3 text-right text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                    SGP
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-neutral-100">
                {data.valuations.map((valuation, index) => (
                  <tr
                    key={valuation.playerId}
                    className="border-b border-neutral-100 hover:bg-surface-secondary transition-colors"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-data font-medium text-content">
                      {index + 1}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-body-sm font-medium text-content">
                        {valuation.playerName}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-body-sm text-content-secondary">
                      {valuation.positions.join("/")}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 whitespace-nowrap text-data text-right",
                        getDollarValueClass(valuation.dollarValue)
                      )}
                    >
                      ${valuation.dollarValue}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-data text-content-secondary text-right">
                      {valuation.vbdScore.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-data text-content-secondary text-right">
                      {valuation.sgpTotal.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Meta Info */}
          <div className="bg-surface-secondary px-4 py-3 border-t border-neutral-100">
            <p className="text-body-sm text-content-secondary">
              Showing {data.valuations.length} player
              {data.valuations.length !== 1 ? "s" : ""} for{" "}
              {data.meta.totalTeams}-team league with ${data.meta.budget}{" "}
              budget
            </p>
          </div>
        </div>
      )}
    </Container>
  );
}
