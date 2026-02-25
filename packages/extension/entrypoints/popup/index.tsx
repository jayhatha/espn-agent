import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import PreDraftRankingEditor from "../../components/PreDraftRankingEditor";
import "../styles/popup.css";

type TabType = "settings" | "rankings";

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
    if (token.length <= 8) return "••••••••";
    return token.substring(0, 4) + "••••" + token.substring(token.length - 4);
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
          backgroundColor: "##f9fafb",
        }}
      >
        <button
          onClick={() => setActiveTab("settings")}
          style={{
            flex: 1,
            padding: "12px 16px",
            fontSize: "14px",
            fontWeight: activeTab === "settings" ? "600" : "400",
            color: activeTab === "settings" ? "#2563eb" : "#6b7280",
            backgroundColor: activeTab === "settings" ? "#ffffff" : "transparent",
            border: "none",
            borderBottom:
              activeTab === "settings" ? "2px solid #2563eb" : "2px solid transparent",
            cursor: "pointer",
          }}
        >
          Settings
        </button>
        <button
          onClick={() => setActiveTab("rankings")}
          style={{
            flex: 1,
            padding: "12px 16px",
            fontSize: "14px",
            fontWeight: activeTab === "rankings" ? "600" : "400",
            color: activeTab === "rankings" ? "#2563eb" : "#6b7280",
            backgroundColor: activeTab === "rankings" ? "#ffffff" : "transparent",
            border: "none",
            borderBottom:
              activeTab === "rankings" ? "2px solid #2563eb" : "2px solid transparent",
            cursor: "pointer",
          }}
        >
          Customize Rankings
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
      ) : (
        <div style={{ height: "460px", overflow: "hidden" }}>
          <PreDraftRankingEditor />
        </div>
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
