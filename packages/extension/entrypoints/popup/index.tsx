import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import PreDraftRankingEditor from "../../components/PreDraftRankingEditor";
import {
  parseFanGraphsBatterCSV,
  parseFanGraphsPitcherCSV,
  parseESPNAuctionCSV,
} from "../../lib/csv-parser";
import { useDraftStore } from "../../lib/draft-state";
import { normalizeName as normalizePlayerName } from "../../lib/engine/normalizer";
import "../styles/popup.css";

type TabType = "settings" | "rankings" | "data";

// ─── Tab button style helper ──────────────────────────────────────────────────
function tabStyle(isActive: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: "12px 8px",
    fontSize: "13px",
    fontWeight: isActive ? "600" : "400",
    color: isActive ? "#2563eb" : "#6b7280",
    backgroundColor: isActive ? "#ffffff" : "transparent",
    border: "none",
    borderBottom: isActive ? "2px solid #2563eb" : "2px solid transparent",
    cursor: "pointer",
  };
}

// ─── Data Tab Component ───────────────────────────────────────────────────────
function DataTab() {
  const [hitterCSV, setHitterCSV] = useState("");
  const [pitcherCSV, setPitcherCSV] = useState("");
  const [auctionCSV, setAuctionCSV] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<"success" | "error">("success");

  const store = useDraftStore();
  const currentRankingsCount = store.rankings.length;
  const currentAuctionCount = store.auctionValues.length;

  const showStatus = (msg: string, type: "success" | "error" = "success") => {
    setStatus(msg);
    setStatusType(type);
  };

  const handleLoadHitters = () => {
    if (!hitterCSV.trim()) {
      showStatus("Paste FanGraphs hitter CSV first", "error");
      return;
    }
    const result = parseFanGraphsBatterCSV(hitterCSV);
    if (result.errors.length > 0 && result.playerCount === 0) {
      showStatus(result.errors.join("; "), "error");
      return;
    }
    // Merge with existing pitcher rankings (keep pitchers, replace hitters)
    const existingPitchers = store.rankings.filter(
      (r) => r.primaryPosition === "SP" || r.primaryPosition === "RP"
    );
    const existingPitcherAuctions = store.auctionValues.filter(
      (v) => {
        const pos = v.positions?.[0] || "";
        return pos === "SP" || pos === "RP";
      }
    );
    store.setRankings([...result.rankings, ...existingPitchers]);
    store.setAuctionValues([...result.auctionValues, ...existingPitcherAuctions]);
    const warn = result.errors.length > 0 ? ` (warnings: ${result.errors.join("; ")})` : "";
    showStatus(`Loaded ${result.playerCount} hitters${warn}`);
    setHitterCSV("");
  };

  const handleLoadPitchers = () => {
    if (!pitcherCSV.trim()) {
      showStatus("Paste FanGraphs pitcher CSV first", "error");
      return;
    }
    const result = parseFanGraphsPitcherCSV(pitcherCSV);
    if (result.errors.length > 0 && result.playerCount === 0) {
      showStatus(result.errors.join("; "), "error");
      return;
    }
    // Merge with existing hitter rankings (keep hitters, replace pitchers)
    const existingHitters = store.rankings.filter(
      (r) => r.primaryPosition !== "SP" && r.primaryPosition !== "RP"
    );
    const existingHitterAuctions = store.auctionValues.filter(
      (v) => {
        const pos = v.positions?.[0] || "";
        return pos !== "SP" && pos !== "RP";
      }
    );
    store.setRankings([...existingHitters, ...result.rankings]);
    store.setAuctionValues([...existingHitterAuctions, ...result.auctionValues]);
    const warn = result.errors.length > 0 ? ` (warnings: ${result.errors.join("; ")})` : "";
    showStatus(`Loaded ${result.playerCount} pitchers${warn}`);
    setPitcherCSV("");
  };

  const handleLoadAuctionValues = () => {
    if (!auctionCSV.trim()) {
      showStatus("Paste auction values CSV first", "error");
      return;
    }
    const result = parseESPNAuctionCSV(auctionCSV);
    if (result.errors.length > 0 && result.count === 0) {
      showStatus(result.errors.join("; "), "error");
      return;
    }
    // Convert name-based values to ID-based by matching against current rankings
    const idValues: Record<number, number> = {};
    for (const ranking of store.rankings) {
      const norm = normalizePlayerName(ranking.playerName);
      if (result.values[norm] !== undefined) {
        idValues[ranking.playerId] = result.values[norm];
      }
    }
    store.setEspnDomAuctionValues(idValues);
    const warn = result.errors.length > 0 ? ` (warnings: ${result.errors.join("; ")})` : "";
    showStatus(`Loaded ${result.count} auction values (${Object.keys(idValues).length} matched to rankings)${warn}`);
    setAuctionCSV("");
  };

  const textareaStyle: React.CSSProperties = {
    width: "100%",
    height: "80px",
    fontSize: "11px",
    fontFamily: "Monaco, Courier New, monospace",
    padding: "8px",
    border: "1px solid #d1d5db",
    borderRadius: "4px",
    resize: "vertical",
    boxSizing: "border-box",
  };

  const sectionStyle: React.CSSProperties = {
    marginBottom: "16px",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "12px",
    fontWeight: 500,
    color: "#374151",
    marginBottom: "4px",
    display: "block",
  };

  return (
    <div style={{ padding: "16px 20px", overflowY: "auto", maxHeight: "420px" }}>
      {/* Current data status */}
      <div style={{
        padding: "8px 12px",
        background: "#f3f4f6",
        borderRadius: "6px",
        fontSize: "12px",
        color: "#374151",
        marginBottom: "16px",
      }}>
        <strong>Current data:</strong> {currentRankingsCount} rankings, {currentAuctionCount} auction values
      </div>

      {/* Status message */}
      {status && (
        <div style={{
          padding: "8px 12px",
          borderRadius: "6px",
          fontSize: "12px",
          marginBottom: "12px",
          background: statusType === "success" ? "#ECFDF5" : "#FEF2F2",
          color: statusType === "success" ? "#065F46" : "#991B1B",
          border: `1px solid ${statusType === "success" ? "#A7F3D0" : "#FECACA"}`,
        }}>
          {status}
        </div>
      )}

      {/* FanGraphs Hitters */}
      <div style={sectionStyle}>
        <label style={labelStyle}>FanGraphs Hitter Projections CSV</label>
        <textarea
          style={textareaStyle}
          value={hitterCSV}
          onChange={(e) => setHitterCSV(e.target.value)}
          placeholder="Paste FanGraphs Depth Charts RoS hitter CSV here..."
        />
        <button
          className="btn btn-primary"
          style={{ width: "100%", marginTop: "6px", padding: "8px", fontSize: "13px" }}
          onClick={handleLoadHitters}
          disabled={!hitterCSV.trim()}
        >
          Load Hitters
        </button>
      </div>

      {/* FanGraphs Pitchers */}
      <div style={sectionStyle}>
        <label style={labelStyle}>FanGraphs Pitcher Projections CSV</label>
        <textarea
          style={textareaStyle}
          value={pitcherCSV}
          onChange={(e) => setPitcherCSV(e.target.value)}
          placeholder="Paste FanGraphs Depth Charts RoS pitcher CSV here..."
        />
        <button
          className="btn btn-primary"
          style={{ width: "100%", marginTop: "6px", padding: "8px", fontSize: "13px" }}
          onClick={handleLoadPitchers}
          disabled={!pitcherCSV.trim()}
        >
          Load Pitchers
        </button>
      </div>

      {/* ESPN Auction Values */}
      <div style={sectionStyle}>
        <label style={labelStyle}>ESPN Auction Values CSV</label>
        <textarea
          style={textareaStyle}
          value={auctionCSV}
          onChange={(e) => setAuctionCSV(e.target.value)}
          placeholder="Paste CSV with Name and Value/Dollars columns..."
        />
        <button
          className="btn btn-secondary"
          style={{ width: "100%", marginTop: "6px", padding: "8px", fontSize: "13px" }}
          onClick={handleLoadAuctionValues}
          disabled={!auctionCSV.trim()}
        >
          Load Auction Values
        </button>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
function App() {
  const [activeTab, setActiveTab] = useState<TabType>("settings");
  const [apiToken, setApiToken] = useState("");
  const [savedToken, setSavedToken] = useState<string | null>(null);
  const [backendUrl, setBackendUrl] = useState("http://localhost:3001");
  const [hasSavedSettings, setHasSavedSettings] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load saved settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const result = await chrome.storage.local.get([
          "apiToken",
          "backendUrl",
        ]);
        if (result.apiToken) {
          setSavedToken(result.apiToken);
        }
        if (result.backendUrl) {
          setBackendUrl(result.backendUrl);
        }
        if (result.apiToken || result.backendUrl) {
          setHasSavedSettings(true);
        }
      } catch (error) {
        setLoadError("Could not load extension settings.");
        console.error("Failed to load settings:", error);
      }
    };

    loadSettings();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await chrome.storage.local.set({
        apiToken: apiToken.trim(),
        backendUrl: backendUrl.trim(),
      });
      setSavedToken(apiToken.trim() || null);
      setHasSavedSettings(true);
      setApiToken("");
    } catch (error) {
      console.error("Failed to save settings:", error);
      setLoadError("Failed to save settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    try {
      await chrome.storage.local.remove(["apiToken", "backendUrl"]);
      setSavedToken(null);
      setHasSavedSettings(false);
      setApiToken("");
      setBackendUrl("http://localhost:3001");
    } catch (error) {
      console.error("Failed to clear settings:", error);
      setLoadError("Failed to clear settings. Please try again.");
    }
  };

  const maskToken = (token: string) => {
    if (token.length <= 8) return "--------";
    return token.substring(0, 4) + "----" + token.substring(token.length - 4);
  };

  return (
    <div
      className="popup-container"
      style={{ minHeight: "520px", background: "#ffffff", color: "#111827" }}
    >
      <div className="popup-header">
        <h1>ESPN Draft Assistant</h1>
        <p className="popup-subtitle">Configure your draft experience</p>
      </div>

      {/* Tab Navigation */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid #e5e7eb",
          backgroundColor: "#f9fafb",
        }}
      >
        <button onClick={() => setActiveTab("settings")} style={tabStyle(activeTab === "settings")}>
          Settings
        </button>
        <button onClick={() => setActiveTab("rankings")} style={tabStyle(activeTab === "rankings")}>
          Rankings
        </button>
        <button onClick={() => setActiveTab("data")} style={tabStyle(activeTab === "data")}>
          Data
        </button>
      </div>

      {loadError && (
        <div
          style={{
            margin: "12px 20px 0",
            padding: "10px 12px",
            borderRadius: "6px",
            background: "#FEF2F2",
            color: "#991B1B",
            fontSize: "12px",
            border: "1px solid #FECACA",
          }}
        >
          {loadError}
        </div>
      )}

      {activeTab === "settings" ? (
        <div className="popup-content">
          {hasSavedSettings ? (
            <div className="saved-token-section">
              <div className="status-indicator">
                <span className="status-dot status-active"></span>
                <span className="status-text">Connected</span>
              </div>
              <div className="token-display">
                <label>API Token:</label>
                <code>
                  {savedToken ? maskToken(savedToken) : "Not set (session auth)"}
                </code>
              </div>
              <div className="backend-display">
                <label>Backend URL:</label>
                <code>{backendUrl}</code>
              </div>
              <button className="btn btn-secondary" onClick={handleClear}>
                Clear Settings
              </button>
              <button
                className="btn btn-primary"
                onClick={() => setHasSavedSettings(false)}
              >
                Edit Settings
              </button>
            </div>
          ) : (
            <div className="config-section">
              <div className="status-indicator">
                <span className="status-dot status-inactive"></span>
                <span className="status-text">Not Connected</span>
              </div>
              <div className="instructions">
                <p>
                  <strong>Setup Instructions:</strong>
                </p>
                <ol>
                  <li>Open the ESPN Agent web app</li>
                  <li>Navigate to Settings page</li>
                  <li>Copy your authentication token</li>
                  <li>Paste it below and save</li>
                </ol>
              </div>
              <div className="form-group">
                <label htmlFor="backendUrl">Backend URL:</label>
                <input
                  type="text"
                  id="backendUrl"
                  value={backendUrl}
                  onChange={(e) => setBackendUrl(e.target.value)}
                  placeholder="http://localhost:3001"
                />
              </div>
              <div className="form-group">
                <label htmlFor="apiToken">API Token:</label>
                <input
                  type="password"
                  id="apiToken"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder="Optional (leave blank for session auth)"
                />
              </div>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={!backendUrl.trim() || isSaving}
              >
                {isSaving ? "Saving..." : "Save Settings"}
              </button>
            </div>
          )}
        </div>
      ) : activeTab === "rankings" ? (
        <div style={{ height: "460px", overflow: "hidden" }}>
          <PreDraftRankingEditor />
        </div>
      ) : (
        <DataTab />
      )}

      <div className="popup-footer">
        <p className="footer-text">
          Navigate to an ESPN draft page to see recommendations
        </p>
      </div>
    </div>
  );
}

let root = document.getElementById("root");
if (!root) {
  root = document.createElement("div");
  root.id = "root";
  document.body.appendChild(root);
}

ReactDOM.createRoot(root).render(<App />);
