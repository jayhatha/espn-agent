import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import { verifySlackRequest } from "../../utils/slack-verify.js";

// ─── Test helpers ──────────────────────────────────────────────────────────

const SIGNING_SECRET = "test_signing_secret_value";

function buildValidSignature(
  rawBody: string,
  timestamp: string,
  secret: string = SIGNING_SECRET,
): string {
  const sigBase = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto
    .createHmac("sha256", secret)
    .update(sigBase)
    .digest("hex");
  return `v0=${hmac}`;
}

beforeEach(() => {
  process.env.SLACK_SIGNING_SECRET = SIGNING_SECRET;
});

afterEach(() => {
  delete process.env.SLACK_SIGNING_SECRET;
  vi.restoreAllMocks();
});

// ─── verifySlackRequest ────────────────────────────────────────────────────

describe("verifySlackRequest", () => {
  it("returns true for a valid signature within the 5-minute window", () => {
    // Arrange
    const rawBody = "token=abc&payload=test";
    const timestamp = String(Math.floor(Date.now() / 1000)); // now
    const signature = buildValidSignature(rawBody, timestamp);

    // Act
    const result = verifySlackRequest(rawBody, timestamp, signature);

    // Assert
    expect(result).toBe(true);
  });

  it("returns false when signature is incorrect (wrong secret)", () => {
    // Arrange
    const rawBody = "token=abc&payload=test";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = buildValidSignature(rawBody, timestamp, "wrong_secret");

    // Act
    const result = verifySlackRequest(rawBody, timestamp, signature);

    // Assert
    expect(result).toBe(false);
  });

  it("returns false when request is more than 5 minutes old (replay attack)", () => {
    // Arrange: timestamp 6 minutes in the past
    const rawBody = "token=abc&payload=old";
    const timestamp = String(Math.floor(Date.now() / 1000) - 360);
    const signature = buildValidSignature(rawBody, timestamp);

    // Act
    const result = verifySlackRequest(rawBody, timestamp, signature);

    // Assert
    expect(result).toBe(false);
  });

  it("returns false for a future timestamp outside the 5-minute window", () => {
    // Arrange: timestamp 6 minutes in the future
    const rawBody = "token=abc&payload=future";
    const timestamp = String(Math.floor(Date.now() / 1000) + 360);
    const signature = buildValidSignature(rawBody, timestamp);

    // Act
    const result = verifySlackRequest(rawBody, timestamp, signature);

    // Assert
    expect(result).toBe(false);
  });

  it("returns true for request exactly at the 5-minute boundary (edge case)", () => {
    // Arrange: timestamp exactly 300s in the past (abs(now - ts) = 300, not > 300)
    const rawBody = "token=abc&payload=boundary";
    const timestamp = String(Math.floor(Date.now() / 1000) - 300);
    const signature = buildValidSignature(rawBody, timestamp);

    // Act
    const result = verifySlackRequest(rawBody, timestamp, signature);

    // Assert
    expect(result).toBe(true);
  });

  it("returns false when signature has invalid format (length mismatch)", () => {
    // Arrange: signature is too short → timingSafeEqual throws → caught → false
    const rawBody = "token=abc";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const badSignature = "v0=tooshort";

    // Act
    const result = verifySlackRequest(rawBody, timestamp, badSignature);

    // Assert
    expect(result).toBe(false);
  });

  it("returns false for a tampered body (valid timestamp, correct format, wrong content)", () => {
    // Arrange: sign original body but submit different body
    const originalBody = "token=abc&payload=original";
    const tamperedBody = "token=abc&payload=tampered";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = buildValidSignature(originalBody, timestamp);

    // Act
    const result = verifySlackRequest(tamperedBody, timestamp, signature);

    // Assert
    expect(result).toBe(false);
  });

  it("throws when SLACK_SIGNING_SECRET is not set", () => {
    // Arrange
    delete process.env.SLACK_SIGNING_SECRET;
    const rawBody = "token=abc";
    const timestamp = String(Math.floor(Date.now() / 1000));

    // Act & Assert
    expect(() =>
      verifySlackRequest(rawBody, timestamp, "v0=anything"),
    ).toThrowError(/SLACK_SIGNING_SECRET/);
  });
});
