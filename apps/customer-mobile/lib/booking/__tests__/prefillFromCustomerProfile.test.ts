import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultBookingFormData } from "../defaultForm";
import {
  bookingFormPatchFromCustomerProfile,
  resolveCustomerContactEmail,
} from "../prefillFromCustomerProfile";

describe("prefillFromCustomerProfile", () => {
  it("resolves signup email before billing email", () => {
    assert.equal(
      resolveCustomerContactEmail(
        {
          id: "u1",
          email: "signup@example.com",
          fullName: null,
          phone: null,
          whatsapp: null,
          preferredContact: null,
          preferredNotificationChannel: null,
          dateOfBirth: null,
          billingEmail: "bill@example.com",
          tier: null,
        },
        "auth@example.com",
      ),
      "signup@example.com",
    );
  });

  it("fills empty phone and default address only", () => {
    const form = defaultBookingFormData("regular-cleaning");
    const patch = bookingFormPatchFromCustomerProfile({
      form,
      profile: {
        id: "u1",
        email: "a@b.com",
        fullName: "Ada",
        phone: "0821234567",
        whatsapp: null,
        preferredContact: null,
        preferredNotificationChannel: null,
        dateOfBirth: null,
        billingEmail: null,
        tier: null,
      },
      addresses: [
        {
          id: "a1",
          user_id: "u1",
          label: "Home",
          line1: "12 Ocean View",
          suburb: "Claremont",
          city: "Cape Town",
          postal_code: "7708",
          notes: "Gate 12",
          is_default: true,
        },
      ],
    });
    assert.equal(patch.contactPhone, "0821234567");
    assert.equal(patch.address, "12 Ocean View");
    assert.equal(patch.suburb, "Claremont");
    assert.equal(patch.accessInstructions, "Gate 12");
  });

  it("does not overwrite existing address or phone", () => {
    const form = {
      ...defaultBookingFormData("regular-cleaning"),
      contactPhone: "0810000000",
      address: "1 Existing St",
      suburb: "Sea Point",
    };
    const patch = bookingFormPatchFromCustomerProfile({
      form,
      profile: {
        id: "u1",
        email: "a@b.com",
        fullName: null,
        phone: "0821234567",
        whatsapp: null,
        preferredContact: null,
        preferredNotificationChannel: null,
        dateOfBirth: null,
        billingEmail: null,
        tier: null,
      },
      addresses: [
        {
          id: "a1",
          user_id: "u1",
          label: "Home",
          line1: "12 Ocean View",
          suburb: "Claremont",
          city: "Cape Town",
          postal_code: "7708",
          is_default: true,
        },
      ],
    });
    assert.deepEqual(patch, {});
  });
});
