import { describe, it, expect, vi } from "vitest";
import { withRetry } from "../../src/runner/retry.js";
import { BridgeError, RateLimitError, AuthExpiredError } from "../../src/errors/errors.js";

describe("withRetry", () => {
  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { maxRetries: 3 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on retryable error and succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new RateLimitError())
      .mockResolvedValue("ok");
    const result = await withRetry(fn, { maxRetries: 3 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-retryable errors", async () => {
    const fn = vi.fn().mockRejectedValue(new AuthExpiredError());
    await expect(withRetry(fn, { maxRetries: 3 })).rejects.toThrow(AuthExpiredError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("stops after max retries", async () => {
    const fn = vi.fn().mockRejectedValue(new RateLimitError());
    await expect(withRetry(fn, { maxRetries: 2 })).rejects.toThrow(RateLimitError);
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("does not retry non-BridgeError", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("random"));
    await expect(withRetry(fn, { maxRetries: 3 })).rejects.toThrow("random");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
