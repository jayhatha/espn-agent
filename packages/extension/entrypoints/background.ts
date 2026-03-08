export default defineBackground(() => {
  // Background service worker for ESPN Draft Assistant
  console.log('[ESPN Draft Assistant] Background service worker initialized');

  // ─── WebSocket Relay (mobile companion) ────────────────────────────────────
  let draftWs: WebSocket | null = null;
  let keepaliveInterval: ReturnType<typeof setInterval> | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 3000;

  function connectDraftRelay() {
    if (
      draftWs?.readyState === WebSocket.OPEN ||
      draftWs?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    draftWs = new WebSocket('ws://localhost:3001/draft/live?role=extension');

    draftWs.addEventListener('open', () => {
      console.log('[ESPN Draft Assistant] WS relay connected to hub');
      reconnectDelay = 3000; // reset on successful connect

      // 20-second keepalive ping to prevent service worker from sleeping
      keepaliveInterval = setInterval(() => {
        if (draftWs?.readyState === WebSocket.OPEN) {
          draftWs.send(JSON.stringify({ type: 'PING' }));
        }
      }, 20_000);
    });

    draftWs.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data as string);

        if (msg.type === 'PONG') {
          return; // ignore pong
        }

        if (msg.type === 'CONTROL') {
          // Forward CONTROL commands to the ESPN draft tab content script
          chrome.tabs.query(
            { url: 'https://fantasy.espn.com/baseball/draft*' },
            (tabs) => {
              for (const tab of tabs) {
                if (tab.id) {
                  chrome.tabs.sendMessage(tab.id, msg);
                }
              }
            },
          );
        }
      } catch (err) {
        console.error('[ESPN Draft Assistant] WS relay message parse error:', err);
      }
    });

    draftWs.addEventListener('close', () => {
      if (keepaliveInterval) {
        clearInterval(keepaliveInterval);
        keepaliveInterval = null;
      }

      console.log(
        `[ESPN Draft Assistant] WS relay disconnected — reconnecting in ${reconnectDelay}ms`,
      );

      reconnectTimeout = setTimeout(connectDraftRelay, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 1.5, 30_000);
    });

    draftWs.addEventListener('error', (err) => {
      console.error('[ESPN Draft Assistant] WS relay error:', err);
      // close handler will schedule reconnect
    });
  }
  // ─── End WebSocket Relay ───────────────────────────────────────────────────

  // Listen for extension installation
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      console.log('[ESPN Draft Assistant] Extension installed successfully');
    } else if (details.reason === 'update') {
      console.log('[ESPN Draft Assistant] Extension updated');
    }
  });

  // Message handler for content script communication
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // SECURITY: Validate sender origin before processing messages
    // Prevents malicious webpages from sending fake messages to extension

    if (sender.url) {
      // Message from content script - validate it's from ESPN domain
      try {
        const senderUrl = new URL(sender.url);

        // Whitelist of allowed ESPN domains
        const allowedDomains = [
          'fantasy.espn.com',
          'lm-api-reads.fantasy.espn.com'
        ];

        const isAllowedDomain = allowedDomains.some(domain =>
          senderUrl.hostname === domain || senderUrl.hostname.endsWith('.' + domain)
        );

        if (!isAllowedDomain) {
          console.warn('[ESPN Draft Assistant] SECURITY: Rejected message from unauthorized origin:', senderUrl.hostname);
          sendResponse({ error: 'Unauthorized sender origin' });
          return false;
        }

        // Additional validation: verify sender is from this extension (prevents extension spoofing)
        if (sender.id && sender.id !== chrome.runtime.id) {
          console.warn('[ESPN Draft Assistant] SECURITY: Rejected message from different extension:', sender.id);
          sendResponse({ error: 'Invalid sender extension' });
          return false;
        }
      } catch (error) {
        console.error('[ESPN Draft Assistant] Invalid sender URL:', sender.url, error);
        sendResponse({ error: 'Invalid sender URL' });
        return false;
      }
    }
    // If sender.url is undefined, message is from extension page (popup, options) - allow it

    console.log('[ESPN Draft Assistant] Message received:', message.type);

    if (message.type === 'GET_RANKINGS') {
      handleGetRankings(message.payload)
        .then(sendResponse)
        .catch((error) => {
          console.error('[ESPN Draft Assistant] Error fetching rankings:', error);
          sendResponse({ error: error.message });
        });
      return true; // Keep channel open for async response
    }

    if (message.type === 'GET_AUCTION_VALUES') {
      handleGetAuctionValues(message.payload)
        .then(sendResponse)
        .catch((error) => {
          console.error('[ESPN Draft Assistant] Error fetching auction values:', error);
          sendResponse({ error: error.message });
        });
      return true; // Keep channel open for async response
    }

    return false;
  });

  // ─── Storage Change Listener — relay state to mobile via WS ───────────────
  chrome.storage.local.onChanged.addListener((changes) => {
    // Only relay if WS hub is connected
    if (draftWs?.readyState !== WebSocket.OPEN) {
      return;
    }

    const hasEngineSignals = 'draft-engine-signals' in changes;
    const hasMobileState = 'draft-mobile-state' in changes;

    if (!hasEngineSignals && !hasMobileState) {
      return;
    }

    const snapshot: {
      type: string;
      ts: number;
      payload: unknown;
      engineSignals: unknown;
    } = {
      type: 'STATE_SNAPSHOT',
      ts: Date.now(),
      payload: null,
      engineSignals: null,
    };

    if (hasMobileState && changes['draft-mobile-state']?.newValue) {
      try {
        snapshot.payload = JSON.parse(changes['draft-mobile-state'].newValue as string);
      } catch (err) {
        console.error('[ESPN Draft Assistant] Failed to parse draft-mobile-state:', err);
      }
    }

    if (hasEngineSignals && changes['draft-engine-signals']?.newValue) {
      try {
        snapshot.engineSignals = JSON.parse(changes['draft-engine-signals'].newValue as string);
      } catch (err) {
        console.error('[ESPN Draft Assistant] Failed to parse draft-engine-signals:', err);
      }
    }

    try {
      draftWs.send(JSON.stringify(snapshot));
    } catch (err) {
      console.error('[ESPN Draft Assistant] Failed to send STATE_SNAPSHOT:', err);
    }
  });
  // ─── End Storage Change Listener ──────────────────────────────────────────

  // Auto-connect WS relay on background SW startup
  connectDraftRelay();
});

async function handleGetRankings(payload: { leagueId: string }) {
  // This will be implemented in a future plan
  // For now, return empty array to allow extension to load
  console.log('[ESPN Draft Assistant] GET_RANKINGS requested for league:', payload.leagueId);
  return { rankings: [] };
}

async function handleGetAuctionValues(payload: { leagueId: string }) {
  // This will be implemented in a future plan
  // For now, return empty array to allow extension to load
  console.log('[ESPN Draft Assistant] GET_AUCTION_VALUES requested for league:', payload.leagueId);
  return { values: [] };
}
