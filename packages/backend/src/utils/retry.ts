import axios, { type AxiosInstance } from "axios";
import axiosRetry from "axios-retry";
import type { BaseLogger } from "pino";

/**
 * Circuit breaker state tracker
 * Prevents rapid-fire retries on persistent failures
 */
class CircuitBreaker {
  private consecutiveFailures = 0;
  private circuitOpenUntil: number | null = null;

  recordFailure(): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= 5) {
      // Open circuit for 60 seconds after 5 consecutive failures
      this.circuitOpenUntil = Date.now() + 60000;
    }
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.circuitOpenUntil = null;
  }

  isOpen(): boolean {
    if (this.circuitOpenUntil === null) return false;
    if (Date.now() >= this.circuitOpenUntil) {
      // Circuit has cooled down, reset
      this.circuitOpenUntil = null;
      this.consecutiveFailures = 0;
      return false;
    }
    return true;
  }
}

/**
 * Create an axios instance with retry logic
 *
 * Retries network errors, 5xx responses, and 429 rate limits up to 3 times with exponential backoff
 * (1s, 2s, 4s with jitter)
 * Circuit breaker opens after 5 consecutive failures, preventing retries for 60s
 */
export function createRetryableAxios(logger?: BaseLogger): AxiosInstance {
  const circuitBreaker = new CircuitBreaker();
  const instance = axios.create();

  axiosRetry(instance, {
    retries: 3,
    retryDelay: (retryCount, error) => {
      // Check circuit breaker before retry
      if (circuitBreaker.isOpen()) {
        logger?.warn("Circuit breaker is open, blocking retry");
        return 0; // Don't retry - circuit is open
      }

      // Handle 429 rate limit with Retry-After header
      if (error.response?.status === 429) {
        const retryAfter = error.response.headers["retry-after"];
        if (retryAfter) {
          const delaySeconds = parseInt(retryAfter, 10);
          if (!isNaN(delaySeconds)) {
            logger?.warn({ retryAfter: delaySeconds }, "Rate limited, using Retry-After header");
            return delaySeconds * 1000;
          }
        }
        // Default to exponential backoff if no Retry-After header
        logger?.warn("Rate limited, using exponential backoff");
        return axiosRetry.exponentialDelay(retryCount, error);
      }

      // Standard exponential backoff for other errors
      return axiosRetry.exponentialDelay(retryCount, error);
    },
    retryCondition: (error) => {
      // Don't retry if circuit is open
      if (circuitBreaker.isOpen()) {
        return false;
      }

      // Retry on network errors, 5xx responses, or 429 rate limits
      return (
        axiosRetry.isNetworkOrIdempotentRequestError(error) ||
        (error.response?.status !== undefined && error.response.status >= 500) ||
        error.response?.status === 429
      );
    },
    onRetry: (retryCount, error, requestConfig) => {
      logger?.warn(
        {
          retryCount,
          url: requestConfig.url,
          status: error.response?.status,
        },
        "Retrying ESPN API request"
      );
    },
  });

  // Add response interceptor to track circuit breaker state
  instance.interceptors.response.use(
    (response) => {
      // Success - reset circuit breaker
      circuitBreaker.recordSuccess();
      return response;
    },
    (error) => {
      // Failure - record in circuit breaker
      if (error.response?.status >= 500 || !error.response) {
        circuitBreaker.recordFailure();
      }
      return Promise.reject(error);
    }
  );

  return instance;
}
