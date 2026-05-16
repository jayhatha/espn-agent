"use client";

import { useMemo, useState } from "react";
import { Container } from "@/components/ui/Container";
import { Heading } from "@/components/ui/Heading";
import { cn } from "@/lib/cn";
import {
  calculateAVG,
  calculateERA,
  calculateWHIP,
} from "@espn-fantasy/shared";

// ── Types ────────────────────────────────────────────

interface RosterPlayer {
  player_id: number;
  player_name: string;
  mlb_team: string | null;
  positions: string[];
  roster_status: string;
  roster_slot: string | null;
  acquisition_type: string | null;
}

interface EnrichedRosterPlayer {
  playerId: number;
  playerName: string;
  mlbTeam: string | null;
  positions: string[];
  rosterStatus: string;
  rosterSlot: string | null;
  projections: Record<string, number> | null;
  currentStats: Record<string, number> | null;
  advancedStats: {
    babip: number | null;
    xba: number | null;
    xslg: number | null;
    xwoba: number | null;
    iso: number | null;
    kBbPct: number | null;
    k9: number | null;
    fip: number | null;
    xfip: number | null;
    xera: number | null;
    siera: number | null;
  } | null;
  tenureStats: Record<string, number> | null;
}

interface GroupedRoster {
  active: RosterPlayer[];
  bench: RosterPlayer[];
  il: RosterPlayer[];
}

interface RosterSectionProps {
  groupedRoster: GroupedRoster | null;
  hasRosterData: boolean;
  enrichedRoster: EnrichedRosterPlayer[] | null;
  enrichedRosterIsLoading?: boolean;
}

// ── Helpers ──────────────────────────────────────────

function isPitcher(positions: string[]) {
  return positions.some((p) => ["SP", "RP", "P"].includes(p));
}

function fmtInt(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "--";
  return String(Math.round(v));
}

function fmtRate(v: number | null | undefined, decimals: number): string {
  if (v == null || isNaN(v) || !isFinite(v)) return "--";
  return v.toFixed(decimals);
}

function fmtPercent(v: number | null | undefined): string {
  if (v == null || isNaN(v) || !isFinite(v)) return "--";
  return `${v.toFixed(1)}%`;
}

const TH =
  "px-2 py-2 text-left text-caption font-semibold uppercase tracking-widest text-content-secondary whitespace-nowrap";
const TH_R =
  "px-2 py-2 text-right text-caption font-semibold uppercase tracking-widest text-content-secondary whitespace-nowrap";
const TD_R =
  "px-2 py-2 text-right font-mono text-data text-content dark:text-shell-text whitespace-nowrap";

function SortTh({
  label,
  sortKey,
  currentKey,
  dir,
  onSort,
  right = true,
}: {
  label: string;
  sortKey: string;
  currentKey: string;
  dir: "asc" | "desc";
  onSort: (k: string) => void;
  right?: boolean;
}) {
  const active = currentKey === sortKey;
  return (
    <th
      className={cn(
        right ? TH_R : TH,
        "cursor-pointer select-none hover:text-content transition-colors",
      )}
      onClick={() => onSort(sortKey)}
    >
      {label}
      {active && (
        <span className="ml-0.5 text-shell-accent">
          {dir === "asc" ? "↑" : "↓"}
        </span>
      )}
    </th>
  );
}

function sortRows<T extends Record<string, any>>(
  data: T[],
  key: string,
  dir: "asc" | "desc",
): T[] {
  return [...data].sort((a, b) => {
    const av = a[key],
      bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "string" && typeof bv === "string")
      return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    return dir === "asc"
      ? (av as number) - (bv as number)
      : (bv as number) - (av as number);
  });
}

// ── Stat column definitions ───────────────────────────

const HITTER_STAT_KEYS = [
  "HR",
  "R",
  "RBI",
  "SB",
  "AVG",
  "BABIP",
  "xBA",
  "xSLG",
  "xwOBA",
  "ISO",
] as const;
const PITCHER_STAT_KEYS = [
  "W",
  "SV",
  "K",
  "ERA",
  "WHIP",
  "KBBPct",
  "K9",
  "FIP",
  "xFIP",
  "xERA",
  "SIERA",
] as const;

const HITTER_LABELS: Record<string, string> = {
  HR: "HR",
  R: "R",
  RBI: "RBI",
  SB: "SB",
  AVG: "AVG",
  BABIP: "BABIP",
  xBA: "xBA",
  xSLG: "xSLG",
  xwOBA: "xwOBA",
  ISO: "ISO",
};

const PITCHER_LABELS: Record<string, string> = {
  W: "W",
  SV: "SV",
  K: "K",
  ERA: "ERA",
  WHIP: "WHIP",
  KBBPct: "K-BB%",
  K9: "K/9",
  FIP: "FIP",
  xFIP: "xFIP",
  xERA: "xERA",
  SIERA: "SIERA",
};

function buildRow(p: EnrichedRosterPlayer) {
  const pitch = isPitcher(p.positions);
  const proj = p.projections ?? {};
  const adv = p.advancedStats;
  const ab = proj.AB ?? 0;
  const ip = proj.IP ?? 0;
  return {
    id: p.playerId,
    name: p.playerName,
    team: p.mlbTeam ?? "--",
    positions: p.positions.join(", "),
    slot: p.rosterSlot ?? (p.rosterStatus === "bench" ? "BE" : "IL"),
    status: p.rosterStatus,
    // hitter stats
    HR: !pitch ? (proj.HR ?? null) : null,
    R: !pitch ? (proj.R ?? null) : null,
    RBI: !pitch ? (proj.RBI ?? null) : null,
    SB: !pitch ? (proj.SB ?? null) : null,
    AVG: !pitch && ab > 0 ? calculateAVG(proj) : null,
    BABIP: !pitch ? (adv?.babip ?? null) : null,
    xBA: !pitch ? (adv?.xba ?? null) : null,
    xSLG: !pitch ? (adv?.xslg ?? null) : null,
    xwOBA: !pitch ? (adv?.xwoba ?? null) : null,
    ISO: !pitch ? (adv?.iso ?? null) : null,
    // pitcher stats
    W: pitch ? (proj.W ?? null) : null,
    SV: pitch ? (proj.SV ?? null) : null,
    K: pitch ? (proj.K ?? null) : null,
    ERA: pitch && ip > 0 ? calculateERA(proj) : null,
    WHIP: pitch && ip > 0 ? calculateWHIP(proj) : null,
    KBBPct: pitch ? (adv?.kBbPct ?? null) : null,
    K9: pitch ? (adv?.k9 ?? null) : null,
    FIP: pitch ? (adv?.fip ?? null) : null,
    xFIP: pitch ? (adv?.xfip ?? null) : null,
    xERA: pitch ? (adv?.xera ?? null) : null,
    SIERA: pitch ? (adv?.siera ?? null) : null,
    _isPitcher: pitch,
  };
}

function renderHitterCell(key: string, row: ReturnType<typeof buildRow>) {
  switch (key) {
    case "HR":
    case "R":
    case "RBI":
    case "SB":
    case "K":
      return fmtInt(row[key as keyof typeof row] as number | null);
    case "AVG":
    case "BABIP":
    case "xBA":
    case "xSLG":
    case "xwOBA":
    case "ISO":
      return fmtRate(row[key as keyof typeof row] as number | null, 3);
    default:
      return "--";
  }
}

function renderPitcherCell(key: string, row: ReturnType<typeof buildRow>) {
  switch (key) {
    case "W":
    case "SV":
    case "K":
      return fmtInt(row[key as keyof typeof row] as number | null);
    case "ERA":
    case "WHIP":
    case "FIP":
    case "xFIP":
    case "xERA":
    case "SIERA":
      return fmtRate(row[key as keyof typeof row] as number | null, 2);
    case "K9":
      return fmtRate(row[key as keyof typeof row] as number | null, 1);
    case "KBBPct":
      return fmtPercent(row[key as keyof typeof row] as number | null);
    default:
      return "--";
  }
}

// ── Sub-tables ───────────────────────────────────────

function HitterTable({ rows }: { rows: ReturnType<typeof buildRow>[] }) {
  const [sortKey, setSortKey] = useState("slot");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function onSort(k: string) {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  }

  const sorted = sortRows(rows, sortKey, sortDir);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-neutral-200 dark:divide-shell-border">
        <thead>
          <tr className="border-b-2 border-neutral-200 dark:border-shell-border">
            <SortTh
              label="Slot"
              sortKey="slot"
              currentKey={sortKey}
              dir={sortDir}
              onSort={onSort}
              right={false}
            />
            <SortTh
              label="Player"
              sortKey="name"
              currentKey={sortKey}
              dir={sortDir}
              onSort={onSort}
              right={false}
            />
            <th className={TH}>Team</th>
            <th className={TH}>Pos</th>
            {HITTER_STAT_KEYS.map((k) => (
              <SortTh
                key={k}
                label={HITTER_LABELS[k]}
                sortKey={k}
                currentKey={sortKey}
                dir={sortDir}
                onSort={onSort}
              />
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-shell-border">
          {sorted.map((row) => (
            <tr
              key={row.id}
              className={row.status === "bench" ? "opacity-70" : ""}
            >
              <td className="px-2 py-2 text-data font-medium text-content-secondary whitespace-nowrap">
                {row.slot}
              </td>
              <td className="px-2 py-2 text-body-sm font-medium text-content dark:text-shell-text whitespace-nowrap">
                {row.name}
              </td>
              <td className="px-2 py-2 text-data text-content-secondary dark:text-shell-muted whitespace-nowrap">
                {row.team}
              </td>
              <td className="px-2 py-2 text-data text-content-secondary dark:text-shell-muted whitespace-nowrap">
                {row.positions}
              </td>
              {HITTER_STAT_KEYS.map((k) => (
                <td key={k} className={TD_R}>
                  {renderHitterCell(k, row)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={14}
                className="px-4 py-6 text-center text-body-sm text-content-secondary"
              >
                No hitters
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function PitcherTable({ rows }: { rows: ReturnType<typeof buildRow>[] }) {
  const [sortKey, setSortKey] = useState("slot");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function onSort(k: string) {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  }

  const sorted = sortRows(rows, sortKey, sortDir);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-neutral-200 dark:divide-shell-border">
        <thead>
          <tr className="border-b-2 border-neutral-200 dark:border-shell-border">
            <SortTh
              label="Slot"
              sortKey="slot"
              currentKey={sortKey}
              dir={sortDir}
              onSort={onSort}
              right={false}
            />
            <SortTh
              label="Player"
              sortKey="name"
              currentKey={sortKey}
              dir={sortDir}
              onSort={onSort}
              right={false}
            />
            <th className={TH}>Team</th>
            <th className={TH}>Pos</th>
            {PITCHER_STAT_KEYS.map((k) => (
              <SortTh
                key={k}
                label={PITCHER_LABELS[k]}
                sortKey={k}
                currentKey={sortKey}
                dir={sortDir}
                onSort={onSort}
              />
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-shell-border">
          {sorted.map((row) => (
            <tr
              key={row.id}
              className={row.status === "bench" ? "opacity-70" : ""}
            >
              <td className="px-2 py-2 text-data font-medium text-content-secondary whitespace-nowrap">
                {row.slot}
              </td>
              <td className="px-2 py-2 text-body-sm font-medium text-content dark:text-shell-text whitespace-nowrap">
                {row.name}
              </td>
              <td className="px-2 py-2 text-data text-content-secondary dark:text-shell-muted whitespace-nowrap">
                {row.team}
              </td>
              <td className="px-2 py-2 text-data text-content-secondary dark:text-shell-muted whitespace-nowrap">
                {row.positions}
              </td>
              {PITCHER_STAT_KEYS.map((k) => (
                <td key={k} className={TD_R}>
                  {renderPitcherCell(k, row)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={15}
                className="px-4 py-6 text-center text-body-sm text-content-secondary"
              >
                No pitchers
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── IL list (no stats) ────────────────────────────────

function ILTable({ players }: { players: RosterPlayer[] }) {
  if (players.length === 0) return null;
  return (
    <div>
      <h3 className="text-body-sm font-semibold text-negative dark:text-negative-dark uppercase tracking-wider mb-2">
        Injured List ({players.length})
      </h3>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-200 dark:divide-shell-border">
          <thead className="bg-negative-light dark:bg-negative-dark-bg/30">
            <tr className="border-b-2 border-negative-border dark:border-negative-dark-border">
              {["Slot", "Player", "Team", "Positions"].map((h) => (
                <th
                  key={h}
                  className="pb-2 pt-1 px-2 text-caption font-semibold uppercase tracking-widest text-negative dark:text-negative-dark text-left"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-shell-border">
            {players.map((p) => (
              <tr
                key={p.player_id}
                className="bg-negative-light/30 dark:bg-negative-dark-bg/20"
              >
                <td className="px-2 py-2 text-data font-medium text-negative dark:text-negative-dark w-12">
                  IL
                </td>
                <td className="px-2 py-2 text-body-sm font-medium text-content dark:text-shell-text">
                  {p.player_name}
                </td>
                <td className="px-2 py-2 text-body-sm text-content-secondary dark:text-shell-muted">
                  {p.mlb_team || "-"}
                </td>
                <td className="px-2 py-2 text-body-sm text-content-secondary dark:text-shell-muted">
                  {(p.positions || []).join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────

export function RosterSection({
  groupedRoster,
  hasRosterData,
  enrichedRoster,
  enrichedRosterIsLoading = false,
}: RosterSectionProps) {
  const rows = useMemo(
    () => (enrichedRoster ?? []).map(buildRow),
    [enrichedRoster],
  );
  const hitters = useMemo(() => rows.filter((r) => !r._isPitcher), [rows]);
  const pitchers = useMemo(() => rows.filter((r) => r._isPitcher), [rows]);

  return (
    <section className="bg-white dark:bg-shell-panel py-8">
      <Container size="wide">
        <Heading
          level={2}
          className="mb-6 text-content dark:text-shell-text font-semibold"
        >
          Roster
        </Heading>
        {hasRosterData ? (
          <div className="space-y-8">
            {/* Hitters */}
            <div>
              <h3 className="text-body-sm font-semibold text-content-secondary dark:text-shell-muted uppercase tracking-wider mb-3">
                Hitters
              </h3>
              {enrichedRosterIsLoading ? (
                <div className="text-body-sm text-content-secondary dark:text-shell-muted py-4 animate-pulse">
                  Loading stats…
                </div>
              ) : enrichedRoster ? (
                <HitterTable rows={hitters} />
              ) : (
                groupedRoster && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-neutral-200 dark:divide-shell-border">
                      <thead>
                        <tr className="border-b-2 border-neutral-200 dark:border-shell-border">
                          {["Slot", "Player", "Team", "Positions"].map((h) => (
                            <th
                              key={h}
                              className="pb-2 pt-1 pr-4 text-caption font-semibold uppercase tracking-widest text-content-secondary text-left"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 dark:divide-shell-border">
                        {[...groupedRoster.active, ...groupedRoster.bench]
                          .filter((p) => !isPitcher(p.positions))
                          .map((p) => (
                            <tr key={p.player_id}>
                              <td className="py-2 pr-4 text-data font-medium text-content-secondary w-12">
                                {p.roster_slot ?? "BE"}
                              </td>
                              <td className="py-2 pr-4 text-body-sm font-medium text-content dark:text-shell-text">
                                {p.player_name}
                              </td>
                              <td className="py-2 pr-4 text-body-sm text-content-secondary dark:text-shell-muted">
                                {p.mlb_team || "-"}
                              </td>
                              <td className="py-2 pr-4 text-body-sm text-content-secondary dark:text-shell-muted">
                                {(p.positions || []).join(", ")}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>

            {/* Pitchers */}
            <div>
              <h3 className="text-body-sm font-semibold text-content-secondary dark:text-shell-muted uppercase tracking-wider mb-3">
                Pitchers
              </h3>
              {enrichedRosterIsLoading ? (
                <div className="text-body-sm text-content-secondary dark:text-shell-muted py-4 animate-pulse">
                  Loading stats…
                </div>
              ) : enrichedRoster ? (
                <PitcherTable rows={pitchers} />
              ) : (
                groupedRoster && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-neutral-200 dark:divide-shell-border">
                      <thead>
                        <tr className="border-b-2 border-neutral-200 dark:border-shell-border">
                          {["Slot", "Player", "Team", "Positions"].map((h) => (
                            <th
                              key={h}
                              className="pb-2 pt-1 pr-4 text-caption font-semibold uppercase tracking-widest text-content-secondary text-left"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 dark:divide-shell-border">
                        {[...groupedRoster.active, ...groupedRoster.bench]
                          .filter((p) => isPitcher(p.positions))
                          .map((p) => (
                            <tr key={p.player_id}>
                              <td className="py-2 pr-4 text-data font-medium text-content-secondary w-12">
                                {p.roster_slot ?? "BE"}
                              </td>
                              <td className="py-2 pr-4 text-body-sm font-medium text-content dark:text-shell-text">
                                {p.player_name}
                              </td>
                              <td className="py-2 pr-4 text-body-sm text-content-secondary dark:text-shell-muted">
                                {p.mlb_team || "-"}
                              </td>
                              <td className="py-2 pr-4 text-body-sm text-content-secondary dark:text-shell-muted">
                                {(p.positions || []).join(", ")}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>

            {/* IL */}
            {groupedRoster && <ILTable players={groupedRoster.il} />}
          </div>
        ) : (
          <p className="text-body-sm text-content-secondary">
            No roster data available for this snapshot.
          </p>
        )}
      </Container>
    </section>
  );
}
