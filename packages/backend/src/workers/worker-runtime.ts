import { Queue, Worker, type Processor, type WorkerOptions, type QueueOptions } from "bullmq";
import IORedis from "ioredis";
import type { BaseLogger } from "pino";

/**
 * Shared BullMQ bootstrap helpers.
 *
 * Each worker file should use these instead of inlining IORedis / SIGTERM boilerplate.
 */

export function createRedisConnection(url?: string): IORedis {
  return new IORedis(url ?? process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });
}

export function createQueue<T = unknown>(
  name: string,
  connection: IORedis,
  opts?: Omit<QueueOptions, "connection">,
): Queue<T> {
  return new Queue<T>(name, { connection: connection as any, ...opts });
}

export function createWorker<T = unknown>(
  name: string,
  processor: Processor<T>,
  connection: IORedis,
  opts?: Omit<WorkerOptions, "connection">,
): Worker<T> {
  return new Worker<T>(name, processor, { connection: connection as any, ...opts });
}

export function registerShutdown(
  workers: Worker[],
  connections: IORedis[],
  logger?: BaseLogger,
): void {
  const shutdown = async (signal: string) => {
    logger?.info(`${signal} received, closing workers...`);
    await Promise.all(workers.map((w) => w.close()));
    await Promise.all(connections.map((c) => c.quit()));
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
