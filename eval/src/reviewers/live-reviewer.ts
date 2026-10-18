import { spawn } from "node:child_process";
import type { ReviewerInput, ReviewOutput } from "../types.js";
import type { Reviewer } from "./types.js";

/**
 * LIVE reviewer — the real, paid integration the USER runs themselves.
 *
 * This module deliberately makes NO model/CLI call unless the user explicitly
 * configures one. The default `notConfiguredReviewer` throws with instructions,
 * so `npm run eval` can never silently spend the user's Codex quota or hit a
 * paid API behind their back. Cross-model numbers are the user's call to run.
 *
 * Two ways to wire a real reviewer:
 *
 *   1. commandReviewer({ command, args }) — shells out to ANY CLI that reads a
 *      diff on stdin and prints a review on stdout. This is how you point the
 *      eval at `codex exec`, the skill-codex MCP server, a `claude -p` call, or
 *      a shell script that fans out to both. The harness pipes the diff to the
 *      process stdin; whatever it prints becomes the review text.
 *
 *   2. Implement the `Reviewer` type yourself (an async fn returning ReviewOutput)
 *      and pass it to the harness — e.g. call the Anthropic SDK or the Codex
 *      MCP tool directly. See eval/README.md for a worked example.
 *
 * Either way, the reviewer must base its verdict ONLY on the diff text, never
 * on the manifest answer key.
 */

/** The default reviewer: refuses to run, with guidance. Never spends money. */
export const notConfiguredReviewer: Reviewer = async (input) => {
  throw new Error(
    [
      `No live reviewer is configured (case "${input.id}").`,
      "",
      "This is intentional: the eval will not make paid model/CLI calls on its own.",
      "To get real numbers, configure a live reviewer — see eval/README.md.",
      "Quick path:  REVIEWER_CMD='codex exec --sandbox read-only' npm run eval -- --live",
    ].join("\n"),
  );
};

/** Options for a CLI-backed reviewer. */
export interface CommandReviewerOptions {
  /** Executable to run, e.g. "codex". */
  readonly command: string;
  /** Fixed args, e.g. ["exec", "--sandbox", "read-only"]. */
  readonly args?: readonly string[];
  /** Identity for the report, e.g. "codex:gpt-6.1-sol". Defaults to `command`. */
  readonly reviewer?: string;
  /** Per-call timeout in ms. */
  readonly timeoutMs?: number;
  /**
   * How to present the diff to the process. "stdin" pipes the diff to stdin
   * (default). "prompt-arg" appends a prompt+diff string as the final arg.
   */
  readonly mode?: "stdin" | "prompt-arg";
  /** Prompt prefix used to instruct the reviewer. */
  readonly promptPrefix?: string;
}

const DEFAULT_PROMPT_PREFIX =
  "You are a code reviewer. Review the following diff and list every bug you find " +
  "with severity (CRITICAL/HIGH/MEDIUM/LOW), the file, and a one-line explanation. " +
  "Do not assume the change is correct.\n\n";

const DEFAULT_TIMEOUT_MS = 300_000;

/**
 * Best-effort termination of a (possibly nested) child. On Windows we spawn the
 * reviewer through the shell, so `child` is `cmd.exe` and the real CLI is a
 * grandchild — SIGTERM on the shell would orphan it. `taskkill /T` reaps the
 * whole tree; elsewhere a SIGTERM on the direct child suffices.
 */
function killTree(child: ReturnType<typeof spawn>): void {
  if (process.platform === "win32" && child.pid !== undefined) {
    try {
      spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
      });
    } catch {
      child.kill("SIGKILL");
    }
  } else {
    child.kill("SIGTERM");
  }
}

/** Run a child process, feeding the diff in, capturing stdout. */
function runCommand(
  opts: CommandReviewerOptions,
  input: ReviewerInput,
): Promise<string> {
  const prompt = `${opts.promptPrefix ?? DEFAULT_PROMPT_PREFIX}\`\`\`diff\n${input.diffText}\n\`\`\`\n`;
  const baseArgs = [...(opts.args ?? [])];
  const args =
    opts.mode === "prompt-arg" ? [...baseArgs, prompt] : baseArgs;

  // On Windows we must run through the shell so `.cmd`/`.ps1` CLI shims resolve
  // (a bare spawn() ENOENTs). But under a shell, args are concatenated WITHOUT
  // escaping (Node DEP0190), so appending the prompt+diff — full of quotes,
  // backticks and newlines — as a shell argument is unsafe and corrupts the
  // command line. Refuse that combination and steer to stdin mode, which pipes
  // the prompt and sidesteps shell quoting entirely (codex/claude both read it).
  const useShell = process.platform === "win32";
  if (useShell && opts.mode === "prompt-arg") {
    return Promise.reject(
      new Error(
        `Live reviewer "${opts.command}": prompt-arg mode is unsafe on Windows ` +
          `(the prompt would be concatenated into the shell command line unescaped). ` +
          `Use stdin mode instead — drop REVIEWER_MODE or set it to "stdin"; ` +
          `codex (\`codex exec\`) and claude (\`claude -p\`) both read the prompt from stdin.`,
      ),
    );
  }

  return new Promise<string>((resolvePromise, reject) => {
    const child = spawn(opts.command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: useShell,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      killTree(child);
      reject(
        new Error(
          `Live reviewer "${opts.command}" timed out after ${opts.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms on case "${input.id}".`,
        ),
      );
    }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Failed to spawn live reviewer "${opts.command}": ${err.message}`,
        ),
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout.trim()) {
        reject(
          new Error(
            `Live reviewer "${opts.command}" exited ${code} with no output on case "${input.id}".\n${stderr.slice(0, 500)}`,
          ),
        );
        return;
      }
      resolvePromise(stdout);
    });

    if (opts.mode !== "prompt-arg") {
      child.stdin.write(prompt);
      child.stdin.end();
    }
  });
}

/**
 * Build a CLI-backed live Reviewer. The user supplies the command; the harness
 * supplies the diff. No answer-key data is ever passed to the process.
 */
export function makeCommandReviewer(opts: CommandReviewerOptions): Reviewer {
  const reviewerId = opts.reviewer ?? opts.command;
  return async (input: ReviewerInput): Promise<ReviewOutput> => {
    const stdout = await runCommand(opts, input);
    if (!stdout.trim()) {
      throw new Error(
        `Live reviewer "${opts.command}" returned empty output on case "${input.id}".`,
      );
    }
    return Object.freeze({ text: stdout, reviewer: reviewerId });
  };
}

/**
 * Build a reviewer from the REVIEWER_CMD environment variable, if set. The
 * value is split on whitespace; the first token is the command, the rest are
 * fixed args. Returns null when unset, so callers can fall back to the mock.
 *
 * Note: the whitespace split is intentionally simple — it does NOT honor quoting
 * or escaped spaces, so a command path containing spaces (or an arg with an
 * embedded space) won't parse as one token. Keep REVIEWER_CMD to a bare command
 * plus simple flags (e.g. `codex exec --sandbox read-only`); for anything richer,
 * point it at a wrapper script, or build a reviewer in code (see eval/README.md).
 */
export function commandReviewerFromEnv(env: NodeJS.ProcessEnv = process.env): Reviewer | null {
  const raw = env.REVIEWER_CMD?.trim();
  if (!raw) return null;
  const parts = raw.split(/\s+/);
  const [command, ...args] = parts;
  return makeCommandReviewer({
    command,
    args,
    reviewer: env.REVIEWER_ID ?? command,
    mode: (env.REVIEWER_MODE as "stdin" | "prompt-arg") ?? "stdin",
    timeoutMs: env.REVIEWER_TIMEOUT_MS ? Number(env.REVIEWER_TIMEOUT_MS) : undefined,
  });
}
