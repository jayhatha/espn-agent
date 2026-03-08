"use client";

import { useState, useEffect, useCallback } from "react";
import { useDraftLiveSocket } from "./useDraftLiveSocket";
import type { Alert, RemainingSlot, RosterPlayer, SimulationDecisionEntry } from "./useDraftLiveSocket";

// ---- Helpers ----

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function pct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

function dollar(n: number): string {
  return "$" + n.toFixed(0);
}

// ---- Sub-components ----

function ConnectionDot({ connected }: { connected: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={`inline-block w-2.5 h-2.5 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}
      />
      <span className={`text-sm font-medium ${connected ? "text-green-400" : "text-red-400"}`}>
        {connected ? "Connected" : "Disconnected"}
      </span>
    </span>
  );
}

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-neutral-900 rounded-xl p-4 ${className}`}>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-3">
      {children}
    </p>
  );
}

function BudgetPressureBar({ pressure }: { pressure: number }) {
  const pctWidth = Math.min(100, Math.max(0, pressure * 100));
  let barColor = "bg-green-500";
  if (pressure > 0.75) barColor = "bg-red-500";
  else if (pressure > 0.5) barColor = "bg-yellow-500";

  return (
    <div className="mt-1">
      <div className="flex justify-between text-xs text-neutral-400 mb-1">
        <span>Budget Pressure</span>
        <span>{pct(pressure)}</span>
      </div>
      <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pctWidth}%` }}
        />
      </div>
    </div>
  );
}

function AlertBadge({ severity }: { severity: number }) {
  let cls = "bg-neutral-700 text-neutral-300";
  if (severity >= 0.9) cls = "bg-red-800 text-red-200";
  else if (severity >= 0.7) cls = "bg-orange-800 text-orange-200";
  else if (severity >= 0.5) cls = "bg-yellow-800 text-yellow-200";
  const label = severity >= 0.9 ? "CRITICAL" : severity >= 0.7 ? "HIGH" : "MEDIUM";
  return (
    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${cls}`}>
      {label}
    </span>
  );
}

// ---- Main Page ----

const POSITIONS = ["All", "C", "1B", "2B", "3B", "SS", "OF", "SP", "RP"];
const WS_URL_KEY = "draft-live-ws-url";

function defaultWsUrl(): string {
  if (typeof window === "undefined") return "";
  const saved = localStorage.getItem(WS_URL_KEY);
  if (saved) return saved;
  return `ws://${window.location.hostname}:3001/draft/live?role=mobile`;
}

export default function DraftLivePage() {
  const [wsUrl, setWsUrl] = useState<string>("");
  const [inputUrl, setInputUrl] = useState<string>("");
  const [urlExpanded, setUrlExpanded] = useState(false);
  const [positionFilter, setPositionFilter] = useState<string>("All");
  const [splitValue, setSplitValue] = useState<number>(50);

  // Initialize on mount (client only — window.location)
  useEffect(() => {
    const url = defaultWsUrl();
    setWsUrl(url);
    setInputUrl(url);
  }, []);

  const { state, engineSignals, connected, sendControl } = useDraftLiveSocket(wsUrl);

  // Sync split slider with extension state when it arrives
  useEffect(() => {
    if (state?.pitcherHitterSplit !== undefined) {
      setSplitValue(state.pitcherHitterSplit);
    }
  }, [state?.pitcherHitterSplit]);

  const applyUrl = useCallback((url: string) => {
    localStorage.setItem(WS_URL_KEY, url);
    setWsUrl(url);
    setUrlExpanded(false);
  }, []);

  const handleUrlSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      applyUrl(inputUrl);
    },
    [inputUrl, applyUrl]
  );

  const handleAutoBidToggle = useCallback(() => {
    const next = !(state?.autoMode ?? false);
    sendControl("SET_AUTO_MODE", next);
  }, [state?.autoMode, sendControl]);

  const handlePositionChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setPositionFilter(e.target.value);
      sendControl("SET_POSITION_FILTER", e.target.value === "All" ? null : e.target.value);
    },
    [sendControl]
  );

  const handleSplitChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSplitValue(Number(e.target.value));
  }, []);

  const handleSplitCommit = useCallback(() => {
    sendControl("SET_PITCHER_HITTER_SPLIT", splitValue);
  }, [sendControl, splitValue]);

  const currentPlayer = state?.currentAuctionPlayer ?? null;
  const optimization = engineSignals?.optimization ?? null;
  const simulation = engineSignals?.simulation ?? null;
  const inflation = engineSignals?.inflation ?? null;
  const budgetCurve = engineSignals?.budgetCurve ?? null;
  const alerts: Alert[] = (engineSignals?.alerts ?? []).filter((a) => a.severity >= 0.5);
  const remainingSlots: RemainingSlot[] = engineSignals?.remainingSlots ?? [];
  const autoMode = state?.autoMode ?? false;
  const roster: RosterPlayer[] = state?.roster ?? [];

  // Determine if there's meaningful data
  const hasData = state !== null;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      {/* ---- Sticky Header ---- */}
      <header className="sticky top-0 z-50 bg-neutral-950 border-b border-neutral-800 px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <span className="text-base font-bold tracking-tight">Draft Companion</span>
          <div className="flex items-center gap-3">
            <ConnectionDot connected={connected} />
            <button
              type="button"
              onClick={() => setUrlExpanded((v) => !v)}
              className="text-xs text-neutral-500 underline min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Edit connection URL"
            >
              {urlExpanded ? "Close" : "URL"}
            </button>
          </div>
        </div>

        {/* Collapsible URL editor */}
        {urlExpanded && (
          <form onSubmit={handleUrlSubmit} className="mt-3 max-w-lg mx-auto flex gap-2">
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm font-mono text-neutral-100 min-h-[44px] focus:outline-none focus:border-neutral-500"
              placeholder="ws://192.168.1.x:3001/draft/live?role=mobile"
            />
            <button
              type="submit"
              className="bg-neutral-700 hover:bg-neutral-600 text-neutral-100 px-3 py-2 rounded-lg text-sm font-medium min-h-[44px] min-w-[44px]"
            >
              Connect
            </button>
          </form>
        )}
      </header>

      {/* ---- Main Content ---- */}
      <main className="flex-1 overflow-y-auto pb-24">
        <div className="max-w-lg mx-auto px-4 py-4 space-y-4">

          {/* Pre-connection state */}
          {!wsUrl && (
            <SectionCard>
              <p className="text-neutral-400 text-center py-4">
                Enter a WebSocket URL above to connect.
              </p>
            </SectionCard>
          )}

          {wsUrl && !connected && (
            <div className="text-center py-6 text-neutral-400">
              <p className="text-lg">Connecting...</p>
              <p className="text-xs mt-1 font-mono text-neutral-600">{wsUrl}</p>
            </div>
          )}

          {connected && !hasData && (
            <SectionCard>
              <p className="text-neutral-400 text-center py-4">
                Waiting for draft data...
              </p>
              <p className="text-xs text-center text-neutral-600 mt-1">
                Make sure the ESPN extension is open and a draft is in progress.
              </p>
            </SectionCard>
          )}

          {/* Extension not connected warning */}
          {connected && hasData && !currentPlayer && !engineSignals && (
            <SectionCard className="border border-yellow-800">
              <p className="text-yellow-400 text-sm text-center">
                Extension not connected — no live data received yet.
              </p>
            </SectionCard>
          )}

          {/* ---- Current Nomination ---- */}
          {hasData && (
            <SectionCard>
              <SectionTitle>Current Nomination</SectionTitle>
              {currentPlayer ? (
                <>
                  <p className="text-2xl font-bold leading-tight">{currentPlayer.playerName}</p>
                  <p className="text-neutral-400 text-sm mt-0.5">
                    {currentPlayer.positions?.join("/") ?? ""}
                    {currentPlayer.nominatingTeam && (
                      <span className="ml-2 text-neutral-600">
                        — nominated by {currentPlayer.nominatingTeam}
                      </span>
                    )}
                  </p>

                  {currentPlayer.currentBid !== undefined && (
                    <p className="text-neutral-300 font-mono mt-2">
                      Current bid:{" "}
                      <span className="text-xl font-bold text-white">
                        {dollar(currentPlayer.currentBid)}
                      </span>
                    </p>
                  )}

                  {optimization && (
                    <div className="mt-3 space-y-1">
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm text-neutral-400">Max Bid</span>
                        <span
                          className={`text-3xl font-bold font-mono ${
                            optimization.shouldBid ? "text-green-400" : "text-red-400"
                          }`}
                        >
                          {dollar(optimization.maxBid)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm text-neutral-400">Verdict</span>
                        <span
                          className={`text-lg font-bold uppercase tracking-wider ${
                            optimization.shouldBid ? "text-green-400" : "text-red-400"
                          }`}
                        >
                          {optimization.shouldBid ? "BID" : "PASS"}
                        </span>
                      </div>

                      <div className="flex justify-between text-sm">
                        <span className="text-neutral-400">Value Surplus</span>
                        <span
                          className={`font-mono ${
                            optimization.valueSurplus >= 0 ? "text-green-400" : "text-red-400"
                          }`}
                        >
                          {optimization.valueSurplus >= 0 ? "+" : ""}
                          {dollar(optimization.valueSurplus)}
                        </span>
                      </div>

                      <div className="flex justify-between text-sm">
                        <span className="text-neutral-400">Market Price</span>
                        <span className="font-mono text-neutral-300">
                          {dollar(optimization.expectedMarketPrice)}
                        </span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-neutral-400 py-3 text-center">Waiting for nomination...</p>
              )}
            </SectionCard>
          )}

          {/* ---- Win Probability ---- */}
          {hasData && simulation && (
            <SectionCard>
              <SectionTitle>Win Probability</SectionTitle>
              {simulation.winProbability ? (
                <>
                  <div className="flex items-end gap-4">
                    <div>
                      <p className="text-4xl font-bold font-mono text-green-400">
                        {pct(simulation.winProbability.winProbability)}
                      </p>
                      <p className="text-xs text-neutral-500 mt-0.5">Win probability</p>
                    </div>
                    <div className="pb-1">
                      <p className="text-2xl font-bold font-mono text-neutral-200">
                        {ordinal(simulation.winProbability.expectedFinish)}
                      </p>
                      <p className="text-xs text-neutral-500">Expected finish</p>
                    </div>
                    <div className="pb-1">
                      <p className="text-xl font-mono text-neutral-300">
                        {pct(simulation.winProbability.top3Probability)}
                      </p>
                      <p className="text-xs text-neutral-500">Top-3</p>
                    </div>
                  </div>

                  {/* Bid vs Pass comparison */}
                  {simulation.currentDecision &&
                    simulation.currentDecision.decisions.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <p className="text-xs text-neutral-500 uppercase tracking-widest">
                          Decision Comparison
                        </p>
                        {simulation.currentDecision.decisions.map(
                          (d: SimulationDecisionEntry, i: number) => (
                            <div
                              key={i}
                              className="flex justify-between items-center bg-neutral-800 rounded-lg px-3 py-2"
                            >
                              <span className="text-sm text-neutral-300">{d.label}</span>
                              <span className="font-mono text-sm text-neutral-100">
                                {ordinal(d.outcome.expectedFinish)}
                              </span>
                            </div>
                          )
                        )}
                      </div>
                    )}
                </>
              ) : (
                <p className="text-neutral-500 text-sm">No simulation data yet</p>
              )}
            </SectionCard>
          )}

          {/* ---- Budget & Inflation ---- */}
          {hasData && (
            <SectionCard>
              <SectionTitle>Budget & Inflation</SectionTitle>
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-neutral-400 text-sm">Remaining Budget</span>
                  <span className="text-3xl font-bold font-mono text-white">
                    {state ? dollar(state.remainingBudget) : "—"}
                  </span>
                </div>

                {budgetCurve && <BudgetPressureBar pressure={budgetCurve.budgetPressure} />}

                {inflation && (
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-400">Inflation Factor</span>
                    <span className="font-mono text-neutral-300">
                      {pct(inflation.inflationFactor - 1)} above market
                    </span>
                  </div>
                )}

                {remainingSlots.length > 0 && (
                  <div>
                    <p className="text-xs text-neutral-500 uppercase tracking-widest mb-2">
                      Remaining Slots
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {remainingSlots.map((slot) => (
                        <span
                          key={slot.position}
                          className="text-xs bg-neutral-800 rounded px-2 py-1 font-mono text-neutral-300"
                        >
                          {slot.position}: {slot.count}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {/* ---- My Roster ---- */}
          {hasData && roster.length > 0 && (
            <SectionCard>
              <SectionTitle>My Roster ({roster.length})</SectionTitle>
              <div className="space-y-1">
                {roster.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between bg-neutral-800 rounded-lg px-3 py-2"
                  >
                    <div>
                      <span className="text-sm text-neutral-100">{p.playerName}</span>
                      <span className="ml-2 text-xs text-neutral-500">
                        {p.positions.join("/")}
                      </span>
                    </div>
                    {p.cost !== undefined && (
                      <span className="text-sm font-mono text-neutral-400">
                        {dollar(p.cost)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* ---- Alerts ---- */}
          {hasData && alerts.length > 0 && (
            <SectionCard>
              <SectionTitle>Alerts</SectionTitle>
              <div className="space-y-2">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-start gap-2 bg-neutral-800 rounded-lg px-3 py-2"
                  >
                    <AlertBadge severity={alert.severity} />
                    <p className="text-sm text-neutral-200 leading-snug">{alert.message}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      </main>

      {/* ---- Sticky Control Bar ---- */}
      {hasData && (
        <footer className="sticky bottom-0 z-50 bg-neutral-900 border-t border-neutral-800 px-4 py-3">
          <div className="max-w-lg mx-auto flex items-center gap-3">
            {/* Auto-bid toggle */}
            <button
              type="button"
              onClick={handleAutoBidToggle}
              className={`min-h-[44px] px-3 py-2 rounded-lg text-sm font-bold uppercase tracking-wide transition-colors ${
                autoMode
                  ? "bg-red-700 hover:bg-red-600 text-white"
                  : "bg-neutral-700 hover:bg-neutral-600 text-neutral-300"
              }`}
              aria-label={autoMode ? "Auto-bid ON — tap to disable" : "Auto-bid OFF — tap to enable"}
            >
              Auto {autoMode ? "ON" : "OFF"}
            </button>

            {/* Position filter */}
            <select
              value={positionFilter}
              onChange={handlePositionChange}
              className="flex-1 min-h-[44px] bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-2 text-sm text-neutral-100 focus:outline-none focus:border-neutral-500"
              aria-label="Position filter"
            >
              {POSITIONS.map((pos) => (
                <option key={pos} value={pos}>
                  {pos}
                </option>
              ))}
            </select>

            {/* Pitcher/Hitter split */}
            <div className="flex flex-col items-center gap-0.5 min-w-[72px]">
              <input
                type="range"
                min={0}
                max={100}
                value={splitValue}
                onChange={handleSplitChange}
                onMouseUp={handleSplitCommit}
                onTouchEnd={handleSplitCommit}
                // onMouseUp/onTouchEnd fire when user releases slider — send control at that point
                className="w-full min-h-[44px] accent-blue-500"
                aria-label="Pitcher/hitter split"
              />
              <span className="text-[10px] text-neutral-500">
                P {100 - splitValue} / H {splitValue}
              </span>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
