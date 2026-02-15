import crypto from "crypto";
import type { FastifyRequest, FastifyReply } from "fastify";

/**
 * Slack request signature verification
 * Implements https://api.slack.com/authentication/verifying-requests-from-slack
 *
 * Verifies:
 * 1. Request timestamp is recent (within 5 minutes)
 * 2. HMAC signature matches expected value
 */

/**
 * Get Slack signing secret from environment variable
 * Validates on first use (lazy initialization)
 */
function getSigningSecret(): string {
  const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

  if (!SLACK_SIGNING_SECRET) {
    throw new Error("SLACK_SIGNING_SECRET environment variable must be set");
  }

  return SLACK_SIGNING_SECRET;
}

/**
 * Verify a Slack request signature
 *
 * @param rawBody - The raw request body (before parsing)
 * @param timestamp - X-Slack-Request-Timestamp header
 * @param signature - X-Slack-Signature header
 * @returns true if signature is valid, false otherwise
 */
export function verifySlackRequest(
  rawBody: string,
  timestamp: string,
  signature: string,
): boolean {
  const SLACK_SIGNING_SECRET = getSigningSecret();
  // Check timestamp freshness (5 minute window to prevent replay attacks)
  const now = Math.floor(Date.now() / 1000);
  const requestTime = parseInt(timestamp, 10);

  if (Math.abs(now - requestTime) > 300) {
    return false; // Request too old or timestamp invalid
  }

  // Compute expected signature
  // Format: v0=HMAC-SHA256(signing_secret, v0:timestamp:body)
  const sigBaseString = `v0:${timestamp}:${rawBody}`;
  const expectedSignature =
    "v0=" +
    crypto
      .createHmac("sha256", SLACK_SIGNING_SECRET)
      .update(sigBaseString)
      .digest("hex");

  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    );
  } catch {
    // Signatures are different lengths (invalid signature format)
    return false;
  }
}

/**
 * Fastify preHandler hook to verify Slack request signatures
 * Add to Slack endpoints with: { preHandler: slackVerifyPreHandler }
 */
export async function slackVerifyPreHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const timestamp = request.headers["x-slack-request-timestamp"] as
    | string
    | undefined;
  const signature = request.headers["x-slack-signature"] as string | undefined;

  if (!timestamp || !signature) {
    request.log.warn("Missing Slack verification headers");
    return reply.code(401).send({ error: "Missing Slack headers" });
  }

  // Get raw body from request
  // Note: Requires raw body to be preserved by content type parser
  const rawBody = (request as any).rawBody as string | undefined;

  if (!rawBody) {
    request.log.error("Raw body not available for signature verification");
    return reply.code(500).send({ error: "Server configuration error" });
  }

  const isValid = verifySlackRequest(rawBody, timestamp, signature);

  if (!isValid) {
    request.log.warn(
      { timestamp, hasSignature: !!signature },
      "Invalid Slack signature",
    );
    return reply.code(401).send({ error: "Invalid signature" });
  }

  // Signature valid - continue to route handler
}
