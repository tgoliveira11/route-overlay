import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Explicit live-test config. The default Vitest config does not include this
 * directory, and the suite still skips unless ROUTE_OVERLAY_LIVE_EXPERIMENT=true.
 */
export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["tests/live/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
