import { describe, expect, it } from "vitest";
import {
  resolveAdminBookingCustomerName,
  resolveAdminBookingCustomerPhone,
} from "@/lib/admin/adminBookingCustomerContact";

describe("resolveAdminBookingCustomerPhone", () => {
  it("prefers bookings.customer_phone over legacy phone field", () => {
    expect(
      resolveAdminBookingCustomerPhone({
        customer_phone: "+27821234567",
        phone: null,
        userProfilePhone: "+27000000000",
      }),
    ).toBe("+27821234567");
  });

  it("falls back to booking snapshot customer phone", () => {
    expect(
      resolveAdminBookingCustomerPhone({
        customer_phone: null,
        bookingSnapshot: { customer: { phone: "082 555 1234" } },
      }),
    ).toBe("082 555 1234");
  });

  it("uses API fallback phone when row fields are empty", () => {
    expect(
      resolveAdminBookingCustomerPhone({
        customer_phone: null,
        fallbackPhone: "0712345678",
      }),
    ).toBe("0712345678");
  });
});

describe("resolveAdminBookingCustomerName", () => {
  it("prefers bookings.customer_name over email local part", () => {
    expect(
      resolveAdminBookingCustomerName({
        customer_name: "Herbert Drene",
        userProfileFullName: null,
        customerEmail: "herbertdrene77@gmail.com",
      }),
    ).toBe("Herbert Drene");
  });

  it("falls back to profile name before email local part", () => {
    expect(
      resolveAdminBookingCustomerName({
        customer_name: null,
        userProfileFullName: "Herbert Drene",
        customerEmail: "herbertdrene77@gmail.com",
      }),
    ).toBe("Herbert Drene");
  });

  it("uses snapshot customer name when row fields are empty", () => {
    expect(
      resolveAdminBookingCustomerName({
        customer_name: null,
        bookingSnapshot: { customer: { name: "Herbert Drene" } },
        customerEmail: "herbertdrene77@gmail.com",
      }),
    ).toBe("Herbert Drene");
  });

  it("uses email local part only as last resort", () => {
    expect(
      resolveAdminBookingCustomerName({
        customer_name: null,
        customerEmail: "herbertdrene77@gmail.com",
      }),
    ).toBe("herbertdrene77");
  });
});
