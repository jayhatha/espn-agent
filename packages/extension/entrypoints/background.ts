import { logger } from "../lib/logger";

export default defineBackground(() => {
  // Background service worker for ESPN Draft Assistant
  logger.log("[ESPN Draft Assistant] Background service worker initialized");

  // ─── WebSocket Relay (mobile companion) ────────────────────────────────────
  const DEFAULT_BACKEND_URL = "http://localhost:3001";

  let draftWs: WebSocket | null = null;
  let keepaliveInterval: ReturnType<typeof setInterval> | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 3000;

  function deriveWsUrl(httpUrl: string): string {
    const normalized = (httpUrl || DEFAULT_BACKEND_URL).replace(/\/+$/, "");
    return (
      normalized.replace(/^http(s)?:\/\//, "ws$1://") +
      "/draft/live?role=extension"
    );
  }

  async function connectDraftRelay() {
    if (
      draftWs?.readyState === WebSocket.OPEN ||
      draftWs?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    const { backendUrl } = await chrome.storage.local.get(["backendUrl"]);
    const wsUrl = deriveWsUrl(
      (backendUrl as string | undefined) ?? DEFAULT_BACKEND_URL,
    );

    draftWs = new WebSocket(wsUrl);

    draftWs.addEventListener("open", () => {
      logger.log("[ESPN Draft Assistant] WS relay connected to hub");
      reconnectDelay = 3000; // reset on successful connect

      // 20-second keepalive ping to prevent service worker from sleeping
      keepaliveInterval = setInterval(() => {
        if (draftWs?.readyState === WebSocket.OPEN) {
          draftWs.send(JSON.stringify({ type: "PING" }));
        }
      }, 20_000);
    });

    draftWs.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data as string);

        if (msg.type === "PONG") {
          return; // ignore pong
        }

        if (msg.type === "CONTROL") {
          // Forward CONTROL commands to the ESPN draft tab content script
          chrome.tabs.query(
            { url: "https://fantasy.espn.com/baseball/draft*" },
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
        logger.error(
          "[ESPN Draft Assistant] WS relay message parse error:",
          err,
        );
      }
    });

    draftWs.addEventListener("close", () => {
      if (keepaliveInterval) {
        clearInterval(keepaliveInterval);
        keepaliveInterval = null;
      }

      logger.log(
        `[ESPN Draft Assistant] WS relay disconnected — reconnecting in ${reconnectDelay}ms`,
      );

      reconnectTimeout = setTimeout(() => {
        void connectDraftRelay();
      }, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 1.5, 30_000);
    });

    draftWs.addEventListener("error", (err) => {
      logger.error("[ESPN Draft Assistant] WS relay error:", err);
      // close handler will schedule reconnect
    });
  }
  // ─── End WebSocket Relay ───────────────────────────────────────────────────

  // Listen for extension installation
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
      logger.log("[ESPN Draft Assistant] Extension installed successfully");
    } else if (details.reason === "update") {
      logger.log("[ESPN Draft Assistant] Extension updated");
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
          "fantasy.espn.com",
          "lm-api-reads.fantasy.espn.com",
        ];

        const isAllowedDomain = allowedDomains.some(
          (domain) =>
            senderUrl.hostname === domain ||
            senderUrl.hostname.endsWith("." + domain),
        );

        if (!isAllowedDomain) {
          logger.warn(
            "[ESPN Draft Assistant] SECURITY: Rejected message from unauthorized origin:",
            senderUrl.hostname,
          );
          sendResponse({ error: "Unauthorized sender origin" });
          return false;
        }

        // Additional validation: verify sender is from this extension (prevents extension spoofing)
        if (sender.id && sender.id !== chrome.runtime.id) {
          logger.warn(
            "[ESPN Draft Assistant] SECURITY: Rejected message from different extension:",
            sender.id,
          );
          sendResponse({ error: "Invalid sender extension" });
          return false;
        }
      } catch (error) {
        logger.error(
          "[ESPN Draft Assistant] Invalid sender URL:",
          sender.url,
          error,
        );
        sendResponse({ error: "Invalid sender URL" });
        return false;
      }
    }
    // If sender.url is undefined, message is from extension page (popup, options) - allow it

    logger.log("[ESPN Draft Assistant] Message received:", message.type);

    if (message.type === "GET_RANKINGS") {
      handleGetRankings(message.payload)
        .then(sendResponse)
        .catch((error) => {
          logger.error(
            "[ESPN Draft Assistant] Error fetching rankings:",
            error,
          );
          sendResponse({ error: error.message });
        });
      return true; // Keep channel open for async response
    }

    if (message.type === "GET_AUCTION_VALUES") {
      handleGetAuctionValues(message.payload)
        .then(sendResponse)
        .catch((error) => {
          logger.error(
            "[ESPN Draft Assistant] Error fetching auction values:",
            error,
          );
          sendResponse({ error: error.message });
        });
      return true; // Keep channel open for async response
    }

    return false;
  });

  // ─── Storage Change Listener — relay state to mobile via WS ───────────────
  // In-memory caches so every WS message always includes both payload + engineSignals.
  // chrome.storage.onChanged only includes keys that actually changed, so partial
  // updates would send null for the unchanged field — breaking hub's latestSnapshot cache
  // and causing reconnecting mobile clients to lose state.
  let cachedPayload: unknown = null;
  let cachedEngineSignals: unknown = null;

  chrome.storage.local.onChanged.addListener((changes) => {
    // Only relay if WS hub is connected
    if (draftWs?.readyState !== WebSocket.OPEN) {
      return;
    }

    const hasEngineSignals = "draft-engine-signals" in changes;
    const hasMobileState = "draft-mobile-state" in changes;

    if (!hasEngineSignals && !hasMobileState) {
      return;
    }

    // Update in-memory caches with any changed values
    if (hasMobileState && changes["draft-mobile-state"]?.newValue) {
      try {
        cachedPayload = JSON.parse(
          changes["draft-mobile-state"].newValue as string,
        );
      } catch (err) {
        logger.error(
          "[ESPN Draft Assistant] Failed to parse draft-mobile-state:",
          err,
        );
      }
    }

    if (hasEngineSignals && changes["draft-engine-signals"]?.newValue) {
      try {
        cachedEngineSignals = JSON.parse(
          changes["draft-engine-signals"].newValue as string,
        );
      } catch (err) {
        logger.error(
          "[ESPN Draft Assistant] Failed to parse draft-engine-signals:",
          err,
        );
      }
    }

    // Always send both fields so hub's latestSnapshot cache is always complete
    try {
      draftWs.send(
        JSON.stringify({
          type: "STATE_SNAPSHOT",
          ts: Date.now(),
          payload: cachedPayload,
          engineSignals: cachedEngineSignals,
        }),
      );
    } catch (err) {
      logger.error(
        "[ESPN Draft Assistant] Failed to send STATE_SNAPSHOT:",
        err,
      );
    }
  });
  // ─── End Storage Change Listener ──────────────────────────────────────────

  // Auto-connect WS relay on background SW startup
  void connectDraftRelay();
});

async function handleGetRankings(payload: { leagueId: string }) {
  // This will be implemented in a future plan
  // For now, return empty array to allow extension to load
  logger.log(
    "[ESPN Draft Assistant] GET_RANKINGS requested for league:",
    payload.leagueId,
  );
  return { rankings: [] };
}

// ESPN position slot ID → position string mapping
const ESPN_SLOT_MAP: Record<number, string> = {
  0: "C",
  1: "1B",
  2: "2B",
  3: "SS",
  4: "3B",
  5: "OF",
  9: "DH",
  13: "SP",
  14: "RP",
  15: "P",
};

async function handleGetAuctionValues(payload: { leagueId: string }) {
  logger.log(
    "[ESPN Draft Assistant] Fetching live auction values from ESPN API for league:",
    payload.leagueId,
  );

  const season = new Date().getFullYear();
  const batchSize = 50;
  const maxPlayers = 500; // Top 500 covers all draftable players
  const allValues: Array<{
    playerId: number;
    playerName: string;
    positions: string[];
    espnAuctionValue: number;
    averageAuctionValue: number;
    rank: number;
  }> = [];

  try {
    for (let offset = 0; offset < maxPlayers; offset += batchSize) {
      const filterHeader = JSON.stringify({
        players: {
          limit: batchSize,
          offset,
          sortDraftRanks: {
            sortPriority: 100,
            sortAsc: true,
            value: "STANDARD",
          },
        },
      });

      const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/flb/seasons/${season}/segments/0/leaguedefaults/1?view=kona_player_info&scoringPeriodId=0`;

      const response = await fetch(url, {
        headers: { "x-fantasy-filter": filterHeader },
      });

      if (!response.ok) {
        logger.error(
          `[ESPN Draft Assistant] ESPN API returned ${response.status}`,
        );
        break;
      }

      const data = (await response.json()) as any;
      const batch = (data?.players as any[]) || [];

      if (batch.length === 0) break;

      for (const entry of batch) {
        const player = entry?.player;
        if (!player) continue;

        const ranks = player.draftRanksByRankType || {};
        const std = ranks.STANDARD || {};
        const roto = ranks.ROTO || {};
        const ownership = player.ownership || {};

        const espnAuctionValue = std.auctionValue ?? roto.auctionValue ?? 0;
        const averageAuctionValue = ownership.auctionValueAverage ?? 0;
        const rank = std.rank ?? 9999;

        // Skip players with no meaningful draft data
        if (espnAuctionValue <= 0 && rank >= 9999 && averageAuctionValue <= 0)
          continue;

        const positions = (player.eligibleSlots || [])
          .filter((s: number) => s <= 15 && s !== 12 && s !== 6 && s !== 7)
          .map((s: number) => ESPN_SLOT_MAP[s])
          .filter(Boolean) as string[];

        allValues.push({
          playerId: entry.id,
          playerName: player.fullName || `Player ${entry.id}`,
          positions: [...new Set(positions)],
          espnAuctionValue,
          averageAuctionValue,
          rank,
        });
      }

      logger.log(
        `[ESPN Draft Assistant] Fetched ${allValues.length} players (offset=${offset})`,
      );

      // Respect rate limits
      if (offset + batchSize < maxPlayers && batch.length === batchSize) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    logger.log(
      `[ESPN Draft Assistant] ESPN auction values loaded: ${allValues.length} players`,
    );
    return { values: allValues };
  } catch (error) {
    logger.error(
      "[ESPN Draft Assistant] Failed to fetch ESPN auction values:",
      error,
    );
    return {
      values: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
