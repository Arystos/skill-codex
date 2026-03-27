import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ChildProcess } from "node:child_process";
import { setupTimeout } from "../../src/runner/timeout.js";
import { TimeoutError } from "../../src/errors/errors.js";

// Mock the platform module so we can test both branches
vi.mock("../../src/util/platform.js", () => ({
  isWindows: vi.fn(() => false),
}));

import { isWindows } from "../../src/util/platform.js";

function makeChild(killed = false): ChildProcess {
  return {
    kill: vi.fn(),
    killed,
  } as unknown as ChildProcess;
}

describe("setupTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(isWindows).mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("rejects with TimeoutError after the timeout elapses", async () => {
    const child = makeChild();
    const { promise } = setupTimeout(child, 1_000);

    vi.advanceTimersByTime(1_000);

    await expect(promise).rejects.toBeInstanceOf(TimeoutError);
  });

  it("does not reject before the timeout elapses", async () => {
    const child = makeChild();
    const { promise } = setupTimeout(child, 1_000);

    vi.advanceTimersByTime(999);

    let settled = false;
    promise.catch(() => { settled = true; });

    // Flush microtasks
    await Promise.resolve();

    expect(settled).toBe(false);
  });

  it("calls child.kill on timeout (Unix: SIGTERM first)", async () => {
    vi.mocked(isWindows).mockReturnValue(false);
    const child = makeChild();
    const { promise } = setupTimeout(child, 1_000);

    vi.advanceTimersByTime(1_000);
    await promise.catch(() => {});

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("sends SIGKILL after grace period on Unix when process survives", async () => {
    vi.mocked(isWindows).mockReturnValue(false);
    const child = makeChild(false); // not killed yet
    const { promise } = setupTimeout(child, 1_000);

    // Trigger timeout (SIGTERM)
    vi.advanceTimersByTime(1_000);
    await promise.catch(() => {});

    // Advance through grace period (5000 ms)
    vi.advanceTimersByTime(5_000);
    await Promise.resolve();

    const calls = vi.mocked(child.kill).mock.calls;
    expect(calls.some(([sig]) => sig === "SIGKILL")).toBe(true);
  });

  it("does not send SIGKILL if process already killed on Unix", async () => {
    vi.mocked(isWindows).mockReturnValue(false);
    const child = makeChild(true); // already killed
    const { promise } = setupTimeout(child, 1_000);

    vi.advanceTimersByTime(1_000);
    await promise.catch(() => {});

    vi.advanceTimersByTime(5_000);
    await Promise.resolve();

    const calls = vi.mocked(child.kill).mock.calls;
    expect(calls.some(([sig]) => sig === "SIGKILL")).toBe(false);
  });

  it("calls child.kill() with no args on Windows (immediate TerminateProcess)", async () => {
    vi.mocked(isWindows).mockReturnValue(true);
    const child = makeChild();
    const { promise } = setupTimeout(child, 1_000);

    vi.advanceTimersByTime(1_000);
    await promise.catch(() => {});

    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledWith();
  });

  it("does not set a grace timer on Windows (no SIGKILL scheduled)", async () => {
    vi.mocked(isWindows).mockReturnValue(true);
    const child = makeChild();
    const { promise } = setupTimeout(child, 1_000);

    vi.advanceTimersByTime(1_000);
    await promise.catch(() => {});

    // Advance well past grace period — kill should still only be called once
    vi.advanceTimersByTime(10_000);
    await Promise.resolve();

    expect(child.kill).toHaveBeenCalledTimes(1);
  });

  it("clears the main timer when clear() is called before timeout", async () => {
    const child = makeChild();
    const { clear, promise } = setupTimeout(child, 1_000);

    clear();
    vi.advanceTimersByTime(2_000);

    let rejected = false;
    promise.catch(() => { rejected = true; });
    await Promise.resolve();

    expect(rejected).toBe(false);
    expect(child.kill).not.toHaveBeenCalled();
  });

  it("clears the grace timer when clear() is called after timeout fires", async () => {
    vi.mocked(isWindows).mockReturnValue(false);
    const child = makeChild(false);
    const { clear, promise } = setupTimeout(child, 1_000);

    vi.advanceTimersByTime(1_000);
    await promise.catch(() => {});

    clear(); // clears grace timer

    vi.advanceTimersByTime(5_000);
    await Promise.resolve();

    // Only SIGTERM should have been sent; no SIGKILL
    const calls = vi.mocked(child.kill).mock.calls;
    expect(calls.some(([sig]) => sig === "SIGKILL")).toBe(false);
  });
});
