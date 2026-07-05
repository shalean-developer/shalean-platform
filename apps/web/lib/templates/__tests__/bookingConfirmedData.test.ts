import { describe, expect, it } from "vitest";
import { buildBookingConfirmedTemplateData } from "@/lib/templates/bookingConfirmedData";
import type { BookingEmailPayload } from "@/lib/email/bookingEmailPayload";

const basePayload = (): BookingEmailPayload => ({
  customerEmail: "alex@example.com",
  customerName: "Alex",
  serviceLabel: "Regular Cleaning",
  dateLabel: "Mon, 1 Dec 2025",
  timeLabel: "09:00",
  location: "12 Main Rd, Cape Town",
  cleanerName: null,
  totalPaidZar: 299,
  paymentReference: "PSK-ABC-123",
  bookingId: "00000000-0000-4000-8000-000000000099",
});

describe("buildBookingConfirmedTemplateData", () => {
  it("includes all canonical email variables", () => {
    const data = buildBookingConfirmedTemplateData(basePayload());
    expect(data.customer_name).toBe("Alex");
    expect(data.service_name).toBe("Regular Cleaning");
    expect(data.booking_date).toBe("Mon, 1 Dec 2025");
    expect(data.booking_time).toBe("09:00");
    expect(data.booking_address).toBe("12 Main Rd, Cape Town");
    expect(data.total_price).toBe("R 299");
    expect(data.payment_status).toBe("Paid");
    expect(data.payment_reference).toBe("PSK-ABC-123");
    expect(data.booking_reference).toBe("00000000-0000-4000-8000-000000000099");
    expect(data.book_again_url).toContain("/book");
    expect(data.account_url).toContain("/account/bookings");
  });

  it("keeps SMS backward-compatible aliases", () => {
    const data = buildBookingConfirmedTemplateData(basePayload());
    expect(data.date).toBe(data.booking_date);
    expect(data.time).toBe(data.booking_time);
    expect(data.price).toBe(data.total_price);
    expect(data.service).toBe(data.service_name);
  });

  it("builds cleaner substitution notice when flagged", () => {
    const data = buildBookingConfirmedTemplateData({
      ...basePayload(),
      showCleanerSubstitutionNotice: true,
    });
    expect(data.cleaner_substitution_notice).toContain("Cleaner update");
  });

  it("leaves cleaner_name empty for downstream defaulting", () => {
    const data = buildBookingConfirmedTemplateData(basePayload());
    expect(data.cleaner_name).toBe("");
  });
});
