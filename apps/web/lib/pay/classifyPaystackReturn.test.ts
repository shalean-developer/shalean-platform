import { describe, expect, it } from "vitest";

import { classifyPaystackReturn } from "@/lib/pay/classifyPaystackReturn";

describe("classifyPaystackReturn", () => {
  it("routes Paystack reference callbacks to verification", () => {
    expect(classifyPaystackReturn({ reference: "bps_paid" })).toEqual({
      kind: "callback",
      reference: "bps_paid",
    });
  });

  it("routes Paystack trxref callbacks to verification", () => {
    expect(classifyPaystackReturn({ trxref: "bps_paid" })).toEqual({
      kind: "callback",
      reference: "bps_paid",
    });
  });

  it("keeps Shalean ref links on the unpaid checkout path", () => {
    expect(classifyPaystackReturn({ ref: "bps_unpaid" })).toEqual({
      kind: "payment_link",
      reference: "bps_unpaid",
    });
  });

  it("prioritizes a gateway callback so a paid return cannot render Pay now", () => {
    expect(
      classifyPaystackReturn({
        ref: "bps_old",
        reference: "bps_paid",
        trxref: "bps_paid",
      }),
    ).toEqual({
      kind: "callback",
      reference: "bps_paid",
    });
  });

  it("rejects blank return parameters", () => {
    expect(classifyPaystackReturn({ ref: " ", reference: "", trxref: " " })).toEqual({
      kind: "missing",
      reference: "",
    });
  });
});
