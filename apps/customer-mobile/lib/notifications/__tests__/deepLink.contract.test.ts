import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveCustomerNotificationDeepLink } from "../resolveCustomerNotificationDeepLink";

describe("resolveCustomerNotificationDeepLink", () => {
  it("uses explicit path when safe", () => {
    assert.equal(
      resolveCustomerNotificationDeepLink({ path: "/bookings/abc" }),
      "/bookings/abc",
    );
  });

  it("rejects path that looks like an absolute URL", () => {
    assert.equal(
      resolveCustomerNotificationDeepLink({ path: "https://evil.example/x" }),
      null,
    );
    assert.equal(resolveCustomerNotificationDeepLink({ path: "//evil.example" }), null);
  });

  it("routes booking_id to booking detail", () => {
    assert.equal(
      resolveCustomerNotificationDeepLink({ booking_id: "b1" }),
      "/bookings/b1",
    );
    assert.equal(
      resolveCustomerNotificationDeepLink({ bookingId: "b2" }),
      "/bookings/b2",
    );
  });

  it("routes en-route / arrived types to track", () => {
    assert.equal(
      resolveCustomerNotificationDeepLink({ booking_id: "b1", type: "en_route" }),
      "/bookings/b1/track",
    );
    assert.equal(
      resolveCustomerNotificationDeepLink({ bookingId: "b1", type: "arrived" }),
      "/bookings/b1/track",
    );
  });

  it("routes review type to leave-review screen", () => {
    assert.equal(
      resolveCustomerNotificationDeepLink({ booking_id: "b1", type: "review" }),
      "/bookings/b1/review",
    );
  });

  it("routes invoice / inbox / rewards type without booking", () => {
    assert.equal(
      resolveCustomerNotificationDeepLink({ type: "invoice" }),
      "/profile/invoices",
    );
    assert.equal(
      resolveCustomerNotificationDeepLink({ type: "inbox" }),
      "/profile/notifications",
    );
    assert.equal(
      resolveCustomerNotificationDeepLink({ type: "rewards" }),
      "/(tabs)/rewards",
    );
  });

  it("returns null for empty payload", () => {
    assert.equal(resolveCustomerNotificationDeepLink(undefined), null);
    assert.equal(resolveCustomerNotificationDeepLink({}), null);
  });
});
