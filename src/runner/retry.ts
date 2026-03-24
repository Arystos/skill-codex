import { BridgeError } from "../errors/errors.js";
import { MAX_RETRIES, MAX_RETRIES_ENV, RETRY_DELAYS_MS, RETRY_CAP_MS } from "../config/constants.js";

export interface RetryOptions {
  readonly maxRetries?: number;
  readonly shouldRetry?: (err: Error) => boolean;
}

function getMaxRetries(override?: number): number {
  if (override !== undefined) return override;
  const envVal = process.env[MAX_RETRIES_ENV];
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed >= 0) return parsed;
  }
  return MAX_RETRIES;
}

function getDelay(attempt: number): number {
  const base = RETRY_DELAYS_MS[attempt] ?? RETRY_CAP_MS;
  const capped = Math.min(base, RETRY_CAP_MS);
  // Add jitter: 50-150% of base delay
  const jitter = 0.5 + Math.random();
  return Math.round(capped * jitter);
}

function defaultShouldRetry(err: Error): boolean {
  return err instanceof BridgeError && err.retryable;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = getMaxRetries(options.maxRetries);
  const shouldRetry = options.shouldRetry ?? defaultShouldRetry;

  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable = err instanceof Error && shouldRetry(err);
      if (attempt < maxRetries && isRetryable) {
        const delay = getDelay(attempt);
        process.stderr.write(
          `[codex-bridge] Transient error (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms...\n`,
        );
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
}
