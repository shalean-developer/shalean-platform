import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

// Load local E2E secrets (E2E_DISPATCH, JWTs, etc.) — see e2e/README.md and .env.example.
dotenv.config({ path: path.resolve(__dirname, ".env.local") });

// One secret in `.env.local`: reuse server `DISPATCH_LOAD_TEST_SECRET` for E2E when unset.
if (!process.env.E2E_DISPATCH_LOAD_TEST_SECRET?.trim() && process.env.DISPATCH_LOAD_TEST_SECRET?.trim()) {
  process.env.E2E_DISPATCH_LOAD_TEST_SECRET = process.env.DISPATCH_LOAD_TEST_SECRET.trim();
}

// Remote target: skip starting local `npm run dev` unless explicitly overridden.
const baseURL = process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://localhost:3000";
const isRemoteBaseUrl = !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(baseURL);
if (isRemoteBaseUrl && process.env.PLAYWRIGHT_SKIP_WEBSERVER !== "0") {
  process.env.PLAYWRIGHT_SKIP_WEBSERVER = "1";
}

/**
 * E2E harness for booking flows.
 *
 * - Local: start `npm run dev` in another terminal, or let Playwright start it via `webServer`.
 * - Remote preview: set `PLAYWRIGHT_BASE_URL` and `PLAYWRIGHT_SKIP_WEBSERVER=1`.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer:
    process.env.PLAYWRIGHT_SKIP_WEBSERVER === "1"
      ? undefined
      : {
          command: "npm run dev",
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
        },
});
