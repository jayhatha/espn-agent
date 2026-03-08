import { useDraftStore } from "./draft-state";
import type { DraftEngineSignals } from "./engine/types";

/**
 * AutoBidController - watches the Zustand store for price changes and automatically
 * clicks ESPN's "+1 bid" button when auto-bid mode is enabled and the engine says
 * shouldBid=true and currentBid < maxBid.
 *
 * Safety guarantees:
 * - Only fires once per price level (tracks lastBidPrice)
 * - Stops when price reaches or exceeds maxBid
 * - Does nothing when autoMode=false
 * - Resets to OFF on page load (not persisted)
 */
export class AutoBidController {
  private unsubscribe: (() => void) | null = null;
  private lastBidPrice: number | null = null;
  private lastEngineSignals: DraftEngineSignals | null = null;

  // Track previous values for manual diffing (store lacks subscribeWithSelector middleware)
  private prevAutoMode: boolean = false;
  private prevCurrentBid: number | undefined = undefined;
  private prevPlayerName: string | undefined = undefined;

  start(): void {
    if (this.unsubscribe) {
      // Already started — prevent duplicate subscriptions
      return;
    }

    // Subscribe to full store state and manually diff relevant fields
    this.unsubscribe = useDraftStore.subscribe((state) => {
      const currentAutoMode = state.autoMode;
      const currentBid = state.currentAuctionPlayer?.currentBid;
      const playerName = state.currentAuctionPlayer?.playerName;

      const autoModeChanged = currentAutoMode !== this.prevAutoMode;
      const bidChanged = currentBid !== this.prevCurrentBid;
      const playerChanged = playerName !== this.prevPlayerName;

      // Update tracked previous values
      this.prevAutoMode = currentAutoMode;
      this.prevCurrentBid = currentBid;
      this.prevPlayerName = playerName;

      // Reset tracking when auto-mode is turned off
      if (!currentAutoMode) {
        if (autoModeChanged) {
          this.lastBidPrice = null;
        }
        return;
      }

      // Only act on price or player changes
      if (!bidChanged && !playerChanged && !autoModeChanged) {
        return;
      }

      // Reset lastBidPrice when player changes (new nomination)
      if (playerChanged) {
        this.lastBidPrice = null;
      }

      this.evaluateAndBid();
    });

    console.log("[AutoBidController] Started");
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.lastBidPrice = null;
    this.lastEngineSignals = null;
    this.prevAutoMode = false;
    this.prevCurrentBid = undefined;
    this.prevPlayerName = undefined;
    console.log("[AutoBidController] Stopped");
  }

  /**
   * Called by DraftSidebar's useEffect to push the latest engine signals into the controller.
   * Also triggers evaluateAndBid() so the controller can act when signals arrive/change
   * while the bid price is stable (e.g., engine just computed shouldBid=true for a
   * player that was already nominated).
   */
  updateSignals(signals: DraftEngineSignals | null): void {
    this.lastEngineSignals = signals;
    // Evaluate after updating signals in case we can now bid
    this.evaluateAndBid();
  }

  evaluateAndBid(): void {
    const state = useDraftStore.getState();
    const { autoMode, currentAuctionPlayer } = state;

    // Guard: auto-mode must be on
    if (!autoMode) return;

    // Guard: must have a nominated player
    if (!currentAuctionPlayer) return;

    // Guard: must have a current bid price
    const { currentBid } = currentAuctionPlayer;
    if (currentBid === undefined) return;

    // Guard: player ID required to look up ESPN ASV
    const playerId = currentAuctionPlayer.playerId;
    if (playerId == null) return;

    // Guard: already bid at this price (prevent repeat clicks)
    if (this.lastBidPrice === currentBid) return;

    // Guard: must have engine signals with optimization data
    if (this.lastEngineSignals?.optimization == null) return;

    const { shouldBid, maxBid } = this.lastEngineSignals.optimization;

    // Guard: engine says PASS
    if (!shouldBid) {
      console.log("[AutoBidController] Engine says PASS — not bidding");
      return;
    }

    // Resolve ESPN ASV with two-source fallback:
    // 1. DOM-scraped values (most accurate, scraped from ESPN fixed data table)
    // 2. Rankings API values (populated from ESPN draft board API)
    const espnAsv =
      state.espnDomAuctionValues?.[playerId] ??
      state.rankings?.find((p) => p.playerId === playerId)?.espnAuctionValue ??
      null;

    // Compute bid cap: ESPN ASV +10% when available, engine maxBid as fallback
    const autoBidCap = espnAsv != null ? Math.ceil(espnAsv * 1.10) : maxBid;
    const capSource = espnAsv != null ? `ESPN ASV $${espnAsv} +10%` : `engine maxBid`;

    // Guard: price has reached or exceeded the cap
    if (currentBid >= autoBidCap) {
      console.log(
        `[AutoBidController] Price $${currentBid} reached cap $${autoBidCap} (${capSource}) — stopping`
      );
      return;
    }

    // Find the ESPN +1 bid button (the "Offer $X" button in the bidding form)
    const button = document.querySelector<HTMLButtonElement>(
      "form.bidding-form__default button.bid-player__button"
    );

    if (!button) {
      console.warn("[AutoBidController] +1 bid button not found in DOM");
      return;
    }

    if (button.disabled) {
      console.warn("[AutoBidController] +1 bid button is disabled — skipping");
      return;
    }

    // Record the price we're bidding at to prevent repeat clicks
    this.lastBidPrice = currentBid;

    console.log(
      `[AutoBidController] Auto-bidding +1 at $${currentBid} (cap: $${autoBidCap} via ${capSource})`
    );

    button.click();
  }
}

/** Singleton instance shared across the extension */
export const autoBidController = new AutoBidController();
