import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Real-Codex end-to-end tests (#23). They start the built MCP server
 * (`dist/index.js`), call `codex_exec` over stdio, and spend real Codex quota,
 * so they run only through `npm run test:e2e`, never in `npm test` or CI.
 *
 * Calls run one at a time: each one waits on the Codex API, and the resume
 * test depends on the session the first call opens.
 */
export default defineConfig({
  test: {
    root: fileURLToPath(new URL(".", import.meta.url)),
    include: ["**/*.e2e.test.ts"],
    fileParallelism: false,
    testTimeout: 300_000,
    hookTimeout: 60_000,
  },
});
