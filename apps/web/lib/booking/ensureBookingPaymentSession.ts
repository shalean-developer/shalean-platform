import "server-only";

import crypto from "crypto";

import {
  customerPaymentLinkTtlMs,
  isStoredPaymentLinkUsable,
} from "@/lib/booking/adminPaymentLinkState";
import {
  appendPaymentAttemptHistory,
  referenceAllowedForBookingAccess,
} from "@/lib/booking/bookingPaymentAttemptHistory";
import { PAYMENT_ERROR_CODES, type PaymentErrorCode } from "@/lib/booking/paymentErrorCodes";
import { detectPaystackKeyModeMismatch } from "@/lib/booking/paystackKeyModeConsistency";
import { assertEnvironmentPaymentSafety } from "@/lib/env/assertEnvironmentSafety";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { logPaymentStructured } from "@/lib/observability/paymentStructuredLog";
import { fetchPaystackTransactionVerify } from "@/lib/payments/verifyPaystackTransaction";
import { runPaystackVerifyFinalizePipeline } from "@/lib/booking/runPaystackVerifyFinalizePipeline";
import type { SupabaseClient } from "@supabase/supabase-js";

export type BookingPaymentSessionAccess =
  | { kind: "paystack_ref"; reference: string }
  | { kind: "owner"; userId: string }
  | { kind: "internal" };

export type EnsureBookingPaymentSessionResult =
  | {
      status: "ready";
      bookingId: string;
      reference: string;
      authorizationUrl: string;
      reused: boolean;
      refreshed: boolean;
      message?: string;
      amountZar: number;
      serviceLabel?: string | null;
      date?: string | null;
      time?: string | null;
      payment_link_expires_at: string | null;
    }
  | {
      status: "paid";
      bookingId: string;
      reference?: string;
      errorCode?: PaymentErrorCode;
    }
  | {
      status: "failed";
      bookingId: string;
      errorCode: PaymentErrorCode;
      error: string;
      retryable: boolean;
    };

type BookingPayRow = {
  id: string;
  status: string | null;
  payment_status: string | null;
  payment_completed_at: string | null;
  paystack_reference: string | null;
  payment_link: string | null;
  payment_link_expires_at: string | null;
  customer_email: string | null;
  customer_id: string | null;
  user_id: string | null;
  total_price: number | string | null;
  total_paid_zar: number | string | null;
  price_snapshot: unknown;
  booking_snapshot: unknown;
  service: string | null;
  date: string | null;
  time: string | null;
};

const SELECT_COLS =
  "id, status, payment_status, payment_completed_at, paystack_reference, payment_link, payment_link_expires_at, customer_email, customer_id, user_id, total_price, total_paid_zar, price_snapshot, booking_snapshot, service, date, time";

/** In-process dedupe for concurrent ensure calls on the same instance. */
const inflightByBookingId = new Map<string, Promise<EnsureBookingPaymentSessionResult>>();

export function __resetEnsureBookingPaymentSessionInflightForTests(): void {
  inflightByBookingId.clear();
}

function parseZar(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return Math.round(raw);
  if (typeof raw === "string" && /^\d+(\.\d+)?$/.test(raw.trim())) {
    const n = Number(raw.trim());
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return null;
}

/** Trusted payable ZAR from the booking row (never trust client amount). */
export function trustedBookingPayableZar(row: {
  total_price?: number | string | null;
  total_paid_zar?: number | string | null;
  price_snapshot?: unknown;
}): number | null {
  const fromTotal = parseZar(row.total_price);
  if (fromTotal != null) return fromTotal;
  const fromPaid = parseZar(row.total_paid_zar);
  if (fromPaid != null) return fromPaid;
  const snap = row.price_snapshot;
  if (snap && typeof snap === "object" && !Array.isArray(snap)) {
    const s = snap as Record<string, unknown>;
    return (
      parseZar(s.pay_total_zar) ??
      parseZar(s.total_price) ??
      parseZar(s.total_zar) ??
      parseZar(s.estimated_total)
    );
  }
  return null;
}

function isAlreadyPaid(row: BookingPayRow): boolean {
  if (String(row.payment_completed_at ?? "").trim()) return true;
  const ps = String(row.payment_status ?? "").trim().toLowerCase();
  if (ps === "success" || ps === "paid") return true;
  const st = String(row.status ?? "").trim().toLowerCase();
  if (st === "pending_payment" || st === "payment_expired") return false;
  // Lifecycle statuses after successful checkout
  if (["pending", "confirmed", "assigned", "in_progress", "completed", "cleaner_assigned"].includes(st)) {
    return true;
  }
  return false;
}

function accessAllowed(row: BookingPayRow, access: BookingPaymentSessionAccess): boolean {
  if (access.kind === "internal") return true;
  if (access.kind === "owner") {
    const uid = access.userId.trim().toLowerCase();
    if (!uid) return false;
    const owners = [row.customer_id, row.user_id]
      .map((x) => (typeof x === "string" ? x.trim().toLowerCase() : ""))
      .filter(Boolean);
    return owners.includes(uid);
  }
  return referenceAllowedForBookingAccess(
    String(row.paystack_reference ?? ""),
    access.reference,
    row.booking_snapshot,
  );
}

async function loadBooking(admin: SupabaseClient, bookingId: string): Promise<BookingPayRow | null> {
  const { data, error } = await admin.from("bookings").select(SELECT_COLS).eq("id", bookingId).maybeSingle();
  if (error || !data || typeof data !== "object") return null;
  return data as BookingPayRow;
}

function readyFromRow(
  row: BookingPayRow,
  opts: { reused: boolean; refreshed: boolean; message?: string; amountZar: number },
): EnsureBookingPaymentSessionResult {
  return {
    status: "ready",
    bookingId: row.id,
    reference: String(row.paystack_reference ?? "").trim(),
    authorizationUrl: String(row.payment_link ?? "").trim(),
    reused: opts.reused,
    refreshed: opts.refreshed,
    message: opts.message,
    amountZar: opts.amountZar,
    serviceLabel: row.service,
    date: row.date != null ? String(row.date) : null,
    time: row.time != null ? String(row.time) : null,
    payment_link_expires_at: row.payment_link_expires_at != null ? String(row.payment_link_expires_at) : null,
  };
}

async function maybeFinalizeSuccessfulCharge(
  admin: SupabaseClient,
  row: BookingPayRow,
  secret: string,
): Promise<EnsureBookingPaymentSessionResult | null> {
  const ref = String(row.paystack_reference ?? "").trim();
  if (!ref) return null;
  const verified = await fetchPaystackTransactionVerify(ref, secret);
  const txStatus = String(verified.data?.status ?? "").toLowerCase();
  if (verified.status !== true || txStatus !== "success") return null;

  try {
    await runPaystackVerifyFinalizePipeline(
      {
        status: verified.data?.status,
        reference: verified.data?.reference ?? ref,
        amount: verified.data?.amount,
        currency: verified.data?.currency,
        paid_at: verified.data?.paid_at,
        fees: verified.data?.fees,
        fees_breakdown: verified.data?.fees_breakdown,
        channel: verified.data?.channel,
        id: verified.data?.id,
        international_format_transaction: verified.data?.international_format_transaction,
        authorization: verified.data?.authorization,
        metadata: verified.data?.metadata as Record<string, unknown> | undefined,
      },
      ref,
      "ensureBookingPaymentSession",
    );
  } catch {
    // Fall through — still report paid if Paystack says success; callback/webhook can finish.
  }

  logPaymentStructured("payment_initialize", {
    booking_id: row.id,
    reference: ref,
    result: "paid_via_verify",
    error_code: PAYMENT_ERROR_CODES.PAYMENT_ALREADY_COMPLETED,
  });

  return {
    status: "paid",
    bookingId: row.id,
    reference: ref,
    errorCode: PAYMENT_ERROR_CODES.PAYMENT_ALREADY_COMPLETED,
  };
}

async function initializeFreshPaystackSession(
  admin: SupabaseClient,
  row: BookingPayRow,
  secret: string,
  amountZar: number,
  reason: string,
): Promise<EnsureBookingPaymentSessionResult> {
  const email = String(row.customer_email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      status: "failed",
      bookingId: row.id,
      errorCode: PAYMENT_ERROR_CODES.PAYMENT_INITIALIZATION_FAILED,
      error: "This booking has no valid customer email for checkout.",
      retryable: false,
    };
  }

  const amountCents = Math.round(amountZar * 100);
  if (!Number.isFinite(amountCents) || amountCents < 100) {
    return {
      status: "failed",
      bookingId: row.id,
      errorCode: PAYMENT_ERROR_CODES.PAYMENT_AMOUNT_MISMATCH,
      error: "Booking amount is invalid for payment.",
      retryable: false,
    };
  }

  const oldRef = String(row.paystack_reference ?? "").trim();
  const oldLink = String(row.payment_link ?? "").trim();
  const newRef = `bps_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
  const expiresAt = new Date(Date.now() + customerPaymentLinkTtlMs()).toISOString();
  const nowIso = new Date().toISOString();

  let nextSnapshot = row.booking_snapshot;
  if (oldRef) {
    nextSnapshot = appendPaymentAttemptHistory(row.booking_snapshot, {
      reference: oldRef,
      authorization_url: oldLink || null,
      created_at: typeof (row.booking_snapshot as { created_at?: string } | null)?.created_at === "string"
        ? String((row.booking_snapshot as { created_at?: string }).created_at)
        : nowIso,
      superseded_at: nowIso,
      reason,
    });
  }

  // Claim the booking for this new reference before calling Paystack (crash-safe + race-safe).
  const { data: claimed, error: claimErr } = await admin
    .from("bookings")
    .update({
      paystack_reference: newRef,
      payment_link: null,
      payment_link_expires_at: expiresAt,
      status: "pending_payment",
      booking_snapshot: nextSnapshot,
    })
    .eq("id", row.id)
    .in("status", ["pending_payment", "payment_expired"])
    .select("id")
    .maybeSingle();

  if (claimErr || !claimed) {
    const latest = await loadBooking(admin, row.id);
    if (latest && isAlreadyPaid(latest)) {
      return { status: "paid", bookingId: row.id, reference: String(latest.paystack_reference ?? "") };
    }
    if (
      latest &&
      isStoredPaymentLinkUsable({
        status: latest.status,
        payment_link: latest.payment_link,
        payment_link_expires_at: latest.payment_link_expires_at,
      })
    ) {
      return readyFromRow(latest, { reused: true, refreshed: false, amountZar });
    }
    return {
      status: "failed",
      bookingId: row.id,
      errorCode: PAYMENT_ERROR_CODES.PAYMENT_REFERENCE_CONFLICT,
      error: "Another payment session is being created. Please try again in a moment.",
      retryable: true,
    };
  }

  const appUrl = getPublicAppUrlBase();
  // Paystack appends reference/trxref; /pay page accepts those for cancel/retry recovery.
  const callbackUrl = appUrl ? `${appUrl}/pay/${encodeURIComponent(row.id)}` : undefined;

  let json: {
    status?: boolean;
    message?: string;
    data?: { authorization_url?: string; reference?: string; access_code?: string };
  };
  try {
    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: amountCents,
        currency: "ZAR",
        reference: newRef,
        ...(callbackUrl ? { callback_url: callbackUrl } : {}),
        metadata: {
          booking_id: row.id,
          shalean_booking_id: row.id,
          pay_total_zar: String(amountZar),
          expected_total_zar: String(amountZar),
          payment_path: "ensure_booking_payment_session",
          ensure_reason: reason,
        },
      }),
    });
    json = (await res.json()) as typeof json;
  } catch (err) {
    logPaymentStructured("payment_initialize", {
      booking_id: row.id,
      reference: newRef,
      result: "failed",
      error_code: PAYMENT_ERROR_CODES.PAYMENT_INITIALIZATION_FAILED,
      message: err instanceof Error ? err.message : "fetch_failed",
    });
    return {
      status: "failed",
      bookingId: row.id,
      errorCode: PAYMENT_ERROR_CODES.PAYMENT_INITIALIZATION_FAILED,
      error:
        "We could not start the secure payment checkout. Your booking is safe and no payment was taken. Please try again.",
      retryable: true,
    };
  }

  const authUrl = typeof json.data?.authorization_url === "string" ? json.data.authorization_url.trim() : "";
  const returnedRef = typeof json.data?.reference === "string" ? json.data.reference.trim() : newRef;

  if (!json.status || !authUrl) {
    logPaymentStructured("payment_initialize", {
      booking_id: row.id,
      reference: newRef,
      result: "failed",
      error_code: PAYMENT_ERROR_CODES.PAYMENT_INITIALIZATION_FAILED,
      paystack_message: typeof json.message === "string" ? json.message.slice(0, 200) : null,
      missing_authorization_url: !authUrl,
    });
    return {
      status: "failed",
      bookingId: row.id,
      errorCode: PAYMENT_ERROR_CODES.PAYMENT_INITIALIZATION_FAILED,
      error:
        "We could not start the secure payment checkout. Your booking is safe and no payment was taken. Please try again.",
      retryable: true,
    };
  }

  const { data: persisted, error: persistErr } = await admin
    .from("bookings")
    .update({
      payment_link: authUrl,
      paystack_reference: returnedRef || newRef,
      payment_link_expires_at: expiresAt,
      status: "pending_payment",
    })
    .eq("id", row.id)
    .eq("paystack_reference", newRef)
    .select(SELECT_COLS)
    .maybeSingle();

  if (persistErr || !persisted) {
    // Lost the race after Paystack init — prefer the winning row's usable link.
    const latest = await loadBooking(admin, row.id);
    if (
      latest &&
      isStoredPaymentLinkUsable({
        status: latest.status,
        payment_link: latest.payment_link,
        payment_link_expires_at: latest.payment_link_expires_at,
      })
    ) {
      return readyFromRow(latest, {
        reused: true,
        refreshed: true,
        message: "Your previous payment session expired. A new secure payment session has been created.",
        amountZar,
      });
    }
    return {
      status: "failed",
      bookingId: row.id,
      errorCode: PAYMENT_ERROR_CODES.PAYMENT_REFERENCE_CONFLICT,
      error:
        "We could not start the secure payment checkout. Your booking is safe and no payment was taken. Please try again.",
      retryable: true,
    };
  }

  const persistedRow = persisted as BookingPayRow;
  logPaymentStructured("payment_initialize", {
    booking_id: row.id,
    reference: returnedRef || newRef,
    result: "ready",
    refreshed: true,
    reason,
    amount_cents: amountCents,
  });

  return readyFromRow(persistedRow, {
    reused: false,
    refreshed: true,
    message: "Your previous payment session expired. A new secure payment session has been created.",
    amountZar,
  });
}

async function ensureBookingPaymentSessionInner(
  admin: SupabaseClient,
  bookingId: string,
  access: BookingPaymentSessionAccess,
): Promise<EnsureBookingPaymentSessionResult> {
  const id = bookingId.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return {
      status: "failed",
      bookingId: id || "unknown",
      errorCode: PAYMENT_ERROR_CODES.PAYMENT_BOOKING_NOT_FOUND,
      error: "Invalid booking.",
      retryable: false,
    };
  }

  const keyMismatch = detectPaystackKeyModeMismatch();
  if (keyMismatch) {
    return {
      status: "failed",
      bookingId: id,
      errorCode: keyMismatch.errorCode,
      error: keyMismatch.error,
      retryable: false,
    };
  }

  const envSafety = assertEnvironmentPaymentSafety();
  if (envSafety) {
    return {
      status: "failed",
      bookingId: id,
      errorCode: PAYMENT_ERROR_CODES.PAYMENT_CONFIGURATION_ERROR,
      error: envSafety.message,
      retryable: false,
    };
  }

  const secret = (process.env.PAYSTACK_SECRET_KEY ?? "").trim();
  if (!secret) {
    return {
      status: "failed",
      bookingId: id,
      errorCode: PAYMENT_ERROR_CODES.PAYMENT_CONFIGURATION_ERROR,
      error: "Paystack is not configured.",
      retryable: false,
    };
  }

  const row = await loadBooking(admin, id);
  if (!row) {
    return {
      status: "failed",
      bookingId: id,
      errorCode: PAYMENT_ERROR_CODES.PAYMENT_BOOKING_NOT_FOUND,
      error: "We could not find this booking.",
      retryable: false,
    };
  }

  if (!accessAllowed(row, access)) {
    logPaymentStructured("payment_initialize", {
      booking_id: id,
      result: "denied",
      error_code: PAYMENT_ERROR_CODES.PAYMENT_ACCESS_DENIED,
    });
    return {
      status: "failed",
      bookingId: id,
      errorCode: PAYMENT_ERROR_CODES.PAYMENT_ACCESS_DENIED,
      error: "Invalid payment reference.",
      retryable: false,
    };
  }

  if (isAlreadyPaid(row)) {
    return {
      status: "paid",
      bookingId: id,
      reference: String(row.paystack_reference ?? "") || undefined,
      errorCode: PAYMENT_ERROR_CODES.PAYMENT_ALREADY_COMPLETED,
    };
  }

  const status = String(row.status ?? "").toLowerCase();
  if (status !== "pending_payment" && status !== "payment_expired") {
    return {
      status: "failed",
      bookingId: id,
      errorCode: PAYMENT_ERROR_CODES.PAYMENT_NOT_PAYABLE,
      error: "This booking is no longer awaiting payment.",
      retryable: false,
    };
  }

  const amountZar = trustedBookingPayableZar(row);
  if (amountZar == null) {
    return {
      status: "failed",
      bookingId: id,
      errorCode: PAYMENT_ERROR_CODES.PAYMENT_AMOUNT_MISMATCH,
      error: "Booking amount is invalid. Contact support.",
      retryable: false,
    };
  }

  if (
    isStoredPaymentLinkUsable({
      status: row.status,
      payment_link: row.payment_link,
      payment_link_expires_at: row.payment_link_expires_at,
    })
  ) {
    logPaymentStructured("payment_initialize", {
      booking_id: id,
      reference: row.paystack_reference,
      result: "reused",
    });
    return readyFromRow(row, { reused: true, refreshed: false, amountZar });
  }

  // Uncertain / abandoned prior attempt — verify with Paystack before creating another charge.
  const paid = await maybeFinalizeSuccessfulCharge(admin, row, secret);
  if (paid) return paid;

  const reason = !String(row.payment_link ?? "").trim()
    ? PAYMENT_ERROR_CODES.PAYMENT_LINK_MISSING
    : status === "payment_expired" ||
        !isStoredPaymentLinkUsable({
          status: "pending_payment",
          payment_link: row.payment_link,
          payment_link_expires_at: row.payment_link_expires_at,
        })
      ? PAYMENT_ERROR_CODES.PAYMENT_LINK_EXPIRED
      : PAYMENT_ERROR_CODES.PAYMENT_ATTEMPT_ABANDONED;

  return initializeFreshPaystackSession(admin, row, secret, amountZar, reason);
}

/**
 * Server-side payment session recovery for an existing unpaid booking.
 * Reuses a valid stored Paystack checkout URL when safe; otherwise initializes a fresh transaction.
 */
export async function ensureBookingPaymentSession(
  admin: SupabaseClient,
  params: { bookingId: string; access: BookingPaymentSessionAccess },
): Promise<EnsureBookingPaymentSessionResult> {
  const bookingId = params.bookingId.trim();
  const existing = inflightByBookingId.get(bookingId);
  if (existing) return existing;

  const promise = ensureBookingPaymentSessionInner(admin, bookingId, params.access).finally(() => {
    if (inflightByBookingId.get(bookingId) === promise) {
      inflightByBookingId.delete(bookingId);
    }
  });
  inflightByBookingId.set(bookingId, promise);
  return promise;
}
