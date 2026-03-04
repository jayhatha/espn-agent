"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { AdminRoute } from "@/components/ProtectedRoute";
import { api } from "@/lib/api";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { cn } from "@/lib/cn";
import { BarChart3, Upload, X } from "lucide-react";
import {
  PITCHER_RANKINGS,
  HITTER_RANKINGS,
  RELIEVER_RANKINGS,
  type ExternalRanking,
} from "./rankings-data";

// --- Types ---

interface ESPNPlayer {
  playerId: number;
  playerName: string;
  positions: string[];
  mlbTeam: string;
  espnAuctionValue: number;
  rotoAuctionValue: number;
  averageDraftPosition: number;
  averageAuctionValue: number;
  percentOwned: number;
  rank: number;
}

interface ESPNResponse {
  players: ESPNPlayer[];
  meta: { season: number; totalPlayers: number; generatedAt: string };
}

interface MergedPlayer extends ESPNPlayer {
  externalRank?: number;
  externalTier?: number;
  externalTierName?: string;
  externalSource?: "SP" | "RP" | "Hitter";
  uploadedValue?: number;
  valueDiff?: number; // CSV$ - ESPN$ (positive = ESPN undervalues, negative = ESPN overvalues)
  rankDiff?: number; // ESPN rank - external rank (positive = undervalued bargain, negative = overvalued)
}

interface UploadedSource {
  name: string;
  entries: { playerName: string; dollarValue: number }[];
}

// --- Constants ---

const STORAGE_KEY = "draft-board-uploaded-auctions";

const POSITIONS = [
  "ALL",
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "OF",
  "SP",
  "RP",
  "DH",
];

type SortKey =
  | "espnAuctionValue"
  | "averageDraftPosition"
  | "externalRank"
  | "playerName"
  | "rank"
  | "uploadedValue"
  | "valueDiff"
  | "rankDiff";

const getTierVariant = (
  tier: number,
): "default" | "positive" | "warning" | "info" => {
  if (tier <= 3) return "positive";
  if (tier <= 8) return "info";
  if (tier <= 15) return "warning";
  return "default";
};

// --- Name normalization for matching ---

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-zA-Z\s]/g, "")
    .toLowerCase()
    .trim();
}

// --- CSV Parsing ---

function parseAuctionCSV(
  csvText: string,
  sourceName: string,
): UploadedSource | null {
  // Strip BOM
  const text = csvText.replace(/^\uFEFF/, "").trim();
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return null;

  // Detect delimiter (tab vs comma)
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0]
    .split(delimiter)
    .map((h) => h.trim().replace(/^["']|["']$/g, "").toLowerCase());

  // Find name column
  const nameIdx = headers.findIndex(
    (h) =>
      h === "name" ||
      h === "player" ||
      h === "playername" ||
      h === "player name" ||
      h === "player_name",
  );

  // Find dollars column
  const dollarsIdx = headers.findIndex(
    (h) =>
      h === "dollars" ||
      h === "dollar" ||
      h === "$" ||
      h === "value" ||
      h === "price" ||
      h === "auction" ||
      h === "cost" ||
      h.includes("dollar") ||
      h.includes("auction") ||
      h.includes("price") ||
      h.includes("value"),
  );

  if (nameIdx === -1 || dollarsIdx === -1) return null;

  const entries: { playerName: string; dollarValue: number }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line
      .split(delimiter)
      .map((c) => c.trim().replace(/^["']|["']$/g, ""));
    const name = cols[nameIdx];
    const dollarStr = cols[dollarsIdx]?.replace(/[$,]/g, "");
    const dollarValue = parseFloat(dollarStr);

    if (name && !isNaN(dollarValue)) {
      entries.push({ playerName: name, dollarValue });
    }
  }

  if (entries.length === 0) return null;
  return { name: sourceName, entries };
}

// --- Player matching ---

function matchPlayers(
  espnPlayers: ESPNPlayer[],
  pitchers: ExternalRanking[],
  hitters: ExternalRanking[],
  relievers: ExternalRanking[],
  combinedUploadMap: Map<string, number>,
): MergedPlayer[] {
  const pitcherMap = new Map<string, ExternalRanking>();
  for (const ext of pitchers) {
    pitcherMap.set(normalizeName(ext.playerName), ext);
  }
  const hitterMap = new Map<string, ExternalRanking>();
  for (const ext of hitters) {
    hitterMap.set(normalizeName(ext.playerName), ext);
  }
  const relieverMap = new Map<string, ExternalRanking>();
  for (const ext of relievers) {
    relieverMap.set(normalizeName(ext.playerName), ext);
  }

  return espnPlayers.map((p) => {
    const normalized = normalizeName(p.playerName);

    // Try exact match first
    let match = pitcherMap.get(normalized) || relieverMap.get(normalized) || hitterMap.get(normalized);
    let source: "SP" | "RP" | "Hitter" | undefined = pitcherMap.has(normalized)
      ? "SP"
      : relieverMap.has(normalized)
        ? "RP"
        : hitterMap.has(normalized)
          ? "Hitter"
          : undefined;

    // Try last name fallback
    if (!match) {
      const lastName = normalized.split(" ").pop() || "";
      if (lastName.length > 3) {
        for (const [key, val] of pitcherMap) {
          if (key.endsWith(lastName) && !key.startsWith(lastName)) {
            match = val;
            source = "SP";
            break;
          }
        }
        if (!match) {
          for (const [key, val] of relieverMap) {
            if (key.endsWith(lastName) && !key.startsWith(lastName)) {
              match = val;
              source = "RP";
              break;
            }
          }
        }
        if (!match) {
          for (const [key, val] of hitterMap) {
            if (key.endsWith(lastName) && !key.startsWith(lastName)) {
              match = val;
              source = "Hitter";
              break;
            }
          }
        }
      }
    }

    // Match uploaded CSV value (combined across all sources)
    let uploadedValue = combinedUploadMap.get(normalized);
    if (uploadedValue === undefined) {
      const lastName = normalized.split(" ").pop() || "";
      if (lastName.length > 3) {
        for (const [key, v] of combinedUploadMap) {
          if (key.endsWith(lastName) && !key.startsWith(lastName)) {
            uploadedValue = v;
            break;
          }
        }
      }
    }

    const valueDiff = uploadedValue != null ? uploadedValue - p.espnAuctionValue : undefined;
    const rankDiff = match?.rank != null ? p.rank - match.rank : undefined;

    return {
      ...p,
      externalRank: match?.rank,
      externalTier: match?.tier,
      externalTierName: match?.tierName,
      externalSource: source,
      uploadedValue,
      valueDiff,
      rankDiff,
    };
  });
}

// --- Component ---

export default function DraftBoardPage() {
  return (
    <AdminRoute>
      <DraftBoardContent />
    </AdminRoute>
  );
}

function DraftBoardContent() {
  const [position, setPosition] = useState("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("espnAuctionValue");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load uploaded sources from localStorage
  const [uploadedSources, setUploadedSources] = useState<UploadedSource[]>(
    () => {
      if (typeof window === "undefined") return [];
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
      } catch {
        return [];
      }
    },
  );

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(uploadedSources));
  }, [uploadedSources]);

  // Build single combined lookup map from all uploaded sources
  const combinedUploadMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const src of uploadedSources) {
      for (const e of src.entries) {
        map.set(normalizeName(e.playerName), e.dollarValue);
      }
    }
    return map;
  }, [uploadedSources]);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;

      Array.from(files).forEach((file) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const text = ev.target?.result as string;
          const sourceName = file.name.replace(/\.[^.]+$/, "");
          const parsed = parseAuctionCSV(text, sourceName);
          if (parsed) {
            setUploadedSources((prev) => {
              // Replace if same source name exists
              const filtered = prev.filter((s) => s.name !== parsed.name);
              return [...filtered, parsed];
            });
          }
        };
        reader.readAsText(file);
      });

      // Reset input so same file can be re-uploaded
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [],
  );

  const removeSource = useCallback((name: string) => {
    setUploadedSources((prev) => prev.filter((s) => s.name !== name));
  }, []);

  const {
    data: espnData,
    isLoading,
    error,
    refetch,
  } = useQuery<ESPNResponse>({
    queryKey: ["draft-espn-global"],
    queryFn: () => api.get("/api/draft/espn?limit=500"),
  });

  const merged = useMemo(() => {
    if (!espnData?.players) return [];
    return matchPlayers(
      espnData.players,
      PITCHER_RANKINGS,
      HITTER_RANKINGS,
      RELIEVER_RANKINGS,
      combinedUploadMap,
    );
  }, [espnData, combinedUploadMap]);

  const matchCount = useMemo(
    () => merged.filter((p) => p.externalRank !== undefined).length,
    [merged],
  );

  const uploadMatchCount = useMemo(
    () => merged.filter((p) => p.uploadedValue !== undefined).length,
    [merged],
  );

  const totalUploadEntries = useMemo(
    () => uploadedSources.reduce((sum, s) => sum + s.entries.length, 0),
    [uploadedSources],
  );

  const filtered = useMemo(() => {
    let players = merged;

    if (position !== "ALL") {
      players = players.filter((p) => p.positions.includes(position));
    }

    players.sort((a, b) => {
      switch (sortKey) {
        case "espnAuctionValue":
          return b.espnAuctionValue - a.espnAuctionValue;
        case "averageDraftPosition":
          return (
            (a.averageDraftPosition || 999) - (b.averageDraftPosition || 999)
          );
        case "externalRank":
          return (a.externalRank || 999) - (b.externalRank || 999);
        case "rank":
          return a.rank - b.rank;
        case "playerName":
          return a.playerName.localeCompare(b.playerName);
        case "uploadedValue":
          return (b.uploadedValue ?? -1) - (a.uploadedValue ?? -1);
        case "valueDiff":
          return Math.abs(b.valueDiff ?? 0) - Math.abs(a.valueDiff ?? 0);
        case "rankDiff":
          return Math.abs(b.rankDiff ?? 0) - Math.abs(a.rankDiff ?? 0);
        default:
          return 0;
      }
    });

    return players;
  }, [merged, position, sortKey]);

  return (
    <Container size="wide" className="py-8">
      <PageHeader
        title="Draft Board"
        subtitle="ESPN auction values with PitcherList + CloserMonkey expert rankings"
        backLink={{ href: "/admin", label: "Back to Admin" }}
      />

      {/* CSV Upload */}
      <div className="mb-6 rounded-card border border-neutral-200 bg-surface-secondary p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.txt"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-body-sm font-medium text-content hover:bg-surface-secondary transition-colors"
          >
            <Upload className="h-4 w-4" />
            Upload Auction CSV
          </button>
          <span className="text-body-sm text-content-tertiary">
            CSV with &quot;Name&quot; and &quot;Dollars&quot; columns
          </span>

          {uploadedSources.map((src) => (
            <span
              key={src.name}
              className="inline-flex items-center gap-1.5 rounded-full bg-white border border-neutral-200 px-3 py-1 text-body-sm"
            >
              <span className="font-medium text-content">{src.name}</span>
              <span className="text-content-tertiary">
                {src.entries.length} players
              </span>
              <button
                onClick={() => removeSource(src.name)}
                className="ml-0.5 rounded-full p-0.5 text-content-tertiary hover:text-negative hover:bg-red-50 transition-colors"
                title={`Remove ${src.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {uploadedSources.length > 0 && (
            <span className="text-body-sm text-content-secondary">
              {totalUploadEntries} total / {uploadMatchCount} matched
            </span>
          )}
        </div>
      </div>

      {/* Rankings info */}
      <div className="mb-6 flex flex-wrap items-center gap-2 text-body-sm text-content-secondary">
        <Badge variant="info">{PITCHER_RANKINGS.length} SP rankings</Badge>
        <Badge variant="info">{RELIEVER_RANKINGS.length} RP rankings (CloserMonkey)</Badge>
        <Badge variant="info">{HITTER_RANKINGS.length} hitter rankings</Badge>
        {espnData && <span>{matchCount} matched to ESPN players</span>}
      </div>

      {/* Controls */}
      <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <div className="flex items-center gap-3">
          <label
            htmlFor="pos-filter"
            className="text-body-sm font-medium text-content whitespace-nowrap"
          >
            Position:
          </label>
          <select
            id="pos-filter"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            className="border border-neutral-300 rounded-lg px-3 py-2 text-body-sm text-content bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <label
            htmlFor="sort-select"
            className="text-body-sm font-medium text-content whitespace-nowrap"
          >
            Sort by:
          </label>
          <select
            id="sort-select"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="border border-neutral-300 rounded-lg px-3 py-2 text-body-sm text-content bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <option value="espnAuctionValue">ESPN Auction $</option>
            <option value="averageDraftPosition">ESPN ADP</option>
            <option value="rank">ESPN Rank</option>
            <option value="externalRank">External Rank</option>
            <option value="rankDiff">Rank +/- (ext vs ESPN)</option>
            {uploadedSources.length > 0 && (
              <option value="uploadedValue">CSV $</option>
            )}
            {uploadedSources.length > 0 && (
              <option value="valueDiff">Value +/- (biggest gaps)</option>
            )}
            <option value="playerName">Name</option>
          </select>
        </div>

        {espnData && (
          <span className="text-body-sm text-content-secondary">
            {filtered.length} of {espnData.players.length} players
          </span>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      )}

      {/* Error */}
      {error && (
        <ErrorAlert
          message={
            error instanceof Error
              ? error.message
              : "Failed to load ESPN draft data"
          }
          onRetry={() => refetch()}
        />
      )}

      {/* Table */}
      {!isLoading && !error && filtered.length > 0 && (
        <div className="rounded-card border border-neutral-200 bg-white shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-100">
              <thead className="bg-surface-secondary sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                    #
                  </th>
                  <th className="px-4 py-3 text-left text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                    Player
                  </th>
                  <th className="px-4 py-3 text-left text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                    Pos
                  </th>
                  <th className="px-4 py-3 text-right text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                    ESPN $
                  </th>
                  <th className="px-4 py-3 text-right text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                    Avg $
                  </th>
                  <th className="px-4 py-3 text-right text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                    ADP
                  </th>
                  {uploadedSources.length > 0 && (
                    <th className="px-4 py-3 text-right text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                      CSV $
                    </th>
                  )}
                  {uploadedSources.length > 0 && (
                    <th className="px-4 py-3 text-right text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                      +/-
                    </th>
                  )}
                  <th className="px-4 py-3 text-right text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                    Rank +/-
                  </th>
                  <th className="px-4 py-3 text-right text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                    Ext Rank
                  </th>
                  <th className="px-4 py-3 text-left text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                    Tier
                  </th>
                  <th className="px-4 py-3 text-right text-body-sm font-medium text-content-secondary uppercase tracking-wider">
                    Own%
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-neutral-100">
                {filtered.map((player, idx) => (
                  <tr
                    key={player.playerId}
                    className="hover:bg-surface-secondary transition-colors"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-data font-medium text-content">
                      {idx + 1}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-body-sm font-medium text-content">
                        {player.playerName}
                      </div>
                      <div className="text-body-sm text-content-tertiary">
                        {player.mlbTeam}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-body-sm text-content-secondary">
                      {player.positions.join("/")}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 whitespace-nowrap text-data text-right font-medium",
                        player.espnAuctionValue >= 20
                          ? "text-positive"
                          : player.espnAuctionValue >= 5
                            ? "text-content"
                            : "text-content-secondary",
                      )}
                    >
                      ${player.espnAuctionValue}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-data text-right text-content-secondary">
                      ${player.averageAuctionValue.toFixed(0)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-data text-right text-content-secondary">
                      {player.averageDraftPosition > 0
                        ? player.averageDraftPosition.toFixed(1)
                        : "\u2014"}
                    </td>
                    {uploadedSources.length > 0 && (
                      <td
                        className={cn(
                          "px-4 py-3 whitespace-nowrap text-data text-right font-medium",
                          player.uploadedValue != null && player.uploadedValue >= 20
                            ? "text-positive"
                            : player.uploadedValue != null && player.uploadedValue >= 5
                              ? "text-content"
                              : "text-content-secondary",
                        )}
                      >
                        {player.uploadedValue != null ? `$${player.uploadedValue}` : "\u2014"}
                      </td>
                    )}
                    {uploadedSources.length > 0 && (
                      <td
                        className={cn(
                          "px-4 py-3 whitespace-nowrap text-data text-right font-semibold",
                          player.valueDiff != null && player.valueDiff >= 5
                            ? "text-green-600"
                            : player.valueDiff != null && player.valueDiff > 0
                              ? "text-green-500"
                              : player.valueDiff != null && player.valueDiff <= -5
                                ? "text-red-600"
                                : player.valueDiff != null && player.valueDiff < 0
                                  ? "text-red-400"
                                  : "text-content-secondary",
                        )}
                      >
                        {player.valueDiff != null
                          ? `${player.valueDiff > 0 ? "+" : ""}${player.valueDiff}`
                          : "\u2014"}
                      </td>
                    )}
                    <td
                      className={cn(
                        "px-4 py-3 whitespace-nowrap text-data text-right",
                        player.rankDiff != null && player.rankDiff >= 20
                          ? "text-green-600 font-semibold"
                          : player.rankDiff != null && player.rankDiff > 0
                            ? "text-green-500"
                            : player.rankDiff != null && player.rankDiff <= -20
                              ? "text-red-600 font-semibold"
                              : player.rankDiff != null && player.rankDiff < 0
                                ? "text-red-400"
                                : player.rankDiff === 0
                                  ? "text-content-secondary"
                                  : "text-content-secondary",
                      )}
                    >
                      {player.rankDiff != null
                        ? player.rankDiff > 0
                          ? `+${player.rankDiff}`
                          : `${player.rankDiff}`
                        : "\u2014"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-data text-right text-content">
                      {player.externalRank != null ? (
                        <span className="inline-flex items-center gap-1">
                          {player.externalRank}
                          {player.externalSource && (
                            <span className="text-[10px] text-content-tertiary">
                              {player.externalSource}
                            </span>
                          )}
                        </span>
                      ) : (
                        "\u2014"
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {player.externalTier !== undefined ? (
                        <Badge variant={getTierVariant(player.externalTier)}>
                          T{player.externalTier}{" "}
                          {player.externalTierName &&
                            `\u00b7 ${player.externalTierName}`}
                        </Badge>
                      ) : (
                        <span className="text-body-sm text-content-tertiary">
                          {"\u2014"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-data text-right text-content-secondary">
                      {player.percentOwned > 0
                        ? `${player.percentOwned.toFixed(0)}%`
                        : "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-surface-secondary px-4 py-3 border-t border-neutral-100">
            <p className="text-body-sm text-content-secondary">
              {espnData?.meta.season} season &middot;{" "}
              {espnData?.meta.totalPlayers} ESPN players &middot;{" "}
              {matchCount} matched to external rankings
              {uploadedSources.length > 0 &&
                ` \u00b7 ${uploadMatchCount} of ${totalUploadEntries} CSV values matched`}
            </p>
          </div>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && filtered.length === 0 && (
        <div className="text-center py-12">
          <BarChart3 className="mx-auto h-12 w-12 text-content-tertiary" />
          <h3 className="mt-2 text-body-sm font-medium text-content">
            No players found
          </h3>
          <p className="mt-1 text-body-sm text-content-secondary">
            {position !== "ALL"
              ? `No players for position ${position}.`
              : "ESPN draft data not available."}
          </p>
        </div>
      )}
    </Container>
  );
}
