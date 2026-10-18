import { defineConfig } from "vitest/config";

/**
 * Dedicated vitest config for the eval harness.
 *
 * The repo's root vitest.config.ts intentionally scopes `include` to
 * `__tests__/**` (the package's own unit tests). The eval ships its own tests
 * under eval/__tests__/ and is verified independently with:
 *
 *   npx vitest run --config eval/vitest.config.ts
 *
 * Keeping a separate config means the eval can grow its own corpus/harness tests
 * without touching the package's test scope or coverage gate.
 */
export default defineConfig({
  test: {
    root: __dirname,
    include: ["__tests__/**/*.test.ts"],
  },
});
