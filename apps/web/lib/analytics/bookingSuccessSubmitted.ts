import { trackGa4BookingSubmitted } from "@/lib/analytics/ga4Events";

export type BookingSuccessPath = "paystack" | "covered" | "area_review" | "missing";

/** Query-string routing for `/booking/success` / `/account/success`. */
export function resolveBookingSuccessPath(params: {
  areaReview?: string | null;
  bookingId?: string | null;
  reference?: string | null;
  covered?: string | null;
}): BookingSuccessPath {
  if (params.areaReview === "1" || params.areaReview === "true") return "area_review";
  const reference = params.reference?.trim() || "";
  const bookingId = params.bookingId?.trim() || "";
  if (params.covered === "1" || params.covered === "true") {
    return bookingId ? "covered" : "missing";
  }
  if (reference) return "paystack";
  if (bookingId) return "covered";
  return "missing";
}

/** Authoritative settlement gate for no-payment / credit-covered bookings. */
export function isSettledBookingPaymentStatus(paymentStatus: string | null | undefined): boolean {
  const ps = String(paymentStatus ?? "")
    .trim()
    .toLowerCase();
  return ps === "success" || ps === "paid";
}

export type EmitBookingSubmittedInput = {
  bookingId: string;
  reference?: string | null;
  service?: string | null;
  value?: number | null;
};

/**
 * Fire `booking_submitted` once per booking id after authoritative success.
 * Returns whether a GA4 event was queued on this call.
 */
export function emitBookingSubmittedAfterConfirm(input: EmitBookingSubmittedInput): boolean {
  const bookingId = input.bookingId.trim();
  if (!bookingId) return false;
  try {
    return trackGa4BookingSubmitted({
      bookingId,
      reference: input.reference ?? null,
      service: input.service ?? null,
      value: input.value ?? null,
    });
  } catch {
    return false;
  }
}

export type CoveredBookingSnapshot = {
  id: string;
  payment_status?: string | null;
  status?: string | null;
  service?: string | null;
  service_slug?: string | null;
  total_paid_zar?: number | null;
  booking_reference?: string | null;
  paystack_reference?: string | null;
};

/**
 * Decide whether a covered (no Paystack) booking may emit `booking_submitted`.
 * Never true for pending/unpaid/failed/area-review rows.
 */
export function canEmitCoveredBookingSubmitted(booking: CoveredBookingSnapshot | null | undefined): boolean {
  if (!booking?.id?.trim()) return false;
  if (!isSettledBookingPaymentStatus(booking.payment_status)) return false;
  const st = String(booking.status ?? "")
    .trim()
    .toLowerCase();
  // Area-review / abandoned unpaid should never reach settled payment_status, but guard status too.
  if (st === "cancelled" || st === "failed") return false;
  return true;
}

export type CoveredFetchResult =
  | { ok: true; booking: CoveredBookingSnapshot }
  | { ok: false; reason: "unauthorized" | "not_found" | "network" | "unsettled" };

/**
 * Load a covered booking and emit booking_submitted only when payment is settled.
 * Does not call Paystack verify.
 */
export async function finalizeCoveredBookingSubmitted(opts: {
  bookingId: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
  emit?: typeof emitBookingSubmittedAfterConfirm;
}): Promise<{ emitted: boolean; result: CoveredFetchResult }> {
  const bookingId = opts.bookingId.trim();
  const emit = opts.emit ?? emitBookingSubmittedAfterConfirm;
  const fetchImpl = opts.fetchImpl ?? fetch;

  if (!bookingId || !opts.accessToken.trim()) {
    return { emitted: false, result: { ok: false, reason: "unauthorized" } };
  }

  try {
    const res = await fetchImpl(`/api/customer/bookings/${encodeURIComponent(bookingId)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        Accept: "application/json",
      },
    });
    if (res.status === 401 || res.status === 403) {
      return { emitted: false, result: { ok: false, reason: "unauthorized" } };
    }
    if (!res.ok) {
      return { emitted: false, result: { ok: false, reason: "not_found" } };
    }
    const json = (await res.json()) as { booking?: CoveredBookingSnapshot };
    const booking = json.booking;
    if (!booking?.id) {
      return { emitted: false, result: { ok: false, reason: "not_found" } };
    }
    if (!canEmitCoveredBookingSubmitted(booking)) {
      return { emitted: false, result: { ok: false, reason: "unsettled" } };
    }
    const emitted = emit({
      bookingId: booking.id,
      reference: booking.booking_reference ?? booking.paystack_reference ?? booking.id,
      service: booking.service_slug ?? booking.service ?? null,
      value:
        typeof booking.total_paid_zar === "number" && Number.isFinite(booking.total_paid_zar)
          ? booking.total_paid_zar
          : 0,
    });
    return { emitted, result: { ok: true, booking } };
  } catch {
    return { emitted: false, result: { ok: false, reason: "network" } };
  }
}

/**
 * Paystack path: emit only when verify confirms payment + booking row persisted.
 */
export function emitBookingSubmittedAfterPaystackVerify(opts: {
  bookingPersisted: boolean;
  bookingId: string | null | undefined;
  reference?: string | null;
  service?: string | null;
  value?: number | null;
  emit?: typeof emitBookingSubmittedAfterConfirm;
}): boolean {
  if (!opts.bookingPersisted) return false;
  const bookingId = opts.bookingId?.trim() ?? "";
  if (!bookingId) return false;
  const emit = opts.emit ?? emitBookingSubmittedAfterConfirm;
  return emit({
    bookingId,
    reference: opts.reference ?? null,
    service: opts.service ?? null,
    value: opts.value ?? null,
  });
}
