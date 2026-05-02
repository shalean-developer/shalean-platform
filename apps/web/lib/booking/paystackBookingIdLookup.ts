import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Inline / decoupled checkout uses `pay_<uuid>` as the Paystack transaction reference (not the booking row id). */
const INLINE_PAYSTACK_REF = /^pay_/i;

export class PaystackDecoupledMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaystackDecoupledMetadataError";
  }
}

export function isInlineDecoupledPaystackReference(reference: string): boolean {
  return INLINE_PAYSTACK_REF.test(reference.trim());
}

/**
 * `pay_…` charges must carry `booking_id` / `shalean_booking_id` / `bookingId` so we can match a pending row.
 * Legacy UUID-as-reference charges skip this rule.
 */
export function assertDecoupledPaystackMetadataAllowsFinalize(
  reference: string,
  metadata: Record<string, string | undefined>,
): void {
  if (!isInlineDecoupledPaystackReference(reference)) return;
  if (resolveInternalBookingIdFromPaystackReference(reference, metadata)) return;
  throw new PaystackDecoupledMetadataError(
    "This payment is missing booking metadata (booking_id / shalean_booking_id). Contact support with your Paystack reference.",
  );
}

function pickUuidFromMeta(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  if (UUID_RE.test(t)) return t;
  return null;
}

/**
 * Resolves internal `bookings.id` for Paystack verify/webhook/upsert.
 * - New flow: `reference` is `pay_<uuid>`; booking id comes from metadata.
 * - Legacy: `reference` is the booking row UUID (inline checkout used booking id as Paystack reference).
 */
export function resolveInternalBookingIdFromPaystackReference(
  reference: string,
  metadata: Record<string, string | undefined> | null | undefined,
): string | null {
  const r = reference.trim();
  const meta = metadata ?? {};
  const fromMeta =
    pickUuidFromMeta(meta.booking_id) ??
    pickUuidFromMeta(meta.shalean_booking_id) ??
    pickUuidFromMeta(meta.bookingId);
  if (fromMeta) return fromMeta;
  if (UUID_RE.test(r)) return r;
  return null;
}

/** Resolve `bookings.id` when Paystack metadata omits `shalean_booking_id` (same as `paystack_reference`). */
export async function bookingIdForPaystackReference(
  admin: SupabaseClient,
  reference: string,
): Promise<string | null> {
  const r = reference.trim();
  if (!r) return null;
  const { data, error } = await admin.from("bookings").select("id").eq("paystack_reference", r).maybeSingle();
  if (error || !data || typeof data !== "object" || !("id" in data)) return null;
  return String((data as { id: string }).id);
}

/** Lookup by `paystack_reference`, or by `id` when the charge reference is the booking UUID (inline checkout). */
export async function findBookingIdStatusForPaystackReference(
  admin: SupabaseClient,
  reference: string,
): Promise<{ bookingId: string; status: string } | null> {
  const r = reference.trim();
  if (!r) return null;
  const { data: byRef } = await admin.from("bookings").select("id, status").eq("paystack_reference", r).maybeSingle();
  let row = byRef;
  if (!row || typeof row !== "object") {
    if (UUID_RE.test(r)) {
      const { data: byId } = await admin.from("bookings").select("id, status").eq("id", r).maybeSingle();
      row = byId;
    }
  }
  if (!row || typeof row !== "object" || !("id" in row)) return null;
  const st = String((row as { status?: string | null }).status ?? "").trim();
  return {
    bookingId: String((row as { id: string }).id),
    status: st || "unknown",
  };
}
