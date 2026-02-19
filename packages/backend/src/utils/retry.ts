import axios, { type AxiosInstance } from "axios";
import axiosRetry from "axios-retry";
import type { Logger } from "pino";

/**
 * Create an axios instance with retry logic
 *
 * Retries network errors and 5xx responses up to 3 times with exponential backoff
 * (1s, 2s, 4s with jitter)
 */
export function createRetryableAxios(logger?: Logger): AxiosInstance {
  const instance = axios.create();

  axiosRetry(instance, {
    retries: 3,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) => {
      // Retry on network errors or 5xx responses
      return (
        axiosRetry.isNetworkOrIdempotentRequestError(error) ||
        (error.response?.status !== undefined && error.response.status >= 500)
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

  return instance;
}
