/**
 * Feature flag management
 * Allows toggling features via environment variables
 */

export interface FeatureFlags {
  slackEnabled: boolean;
}

/**
 * Get feature flag values from environment variables
 */
export function getFeatureFlags(): FeatureFlags {
  return {
    // Slack integration (OAuth, interactive messages, workers)
    // Default: false (opt-in)
    slackEnabled: process.env.FEATURE_SLACK_ENABLED === "true",
  };
}

/**
 * Check if Slack integration is enabled
 */
export function isSlackEnabled(): boolean {
  return getFeatureFlags().slackEnabled;
}

/**
 * Throw error if Slack is not enabled
 * Use in API routes to fail fast
 */
export function requireSlackEnabled(): void {
  if (!isSlackEnabled()) {
    throw new Error(
      "Slack integration is not enabled. Set FEATURE_SLACK_ENABLED=true to enable.",
    );
  }
}
