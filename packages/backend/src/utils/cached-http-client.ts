import { LRUCache } from "lru-cache";
import type { BaseLogger } from "pino";
import { createRetryableAxios } from "./retry.js";

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

export interface CachedHttpClientOptions {
  /** Maximum number of cache entries. Default: 50 */
  maxEntries?: number;
  /** Default TTL in milliseconds. Default: 6 hours */
  defaultTtlMs?: number;
  /** Request timeout in milliseconds. Default: 20000 */
  timeoutMs?: number;
  logger?: BaseLogger;
}

/**
 * Shared HTTP client with LRU caching, timeout, and retry.
 *
 * Adapters accept this as a constructor parameter so caching infrastructure
 * (TTLs, retry behavior, cache invalidation) has a single home.
 *
 * Usage:
 *   const client = new CachedHttpClient({ defaultTtlMs: 6 * 60 * 60 * 1000 });
 *   const html = await client.get<string>(url, { responseType: "text", cacheKey: "my:key" });
 */
export class CachedHttpClient {
  private readonly cache: LRUCache<string, CacheEntry>;
  private readonly defaultTtlMs: number;
  private readonly timeoutMs: number;
  private readonly logger?: BaseLogger;
  private readonly axios: ReturnType<typeof createRetryableAxios>;

  constructor(options: CachedHttpClientOptions = {}) {
    const {
      maxEntries = 50,
      defaultTtlMs = 6 * 60 * 60 * 1000,
      timeoutMs = 20000,
      logger,
    } = options;

    this.cache = new LRUCache({ max: maxEntries });
    this.defaultTtlMs = defaultTtlMs;
    this.timeoutMs = timeoutMs;
    this.logger = logger;
    this.axios = createRetryableAxios(logger);
  }

  /**
   * Perform a cached GET request.
   * Returns cached data when available and not expired.
   */
  async get<T = unknown>(
    url: string,
    options: {
      headers?: Record<string, string>;
      /** Override TTL for this specific request */
      ttlMs?: number;
      /** Cache key; defaults to the URL */
      cacheKey?: string;
      responseType?: "json" | "text";
    } = {},
  ): Promise<T> {
    const cacheKey = options.cacheKey ?? url;
    const ttlMs = options.ttlMs ?? this.defaultTtlMs;

    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.logger?.debug({ cacheKey }, "Cache hit");
      return cached.data as T;
    }

    const response = await this.axios.get<T>(url, {
      headers: options.headers,
      timeout: this.timeoutMs,
      responseType: options.responseType ?? "json",
    });

    this.cache.set(cacheKey, {
      data: response.data,
      expiresAt: Date.now() + ttlMs,
    });

    return response.data;
  }

  /**
   * Perform an uncached POST request.
   */
  async post<T = unknown>(
    url: string,
    body: unknown,
    options: { headers?: Record<string, string> } = {},
  ): Promise<T> {
    const response = await this.axios.post<T>(url, body, {
      headers: options.headers,
      timeout: this.timeoutMs,
    });
    return response.data;
  }

  /** Remove a specific cache entry. */
  invalidate(cacheKey: string): void {
    this.cache.delete(cacheKey);
  }
}
