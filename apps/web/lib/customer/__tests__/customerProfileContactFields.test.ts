import { describe, expect, it } from "vitest";

import {
  billingEmailFromLoginEmail,
  mapPreferredContactToNotificationChannel,
  normalizeCustomerProfileContactFields,
} from "@/lib/customer/customerProfileContactFields";

describe("customerProfileContactFields", () => {
  it("maps preferred contact to notification channel", () => {
    expect(mapPreferredContactToNotificationChannel("whatsapp")).toBe("whatsapp");
    expect(mapPreferredContactToNotificationChannel("phone")).toBe("sms");
    expect(mapPreferredContactToNotificationChannel("email")).toBe("email");
  });

  it("normalizes billing email and rejects synthetic login aliases", () => {
    const fields = normalizeCustomerProfileContactFields({
      fullName: "Mongezi Bacela",
      billingEmail: "27691445709@cleaner.shalean.com",
      phone: "0646053173",
    });
    expect(fields.full_name).toBe("Mongezi Bacela");
    expect(fields.billing_email).toBeUndefined();
    expect(fields.phone_e164).toBe("+27646053173");
  });

  it("stores real billing email from login when not synthetic", () => {
    expect(billingEmailFromLoginEmail("mongezib@arcfyre.com")).toBe("mongezib@arcfyre.com");
    expect(billingEmailFromLoginEmail("27824103968@walkin.shalean.com")).toBeNull();
  });
});
