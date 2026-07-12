import type { BookingFormData } from "@/lib/booking/types";
import type { CustomerAddressRow, CustomerProfileDto } from "@/services/types/customerAccount";

/** Prefer signup/auth email, then billing email. */
export function resolveCustomerContactEmail(
  profile: CustomerProfileDto | null | undefined,
  authEmail?: string | null,
): string {
  return (
    profile?.email?.trim() ||
    profile?.billingEmail?.trim() ||
    authEmail?.trim() ||
    ""
  );
}

export function pickDefaultCustomerAddress(
  addresses: CustomerAddressRow[] | undefined | null,
): CustomerAddressRow | null {
  if (!addresses?.length) return null;
  return addresses.find((a) => a.is_default) ?? addresses[0] ?? null;
}

/**
 * Fill empty booking contact/address fields from profile + default saved address.
 * Does not overwrite values the customer already entered (or restored from draft).
 */
export function bookingFormPatchFromCustomerProfile(input: {
  form: BookingFormData;
  profile: CustomerProfileDto | null | undefined;
  addresses: CustomerAddressRow[] | undefined | null;
}): Partial<BookingFormData> {
  const patch: Partial<BookingFormData> = {};
  const phone =
    input.profile?.phone?.trim() ||
    input.profile?.whatsapp?.trim() ||
    "";
  if (!input.form.contactPhone.trim() && phone) {
    patch.contactPhone = phone;
  }

  const hasAddress = Boolean(input.form.address.trim() && input.form.suburb.trim());
  if (!hasAddress) {
    const addr = pickDefaultCustomerAddress(input.addresses);
    if (addr) {
      patch.address = addr.line1.trim();
      patch.suburb = addr.suburb.trim();
      patch.city = addr.city?.trim() || "Cape Town";
      patch.postalCode = addr.postal_code?.trim() || "";
      if (!input.form.accessInstructions.trim() && addr.notes?.trim()) {
        patch.accessInstructions = addr.notes.trim();
      }
    }
  }

  return patch;
}
