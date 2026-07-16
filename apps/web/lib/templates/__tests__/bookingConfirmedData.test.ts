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
  suburb: "Sea Point",
  extrasLabel: "Inside Oven · R 120",
  recurringSummary: "Weekly · Mon, Wed",
  cleanerStatusLabel: "Cleaner assignment pending",
  cleanerName: null,
  totalPaidZar: 299,
  paymentReference: "PAY-ABC123",
  bookingReference: "SHL-BK-001245",
  bookingId: "00000000-0000-4000-8000-000000000099",
});

describe("buildBookingConfirmedTemplateData", () => {
  it("includes all canonical email variables with customer refs", () => {
    const data = buildBookingConfirmedTemplateData(basePayload());
    expect(data.customer_name).toBe("Alex");
    expect(data.service_name).toBe("Regular Cleaning");
    expect(data.booking_date).toBe("Mon, 1 Dec 2025");
    expect(data.booking_time).toBe("09:00");
    expect(data.booking_address).toBe("12 Main Rd, Cape Town");
    expect(data.suburb).toBe("Sea Point");
    expect(data.extras_label).toContain("Inside Oven");
    expect(data.recurring_summary).toContain("Weekly");
    expect(data.recurring_summary).toContain("Mon");
    expect(data.recurring_row).toContain("Recurring");
    expect(data.total_price).toBe("R 299");
    expect(data.payment_status).toBe("Paid");
    expect(data.payment_reference).toBe("PAY-ABC123");
    expect(data.booking_reference).toBe("SHL-BK-001245");
    expect(data.booking_id).toBe("SHL-BK-001245");
    expect(data.book_again_url).toContain("/book");
    expect(data.account_url).toContain("/account/bookings/00000000-0000-4000-8000-000000000099");
  });

  it("masks long Paystack payment references to PAY-######", () => {
    const data = buildBookingConfirmedTemplateData({
      ...basePayload(),
      paymentReference: "bv2_1710000000_81cp6m",
      bookingReference: null,
    });
    expect(data.payment_reference).toBe("PAY-81CP6M");
    expect(data.booking_reference).toBe("Pending");
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

  it("uses cleaner status for cleaner_name defaulting", () => {
    const data = buildBookingConfirmedTemplateData(basePayload());
    expect(data.cleaner_name).toBe("Cleaner assignment pending");
  });

  it("formats bullet recurring days for customer summary", () => {
    const data = buildBookingConfirmedTemplateData({
      ...basePayload(),
      recurringSummary: "Weekly · Tuesday • Thursday • Saturday",
    });
    expect(data.recurring_summary).toBe("Weekly · Tuesday • Thursday • Saturday");
    expect(data.recurring_row).toContain("Tuesday • Thursday • Saturday");
  });
});
