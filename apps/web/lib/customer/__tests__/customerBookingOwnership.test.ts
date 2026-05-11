import { describe, expect, it } from "vitest";
import {
  customerCanAccessBookingRow,
  mergeCustomerBookingListsByCreatedAtDesc,
} from "@/lib/customer/customerBookingOwnership";

describe("customerCanAccessBookingRow", () => {
  const uid = "11111111-1111-4111-8111-111111111111";

  it("allows when user_id matches auth uid", () => {
    expect(
      customerCanAccessBookingRow({ user_id: uid, customer_email: "other@x.com" }, uid, "me@example.com"),
    ).toBe(true);
  });

  it("allows orphan row when user_id null and email matches viewer", () => {
    expect(
      customerCanAccessBookingRow({ user_id: null, customer_email: "Me@Example.com" }, uid, "me@example.com"),
    ).toBe(true);
  });

  it("denies when user_id belongs to another account", () => {
    expect(
      customerCanAccessBookingRow(
        { user_id: "22222222-2222-4222-8222-222222222222", customer_email: "me@example.com" },
        uid,
        "me@example.com",
      ),
    ).toBe(false);
  });

  it("denies orphan when email does not match viewer", () => {
    expect(
      customerCanAccessBookingRow({ user_id: null, customer_email: "you@example.com" }, uid, "me@example.com"),
    ).toBe(false);
  });
});

describe("mergeCustomerBookingListsByCreatedAtDesc", () => {
  it("dedupes by id and sorts by created_at descending", () => {
    const a = [
      { id: "a", created_at: "2026-01-01T00:00:00.000Z" },
      { id: "b", created_at: "2026-01-03T00:00:00.000Z" },
    ];
    const b = [
      { id: "b", created_at: "2026-01-03T00:00:00.000Z" },
      { id: "c", created_at: "2026-01-02T00:00:00.000Z" },
    ];
    const out = mergeCustomerBookingListsByCreatedAtDesc(a, b);
    expect(out.map((x) => x.id)).toEqual(["b", "c", "a"]);
  });
});
