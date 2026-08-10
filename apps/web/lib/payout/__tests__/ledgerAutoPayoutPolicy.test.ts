import { afterEach, describe, expect, it, vi } from "vitest";

import { isLedgerAutoPayoutEnabled } from "@/lib/payout/ledgerAutoPayoutPolicy";

describe("isLedgerAutoPayoutEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to disabled so the weekly rail remains canonical", () => {
    vi.stubEnv("LEDGER_AUTO_PAYOUT_ENABLED", "");
    expect(isLedgerAutoPayoutEnabled()).toBe(false);
  });

  it("requires an explicit true value", () => {
    vi.stubEnv("LEDGER_AUTO_PAYOUT_ENABLED", " TRUE ");
    expect(isLedgerAutoPayoutEnabled()).toBe(true);

    vi.stubEnv("LEDGER_AUTO_PAYOUT_ENABLED", "1");
    expect(isLedgerAutoPayoutEnabled()).toBe(false);
  });
});
