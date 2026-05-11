import { describe, it, expect } from "vitest";
import { parseWidgetDraftCreateBody } from "@/lib/booking/bookingWidgetDraft";

const validCore = {
  service: "standard",
  date: "2026-05-11",
  time: "09:00",
  bedrooms: 2,
  bathrooms: 1,
  extras: [] as string[],
  location: "Test City",
};

describe("parseWidgetDraftCreateBody", () => {
  it("extracts guestEmail from customer_email and parses intake", () => {
    const { intake, guestEmail } = parseWidgetDraftCreateBody({
      ...validCore,
      customer_email: "  Guest@Example.com ",
    });
    expect(guestEmail).toBe("Guest@Example.com");
    expect(intake?.service).toBe("standard");
    expect(intake?.bedrooms).toBe(2);
  });

  it("falls back to email property", () => {
    const { guestEmail } = parseWidgetDraftCreateBody({
      ...validCore,
      email: "x@y.co",
    });
    expect(guestEmail).toBe("x@y.co");
  });

  it("prefers customer_email over email", () => {
    const { guestEmail } = parseWidgetDraftCreateBody({
      ...validCore,
      customer_email: "a@b.com",
      email: "c@d.com",
    });
    expect(guestEmail).toBe("a@b.com");
  });

  it("returns null intake for invalid payload", () => {
    const { intake } = parseWidgetDraftCreateBody({ foo: 1 });
    expect(intake).toBeNull();
  });

  it("returns null intake when service is not a widget key (route would 400 before insert)", () => {
    const { intake } = parseWidgetDraftCreateBody({
      ...validCore,
      service: "not-a-widget-service",
    });
    expect(intake).toBeNull();
  });
});
