import { describe, expect, it } from "vitest";
import { allowPaystackVerifyRequest } from "@/lib/rateLimit/paystackVerifyIpLimit";

describe("allowPaystackVerifyRequest", () => {
  it("allows under cap then returns 429 semantics via false", () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 40; i++) {
      expect(allowPaystackVerifyRequest(key)).toBe(true);
    }
    expect(allowPaystackVerifyRequest(key)).toBe(false);
  });
});
