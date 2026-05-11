import { describe, it, expect } from "vitest";
import { resolveWidgetDraftBookingOwnership } from "@/lib/booking/widgetDraftOwnership";

describe("resolveWidgetDraftBookingOwnership", () => {
  const uid = "00000000-0000-4000-8000-000000000001";

  it("guest: sets normalized customer_email only", () => {
    const r = resolveWidgetDraftBookingOwnership({
      guestEmail: "  Test@Example.com ",
    });
    expect(r.user_id).toBeNull();
    expect(r.customer_email).toBe("test@example.com");
  });

  it("guest: null email when missing or too short", () => {
    expect(
      resolveWidgetDraftBookingOwnership({ guestEmail: "ab" }).customer_email,
    ).toBeNull();
    expect(
      resolveWidgetDraftBookingOwnership({ guestEmail: null }).customer_email,
    ).toBeNull();
  });

  it("authenticated: always sets user_id; prefers auth email", () => {
    const r = resolveWidgetDraftBookingOwnership({
      authUserId: uid,
      authEmail: "auth@example.com",
      guestEmail: "other@example.com",
    });
    expect(r.user_id).toBe(uid);
    expect(r.customer_email).toBe("auth@example.com");
  });

  it("authenticated: falls back to guest email when auth email missing", () => {
    const r = resolveWidgetDraftBookingOwnership({
      authUserId: uid,
      authEmail: null,
      guestEmail: "guest@example.com",
    });
    expect(r.user_id).toBe(uid);
    expect(r.customer_email).toBe("guest@example.com");
  });

  it("never sets user_id from email alone", () => {
    const r = resolveWidgetDraftBookingOwnership({
      guestEmail: "only@example.com",
    });
    expect(r.user_id).toBeNull();
  });

  it("rejects non-uuid auth id (treat as guest)", () => {
    const r = resolveWidgetDraftBookingOwnership({
      authUserId: "not-a-uuid",
      authEmail: "a@b.com",
      guestEmail: "g@example.com",
    });
    expect(r.user_id).toBeNull();
    expect(r.customer_email).toBe("g@example.com");
  });
});
