export default defineBackground(() => {
  // Background service worker for ESPN Draft Assistant
  console.log('[ESPN Draft Assistant] Background service worker initialized');

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
