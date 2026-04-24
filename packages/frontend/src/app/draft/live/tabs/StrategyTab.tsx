"use client";

import { CategoryProgressBar } from "../components/CategoryProgressBar";
import type { CategoryProgress } from "../components/CategoryProgressBar";
import { IdealRosterList } from "../components/IdealRosterList";
import type { IdealRosterPlayer } from "../components/IdealRosterList";

// ---- Local type definitions ----
// These mirror the WS relay types. Plan 41-03 may consolidate into useDraftLiveSocket.ts.

interface ScarcitySignal {
  position: string;
  supply: number;
  demand: number;
  tierDropValue: number;
}

interface WinProbabilityOutcome {
  winProbability: number;
  expectedFinish: number;
  top3Probability: number;
}

interface SimulationSignal {
  winProbability: WinProbabilityOutcome | null;
}

interface IdealRosterSignal {
  players: IdealRosterPlayer[];
  totalSGPValue: number;
  budgetUsed: number;
  unfilledSlots: number;
  anchorCount: number;
  coreCount: number;
  valueCount: number;
  categoryProgress?: CategoryProgress[];
}

interface BuildArchetypeSignal {
  archetypeLabel: string | null;
  archetypeConfidence: number;
}

interface EngineSignals {
  idealRoster?: IdealRosterSignal | null;
  scarcity?: ScarcitySignal[] | null;
  archetype?: BuildArchetypeSignal | null;
  simulation?: SimulationSignal | null;
  [key: string]: unknown;
}

// ---- Helpers ----

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function pct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

// ---- Sub-components ----

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-grafana-bg rounded-xl p-4 ${className}`}>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-grafana-muted mb-3">
      {children}
    </p>
  );
}

// ---- StrategyTab ----

interface StrategyTabProps {
  engineSignals: EngineSignals | null;
  simulation: SimulationSignal | null;
}

export function StrategyTab({ engineSignals, simulation }: StrategyTabProps) {
  const idealRoster = engineSignals?.idealRoster ?? null;
  const scarcity = engineSignals?.scarcity ?? null;
  const archetype = engineSignals?.archetype ?? null;
  const winProb = simulation?.winProbability ?? null;

  // Sort category progress: below target first (lowest percent), then above target
  const sortedCategories = [...(idealRoster?.categoryProgress ?? [])].sort(
    (a, b) => a.percent - b.percent
  );

  // Sort scarcity by tierDropValue descending
  const sortedScarcity = [...(scarcity ?? [])].sort(
    (a, b) => b.tierDropValue - a.tierDropValue
  );

  return (
    <div className="space-y-4">
      {/* 1. Win Probability (compact) */}
      <SectionCard>
        <SectionTitle>Win Probability</SectionTitle>
        {winProb ? (
          <div className="flex items-end gap-4">
            <div>
              <p className="text-3xl font-bold font-mono text-positive-dark">
                {pct(winProb.winProbability)}
              </p>
              <p className="text-caption text-grafana-muted mt-0.5">Win prob</p>
            </div>
            <div className="pb-0.5">
              <p className="text-xl font-bold font-mono text-grafana-text">
                {ordinal(winProb.expectedFinish)}
              </p>
              <p className="text-caption text-grafana-muted">Finish</p>
            </div>
            <div className="pb-0.5">
              <p className="text-lg font-mono text-grafana-muted">
                {pct(winProb.top3Probability)}
              </p>
              <p className="text-caption text-grafana-muted">Top-3</p>
            </div>
          </div>
        ) : (
          <p className="text-grafana-muted text-sm">No simulation data yet</p>
        )}
      </SectionCard>

      {/* 2. Build Archetype */}
      <SectionCard>
        <SectionTitle>Build Archetype</SectionTitle>
        {archetype?.archetypeLabel ? (
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${
                archetype.archetypeConfidence > 0.5 ? "bg-grafana-positive" : "bg-grafana-warning"
              }`}
            />
            <span className="text-lg font-bold text-grafana-text">
              {archetype.archetypeLabel}
            </span>
          </div>
        ) : (
          <p className="text-grafana-muted text-sm">
            Archetype analysis available after 3+ picks
          </p>
        )}
      </SectionCard>

      {/* 3. Category Progress */}
      <SectionCard>
        <SectionTitle>Category Progress</SectionTitle>
        {sortedCategories.length > 0 ? (
          <div className="space-y-1.5">
            {sortedCategories.map((cp) => (
              <CategoryProgressBar key={cp.statKey} progress={cp} />
            ))}
          </div>
        ) : (
          <p className="text-grafana-muted text-sm">
            Category targets available when ideal roster computes
          </p>
        )}
      </SectionCard>

      {/* 4. Ideal Roster */}
      <SectionCard>
        <SectionTitle>Ideal Roster</SectionTitle>
        {idealRoster && idealRoster.players.length > 0 ? (
          <>
            <IdealRosterList
              players={idealRoster.players}
              anchorCount={idealRoster.anchorCount}
              coreCount={idealRoster.coreCount}
              valueCount={idealRoster.valueCount}
            />
            <div className="flex justify-between mt-3 text-xs text-grafana-muted">
              <span>Budget used: ${Math.round(idealRoster.budgetUsed)}</span>
              <span>Unfilled: {idealRoster.unfilledSlots}</span>
            </div>
          </>
        ) : (
          <p className="text-grafana-muted text-sm">
            Ideal roster available after rankings load
          </p>
        )}
      </SectionCard>

      {/* 5. Scarcity Alerts */}
      <SectionCard>
        <SectionTitle>Scarcity Alerts</SectionTitle>
        {sortedScarcity.length > 0 ? (
          <div className="space-y-1.5">
            {sortedScarcity.map((s) => {
              let dotColor = "bg-grafana-positive";
              if (s.supply < s.demand) dotColor = "bg-grafana-negative";
              else if (s.supply === s.demand) dotColor = "bg-grafana-warning";

              return (
                <div
                  key={s.position}
                  className="flex items-center justify-between bg-grafana-panel rounded-lg px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                    <span className="text-sm text-grafana-text font-medium">
                      {s.position}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-grafana-muted">
                      {s.supply}/{s.demand}
                    </span>
                    <span className="font-mono text-grafana-muted">
                      ${Math.round(s.tierDropValue)} gap
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-grafana-muted text-sm">No position scarcity alerts</p>
        )}
      </SectionCard>
    </div>
  );
}
