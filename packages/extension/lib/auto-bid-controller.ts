import { useDraftStore, normalizeName } from "./draft-state";
import type { DraftEngineSignals } from "./engine/types";

/**
 * Live nomination controller state — exposed via getNominationDiagnostics()
 * and polled by the NominationDiagnostics UI panel.
 */
export interface NominationDiagnostics {
  autoMode: boolean;
  currentAuctionPlayer: string | null;
  nominationAttempts: number;
  maxAttempts: number;
  cooldownRemainingMs: number;
  lastAttemptResult: string | null;
  lastCandidateName: string | null;
  lastCandidateSource: 'simulation' | 'idealRoster' | null;
  lastTurnDetectionResult: { matched: boolean; strategy: string | null; strategiesChecked: string[] };
  isActive: boolean; // autoMode && currentAuctionPlayer == null
}

/**
 * AutoBidController - watches the Zustand store for price changes and automatically
 * clicks ESPN's "+1 bid" button when auto-bid mode is enabled.
 *
 * Also auto-nominates players when it is the user's turn and no auction is active,
 * using nomination strategy (trap scores) as primary source and ideal roster as fallback.
 *
 * Bidding strategy:
 * - Ideal roster targets (anchor/core): bid up to ESPN ASV + 10%
 * - PL Undervalued (high PL rank + low ASV): bid up to ESPN ASV + 15%
 * - Opportunity bids (top-50 ext rank, top-100 for SP + below market): bid up to ESPN ASV
 * - Everyone else: skip
 *
 * Nomination strategy:
 * - Primary: nomination strategy trap scores from forward simulation
 * - Fallback: ideal roster non-drafted players
 * - Cooldown: 5-second window between attempts, max 3 attempts before backing off
 *
 * Safety guarantees:
 * - Only fires once per price level (tracks lastBidPrice)
 * - Stops when price reaches or exceeds bid cap
 * - Does nothing when autoMode=false
 * - Resets to OFF on page load (not persisted)
 * - Nomination has cooldown + attempt limits to prevent runaway clicking
 */
export class AutoBidController {
  private unsubscribe: (() => void) | null = null;
  private lastBidPrice: number | null = null;
  private lastEngineSignals: DraftEngineSignals | null = null;

  // Track previous values for manual diffing (store lacks subscribeWithSelector middleware)
  private prevAutoMode: boolean = false;
  private prevCurrentBid: number | undefined = undefined;
  private prevPlayerName: string | undefined = undefined;
  private prevCurrentAuctionPlayer: unknown = undefined;

  // Auto-nomination state
  private lastNominationTime: number | null = null;
  private nominationAttempts: number = 0;
  private nominationDelayTimer: ReturnType<typeof setTimeout> | null = null;

  // Diagnostic state (for getNominationDiagnostics() and NominationDiagnostics UI)
  private lastAttemptResult: string | null = null;
  private lastCandidateName: string | null = null;
  private lastCandidateSource: 'simulation' | 'idealRoster' | null = null;
  private lastTurnDetection: { matched: boolean; strategy: string | null; strategiesChecked: string[] } = {
    matched: false,
    strategy: null,
    strategiesChecked: [],
  };

  /** Cooldown between nomination attempts (ms) */
  private static readonly NOMINATION_COOLDOWN_MS = 5000;
  /** Max nomination attempts before backing off until state changes */
  private static readonly MAX_NOMINATION_ATTEMPTS = 3;

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
      const currentAuctionPlayer = state.currentAuctionPlayer;

      const autoModeChanged = currentAutoMode !== this.prevAutoMode;
      const bidChanged = currentBid !== this.prevCurrentBid;
      const playerChanged = playerName !== this.prevPlayerName;
      // Detect transition: auction player was present but is now gone (auction ended)
      const playerWentAway =
        currentAuctionPlayer == null && this.prevCurrentAuctionPlayer != null;
      // Detect transition: auction player appeared (nomination succeeded)
      const playerAppeared =
        currentAuctionPlayer != null && this.prevCurrentAuctionPlayer == null;

      // Update tracked previous values (must happen after diff computation)
      this.prevAutoMode = currentAutoMode;
      this.prevCurrentBid = currentBid;
      this.prevPlayerName = playerName;
      this.prevCurrentAuctionPlayer = currentAuctionPlayer;

      // Reset tracking when auto-mode is turned off
      if (!currentAutoMode) {
        if (autoModeChanged) {
          this.lastBidPrice = null;
          this.clearNominationState();
        }
        return;
      }

      // Reset nomination attempts when a new player gets nominated (nomination succeeded)
      if (playerAppeared || (playerChanged && currentAuctionPlayer != null)) {
        this.nominationAttempts = 0;
        this.lastNominationTime = null;
      }

      // When auction ends (player went away), schedule nomination after 1s delay
      // to give ESPN time to settle between auctions
      if (playerWentAway) {
        this.scheduleNomination(1000);
      }

      // Only act on price or player changes for bidding
      if (!bidChanged && !playerChanged && !autoModeChanged) {
        return;
      }

      // Reset lastBidPrice when player changes (new nomination)
      if (playerChanged) {
        this.lastBidPrice = null;
      }

      this.evaluateAndBid();
    });

    console.log("[AutoBidController] Started (bid + nominate)");
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.lastBidPrice = null;
    this.lastEngineSignals = null;
    this.prevAutoMode = false;
    this.prevCurrentBid = undefined;
    this.prevPlayerName = undefined;
    this.prevCurrentAuctionPlayer = undefined;
    this.clearNominationState();
    console.log("[AutoBidController] Stopped");
  }

  /**
   * Called by DraftSidebar's useEffect to push the latest engine signals into the controller.
   * Also triggers evaluateAndBid() so the controller can act when signals arrive/change
   * while the bid price is stable (e.g., engine just computed shouldBid=true for a
   * player that was already nominated).
   *
   * When no player is nominated and nomination strategy data is available, triggers
   * evaluateAndNominate() to auto-nominate.
   */
  updateSignals(signals: DraftEngineSignals | null): void {
    this.lastEngineSignals = signals;

    const state = useDraftStore.getState();

    if (state.autoMode && state.currentAuctionPlayer == null) {
      // No active auction — try to nominate
      this.evaluateAndNominate();
    } else {
      // Evaluate after updating signals in case we can now bid
      this.evaluateAndBid();
    }
  }

  // ── Auto-nomination logic ──────────────────────────────────────────────

  /**
   * Schedule a nomination attempt after a delay.
   * Prevents scheduling multiple timers.
   */
  private scheduleNomination(delayMs: number): void {
    if (this.nominationDelayTimer != null) return;

    this.nominationDelayTimer = setTimeout(() => {
      this.nominationDelayTimer = null;
      this.evaluateAndNominate();
    }, delayMs);

    console.log(`[AutoNominate] Scheduled nomination check in ${delayMs}ms`);
  }

  /**
   * Clear all nomination-related state (timers, counters, diagnostics).
   */
  private clearNominationState(): void {
    if (this.nominationDelayTimer != null) {
      clearTimeout(this.nominationDelayTimer);
      this.nominationDelayTimer = null;
    }
    this.lastNominationTime = null;
    this.nominationAttempts = 0;
    this.lastAttemptResult = null;
    this.lastCandidateName = null;
    this.lastCandidateSource = null;
    this.lastTurnDetection = { matched: false, strategy: null, strategiesChecked: [] };
  }

  /**
   * Return current nomination controller state for diagnostic inspection.
   * Called by NominationDiagnostics UI (polled every 500ms) and exposed on
   * window.espnDraftAssistant.nominationDiag() in DEV mode.
   */
  getNominationDiagnostics(): NominationDiagnostics {
    const state = useDraftStore.getState();
    const now = Date.now();
    const cooldownRemainingMs = this.lastNominationTime != null
      ? Math.max(0, AutoBidController.NOMINATION_COOLDOWN_MS - (now - this.lastNominationTime))
      : 0;

    return {
      autoMode: state.autoMode,
      currentAuctionPlayer: state.currentAuctionPlayer?.playerName ?? null,
      nominationAttempts: this.nominationAttempts,
      maxAttempts: AutoBidController.MAX_NOMINATION_ATTEMPTS,
      cooldownRemainingMs,
      lastAttemptResult: this.lastAttemptResult,
      lastCandidateName: this.lastCandidateName,
      lastCandidateSource: this.lastCandidateSource,
      lastTurnDetectionResult: this.lastTurnDetection,
      isActive: state.autoMode && state.currentAuctionPlayer == null,
    };
  }

  /**
   * Bypass cooldown/attempt limits and immediately attempt nomination.
   * Exposed in DEV mode via window.espnDraftAssistant.forceNominate().
   */
  forceNominate(): void {
    console.log("[AutoNominate] Force nominate triggered by user");
    this.nominationAttempts = 0;
    this.lastNominationTime = null;
    this.evaluateAndNominate();
  }

  /**
   * Detect whether it is the user's turn to nominate by inspecting ESPN's DOM.
   *
   * ESPN's auction page uses a "pick train" showing nomination order. When it is
   * the user's turn, their team is highlighted. We also check for a "Nominate a Player"
   * prompt or empty pick area as a simpler fallback.
   *
   * Returns true only when we are confident it is our turn. Returns false if unsure.
   * Also updates this.lastTurnDetection with the matched strategy or all-failed result.
   */
  private isMyTurnToNominate(): boolean {
    const strategiesChecked: string[] = [];

    // Strategy 1: Check for "Nominate a Player" or "Select a player" prompt text
    // ESPN shows this when it is your turn and no player is nominated
    const s1 = "Strategy 1 (body text: 'nominate a player' / 'select a player')";
    strategiesChecked.push(s1);
    const bodyText = document.body?.innerText || "";
    const s1matched = /nominate\s+a\s+player/i.test(bodyText) || /select\s+a\s+player/i.test(bodyText);
    console.debug(`[AutoNominate] ${s1}: ${s1matched}`);
    if (s1matched) {
      this.lastTurnDetection = { matched: true, strategy: s1, strategiesChecked };
      console.log(`[AutoNominate] Turn detected via: ${s1}`);
      return true;
    }

    // Strategy 2: Check pick train for highlighted/active team matching our team
    const s2 = "Strategy 2 (pick train active team: 'your'/'my turn' indicator)";
    strategiesChecked.push(s2);
    const pickTrainSelectors = [
      ".pick-train",
      '[class*="pickTrain"]',
      '[class*="pick-train"]',
      '[class*="PickTrain"]',
    ];

    let pickTrain: Element | null = null;
    for (const selector of pickTrainSelectors) {
      pickTrain = document.querySelector(selector);
      if (pickTrain) break;
    }

    let s2matched = false;
    if (pickTrain) {
      const activeSelectors = [
        ".active",
        '[class*="active"]',
        '[class*="current"]',
        '[class*="Active"]',
        '[class*="Current"]',
        '[class*="myTurn"]',
        '[class*="your-turn"]',
      ];

      let activeTeam: Element | null = null;
      for (const selector of activeSelectors) {
        activeTeam = pickTrain.querySelector(selector);
        if (activeTeam) break;
      }

      if (activeTeam) {
        const activeText = activeTeam.textContent?.toLowerCase() || "";
        if (activeText.includes("your") || activeText.includes("my turn")) {
          s2matched = true;
        }
      }
    }
    console.debug(`[AutoNominate] ${s2}: ${s2matched} (pickTrain found=${pickTrain != null})`);
    if (s2matched) {
      this.lastTurnDetection = { matched: true, strategy: s2, strategiesChecked };
      console.log(`[AutoNominate] Turn detected via: ${s2}`);
      return true;
    }

    // Strategy 3: Check if the bidding form area is in a "waiting to nominate" state
    // ESPN shows the pick area empty or with a nomination prompt when it's your turn
    const s3 = "Strategy 3 (pickArea text or nominate button)";
    strategiesChecked.push(s3);
    const pickArea = document.querySelector(".pickArea, [class*='pickArea']");
    let s3matched = false;
    if (pickArea) {
      const pickAreaText = pickArea.textContent?.toLowerCase() || "";
      if (pickAreaText.includes("nominate") || pickAreaText.includes("select a player")) {
        s3matched = true;
      } else {
        const playerSelected = pickArea.querySelector('[data-testid="player-selected"], .player-selected');
        if (!playerSelected && pickAreaText.trim().length < 20) {
          const nominateButton = document.querySelector(
            'button[class*="nominate"], button[class*="Nominate"], [data-testid*="nominate"]'
          );
          if (nominateButton) {
            s3matched = true;
          }
        }
      }
    }
    console.debug(`[AutoNominate] ${s3}: ${s3matched} (pickArea found=${pickArea != null})`);
    if (s3matched) {
      this.lastTurnDetection = { matched: true, strategy: s3, strategiesChecked };
      console.log(`[AutoNominate] Turn detected via: ${s3}`);
      return true;
    }

    // Strategy 4: Check for "Select" buttons (Button--select class) in the player table
    // ESPN changes "Queue" → "Select" when it is your turn to nominate
    const s4 = "Strategy 4 (Button--select buttons in player table)";
    strategiesChecked.push(s4);
    const selectButtons = document.querySelectorAll<HTMLButtonElement>(
      "button.Button--select[data-player-id]:not([disabled])"
    );
    const s4matched = selectButtons.length > 0;
    console.debug(`[AutoNominate] ${s4}: ${s4matched} (count=${selectButtons.length})`);
    if (s4matched) {
      this.lastTurnDetection = { matched: true, strategy: s4, strategiesChecked };
      console.log(`[AutoNominate] Turn detected via: ${s4}`);
      return true;
    }

    // Strategy 5: Check for an enabled Queue button in the player table
    // If queue buttons are clickable, it likely means we can nominate
    const s5 = "Strategy 5 (enabled queue buttons, no active bidding form)";
    strategiesChecked.push(s5);
    const queueButtons = document.querySelectorAll<HTMLButtonElement>(
      "button[data-player-id]:not([disabled])"
    );
    let s5matched = false;
    if (queueButtons.length > 0) {
      const biddingForm = document.querySelector("form.bidding-form__default");
      const currentAmount = document.querySelector(".current-amount");
      if (!biddingForm && !currentAmount) {
        s5matched = true;
      }
    }
    console.debug(`[AutoNominate] ${s5}: ${s5matched} (queueCount=${queueButtons.length})`);
    if (s5matched) {
      this.lastTurnDetection = { matched: true, strategy: s5, strategiesChecked };
      console.log(`[AutoNominate] Turn detected via: ${s5}`);
      return true;
    }

    // No strategy matched
    this.lastTurnDetection = { matched: false, strategy: null, strategiesChecked };
    return false;
  }

  /**
   * Auto-nominate the best available player when conditions are met:
   * 1. autoMode is ON
   * 2. No active auction (currentAuctionPlayer is null)
   * 3. It is our turn to nominate (DOM detection)
   * 4. Cooldown has elapsed and attempt limit not exceeded
   *
   * Uses nomination strategy (trap scores) as primary source,
   * ideal roster non-drafted players as fallback.
   */
  evaluateAndNominate(): void {
    const state = useDraftStore.getState();
    const MAX = AutoBidController.MAX_NOMINATION_ATTEMPTS;
    const cooldownRemaining = this.lastNominationTime != null
      ? Math.max(0, AutoBidController.NOMINATION_COOLDOWN_MS - (Date.now() - this.lastNominationTime))
      : 0;

    console.log(
      `[AutoNominate] evaluateAndNominate() called — autoMode=${state.autoMode}, ` +
      `auctionPlayer=${state.currentAuctionPlayer?.playerName ?? 'null'}, ` +
      `attempts=${this.nominationAttempts}/${MAX}, cooldown=${cooldownRemaining}ms`
    );

    // Guard: auto-mode must be on
    if (!state.autoMode) {
      this.lastAttemptResult = "autoMode off";
      return;
    }

    // Guard: no active auction (we're in nomination phase)
    if (state.currentAuctionPlayer != null) {
      this.lastAttemptResult = "auction active";
      return;
    }

    // Guard: nomination attempt limit
    if (this.nominationAttempts >= MAX) {
      this.lastAttemptResult = `max attempts (${this.nominationAttempts}/${MAX})`;
      console.log(
        `[AutoNominate] Max attempts reached (${this.nominationAttempts}/${MAX}) — waiting for state change`
      );
      return;
    }

    // Guard: cooldown between attempts
    if (cooldownRemaining > 0) {
      this.lastAttemptResult = `cooldown active (${Math.round(cooldownRemaining / 1000)}s remaining)`;
      console.log(
        `[AutoNominate] Cooldown active — ${Math.round(cooldownRemaining / 1000)}s remaining`
      );
      // Schedule a retry after cooldown expires
      this.scheduleNomination(cooldownRemaining + 100);
      return;
    }

    // Guard: must be our turn to nominate
    if (!this.isMyTurnToNominate()) {
      this.lastAttemptResult = "not our turn";
      console.log("[AutoNominate] Not our turn to nominate — skipping");
      return;
    }

    // ── Select nomination candidate ──

    // Primary: nomination strategy from forward simulation
    const nominationStrategy = this.lastEngineSignals?.simulation?.nominationStrategy;
    let candidateName: string | null = null;
    let candidateReason: string | null = null;
    let candidateTrapScore: number | null = null;

    if (nominationStrategy && nominationStrategy.length > 0) {
      const topPick = nominationStrategy[0];
      candidateName = topPick.playerName;
      candidateReason = `trap: ${topPick.reason}`;
      candidateTrapScore = topPick.trapScore;
      this.lastCandidateName = candidateName;
      this.lastCandidateSource = 'simulation';
      console.log(
        `[AutoNominate] Candidate source=simulation: ${candidateName} (trapScore=${candidateTrapScore.toFixed(2)}, reason=${candidateReason})`
      );
    }

    // Fallback: ideal roster non-drafted players
    if (!candidateName) {
      const idealPlayers = this.lastEngineSignals?.idealRoster?.players ?? [];
      const firstUndrafted = idealPlayers.find((p) => !p.isDrafted);
      if (firstUndrafted) {
        candidateName = firstUndrafted.name;
        candidateReason = `ideal roster ${firstUndrafted.tier} target`;
        this.lastCandidateName = candidateName;
        this.lastCandidateSource = 'idealRoster';
        console.log(
          `[AutoNominate] Candidate source=idealRoster: ${candidateName} (tier=${firstUndrafted.tier}, reason=${candidateReason})`
        );
      }
    }

    if (!candidateName) {
      this.lastAttemptResult = "no candidates available";
      console.log("[AutoNominate] No nomination candidates available — skipping");
      return;
    }

    // ── Map candidate name to ESPN player ID ──
    const normalizedCandidate = normalizeName(candidateName);
    const matchedRanking = state.rankings?.find(
      (r) => normalizeName(r.playerName) === normalizedCandidate
    );

    console.log(
      `[AutoNominate] Ranking lookup: candidateName="${candidateName}" normalized="${normalizedCandidate}" ` +
      `→ matched="${matchedRanking?.playerName ?? 'NOT FOUND'}" playerId=${matchedRanking?.playerId ?? 'N/A'}`
    );

    if (!matchedRanking) {
      this.lastAttemptResult = `ranking not found for "${candidateName}" (normalized: "${normalizedCandidate}")`;
      console.warn(
        `[AutoNominate] Cannot find "${candidateName}" in rankings — cannot map to ESPN player ID`
      );
      this.nominationAttempts++;
      this.lastNominationTime = Date.now();
      return;
    }

    const playerId = matchedRanking.playerId;

    // ── Find and click the queue button for this player ──
    const queueButton = document.querySelector<HTMLButtonElement>(
      `button[data-player-id="${playerId}"]`
    );

    if (queueButton && !queueButton.disabled) {
      this.clickPlayerButton(queueButton, candidateName, playerId, candidateReason!);
      return;
    }

    if (queueButton?.disabled) {
      this.lastAttemptResult = `button disabled for ${candidateName} (ID: ${playerId}) — already drafted or queued`;
      console.warn(
        `[AutoNominate] Queue button disabled for ${candidateName} (ID: ${playerId}) — already drafted or queued`
      );
      this.nominationAttempts++;
      this.lastNominationTime = Date.now();
      return;
    }

    // Button not in DOM — player not visible in the table. Use ESPN's player search
    // to filter the table, then find and click the button.
    console.log(
      `[AutoNominate] Player not visible in table — searching for "${candidateName}"`
    );
    this.searchAndNominate(candidateName, playerId, candidateReason!);
  }

  /**
   * Click the queue/select button, then click the confirmation button.
   */
  private clickPlayerButton(
    button: HTMLButtonElement,
    candidateName: string,
    playerId: number,
    candidateReason: string,
  ): void {
    this.nominationAttempts++;
    this.lastNominationTime = Date.now();

    const btnText = button.textContent?.trim() || "Queue";
    this.lastAttemptResult = `clicked "${btnText}" button for ${candidateName}`;
    console.log(
      `[AutoNominate] Clicking "${btnText}" for ${candidateName} (ID: ${playerId}, ${candidateReason}, attempt ${this.nominationAttempts}/${AutoBidController.MAX_NOMINATION_ATTEMPTS})`
    );

    button.click();

    // Click the confirmation button after ESPN processes the selection.
    setTimeout(() => {
      this.clickNominateButton(candidateName);
    }, 500);
  }

  /**
   * Use ESPN's player search input to find a player not visible in the table,
   * then click their queue/select button, and clear the search afterward.
   */
  private searchAndNominate(
    candidateName: string,
    playerId: number,
    candidateReason: string,
  ): void {
    const searchInput = document.querySelector<HTMLInputElement>(
      '.playersSearch input.form__control, input[placeholder="Player Name"]'
    );

    if (!searchInput) {
      console.warn(
        `[AutoNominate] Search input not found — cannot search for ${candidateName}`
      );
      this.nominationAttempts++;
      this.lastNominationTime = Date.now();
      return;
    }

    // Type the player name into the search input using React-compatible value setting
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype, 'value'
    )?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(searchInput, candidateName);
    } else {
      searchInput.value = candidateName;
    }
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new Event('change', { bubbles: true }));

    console.log(`[AutoNominate] Typed "${candidateName}" into search`);

    // Wait for ESPN to filter the table, then find the button
    setTimeout(() => {
      const queueButton = document.querySelector<HTMLButtonElement>(
        `button[data-player-id="${playerId}"]`
      );

      if (queueButton && !queueButton.disabled) {
        this.clickPlayerButton(queueButton, candidateName, playerId, candidateReason);
      } else {
        console.warn(
          `[AutoNominate] Player button still not found after search for ${candidateName} (ID: ${playerId})`
        );
        this.nominationAttempts++;
        this.lastNominationTime = Date.now();
      }

      // Clear the search after a delay (whether nomination succeeded or not)
      setTimeout(() => this.clearPlayerSearch(), 1000);
    }, 800);
  }

  /**
   * Clear ESPN's player search input by clicking the clear button or resetting the value.
   */
  private clearPlayerSearch(): void {
    // Try the clear button first
    const clearButton = document.querySelector<HTMLElement>(
      '.player--search--clear, .playersSearch .player--search--clear svg'
    );
    if (clearButton) {
      clearButton.click();
      console.log("[AutoNominate] Cleared player search via clear button");
      return;
    }

    // Fallback: reset input value directly
    const searchInput = document.querySelector<HTMLInputElement>(
      '.playersSearch input.form__control, input[placeholder="Player Name"]'
    );
    if (searchInput) {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype, 'value'
      )?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(searchInput, '');
      } else {
        searchInput.value = '';
      }
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.dispatchEvent(new Event('change', { bubbles: true }));
      console.log("[AutoNominate] Cleared player search via input reset");
    }
  }

  /**
   * Find and click the nomination submit button in the bid control / pick area.
   * ESPN shows this button after a player has been queued/selected.
   *
   * When it's your turn to nominate, ESPN changes "Queue" buttons to "Select"
   * and the confirmation button may say "Nominate", "Select", or other text.
   */
  private clickNominateButton(candidateName: string): void {
    // Nominate-specific selectors (high confidence — class/testid contain "nominate")
    const specificSelectors = [
      "button.bid-player__button",          // ESPN actual: "nominate player" confirm button
      "button.nominate-button",
      'button[class*="nominate"]',
      'button[class*="Nominate"]',
      '[data-testid*="nominate"] button',
      'button[data-testid*="nominate"]',
    ];

    let nominateButton: HTMLButtonElement | null = null;

    // Try specific selectors first (no text check needed)
    for (const selector of specificSelectors) {
      const btn = document.querySelector<HTMLButtonElement>(selector);
      if (btn && !btn.disabled) {
        nominateButton = btn;
        break;
      }
    }

    // Try generic ESPN action area selectors — accept any action button text
    // (nominate, select, submit, confirm) since ESPN varies the label
    if (!nominateButton) {
      const actionAreaSelectors = [
        ".pickArea button",
        "form.bidding-form__default button.bid-player__button",
        ".bid-player button",
        '[class*="pickArea"] button',
      ];
      const actionWords = ["nominate", "select", "submit", "confirm"];

      for (const selector of actionAreaSelectors) {
        const btn = document.querySelector<HTMLButtonElement>(selector);
        if (btn && !btn.disabled) {
          const text = btn.textContent?.trim().toLowerCase() || "";
          if (actionWords.some(word => text.includes(word))) {
            nominateButton = btn;
            break;
          }
        }
      }
    }

    // Fallback: scan all buttons for nomination/selection action text
    if (!nominateButton) {
      const actionWords = ["nominate player", "nominate", "submit"];
      const allButtons = document.querySelectorAll<HTMLButtonElement>("button");
      for (const btn of allButtons) {
        const text = btn.textContent?.trim().toLowerCase() || "";
        if (actionWords.some(word => text.includes(word)) && !btn.disabled) {
          nominateButton = btn;
          break;
        }
      }
    }

    if (!nominateButton) {
      console.warn(
        `[AutoNominate] Submit button not found after selecting ${candidateName} — click may have auto-submitted`
      );
      return;
    }

    console.log(
      `[AutoNominate] Clicking "${nominateButton.textContent?.trim()}" button for ${candidateName}`
    );
    nominateButton.click();
  }

  // ── Auto-bidding logic ─────────────────────────────────────────────────

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

    // Resolve nominated player name early — needed for name-based lookups below
    // (Rankings use FanGraphs MLBAM IDs, not ESPN player IDs, so we match by name)
    const nominatedName = currentAuctionPlayer.playerName?.toLowerCase();

    // Resolve ESPN ASV with two-source fallback:
    // 1. DOM-scraped values (most accurate, scraped from ESPN fixed data table)
    // 2. Rankings API values (populated from ESPN draft board API)
    const espnAsv =
      state.espnDomAuctionValues?.[playerId] ??
      (nominatedName ? state.rankings?.find((r) => r.playerName.toLowerCase() === nominatedName)?.espnAuctionValue : undefined) ??
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
    //   → SPs use wider threshold (top-100 vs top-50) because PL SP rankings are deepest
    //
    // Path 3: PL UNDERVALUED (high PL rank but low ASV — market mispricing)
    //   → bid up to ASV + 15% (PL says they're better than market thinks)
    //
    // Everyone else: skip.

    const idealPlayers = this.lastEngineSignals?.idealRoster?.players ?? [];
    const idealMatch = idealPlayers.find(
      (p) => !p.isDrafted && p.name.toLowerCase() === nominatedName
    );
    const isIdealTarget =
      idealMatch != null && (idealMatch.tier === "anchor" || idealMatch.tier === "core");

    // Opportunity: high externally ranked player currently below market price
    // SPs get wider threshold (top-100) because PL rankings are deepest for SP
    const ranking = nominatedName
      ? state.rankings?.find((r) => r.playerName.toLowerCase() === nominatedName)
      : undefined;
    const isSP = ranking?.primaryPosition === "SP";
    const isRP = ranking?.primaryPosition === "RP";
    const isPitcher = isSP || isRP;
    const opportunityRankThreshold = isSP ? 100 : 50;
    const hasHighExternalRank =
      ranking?.externalRank != null && ranking.externalRank <= opportunityRankThreshold;
    const isBelowMarket = espnAsv != null && currentBid < espnAsv;
    const isOpportunity = hasHighExternalRank && isBelowMarket;

    // Path 3: PL UNDERVALUED — high PL rank but low ASV (market mispricing)
    // SP-specific thresholds are more generous because PL SP rankings are deep and reliable
    let isPLUndervalued = false;
    if (ranking?.externalRank != null && espnAsv != null) {
      const rank = ranking.externalRank;
      if (isSP) {
        // SP thresholds (more generous — PL SP rankings most valuable)
        isPLUndervalued =
          (rank <= 50 && espnAsv < 15) ||
          (rank <= 100 && espnAsv < 10);
      } else {
        // General thresholds
        isPLUndervalued =
          (rank <= 30 && espnAsv < 20) ||
          (rank <= 75 && espnAsv < 12);
      }
    }

    // Path 4: RANKED VALUE — sub-$5 players with any external ranking
    // When everyone is cheap, external rank is the best differentiator.
    // Wider rank thresholds than other paths since we're spending very little.
    const isRankedValue =
      !isIdealTarget && !isPLUndervalued && !isOpportunity &&
      espnAsv != null && espnAsv <= 5 &&
      ranking?.externalRank != null && ranking.externalRank <= 200;

    if (!isIdealTarget && !isOpportunity && !isPLUndervalued && !isRankedValue) {
      console.log(
        `[AutoBidController] Not a target — skipping (ideal=${!!idealMatch}, tier=${idealMatch?.tier ?? "none"}, extRank=${ranking?.externalRank ?? "none"}, pos=${ranking?.primaryPosition ?? "?"}, belowMkt=${isBelowMarket}, plUnderval=${isPLUndervalued})`
      );
      return;
    }

    // Compute bid cap based on bid path (priority: IDEAL > PL UNDERVALUED > RANKED VALUE > OPPORTUNITY):
    // - Ideal targets: ASV + 10% (bid as much as it takes for our strategy)
    // - PL Undervalued: ASV + 15% (PL says they're better than market thinks)
    // - Ranked Value: ASV + rank-scaled premium (cheap + ranked = grab them)
    // - Opportunities: ASV only (we're buying value, not overpaying)
    let autoBidCap: number;
    let capSource: string;

    if (isIdealTarget) {
      if (espnAsv != null) {
        autoBidCap = Math.ceil(espnAsv * 1.1);
        capSource = `IDEAL TARGET, ASV $${espnAsv} +10%`;
      } else {
        // No ASV — use optimization maxBid if worker has completed, else defer
        const maxBid = this.lastEngineSignals?.optimization?.maxBid;
        if (maxBid != null && maxBid > 0) {
          autoBidCap = maxBid;
          capSource = `IDEAL TARGET, engine maxBid $${maxBid}`;
        } else {
          // Worker hasn't completed yet — will retry on next updateSignals() call
          console.log("[AutoBidController] Ideal target but no ASV or maxBid yet — deferring");
          return;
        }
      }
    } else if (isPLUndervalued) {
      // PL says they're better than market thinks — willing to go 15% above ASV
      autoBidCap = Math.ceil(espnAsv! * 1.15);
      capSource = `PL UNDERVALUED, rank #${ranking!.externalRank} ${isSP ? "(SP)" : ""} ASV $${espnAsv} +15%`;
    } else if (isRankedValue) {
      // Sub-$5 player with an external ranking — the cheaper the player and
      // better the rank, the more premium we're willing to pay.
      // Top-50 ranked: ASV + $2 premium (e.g., $3 → $5)
      // Top-100: ASV + $1 (e.g., $3 → $4)
      // 100-200: at ASV (still worth grabbing at market)
      const rank = ranking!.externalRank;
      const premium = rank <= 50 ? 2 : rank <= 100 ? 1 : 0;
      autoBidCap = Math.ceil(espnAsv! + premium);
      capSource = `RANKED VALUE, rank #${rank} ASV $${espnAsv} +$${premium}`;
    } else {
      // Opportunity: cap at market value (espnAsv is guaranteed non-null here by isBelowMarket check)
      autoBidCap = espnAsv!;
      capSource = `OPPORTUNITY, ASV $${espnAsv}`;
    }

    // Apply pitcher/hitter split dampening to bid caps for pitchers.
    // Same formula as engine/index.ts: pitcherMultiplier = (100 - split) / 50
    // At default split=65: pitcherMultiplier = 0.7, so a $22 IDEAL TARGET cap becomes $16.
    // At 50/50 split: multiplier = 1.0, no change for either pitchers or hitters.
    const pitcherHitterSplit = state.pitcherHitterSplit ?? 65;
    if (isPitcher) {
      const pitcherMultiplier = (100 - pitcherHitterSplit) / 50;
      const rawCap = autoBidCap;
      autoBidCap = Math.max(1, Math.ceil(autoBidCap * pitcherMultiplier));
      capSource += ` → pitcher dampened ×${pitcherMultiplier.toFixed(2)} = $${autoBidCap} (raw $${rawCap})`;
    }

    // Apply catcher slot dampening: when the dedicated C slot is already filled, a catcher
    // can only go to UTIL or BN. We still want to draft utility catchers but shouldn't
    // overpay since they're now bench-eligible only. Cut the bid cap by 50% to reflect
    // reduced value of a second catcher slotted to UTIL/BN.
    const playerPosition = ranking?.primaryPosition;
    if (playerPosition === 'C') {
      const remainingSlots = this.lastEngineSignals?.remainingSlots;
      const catcherSlotsRemaining = remainingSlots?.['C'] ?? 0;
      if (catcherSlotsRemaining <= 0) {
        const rawCap = autoBidCap;
        autoBidCap = Math.max(1, Math.ceil(autoBidCap * 0.5));
        capSource += ` → C slot filled, catcher dampened ×0.5 = $${autoBidCap} (raw $${rawCap})`;
        console.log(
          `[AutoBidController] C slot filled — catcher dampening applied (0.5x): $${rawCap} → $${autoBidCap}`
        );
      }
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
