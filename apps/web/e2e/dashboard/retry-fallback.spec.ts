import { test } from "@playwright/test";

/**
 * Gap 4 scenario 4 — offer expiry, same-cleaner retry, and auto-fallback are covered by unit tests
 * (`lib/dispatch/userSelectedOfferExpiryRetry.test.ts`, `redispatchAfterOfferReject.test.ts`) and depend on
 * real TTL + cron/RPC timing. No stable Playwright simulation ships yet.
 */
test.describe("Dispatch retry / fallback smoke", () => {
  test("TTL-driven offer expiry chain (not automated here)", () => {
    test.skip(
      true,
      "Blocker: requires deterministic offer expiry + worker hooks without waiting production TTL. See e2e/dashboard/README.md and dispatch unit tests for contract coverage.",
    );
  });
});
