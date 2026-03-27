export class BridgeError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(message: string, code: string, retryable: boolean) {
    super(message);
    this.name = "BridgeError";
    this.code = code;
    this.retryable = retryable;
  }
}

export class CliNotFoundError extends BridgeError {
  constructor(binary: string = "codex") {
    super(
      `${binary} CLI not found on PATH. Install it with: npm i -g @openai/codex`,
      "CLI_NOT_FOUND",
      false,
    );
    this.name = "CliNotFoundError";
  }
}

export class AuthExpiredError extends BridgeError {
  constructor() {
    super(
      "Codex authentication expired or not found. Run `codex login` to re-authenticate.",
      "AUTH_EXPIRED",
      false,
    );
    this.name = "AuthExpiredError";
  }
}

export class RecursionLimitError extends BridgeError {
  constructor(depth: number, max: number) {
    super(
      `Maximum bridge nesting depth reached (${depth} >= ${max}). This prevents infinite recursion between Claude and Codex.`,
      "RECURSION_LIMIT",
      false,
    );
    this.name = "RecursionLimitError";
  }
}

export class LockConflictError extends BridgeError {
  constructor(pid: number) {
    super(
      `Another skill-codex instance is running (PID ${pid}). Wait for it to finish or delete the lock file.`,
      "LOCK_CONFLICT",
      false,
    );
    this.name = "LockConflictError";
  }
}

export class TimeoutError extends BridgeError {
  constructor(timeoutMs: number) {
    super(
      `Codex timed out after ${Math.round(timeoutMs / 1000)}s. Increase SKILL_CODEX_TIMEOUT_MS if needed.`,
      "TIMEOUT",
      true,
    );
    this.name = "TimeoutError";
  }
}

export class RateLimitError extends BridgeError {
  constructor() {
    super(
      "Codex rate limited (429). Will retry with backoff.",
      "RATE_LIMIT",
      true,
    );
    this.name = "RateLimitError";
  }
}

export class ServerError extends BridgeError {
  constructor(detail: string = "") {
    super(
      `Codex server error${detail ? `: ${detail}` : ""}. Will retry.`,
      "SERVER_ERROR",
      true,
    );
    this.name = "ServerError";
  }
}

export class NetworkError extends BridgeError {
  constructor(detail: string = "") {
    super(
      `Network error connecting to Codex${detail ? `: ${detail}` : ""}. Check your connection.`,
      "NETWORK_ERROR",
      true,
    );
    this.name = "NetworkError";
  }
}

export class EmptyOutputError extends BridgeError {
  constructor() {
    super(
      "Codex returned empty output. This may be a transient issue.",
      "EMPTY_OUTPUT",
      true,
    );
    this.name = "EmptyOutputError";
  }
}

export class NotGitRepoError extends BridgeError {
  constructor(cwd: string) {
    super(
      `Not a git repository: ${cwd}. This operation requires a git repo.`,
      "NOT_GIT_REPO",
      false,
    );
    this.name = "NotGitRepoError";
  }
}

export class ParseError extends BridgeError {
  constructor(detail: string = "") {
    super(
      `Failed to parse Codex output${detail ? `: ${detail}` : ""}. The Codex CLI format may have changed — please update skill-codex.`,
      "PARSE_ERROR",
      false,
    );
    this.name = "ParseError";
  }
}
