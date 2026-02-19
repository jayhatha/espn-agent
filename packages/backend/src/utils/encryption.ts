import crypto from "crypto";

/**
 * Encryption utilities for sensitive credentials
 * Uses AES-256-GCM for authenticated encryption
 *
 * ENCRYPTION_KEY must be 64 hex characters (32 bytes)
 * Generate with: openssl rand -hex 32
 */

const ALGORITHM = "aes-256-gcm";

/**
 * Check if encryption key is configured
 * Useful for graceful degradation during development
 */
export function hasEncryptionKey(): boolean {
  const key = process.env.ENCRYPTION_KEY;
  return !!(key && key.length === 64);
}

/**
 * Get encryption key from environment variable
 * Validates on first use (lazy initialization)
 */
function getEncryptionKey(): Buffer {
  const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY must be set and be 64 hex characters (32 bytes). Generate with: openssl rand -hex 32",
    );
  }

  return Buffer.from(ENCRYPTION_KEY, "hex");
}

/**
 * Encrypt a token using AES-256-GCM
 * Format: [iv:16][authTag:16][encrypted:*]
 */
export function encryptToken(token: string): Buffer {
  const keyBuffer = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);

  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Concatenate: IV (16 bytes) + Auth Tag (16 bytes) + Encrypted data
  return Buffer.concat([iv, authTag, encrypted]);
}

/**
 * Decrypt a token encrypted with encryptToken()
 */
export function decryptToken(encrypted: Buffer): string {
  if (encrypted.length < 32) {
    throw new Error("Invalid encrypted token: too short");
  }

  const keyBuffer = getEncryptionKey();
  const iv = encrypted.subarray(0, 16);
  const authTag = encrypted.subarray(16, 32);
  const data = encrypted.subarray(32);

  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);

  return decrypted.toString("utf8");
}
