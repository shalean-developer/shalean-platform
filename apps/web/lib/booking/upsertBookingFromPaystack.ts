import { getServiceLabel } from "@/components/booking/serviceCategories";
import { resolveLocationIdFromLabel } from "@/lib/booking/resolveLocationId";
import { assignCleanerToBooking } from "@/lib/dispatch/assignCleaner";
import { notifyCleanerAssignedBooking } from "@/lib/dispatch/notifyCleanerAssigned";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { recordBookingSideEffects } from "@/lib/booking/recordBookingSideEffects";
import { resolveBookingUserId } from "@/lib/booking/resolveBookingUserId";
import { buildSnapshotFlat, mergeSnapshotWithFlat } from "@/lib/booking/snapshotFlat";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type UpsertBookingInput = {
  paystackReference: string;
  amountCents: number;
  currency: string;
  customerEmail: string;
  snapshot: BookingSnapshotV1 | null;
  /** Flat Paystack metadata (server-set at initialize) — used only to resolve user_id with snapshot. */
  paystackMetadata?: Record<string, string | undefined> | null;
};

/**
 * Idempotent insert by `paystack_reference`. Webhook is the source of truth for persistence.
 */
export async function upsertBookingFromPaystack(input: UpsertBookingInput): Promise<{
  skipped: boolean;
  bookingId: string | null;
  error?: string;
}> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    await reportOperationalIssue("warn", "upsertBookingFromPaystack", "Supabase admin client not configured", {
      paystackReference: input.paystackReference,
    });
    return { skipped: true, bookingId: null, error: "Supabase not configured" };
  }

  const { data: existing, error: selectErr } = await supabase
    .from("bookings")
    .select("id")
    .eq("paystack_reference", input.paystackReference)
    .maybeSingle();

  if (selectErr) {
    await reportOperationalIssue("error", "upsertBookingFromPaystack", `select failed: ${selectErr.message}`, {
      paystackReference: input.paystackReference,
    });
    return { skipped: true, bookingId: null, error: selectErr.message };
  }

  if (existing && typeof existing === "object" && "id" in existing) {
    return { skipped: true, bookingId: String((existing as { id: string }).id) };
  }

  const locked = input.snapshot?.locked;
  const extras = locked?.extras ?? [];
  const cust = input.snapshot?.customer;
  const emailStored = normalizeEmail(input.customerEmail);
  const userIdResolved = await resolveBookingUserId(
    supabase,
    input.snapshot,
    input.paystackMetadata ?? null,
    emailStored,
  );

  const flat = buildSnapshotFlat(locked ?? undefined);
  const bookingSnapshotMerged = mergeSnapshotWithFlat(input.snapshot, flat);

  const locationId = await resolveLocationIdFromLabel(supabase, locked?.location?.trim() ?? null);

  const row = {
    paystack_reference: input.paystackReference,
    customer_email: emailStored,
    customer_name: cust?.name?.trim() || null,
    customer_phone: cust?.phone?.trim() || null,
    user_id: userIdResolved,
    amount_paid_cents: input.amountCents,
    currency: input.currency || "ZAR",
    booking_snapshot: bookingSnapshotMerged,
    status: "pending",
    service: locked?.service != null ? getServiceLabel(locked.service) : null,
    rooms: locked?.rooms ?? null,
    bathrooms: locked?.bathrooms ?? null,
    extras: extras,
    location: locked?.location?.trim() || null,
    location_id: locationId,
    date: locked?.date ?? null,
    time: locked?.time ?? null,
    total_paid_zar:
      typeof input.snapshot?.total_zar === "number"
        ? input.snapshot.total_zar
        : Math.round(input.amountCents / 100),
  };

  const { data: inserted, error: insertErr } = await supabase
    .from("bookings")
    .insert(row)
    .select("id, created_at, user_id")
    .maybeSingle();

  if (insertErr) {
    if (insertErr.code === "23505") {
      const { data: again } = await supabase
        .from("bookings")
        .select("id")
        .eq("paystack_reference", input.paystackReference)
        .maybeSingle();
      const id =
        again && typeof again === "object" && "id" in again ? String((again as { id: string }).id) : null;
      return { skipped: true, bookingId: id };
    }
    await reportOperationalIssue("error", "upsertBookingFromPaystack", `insert failed: ${insertErr.message}`, {
      paystackReference: input.paystackReference,
      code: insertErr.code,
    });
    return { skipped: true, bookingId: null, error: insertErr.message };
  }

  const id =
    inserted && typeof inserted === "object" && "id" in inserted
      ? String((inserted as { id: string }).id)
      : null;

  const userIdForEffects =
    inserted && typeof inserted === "object" && "user_id" in inserted
      ? ((inserted as { user_id?: string | null }).user_id ?? userIdResolved)
      : userIdResolved;

  if (id) {
    /** Smart dispatch unless explicitly disabled (`AUTO_DISPATCH_CLEANERS=false`). */
    const autoDispatch = process.env.AUTO_DISPATCH_CLEANERS !== "false";
    if (autoDispatch) {
      void assignCleanerToBooking(supabase, id).then((r) => {
        if (r.ok) void notifyCleanerAssignedBooking(supabase, id, r.cleanerId);
      });
    }
    const createdAt =
      inserted && typeof inserted === "object" && "created_at" in inserted
        ? String((inserted as { created_at?: string }).created_at ?? "")
        : "";
    try {
      const locked = input.snapshot?.locked;
      await recordBookingSideEffects({
        supabase,
        bookingId: id,
        userId: userIdForEffects,
        customerEmail: emailStored,
        amountCents: input.amountCents,
        paystackReference: input.paystackReference,
        createdAt: createdAt || new Date().toISOString(),
        appointmentDateYmd: locked?.date ?? null,
        appointmentTimeHm: locked?.time ?? null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await reportOperationalIssue("error", "upsertBookingFromPaystack", `recordBookingSideEffects threw: ${msg}`, {
        bookingId: id,
        paystackReference: input.paystackReference,
      });
    }
  }

  return { skipped: false, bookingId: id };
}
