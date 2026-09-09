import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 10000,
    // Integration tests share one real Postgres test database and reset
    // shared tables (e.g. BusinessSettings) between cases — running test
    // files in parallel causes cross-file races against that shared state.
    fileParallelism: false,
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, ".") },
  },
});
