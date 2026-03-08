import { useDraftStore } from "./draft-state";
import type { DraftEngineSignals } from "./engine/types";

/**
 * AutoBidController - watches the Zustand store for price changes and automatically
 * clicks ESPN's "+1 bid" button when auto-bid mode is enabled.
 *
 * Bidding strategy:
 * - Ideal roster targets (anchor/core): bid up to ESPN ASV + 10%
 * - Opportunity bids (top-50 ext rank + below market): bid up to ESPN ASV
 * - Everyone else: skip
 *
 * Safety guarantees:
 * - Only fires once per price level (tracks lastBidPrice)
 * - Stops when price reaches or exceeds bid cap
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

    // Resolve ESPN ASV with two-source fallback:
    // 1. DOM-scraped values (most accurate, scraped from ESPN fixed data table)
    // 2. Rankings API values (populated from ESPN draft board API)
    const espnAsv =
      state.espnDomAuctionValues?.[playerId] ??
      state.rankings?.find((p) => p.playerId === playerId)?.espnAuctionValue ??
      null;

    // ── Strategy filter: only auto-bid on players we actually want ──
    //
    // NOTE: We intentionally do NOT gate on optimization.shouldBid here.
    // The bid optimizer runs in an async Web Worker, so shouldBid is false
    // (placeholder) when the controller first evaluates after a nomination.
    // Instead, we use our own two-path strategy filter which relies on
    // synchronously-available idealRoster and rankings data.
    //
    // Path 1: IDEAL ROSTER targets (anchor/core from our suggested roster)
    //   → bid aggressively up to ASV + 10%
    //
    // Path 2: OPPORTUNITY bids (high external rank + below market)
    //   → bid up to ASV (at market, not above — we're getting a deal)
    //
    // Everyone else: skip.

    const nominatedName = currentAuctionPlayer.playerName?.toLowerCase();
    const idealPlayers = this.lastEngineSignals?.idealRoster?.players ?? [];
    const idealMatch = idealPlayers.find(
      (p) => !p.isDrafted && p.name.toLowerCase() === nominatedName
    );
    const isIdealTarget =
      idealMatch != null && (idealMatch.tier === "anchor" || idealMatch.tier === "core");

    // Opportunity: top-50 externally ranked player currently below market price
    const ranking = state.rankings?.find((r) => r.playerId === playerId);
    const hasHighExternalRank =
      ranking?.externalRank != null && ranking.externalRank <= 50;
    const isBelowMarket = espnAsv != null && currentBid < espnAsv;
    const isOpportunity = hasHighExternalRank && isBelowMarket;

    if (!isIdealTarget && !isOpportunity) {
      console.log(
        `[AutoBidController] Not an ideal roster target or opportunity — skipping (ideal=${!!idealMatch}, tier=${idealMatch?.tier ?? "none"}, extRank=${ranking?.externalRank ?? "none"}, belowMkt=${isBelowMarket})`
      );
      return;
    }

    // Compute bid cap based on bid path:
    // - Ideal targets: ASV + 10% (bid as much as it takes for our strategy)
    // - Opportunities: ASV only (we're buying value, not overpaying)
    let autoBidCap: number;
    let capSource: string;

    if (isIdealTarget) {
      if (espnAsv != null) {
        autoBidCap = Math.ceil(espnAsv * 1.1);
        capSource = `ideal target, ASV $${espnAsv} +10%`;
      } else {
        // No ASV — use optimization maxBid if worker has completed, else defer
        const maxBid = this.lastEngineSignals?.optimization?.maxBid;
        if (maxBid != null && maxBid > 0) {
          autoBidCap = maxBid;
          capSource = `ideal target, engine maxBid $${maxBid}`;
        } else {
          // Worker hasn't completed yet — will retry on next updateSignals() call
          console.log("[AutoBidController] Ideal target but no ASV or maxBid yet — deferring");
          return;
        }
      }
    } else {
      // Opportunity: cap at market value (espnAsv is guaranteed non-null here by isBelowMarket check)
      autoBidCap = espnAsv!;
      capSource = `opportunity, ASV $${espnAsv}`;
    }

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
