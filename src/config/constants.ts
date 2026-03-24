export const MAX_BRIDGE_DEPTH = 2;
export const BRIDGE_DEPTH_ENV = "CODEX_BRIDGE_DEPTH";

export const DEFAULT_TIMEOUT_MS = 600_000; // 10 minutes
export const TIMEOUT_ENV = "CODEX_BRIDGE_TIMEOUT_MS";
export const KILL_GRACE_MS = 5_000;

export const MAX_RETRIES = 3;
export const MAX_RETRIES_ENV = "CODEX_BRIDGE_MAX_RETRIES";
export const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];
export const RETRY_CAP_MS = 10_000;

export const MAX_RESPONSE_CHARS = 80_000;

export const LOCK_STALE_MS = 900_000; // 15 minutes
export const LOCK_FILENAME = ".codex-bridge.lock";

export const TRIVIAL_DIFF_THRESHOLD = 5; // lines
export const DOCS_ONLY_EXTENSIONS = [".md", ".txt", ".rst", ".adoc"];
export const SECURITY_PATH_KEYWORDS = ["security", "auth", "crypto", "password", "secret", "token"];
export const FORCE_REVIEW_LINES = 100;
export const FORCE_REVIEW_FILES = 3;

export const CONFIG_ONLY_FILES = [".gitignore", ".eslintrc", ".prettierrc", ".editorconfig"];

export const DEBUG_ENV = "CODEX_BRIDGE_DEBUG";

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
