import { useDraftStore, normalizeName } from "./draft-state";
import type { DraftEngineSignals } from "./engine/types";
import { getPositionalWeight, getSpTierCap, GS_CAP } from "./engine/draft-constants";
import { logger } from "./logger";

/** Find an action button for a specific player, preferring .action-btn class */
function findActionButton(playerId: string | number): HTMLButtonElement | null {
  return (
    document.querySelector<HTMLButtonElement>(
      `button.action-btn[data-player-id="${playerId}"]`,
    ) ??
    document.querySelector<HTMLButtonElement>(
      `button[data-player-id="${playerId}"]`,
    )
  );
}

/** Find all action buttons, preferring .action-btn class */
function findAllActionButtons(): NodeListOf<HTMLButtonElement> {
  const buttons = document.querySelectorAll<HTMLButtonElement>(
    "button.action-btn[data-player-id]",
  );
  if (buttons.length > 0) return buttons;
  return document.querySelectorAll<HTMLButtonElement>("button[data-player-id]");
}

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
  lastCandidateSource: "overpriced" | null;
  lastTurnDetectionResult: {
    matched: boolean;
    strategy: string | null;
    strategiesChecked: string[];
    turnStrategyType: "primary" | "fallback" | null;
  };
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
 * - Overpriced-first: nomination_score = espn_price - model_value, highest score wins
 * - Goal: force league overspending, increase inflation, preserve value in remaining pool
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
  private lastCandidateSource: "overpriced" | null = null;
  private lastTurnDetection: {
    matched: boolean;
    strategy: string | null;
    strategiesChecked: string[];
    turnStrategyType: "primary" | "fallback" | null;
  } = {
    matched: false,
    strategy: null,
    strategiesChecked: [],
    turnStrategyType: null,
  };

  /** Cooldown between nomination attempts (ms) */
  private static readonly NOMINATION_COOLDOWN_MS = 5000;
  /** Max nomination attempts before backing off until state changes */
  private static readonly MAX_NOMINATION_ATTEMPTS = 3;
  /** How long to wait for ESPN's search dropdown to appear after typing (ms) */
  private static readonly SEARCH_DROPDOWN_TIMEOUT_MS = 2000;
  /** How long to wait for ESPN's queue button to appear after clicking dropdown match (ms) */
  private static readonly SEARCH_QUEUE_BUTTON_TIMEOUT_MS = 3000;
  /** Polling interval for dropdown and queue button checks (ms) */
  private static readonly SEARCH_POLL_INTERVAL_MS = 200;
  /** Delay after clicking dropdown match before starting queue button poll (ms) */
  private static readonly SEARCH_DROPDOWN_SETTLE_MS = 500;
  /** Delay after clicking queue/select button before clearing search (ms) */
  private static readonly SEARCH_CLEAR_DELAY_MS = 500;
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

      // When auction ends (player went away), reset attempts and schedule nomination
      // after 1s delay to give ESPN time to settle between auctions
      if (playerWentAway) {
        this.nominationAttempts = 0;
        this.lastNominationTime = null;
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

    logger.log("[AutoBidController] Started (bid + nominate)");
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.lastBidPrice = null;
    this.lastEngineSignals = null;
    // Reset bid tracking state
    this.prevAutoMode = false;
    this.prevCurrentBid = undefined;
    this.prevPlayerName = undefined;
    this.prevCurrentAuctionPlayer = undefined;
    // Single reset path for all nomination state (including queue state)
    this.clearNominationState();
    logger.log("[AutoBidController] Stopped");
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

    // Guard: don't act before the draft has started. If no picks have been
    // made and no bidding form is visible, the draft lobby is still open.
    const draftHasActivity = state.allPicks.length > 0
      || !!document.querySelector("form.bidding-form__default")
      || !!document.querySelector(".auction-pick-component--own");
    if (!draftHasActivity) {
      return; // Pre-draft lobby — do nothing
    }

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

    logger.log(`[AutoNominate] Scheduled nomination check in ${delayMs}ms`);
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
    this.lastTurnDetection = {
      matched: false,
      strategy: null,
      strategiesChecked: [],
      turnStrategyType: null,
    };
  }

  /**
   * Return current nomination controller state for diagnostic inspection.
   * Called by NominationDiagnostics UI (polled every 500ms) and exposed on
   * window.espnDraftAssistant.nominationDiag() in DEV mode.
   */
  getNominationDiagnostics(): NominationDiagnostics {
    const state = useDraftStore.getState();
    const now = Date.now();
    const cooldownRemainingMs =
      this.lastNominationTime != null
        ? Math.max(
            0,
            AutoBidController.NOMINATION_COOLDOWN_MS -
              (now - this.lastNominationTime),
          )
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
    logger.log("[AutoNominate] Force nominate triggered by user");
    this.nominationAttempts = 0;
    this.lastNominationTime = null;
    this.evaluateAndNominate();
  }

  /**
   * Reorder the nomination queue to match the requested player ID order.
   * Filters to only IDs still present in the current queue.
   *
   * TODO: ESPN queue reorder requires DOM drag simulation which is fragile.
   * For now, we just update the store's espnNominationQueue order to reflect
   * the requested ordering. Actual ESPN DOM reorder is deferred.
   */
  reorderQueue(orderedPlayerIds: number[]): void {
    logger.log("[AutoNominate] Reorder queue requested:", orderedPlayerIds);
    const store = useDraftStore.getState();
    const currentQueue = store.espnNominationQueue;
    const queueMap = new Map(currentQueue.map((item) => [item.playerId, item]));

    // Build reordered queue: requested IDs first (filtered to existing), then remaining
    const reordered: typeof currentQueue = [];
    const seen = new Set<number>();
    for (const id of orderedPlayerIds) {
      const item = queueMap.get(id);
      if (item && !seen.has(id)) {
        reordered.push({ ...item, queuePosition: reordered.length + 1 });
        seen.add(id);
      }
    }
    // Append any queue items not in the requested order
    for (const item of currentQueue) {
      if (!seen.has(item.playerId)) {
        reordered.push({ ...item, queuePosition: reordered.length + 1 });
      }
    }

    store.setEspnNominationQueue(reordered);
    logger.log("[AutoNominate] Queue reordered:", reordered.length, "items");
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

    // ── PRIMARY TIER: CONFIRMED selectors (Phase 39 SELECTOR-MAP) ──────────────
    // Run these first. If either matches, we are confident it is our turn.

    // Strategy 4 (PRIMARY): Button--select buttons in player table
    // CONFIRMED: button.Button--select[data-player-id]:not([disabled]) — Phase 39 Group 6
    // ESPN changes Queue → Select buttons when it is the user's nomination turn.
    const s4 = "Strategy 4 [PRIMARY] (Button--select buttons in player table)";
    strategiesChecked.push(s4);
    const selectButtons = document.querySelectorAll<HTMLButtonElement>(
      "button.Button--select[data-player-id]:not([disabled])",
    );
    const s4matched = selectButtons.length > 0;
    logger.debug(`[AutoNominate] ${s4}: ${s4matched} (count=${selectButtons.length})`);
    if (s4matched) {
      this.lastTurnDetection = {
        matched: true,
        strategy: s4,
        strategiesChecked,
        turnStrategyType: "primary",
      };
      logger.log(`[AutoNominate] Turn detected via: ${s4}`);
      return true;
    }

    // Strategy 3 (PRIMARY): pickArea text or empty pickArea with no player selected
    // CONFIRMED: .pickArea — Phase 39 Group 4/8
    // CONFIRMED: [data-testid="player-selected"] — Phase 39 Group 4
    const s3 = "Strategy 3 [PRIMARY] (pickArea text or nominate button)";
    strategiesChecked.push(s3);
    const pickArea = document.querySelector(".pickArea");
    let s3matched = false;
    if (pickArea) {
      const pickAreaText = pickArea.textContent?.toLowerCase() || "";
      if (
        pickAreaText.includes("nominate") ||
        pickAreaText.includes("select a player")
      ) {
        s3matched = true;
      } else {
        const playerSelected = pickArea.querySelector(
          '[data-testid="player-selected"]',
        );
        if (!playerSelected && pickAreaText.trim().length < 20) {
          const nominateButton = document.querySelector("button.bid-player__button");
          if (nominateButton) {
            s3matched = true;
          }
        }
      }
    }
    logger.debug(`[AutoNominate] ${s3}: ${s3matched} (pickArea found=${pickArea != null})`);
    if (s3matched) {
      this.lastTurnDetection = {
        matched: true,
        strategy: s3,
        strategiesChecked,
        turnStrategyType: "primary",
      };
      logger.log(`[AutoNominate] Turn detected via: ${s3}`);
      return true;
    }

    // ── FALLBACK TIER: UNTESTED selectors — only runs if primary tier fails ──────
    // These strategies have not been verified against live ESPN DOM (Phase 39).
    // If one of these matches, log a warning so we know to validate it.
    logger.debug("[AutoNominate] Primary strategies failed — trying UNTESTED fallback strategies");

    // Strategy 1 (UNTESTED_FALLBACK): body text scan
    // UNTESTED: relies on ESPN text content not changing between seasons
    const s1 = "Strategy 1 [UNTESTED_FALLBACK] (body text: 'nominate a player' / 'select a player')";
    strategiesChecked.push(s1);
    const bodyText = document.body?.innerText || "";
    const s1matched =
      /nominate\s+a\s+player/i.test(bodyText) ||
      /select\s+a\s+player/i.test(bodyText);
    logger.debug(`[AutoNominate] ${s1}: ${s1matched}`);
    if (s1matched) {
      logger.warn(
        "[AutoNominate] Turn detected via UNTESTED fallback strategy 1 (body text). " +
        "Verify this selector with Chrome DevTools MCP and update SELECTOR-MAP.md.",
      );
      this.lastTurnDetection = {
        matched: true,
        strategy: s1,
        strategiesChecked,
        turnStrategyType: "fallback",
      };
      return true;
    }

    // Strategy 2 (UNTESTED_FALLBACK): pick train active team
    // UNTESTED: .pick-train, [class*="pickTrain"], .active/[class*="active"] not verified
    const s2 = "Strategy 2 [UNTESTED_FALLBACK] (pick train active team)";
    strategiesChecked.push(s2);
    const pickTrainSelectors = [
      // CONFIRMED (MCP verified 2026-03-14): pick-train__content, pick-train__content__picks-container
      '[class*="pick-train"]',
      // CONFIRMED: .auction-pick-component--own marks our team, --selecting marks nominating team
      ".auction-pick-component--selecting",
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
    logger.debug(`[AutoNominate] ${s2}: ${s2matched} (pickTrain found=${pickTrain != null})`);
    if (s2matched) {
      logger.warn(
        "[AutoNominate] Turn detected via UNTESTED fallback strategy 2 (pick train). " +
        "Verify with Chrome DevTools MCP and update SELECTOR-MAP.md.",
      );
      this.lastTurnDetection = {
        matched: true,
        strategy: s2,
        strategiesChecked,
        turnStrategyType: "fallback",
      };
      return true;
    }

    // Strategy 5 (UNTESTED_FALLBACK): enabled queue buttons + no bidding form
    // UNTESTED: form.bidding-form__default not confirmed against live ESPN DOM
    const s5 = "Strategy 5 [UNTESTED_FALLBACK] (enabled queue buttons, no active bidding form)";
    strategiesChecked.push(s5);
    const queueButtons = document.querySelectorAll<HTMLButtonElement>(
      "button[data-player-id]:not([disabled])",
    );
    let s5matched = false;
    if (queueButtons.length > 0) {
      const biddingForm = document.querySelector("form.bidding-form__default");
      const currentAmount = document.querySelector(".current-amount"); // CONFIRMED
      if (!biddingForm && !currentAmount) {
        s5matched = true;
      }
    }
    logger.debug(`[AutoNominate] ${s5}: ${s5matched} (queueCount=${queueButtons.length})`);
    if (s5matched) {
      logger.warn(
        "[AutoNominate] Turn detected via UNTESTED fallback strategy 5 (queue buttons + no bid form). " +
        "Verify with Chrome DevTools MCP and update SELECTOR-MAP.md.",
      );
      this.lastTurnDetection = {
        matched: true,
        strategy: s5,
        strategiesChecked,
        turnStrategyType: "fallback",
      };
      return true;
    }

    // No strategy matched
    this.lastTurnDetection = {
      matched: false,
      strategy: null,
      strategiesChecked,
      turnStrategyType: null,
    };
    return false;
  }

  /**
   * Auto-nominate the best available player when conditions are met:
   * 1. autoMode is ON
   * 2. No active auction (currentAuctionPlayer is null)
   * 3. It is our turn to nominate (DOM detection)
   * 4. Cooldown has elapsed and attempt limit not exceeded
   *
   * Uses overpriced-first selection: nomination_score = espn_price - model_value.
   */
  evaluateAndNominate(): void {
    const state = useDraftStore.getState();
    const MAX = AutoBidController.MAX_NOMINATION_ATTEMPTS;
    const cooldownRemaining =
      this.lastNominationTime != null
        ? Math.max(
            0,
            AutoBidController.NOMINATION_COOLDOWN_MS -
              (Date.now() - this.lastNominationTime),
          )
        : 0;

    logger.log(
      `[AutoNominate] evaluateAndNominate() called — autoMode=${state.autoMode}, ` +
        `auctionPlayer=${state.currentAuctionPlayer?.playerName ?? "null"}, ` +
        `attempts=${this.nominationAttempts}/${MAX}, cooldown=${cooldownRemaining}ms`,
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

    // Guard: nomination attempt limit — reset after 10s so we retry with fresh attempts
    if (this.nominationAttempts >= MAX) {
      const timeSinceLastAttempt =
        this.lastNominationTime != null
          ? Date.now() - this.lastNominationTime
          : Infinity;
      if (timeSinceLastAttempt > 10_000) {
        logger.log(
          `[AutoNominate] Resetting stale attempts (${this.nominationAttempts}/${MAX}, ${Math.round(timeSinceLastAttempt / 1000)}s ago)`,
        );
        this.nominationAttempts = 0;
        this.lastNominationTime = null;
      } else {
        this.lastAttemptResult = `max attempts (${this.nominationAttempts}/${MAX})`;
        logger.log(
          `[AutoNominate] Max attempts reached (${this.nominationAttempts}/${MAX}) — retrying in 10s`,
        );
        this.scheduleNomination(10_000);
        return;
      }
    }

    // Guard: cooldown between attempts
    if (cooldownRemaining > 0) {
      this.lastAttemptResult = `cooldown active (${Math.round(cooldownRemaining / 1000)}s remaining)`;
      logger.log(
        `[AutoNominate] Cooldown active — ${Math.round(cooldownRemaining / 1000)}s remaining`,
      );
      // Schedule a retry after cooldown expires
      this.scheduleNomination(cooldownRemaining + 100);
      return;
    }

    // Guard: must be our turn to nominate
    if (!this.isMyTurnToNominate()) {
      this.lastAttemptResult = "not our turn";
      logger.log("[AutoNominate] Not our turn to nominate — skipping");
      return;
    }

    // ── Overpriced-first candidate selection ──
    const draftedIds = new Set(state.allPicks.map(p => p.playerId));
    const candidates = state.auctionValues
      .filter(av => !draftedIds.has(av.playerId) && av.dollarValue > 0)
      .map(av => {
        const ranking = state.rankings.find(r => r.playerId === av.playerId);
        const modelValue = ranking?.vbdScore ?? av.dollarValue;
        const espnPrice = av.dollarValue;
        return { ...av, nominationScore: espnPrice - modelValue, modelValue };
      })
      .sort((a, b) => b.nominationScore - a.nominationScore);

    const topCandidate = candidates[0];
    if (!topCandidate) {
      this.lastAttemptResult = "no candidates available";
      logger.log("[AutoNominate] No nomination candidates available — skipping");
      return;
    }

    const candidateName = topCandidate.playerName;
    const candidateReason = `overpriced: ESPN $${topCandidate.dollarValue} vs model $${topCandidate.modelValue.toFixed(0)} (score=${topCandidate.nominationScore.toFixed(1)})`;
    this.lastCandidateName = candidateName;
    this.lastCandidateSource = "overpriced";

    logger.log(
      `[AutoNominate] Candidate source=overpriced: ${candidateName} (espnPrice=$${topCandidate.dollarValue}, modelValue=$${topCandidate.modelValue.toFixed(1)}, nominationScore=${topCandidate.nominationScore.toFixed(1)})`,
    );

    // Try direct ID lookup first (we already have the ESPN playerId)
    const directButton = findActionButton(topCandidate.playerId);
    if (directButton && !directButton.disabled) {
      this.clickPlayerButton(directButton, candidateName, topCandidate.playerId, candidateReason);
      return;
    }

    // ── Map candidate name to ESPN player ID (fallback) ──
    const normalizedCandidate = normalizeName(candidateName);
    const matchedRanking = state.rankings?.find(
      (r) => normalizeName(r.playerName) === normalizedCandidate,
    );

    logger.log(
      `[AutoNominate] Ranking lookup: candidateName="${candidateName}" normalized="${normalizedCandidate}" ` +
        `→ matched="${matchedRanking?.playerName ?? "NOT FOUND"}" playerId=${matchedRanking?.playerId ?? "N/A"}`,
    );

    if (!matchedRanking) {
      this.lastAttemptResult = `ranking not found for "${candidateName}" (normalized: "${normalizedCandidate}")`;
      logger.warn(
        `[AutoNominate] Cannot find "${candidateName}" in rankings — cannot map to ESPN player ID`,
      );
      this.nominationAttempts++;
      this.lastNominationTime = Date.now();
      return;
    }

    const playerId = matchedRanking.playerId;

    // ── Find and click the select/queue button for this player ──
    const playerButton = findActionButton(playerId);

    if (playerButton && !playerButton.disabled) {
      this.clickPlayerButton(
        playerButton,
        candidateName,
        playerId,
        candidateReason!,
      );
      return;
    }

    if (playerButton?.disabled) {
      this.lastAttemptResult = `button disabled for ${candidateName} (ID: ${playerId}) — already drafted or queued`;
      logger.warn(
        `[AutoNominate] Button disabled for ${candidateName} (ID: ${playerId}, text="${playerButton.textContent?.trim()}") — already drafted or queued`,
      );
      this.nominationAttempts++;
      this.lastNominationTime = Date.now();
      return;
    }

    // Button not in DOM — player not visible in the table. Use ESPN's player search
    // to filter the table, then find and click the button.
    logger.log(
      `[AutoNominate] Player not visible in table — searching for "${candidateName}"`,
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
    logger.log(
      `[AutoNominate] Clicking "${btnText}" for ${candidateName} (ID: ${playerId}, ${candidateReason}, attempt ${this.nominationAttempts}/${AutoBidController.MAX_NOMINATION_ATTEMPTS})`,
    );

    button.click();

    // Click the confirmation button after ESPN processes the selection.
    setTimeout(() => {
      this.clickNominateButton(candidateName);
    }, 500);
  }

  /**
   * Find ESPN's player search input and type a search term into it using the
   * React-compatible nativeInputValueSetter + InputEvent pattern.
   *
   * ESPN's draft page uses React, so plain `input.value = x` assignments are ignored
   * by React's synthetic event system. We must use the native setter to bypass React's
   * value tracking, then dispatch an InputEvent (not a plain Event) with inputType
   * "insertText" — this is what React's onChange handler receives from a real keystroke.
   *
   * Returns the search input element if found and typed into, null if the input was not found.
   *
   * Selectors (Phase 39 Group 9):
   * CONFIRMED: .playersSearch input.form__control
   * UNTESTED:  input[placeholder="Player Name"] — fallback if primary fails
   */
  private typeIntoSearchInput(
    searchTerm: string,
    context: string,
  ): HTMLInputElement | null {
    // CONFIRMED (Phase 39 Group 9): .playersSearch input.form__control
    const searchInput =
      document.querySelector<HTMLInputElement>(
        ".playersSearch input.form__control",
      ) ??
      document.querySelector<HTMLInputElement>(
        'input[placeholder="Player Name"]',
      ); // UNTESTED fallback

    if (!searchInput) {
      logger.warn(
        `[${context}] Search input not found (.playersSearch input.form__control) — cannot search`,
      );
      return null;
    }

    // Focus before typing so ESPN's React app registers the interaction
    searchInput.focus();

    // Set value via native setter to bypass React's controlled input tracking
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(searchInput, searchTerm);
    } else {
      searchInput.value = searchTerm;
    }

    // Dispatch InputEvent (carries data/inputType) — React's synthetic event handler uses this
    searchInput.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: searchTerm,
        inputType: "insertText",
      }),
    );
    // Dispatch change + keyup for handlers that listen for keyboard events
    searchInput.dispatchEvent(new Event("change", { bubbles: true }));
    searchInput.dispatchEvent(
      new KeyboardEvent("keyup", {
        bubbles: true,
        key: searchTerm.slice(-1),
      }),
    );

    return searchInput;
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
    // Use last name for search — ESPN search works better with just the surname
    const nameParts = candidateName.trim().split(/\s+/);
    const searchTerm =
      nameParts.length > 1 ? nameParts[nameParts.length - 1] : candidateName;

    const searchInput = this.typeIntoSearchInput(searchTerm, "AutoNominate");
    if (!searchInput) {
      this.nominationAttempts++;
      this.lastNominationTime = Date.now();
      return;
    }

    logger.log(
      `[AutoNominate] Typed "${searchTerm}" into search (from "${candidateName}")`,
    );

    // Poll for the search dropdown (.player--search--matches) to appear, then click the
    // correct match button. Use recursive setTimeout (not setInterval) for clean termination.
    const maxElapsed = AutoBidController.SEARCH_DROPDOWN_TIMEOUT_MS;
    const pollInterval = AutoBidController.SEARCH_POLL_INTERVAL_MS;
    const normalizedCandidate = normalizeName(candidateName);

    const pollForDropdown = (elapsed: number): void => {
      const matchesContainer = document.querySelector(
        ".player--search--matches",
      );
      const matchButtons = matchesContainer
        ? Array.from(
            matchesContainer.querySelectorAll<HTMLButtonElement>(
              "button.player--search--match",
            ),
          )
        : [];

      if (matchButtons.length > 0) {
        // Prefer match by ESPN player ID attribute
        let matchButton: HTMLButtonElement | null = null;
        if (playerId) {
          matchButton = matchesContainer!.querySelector<HTMLButtonElement>(
            `button.player--search--match[data-player-search-playerid="${playerId}"]`,
          );
        }

        // Fallback: match by player name attribute (case-insensitive, normalized)
        if (!matchButton) {
          for (const btn of matchButtons) {
            const btnName =
              btn.getAttribute("data-player-search-playername") ?? "";
            if (normalizeName(btnName) === normalizedCandidate) {
              matchButton = btn;
              break;
            }
          }
        }

        if (matchButton) {
          logger.log(
            `[AutoNominate] Clicking search match for ${candidateName} (ID: ${playerId})`,
          );
          matchButton.click();
          this.nominationAttempts++;
          this.lastNominationTime = Date.now();
          this.lastAttemptResult = `Clicked search dropdown match for ${candidateName}`;

          // After ESPN processes the dropdown selection, click the Nominate/Select confirm button
          setTimeout(() => {
            this.clickNominateButton(candidateName);
          }, AutoBidController.SEARCH_DROPDOWN_SETTLE_MS);

          // Clear the search input after the nomination flow completes
          setTimeout(() => {
            this.clearPlayerSearch();
          }, AutoBidController.SEARCH_DROPDOWN_SETTLE_MS + 1000);
          return;
        }
      }

      // Keep polling if we haven't hit the timeout yet
      if (elapsed + pollInterval < maxElapsed) {
        setTimeout(() => pollForDropdown(elapsed + pollInterval), pollInterval);
      } else {
        logger.warn(
          `[AutoNominate] No matching player in search dropdown for ${candidateName} (ID: ${playerId})`,
        );
        this.nominationAttempts++;
        this.lastNominationTime = Date.now();
        this.lastAttemptResult = `No dropdown match found for ${candidateName}`;
        this.clearPlayerSearch();
      }
    };

    // Start polling after a short delay to give ESPN time to open the dropdown
    setTimeout(() => pollForDropdown(0), 300);
  }

  /**
   * Clear ESPN's player search input by clicking the clear button or resetting the value.
   */
  private clearPlayerSearch(): void {
    // CONFIRMED (Phase 39 Group 9): .player--search--clear
    let clearButton = document.querySelector<HTMLElement>(
      ".player--search--clear",
    );
    if (!clearButton) {
      // UNTESTED: SVG child fallback — ESPN may structure the clear button differently
      const clearSvg = document.querySelector<SVGElement>(
        "div.player--search--clear svg",
      );
      if (clearSvg) {
        clearButton = clearSvg.parentElement as HTMLElement;
      }
    }
    if (clearButton) {
      clearButton.click();
      logger.log("[AutoNominate] Cleared player search via clear button");
      return;
    }

    // Fallback: reset input value directly
    // CONFIRMED (Phase 39 Group 9): .playersSearch input.form__control
    const searchInput = document.querySelector<HTMLInputElement>(
      ".playersSearch input.form__control",
    );
    if (searchInput) {
      // Focus before clearing so React registers the interaction
      searchInput.focus();
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(searchInput, "");
      } else {
        searchInput.value = "";
      }
      // InputEvent with deleteContentBackward mirrors Ctrl+A+Delete — React's onChange handles this correctly
      searchInput.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          data: "",
          inputType: "deleteContentBackward",
        }),
      );
      searchInput.dispatchEvent(new Event("change", { bubbles: true }));
      logger.log("[AutoNominate] Cleared player search via input reset");
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
    // CONFIRMED (MCP verified 2026-03-14): ESPN uses bid-player__button for both nomination and bidding
    const specificSelectors = [
      "button.bid-player__button", // CONFIRMED: 2 matches during bidding (quick offer + manual offer)
      "form.bidding-form__default button.bid-player__button", // CONFIRMED: scoped to bidding form
      ".pickArea button", // CONFIRMED: fallback — any button in pick area
      // FAILED selectors removed: button.nominate-button, button[class*="nominate"]
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
          if (actionWords.some((word) => text.includes(word))) {
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
        if (actionWords.some((word) => text.includes(word)) && !btn.disabled) {
          nominateButton = btn;
          break;
        }
      }
    }

    if (!nominateButton) {
      logger.warn(
        `[AutoNominate] Submit button not found after selecting ${candidateName} — click may have auto-submitted`,
      );
      return;
    }

    logger.log(
      `[AutoNominate] Clicking "${nominateButton.textContent?.trim()}" button for ${candidateName}`,
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
      (nominatedName
        ? state.rankings?.find(
            (r) => r.playerName.toLowerCase() === nominatedName,
          )?.espnAuctionValue
        : undefined) ??
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
      (p) => !p.isDrafted && p.name.toLowerCase() === nominatedName,
    );
    const isIdealTarget =
      idealMatch != null &&
      (idealMatch.tier === "anchor" || idealMatch.tier === "core");

    // Opportunity: high externally ranked player currently below market price
    // SPs get wider threshold (top-100) because PL rankings are deepest for SP
    const ranking = nominatedName
      ? state.rankings?.find(
          (r) => r.playerName.toLowerCase() === nominatedName,
        )
      : undefined;
    const isSP = ranking?.primaryPosition === "SP";
    const isRP = ranking?.primaryPosition === "RP";
    const isPitcher = isSP || isRP;
    const opportunityRankThreshold = isSP ? 100 : 50;
    const hasHighExternalRank =
      ranking?.externalRank != null &&
      ranking.externalRank <= opportunityRankThreshold;
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
          (rank <= 50 && espnAsv < 15) || (rank <= 100 && espnAsv < 10);
      } else {
        // General thresholds
        isPLUndervalued =
          (rank <= 30 && espnAsv < 20) || (rank <= 75 && espnAsv < 12);
      }
    }

    // Path 4: RANKED VALUE — sub-$5 players with any external ranking
    // When everyone is cheap, external rank is the best differentiator.
    // Wider rank thresholds than other paths since we're spending very little.
    const isRankedValue =
      !isIdealTarget &&
      !isPLUndervalued &&
      !isOpportunity &&
      espnAsv != null &&
      espnAsv <= 5 &&
      ranking?.externalRank != null &&
      ranking.externalRank <= 200;

    // ── Endgame mode: value_per_dollar scoring when budget <= $20 ──
    const budgetCurve = this.lastEngineSignals?.budgetCurve;
    const isEndgame = budgetCurve?.endgameMode === true;

    if (isEndgame) {
      logger.log(
        `[AutoBid] ENDGAME MODE activated ($${budgetCurve?.remainingBudget ?? "?"} remaining)`,
      );

      // In endgame, only bid on high value-per-dollar players
      // Value source: idealMatch SGP value, or external rank as proxy
      const playerValue = idealMatch?.sgpValue ?? (ranking?.externalRank != null ? Math.max(0, 200 - ranking.externalRank) / 20 : 0);
      const valuePerDollar = currentBid > 0 ? playerValue / currentBid : playerValue;

      // Endgame preferences:
      // - Prefer: breakout hitters (high projected HR/SB via high SGP), cheap OF, K pitchers
      // - Avoid: backup catchers (C slot filled - already handled by catcher dampening below),
      //          weak OPS hitters (low value hitters)
      const isOF = ranking?.primaryPosition === "OF";
      const isKPitcher = isSP || isRP; // All pitchers contribute K
      const isBreakoutHitter = !isPitcher && idealMatch != null && idealMatch.sgpValue > 3;
      const isDesirableEndgame = isBreakoutHitter || (isOF && valuePerDollar > 0.5) || (isKPitcher && valuePerDollar > 0.5);

      // In endgame, skip low-value players entirely (value_per_dollar < 0.3)
      // unless they're an ideal target or a desirable endgame pickup
      if (valuePerDollar < 0.3 && !isIdealTarget && !isDesirableEndgame) {
        logger.log(
          `[AutoBid] ENDGAME skip: low value_per_dollar=${valuePerDollar.toFixed(2)} for ${nominatedName ?? "unknown"}`,
        );
        return;
      }

      // Weak OPS filter: skip non-pitcher players with very low SGP (weak hitters)
      // Only applies when NOT an ideal target
      if (!isPitcher && !isIdealTarget && idealMatch != null && idealMatch.sgpValue < 1) {
        logger.log(
          `[AutoBid] ENDGAME skip: weak hitter (sgp=${idealMatch.sgpValue.toFixed(2)}) ${nominatedName ?? "unknown"}`,
        );
        return;
      }
    }

    if (
      !isIdealTarget &&
      !isOpportunity &&
      !isPLUndervalued &&
      !isRankedValue
    ) {
      logger.log(
        `[AutoBidController] Not a target — skipping (ideal=${!!idealMatch}, tier=${idealMatch?.tier ?? "none"}, extRank=${ranking?.externalRank ?? "none"}, pos=${ranking?.primaryPosition ?? "?"}, belowMkt=${isBelowMarket}, plUnderval=${isPLUndervalued})`,
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
          logger.log(
            "[AutoBidController] Ideal target but no ASV or maxBid yet — deferring",
          );
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
    if (playerPosition === "C") {
      const remainingSlots = this.lastEngineSignals?.remainingSlots;
      const catcherSlotsRemaining = remainingSlots?.["C"] ?? 0;
      if (catcherSlotsRemaining <= 0) {
        const rawCap = autoBidCap;
        autoBidCap = Math.max(1, Math.ceil(autoBidCap * 0.5));
        capSource += ` → C slot filled, catcher dampened ×0.5 = $${autoBidCap} (raw $${rawCap})`;
        logger.log(
          `[AutoBidController] C slot filled — catcher dampening applied (0.5x): $${rawCap} → $${autoBidCap}`,
        );
      }
    }

    // Apply positional weight bonus: scarce hitting positions get a bid ceiling boost.
    // SS +4, OF +3, 3B +3, 1B +2, 2B +2, C +1. Pitchers and flex get +0.
    const playerPositions = ranking?.positions ?? (playerPosition ? [playerPosition] : []);
    const posWeight = getPositionalWeight(playerPositions);
    if (posWeight > 0) {
      const rawCap = autoBidCap;
      autoBidCap += posWeight;
      capSource += ` → positional weight +${posWeight} (${playerPositions.join("/")}) = $${autoBidCap} (raw $${rawCap})`;
    }

    // Apply SP tier caps: limit spending on SPs based on how many are already drafted.
    // SP1 $18, SP2 $12, SP3 $10, SP4 $5, SP5+ $3.
    if (isSP) {
      const spCount = state.myRoster.filter(
        (p) => p.positions.some((pos) => pos.toUpperCase() === "SP"),
      ).length;
      const tierCap = getSpTierCap(spCount);
      if (autoBidCap > tierCap) {
        const rawCap = autoBidCap;
        autoBidCap = tierCap;
        capSource += ` → SP tier ${spCount + 1} cap $${tierCap} (raw $${rawCap})`;
      }
      // GS cap awareness: log advisory for deep SP picks (SP4+)
      if (spCount >= 3) {
        logger.log(
          `[AutoBidController] GS cap awareness: ${spCount} SPs drafted, ${GS_CAP} GS limit suggests preserving budget for high-K relievers`,
        );
      }
    }

    // Apply endgame dampening: when in endgame mode, reduce all bid caps by 30%
    // to preserve remaining budget for high-value-per-dollar pickups.
    if (isEndgame) {
      const rawCap = autoBidCap;
      autoBidCap = Math.max(1, Math.ceil(autoBidCap * 0.7));
      capSource += ` → ENDGAME dampened ×0.70 = $${autoBidCap} (raw $${rawCap})`;
    }

    // Apply inflation bid adjustment (INF-02): when inflation > 1.10 (buying_window
    // or strong_value band), opponents are overspending relative to remaining value —
    // extend bid ceiling by +2 to capture bargains.
    const inflationFactor = this.lastEngineSignals?.inflation?.inflationFactor ?? 1.0;
    const inflationBand = this.lastEngineSignals?.inflation?.inflationBand ?? "neutral";
    if (inflationFactor > 1.10) {
      autoBidCap += 2;
      capSource += ` → inflation adjustment +2 (inflation=${inflationFactor.toFixed(2)}, band=${inflationBand})`;
      logger.log(
        `[AutoBid] Inflation adjustment: +2 (inflation=${inflationFactor.toFixed(2)}, band=${inflationBand})`,
      );
    }

    // Guard: price has reached or exceeded the cap
    if (currentBid >= autoBidCap) {
      logger.log(
        `[AutoBidController] Price $${currentBid} reached cap $${autoBidCap} (${capSource}) — stopping`,
      );
      return;
    }

    // Find the ESPN +1 bid button (the "Offer $X" button in the bidding form)
    const button = document.querySelector<HTMLButtonElement>(
      "form.bidding-form__default button.bid-player__button",
    );

    if (!button) {
      logger.warn("[AutoBidController] +1 bid button not found in DOM");
      return;
    }

    if (button.disabled) {
      logger.warn("[AutoBidController] +1 bid button is disabled — skipping");
      return;
    }

    // Record the price we're bidding at to prevent repeat clicks
    this.lastBidPrice = currentBid;

    logger.log(
      `[AutoBidController] Auto-bidding +1 at $${currentBid} (cap: $${autoBidCap} via ${capSource})`,
    );

    button.click();
  }
}

/** Singleton instance shared across the extension */
export const autoBidController = new AutoBidController();
