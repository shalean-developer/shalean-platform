import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { normalizePaystackMetadata } from "@/lib/booking/paystackMetadata";
import { parseBookingSnapshot } from "@/lib/booking/paystackChargeTypes";
import { resolveInternalBookingIdFromPaystackReference } from "@/lib/booking/paystackBookingIdLookup";
import { resolveBookingOwnershipColumn } from "@/lib/customer/customerBookingsForUser";
import { resolveBookingUserId } from "@/lib/booking/resolveBookingUserId";
import { paymentFinalizationReplayEquivalent } from "@/lib/booking/paymentCustomerIdentityGuard";

/** Call only with verified gateway transaction data or an authenticated webhook payload. */
export async function provePersistedPaystackReplay(params: {
  supabase: SupabaseClient;
  bookingId: string;
  reference: string;
  amountCents: number;
  customerEmail: string;
  metadata?: Record<string, unknown> | null;
}): Promise<boolean> {
  const { supabase, bookingId, reference } = params;
  const ownershipColumn = await resolveBookingOwnershipColumn(supabase);
  const { data, error } = await supabase.from("bookings")
    .select(`id, status, paystack_reference, customer_email, ${ownershipColumn}`)
    .eq("id", bookingId).maybeSingle();
  const row = data as unknown as Record<string, unknown> | null;
  if (error || !row || row.id !== bookingId || typeof row.status !== "string" || !row.status ||
    ["pending_payment", "payment_mismatch", "payment_reconciliation_required"].includes(row.status)) return false;
  const metadata = normalizePaystackMetadata(params.metadata);
  const { snapshot } = parseBookingSnapshot(metadata, { amountCents: params.amountCents });
  const gatewayEmail = normalizeEmail(params.customerEmail);
  const email = gatewayEmail || normalizeEmail(metadata.customer_email || "");
  const owner = await resolveBookingUserId(supabase, snapshot, metadata, email);
  const resolvedId = resolveInternalBookingIdFromPaystackReference(reference, metadata);
  return paymentFinalizationReplayEquivalent({
    id: bookingId,
    paystackReference: typeof row.paystack_reference === "string" ? row.paystack_reference : null,
    customerEmail: typeof row.customer_email === "string" ? row.customer_email : null,
    customerAuthId: typeof row[ownershipColumn] === "string" ? row[ownershipColumn] as string : null,
  }, {
    bookingIds: [resolvedId, metadata.booking_id, metadata.shalean_booking_id, metadata.bookingId]
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0),
    paystackReference: reference, customerEmail: email, customerAuthId: owner,
  });
}
