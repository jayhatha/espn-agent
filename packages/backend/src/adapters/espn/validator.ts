import crypto from "crypto";
import type { BaseLogger } from "pino";

export class EspnResponseValidator {
  private logger?: BaseLogger;
  constructor(logger?: BaseLogger) {
    this.logger = logger;
  }

  computeSchemaFingerprint(data: Record<string, unknown>): string {
    this.logger?.debug(
      { keys: Object.keys(data) },
      "Computing schema fingerprint",
    );
    const structure = this.extractStructure(data);
    const hash = crypto.createHash("sha256");
    hash.update(JSON.stringify(structure));
    return hash.digest("hex").substring(0, 16);
  }

  extractStructure(obj: unknown, depth = 0): unknown {
    if (depth > 3) return typeof obj;
    if (obj === null || obj === undefined) return null;
    if (Array.isArray(obj)) {
      return obj.length > 0 ? [this.extractStructure(obj[0], depth + 1)] : [];
    }
    if (typeof obj === "object") {
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(obj)) {
        result[key] = this.extractStructure(
          (obj as Record<string, unknown>)[key],
          depth + 1,
        );
      }
      return result;
    }
    return typeof obj;
  }
}
