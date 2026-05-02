import os from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

const maxThreads = Math.max(2, Math.floor(os.cpus().length / 2));

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["lib/**/*.test.ts", "app/api/**/__tests__/*.test.ts"],
    pool: "threads",
    poolOptions: {
      threads: {
        singleThread: false,
        isolate: true,
        maxThreads,
      },
    },
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "vitest-shims/server-only.ts"),
    },
  },
});
