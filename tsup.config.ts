import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
    },
    format: ["esm"],
    target: "node18",
    dts: true,
    clean: true,
    sourcemap: true,
    splitting: false,
  },
  {
    entry: {
      "bin/skill-codex": "bin/skill-codex.ts",
    },
    format: ["esm"],
    target: "node18",
    dts: false,
    clean: false,
    sourcemap: true,
    splitting: false,
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
