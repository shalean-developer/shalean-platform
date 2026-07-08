import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  customerRebookLandingUrl,
  customerRebookTokenSubjectForBooking,
  isCustomerRebookLinkSigningConfigured,
  signCustomerRebookToken,
  verifyCustomerRebookToken,
} from "@/lib/customer/customerRebookLinkToken";

describe("customerRebookLinkToken", () => {
  const prevSecret = process.env.CUSTOMER_REBOOK_LINK_SECRET;

  beforeEach(() => {
    process.env.CUSTOMER_REBOOK_LINK_SECRET = "test-customer-rebook-secret-at-least-16-chars";
  });

  afterEach(() => {
    if (prevSecret === undefined) delete process.env.CUSTOMER_REBOOK_LINK_SECRET;
    else process.env.CUSTOMER_REBOOK_LINK_SECRET = prevSecret;
  });

  it("reports signing configured when secret is set", () => {
    expect(isCustomerRebookLinkSigningConfigured()).toBe(true);
  });

  it("round-trips a user-scoped token", () => {
    const token = signCustomerRebookToken({ userId: "user-123" });
    const payload = verifyCustomerRebookToken(token);
    expect(payload?.sub).toBe("user-123");
    expect(payload?.bid).toBeUndefined();
  });

  it("round-trips a booking-scoped token", () => {
    const token = signCustomerRebookToken({ userId: "user-123", bookingId: "bk-456" });
    const payload = verifyCustomerRebookToken(token);
    expect(payload?.sub).toBe("user-123");
    expect(payload?.bid).toBe("bk-456");
  });

  it("supports guest booking subject", () => {
    const subject = customerRebookTokenSubjectForBooking("bk-guest");
    const token = signCustomerRebookToken({ userId: subject, bookingId: "bk-guest" });
    const payload = verifyCustomerRebookToken(token);
    expect(payload?.sub).toBe("booking:bk-guest");
    expect(payload?.bid).toBe("bk-guest");
  });

  it("rejects tampered tokens", () => {
    const token = signCustomerRebookToken({ userId: "user-123" });
    const payload = verifyCustomerRebookToken(`${token}x`);
    expect(payload).toBeNull();
  });

  it("builds a signed landing URL", () => {
    const url = customerRebookLandingUrl({ userId: "user-123" });
    expect(url).toMatch(/\/rebook\?t=/);
  });
});
