export const MAX_BRIDGE_DEPTH = 2;
export const BRIDGE_DEPTH_ENV = "SKILL_CODEX_DEPTH";

export const DEFAULT_TIMEOUT_MS = 300_000; // 5 minutes (override via SKILL_CODEX_TIMEOUT_MS or per-call timeoutMs)
export const TIMEOUT_ENV = "SKILL_CODEX_TIMEOUT_MS";
export const KILL_GRACE_MS = 5_000;

/** How often to emit a heartbeat progress message during quiet stretches. */
export const HEARTBEAT_INTERVAL_MS = 10_000;

export const MAX_RETRIES = 3;
export const MAX_RETRIES_ENV = "SKILL_CODEX_MAX_RETRIES";
export const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];
export const RETRY_CAP_MS = 10_000;

// Claude Code saves an MCP text result over 50,000 characters to a file and
// shows only the path, and warns above 10,000 tokens. 36,000 characters
// (~9k tokens, plus header and activity lines) keeps a codex_exec answer inline
// and under the warning. Longer answers are saved in full; see saveFullOutput.
export const MAX_RESPONSE_CHARS = 36_000;
/** Most recent activity lines (commands, file writes) shown in a response. */
export const MAX_ACTIVITY_LINES = 40;

/** Most extra writable roots one codex_exec call may add with `addDirs`. */
export const MAX_ADD_DIRS = 16;

export const LOCK_STALE_MS = 900_000; // 15 minutes
export const LOCK_FILENAME = ".skill-codex.lock";

// Live, human-readable per-run log. Codex emits JSONL that the MCP transport
// buffers until completion; tailing this file shows progress in real time.
// Defaults to a per-workspace file under the OS temp dir so a run never writes
// a growing log into the user's working repo. Override with an absolute path
// via SKILL_CODEX_LOG. The resolved path is printed at run start and returned
// in the tool response, so it stays discoverable.
export const LOG_ENV = "SKILL_CODEX_LOG";

export const TRIVIAL_DIFF_THRESHOLD = 5; // lines
export const DOCS_ONLY_EXTENSIONS = [".md", ".txt", ".rst", ".adoc"];
export const SECURITY_PATH_KEYWORDS = ["security", "auth", "crypto", "password", "secret", "token"];
export const FORCE_REVIEW_LINES = 100;
export const FORCE_REVIEW_FILES = 3;

export const CONFIG_ONLY_FILES = [".gitignore", ".eslintrc", ".prettierrc", ".editorconfig"];

export const DEBUG_ENV = "SKILL_CODEX_DEBUG";

// Windows sandbox backend passed as `-c windows.sandbox=<mode>`. Chosen from
// SKILL_CODEX_WINDOWS_SANDBOX, else `[windows] sandbox` in ~/.codex/config.toml,
// else WINDOWS_SANDBOX_DEFAULT. What each backend can do is documented in
// src/runner/sandbox-args.ts.
export const WINDOWS_SANDBOX_ENV = "SKILL_CODEX_WINDOWS_SANDBOX";
// The values codex-rs accepts for `windows.sandbox` (windows_sandbox_config.rs).
export const WINDOWS_SANDBOX_MODES = ["elevated", "unelevated", "mxc"] as const;
export type WindowsSandboxMode = (typeof WINDOWS_SANDBOX_MODES)[number];
// Used only when neither is set: unelevated needs no one-time elevated setup,
// but Codex can't start child processes under it (no builds or tests, #26).
export const WINDOWS_SANDBOX_DEFAULT: WindowsSandboxMode = "unelevated";

export const TRANSIENT_PATTERNS = [
  "rate limit", "too many requests", "429",
  "500", "502", "503", "504",
  "internal server error", "bad gateway", "service unavailable", "gateway timeout",
  "connection reset", "connection refused",
  "econnreset", "econnrefused", "etimedout",
  "network error", "fetch failed", "socket hang up",
] as const;

export const AUTH_ERROR_PATTERNS = [
  "api key", "authentication", "unauthorized", "401", "auth",
] as const;
