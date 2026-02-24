import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import '../styles/popup.css';

function App() {
  const [apiToken, setApiToken] = useState('');
  const [savedToken, setSavedToken] = useState<string | null>(null);
  const [backendUrl, setBackendUrl] = useState('http://localhost:3001');
  const [isSaving, setIsSaving] = useState(false);

  // Load saved settings on mount
  useEffect(() => {
    chrome.storage.local.get(['apiToken', 'backendUrl'], (result) => {
      if (result.apiToken) {
        setSavedToken(result.apiToken);
      }
      if (result.backendUrl) {
        setBackendUrl(result.backendUrl);
      }
    });
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await chrome.storage.local.set({
        apiToken: apiToken.trim(),
        backendUrl: backendUrl.trim(),
      });
      setSavedToken(apiToken.trim());
      setApiToken('');
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    try {
      await chrome.storage.local.remove(['apiToken', 'backendUrl']);
      setSavedToken(null);
      setApiToken('');
      setBackendUrl('http://localhost:3001');
    } catch (error) {
      console.error('Failed to clear settings:', error);
    }
  };

  const maskToken = (token: string) => {
    if (token.length <= 8) return '••••••••';
    return token.substring(0, 4) + '••••' + token.substring(token.length - 4);
  };

  return (
    <div className="popup-container">
      <div className="popup-header">
        <h1>ESPN Draft Assistant</h1>
        <p className="popup-subtitle">Configure your backend connection</p>
      </div>

      <div className="popup-content">
        {savedToken ? (
          <div className="saved-token-section">
            <div className="status-indicator">
              <span className="status-dot status-active"></span>
              <span className="status-text">Connected</span>
            </div>
            <div className="token-display">
              <label>API Token:</label>
              <code>{maskToken(savedToken)}</code>
            </div>
            <div className="backend-display">
              <label>Backend URL:</label>
              <code>{backendUrl}</code>
            </div>
            <button className="btn btn-secondary" onClick={handleClear}>
              Clear Settings
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
                placeholder="Paste your auth token here"
              />
            </div>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={!apiToken.trim() || isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        )}
      </div>

      <div className="popup-footer">
        <p className="footer-text">
          Navigate to an ESPN draft page to see recommendations
        </p>
      </div>
    </div>
  );
}

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(<App />);
}
