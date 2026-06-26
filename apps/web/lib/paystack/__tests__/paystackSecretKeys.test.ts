import { describe, expect, it, vi } from "vitest";

import {
  describePaystackKeyModes,
  getPaystackSecretKeyCandidates,
} from "@/lib/paystack/paystackSecretKeys";

describe("paystackSecretKeys", () => {
  it("dedupes identical secrets across env vars", () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_primary");
    vi.stubEnv("PAYSTACK_SECRET_KEY_TEST", "sk_test_primary");
    vi.stubEnv("PAYSTACK_SECRET_KEY_LIVE", "sk_live_other");

    const keys = getPaystackSecretKeyCandidates();
    expect(keys).toHaveLength(2);
    expect(keys.map((k) => k.secret)).toEqual(["sk_test_primary", "sk_live_other"]);
    expect(describePaystackKeyModes(keys)).toBe("primary(test), live(live)");
  });
});
