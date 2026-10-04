import { describe, expect, it } from "vitest";
import {
  createFreshPaymentPreparationToken,
  verifyFreshPaymentPreparationToken,
} from "./freshPaymentPreparationToken";

const secret = "sk_test_payment_preparation_contract";
const claims = {
  bookingId: "11111111-1111-4111-8111-111111111111",
  reference: "bv2_1789561251061_test",
  userId: "22222222-2222-4222-8222-222222222222",
};

describe("fresh payment preparation token", () => {
  it("authorizes the matching fresh booking phase", () => {
    const issuedAt = 1_789_561_251_061;
    const token = createFreshPaymentPreparationToken({ ...claims, issuedAt }, secret);

    expect(token).toBeTruthy();
    expect(
      verifyFreshPaymentPreparationToken(token!, { ...claims, now: issuedAt + 30_000 }, secret),
    ).toBe(true);
  });

  it("rejects tampering, cross-booking reuse, and expired tokens", () => {
    const issuedAt = 1_789_561_251_061;
    const token = createFreshPaymentPreparationToken({ ...claims, issuedAt }, secret)!;

    expect(
      verifyFreshPaymentPreparationToken(`${token}x`, { ...claims, now: issuedAt + 1_000 }, secret),
    ).toBe(false);
    expect(
      verifyFreshPaymentPreparationToken(
        token,
        { ...claims, bookingId: "33333333-3333-4333-8333-333333333333", now: issuedAt + 1_000 },
        secret,
      ),
    ).toBe(false);
    expect(
      verifyFreshPaymentPreparationToken(token, { ...claims, now: issuedAt + 120_001 }, secret),
    ).toBe(false);
  });
});
