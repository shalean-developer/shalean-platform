import { describe, expect, it } from "vitest";
import { bookingCustomerKey, bookingCustomerOwnershipPatch } from "@/lib/booking/bookingCustomerIdentity";

describe("bookingCustomerOwnershipPatch", () => {
  it("writes customer_id on production schema", () => {
    expect(bookingCustomerOwnershipPatch("abc-123", "customer_id")).toEqual({ customer_id: "abc-123" });
  });

  it("writes user_id on legacy schema", () => {
    expect(bookingCustomerOwnershipPatch("abc-123", "user_id")).toEqual({ user_id: "abc-123" });
  });
});

describe("bookingCustomerKey", () => {
  it("prefers customer_id when both are set", () => {
    expect(bookingCustomerKey({ customer_id: "c1", user_id: "u1" })).toBe("c1");
  });
});
