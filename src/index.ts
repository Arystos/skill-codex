import { startServer } from "./server.js";

startServer().catch((err) => {
  process.stderr.write(`[codex-bridge] Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
