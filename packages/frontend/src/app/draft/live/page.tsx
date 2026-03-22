"use client";

import { useState, useEffect, useCallback } from "react";
import { useDraftLiveSocket } from "./useDraftLiveSocket";
import { useWakeLock } from "./useWakeLock";
import { ConnectionBanner } from "./components/ConnectionBanner";
import { LiveTab } from "./tabs/LiveTab";

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

// ---- Main Page ----

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
  // Removed tab system — single-page LiveTab only

  // Initialize on mount (client only - window.location)
  useEffect(() => {
    const url = defaultWsUrl();
    setWsUrl(url);
    setInputUrl(url);
  }, []);

  const { state, engineSignals, connected, extensionConnected, sendControl } =
    useDraftLiveSocket(wsUrl);

  // Wake lock keeps phone screen on during draft
  useWakeLock();

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

  // Determine if there's meaningful data
  const hasData = state !== null;

  return (
    <div className="min-h-screen bg-[#181b1f] text-[#d9dde6] flex flex-col">
      {/* ---- Sticky Header ---- */}
      <header className="sticky top-0 z-50 bg-[#181b1f] border-b border-[#2d3139] px-4 py-3">
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

      {/* ---- Extension Connection Banner ---- */}
      <ConnectionBanner extensionConnected={extensionConnected} wsConnected={connected} />

      {/* ---- Content ---- */}
      <main className="flex-1 overflow-y-auto">
        <LiveTab
          state={state}
          engineSignals={engineSignals}
          hasData={hasData}
          wsConnected={connected}
          wsUrl={wsUrl}
          positionFilter={positionFilter}
          splitValue={splitValue}
          onPositionFilterChange={setPositionFilter}
          onSplitValueChange={setSplitValue}
          sendControl={sendControl}
        />
      </main>
    </div>
  );
}
