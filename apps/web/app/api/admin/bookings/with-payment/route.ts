import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  finalizeAdminPaystackCheckout,
  sendAdminPaystackDeliveryForRow,
} from "@/lib/admin/adminPaystackPostInitialize";
import {
  abandonAdminBookingCreateIdempotency,
  claimAdminBookingCreateIdempotency,
  finalizeAdminBookingCreateIdempotency,
} from "@/lib/admin/adminBookingCreateIdempotency";
import {
  adminBookingLocationFingerprint,
  adminBookingServiceSlug,
} from "@/lib/admin/adminBookingCreateFingerprint";
import { paymentLinkSendAllowed } from "@/lib/admin/paymentLinkSendGate";
import { requireAdminUser } from "@/lib/auth/evaluateAdminAccess";
import { deriveAdminClientPaymentStatus, isStoredPaymentLinkUsable } from "@/lib/booking/adminPaymentLinkState";
import { parseLockedBookingFromUnknown } from "@/lib/booking/lockedBooking";
import { processPaystackInitializeBody } from "@/lib/booking/paystackInitializeCore";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BookingHead = {
  id: string;
  user_id: string | null;
  payment_status?: string | null;
  status: string | null;
  payment_link: string | null;
  payment_link_expires_at: string | null;
  payment_link_last_sent_at: string | null;
  paystack_reference: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  service: string | null;
  date: string | null;
  time: string | null;
  total_paid_zar: number | string | null;
  payment_link_send_count: number | null;
  payment_link_first_sent_at: string | null;
  payment_link_delivery: unknown;
  payment_conversion_bucket: string | null;
  payment_last_touch_channel: string | null;
};

function boolish(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v === "string") return ["1", "true", "yes"].includes(v.trim().toLowerCase());
  return false;
}

const HEAD_SELECT =
  "id, user_id, payment_status, status, payment_link, payment_link_expires_at, payment_link_last_sent_at, paystack_reference, customer_name, customer_phone, customer_email, service, date, time, total_paid_zar, payment_link_send_count, payment_link_first_sent_at, payment_link_delivery, payment_conversion_bucket, payment_last_touch_channel";

/**
 * Admin-only: same pipeline as customer checkout (`processPaystackInitializeBody`).
 * Body shape matches `POST /api/paystack/initialize` (locked, email, customer, tip, …).
 *
 * Idempotency:
 *   1. **Reuse existing booking**: pass `bookingId` for an existing `pending_payment` row with a
 *      **non-expired** link to return the stored URL without a new Paystack initialize (unless
 *      `forceNewCheckout` is true). Set `resendNotifications: true` to re-send notifications on a
 *      reused link (rate-limited).
 *   2. **Idempotency-Key header (M-3)**: identical retries on the new-checkout path (no `bookingId`,
 *      or `forceNewCheckout: true`) reuse the same `admin_booking_create_idempotency` row used by
 *      `POST /api/admin/bookings`, so a double-submit cannot create two pending_payment rows or
 *      two Paystack initialize sessions. Fingerprint = customer + slot + service + location;
 *      requires resolving the customer auth id from `body.customer.userId` or `resolve_auth_user_id_by_email`
 *      RPC fallback. When neither is present (rare), the route falls back to the historical
 *      "no idempotency" behavior.
 *
 * Customer delivery is **email first**, SMS only if email is missing or fails (no customer WhatsApp).
 *
 * `notificationMode`: legacy; both `chain` and `chain_plus_email` use the same email-first delivery order.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) {
    return NextResponse.json({ error: "Missing authorization." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const pub = createClient(url, anon);
  const {
    data: { user },
    error: userErr,
  } = await pub.auth.getUser(token);

  if (userErr || !user?.id) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }

  const adminAuth = await requireAdminUser(user);
  if (!adminAuth.ok) {
    return NextResponse.json({ error: adminAuth.error }, { status: adminAuth.status });
  }

  let body: Record<string, unknown>;
  try {
    const raw = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    body = raw as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const bookingIdFromBody =
    typeof body.bookingId === "string" && body.bookingId.trim()
      ? body.bookingId.trim()
      : typeof body.booking_id === "string" && body.booking_id.trim()
        ? body.booking_id.trim()
        : null;

  const forceNewCheckout = boolish(body.forceNewCheckout);
  const resendNotifications = boolish(body.resendNotifications);
  const notificationMode =
    body.notificationMode === "chain" ? ("chain" as const) : ("chain_plus_email" as const);
  const ignoreCleanerSlotConflict = boolish(body.ignore_cleaner_slot_conflict);
  const cleanerSlotOverrideReasonRaw =
    typeof body.cleaner_slot_override_reason === "string" ? body.cleaner_slot_override_reason.trim().slice(0, 500) : "";
  const cleanerSlotOverrideReasonForDb =
    ignoreCleanerSlotConflict && cleanerSlotOverrideReasonRaw.length > 0 ? cleanerSlotOverrideReasonRaw : null;

  if (bookingIdFromBody && !forceNewCheckout) {
    const { data: existing, error: exErr } = await admin.from("bookings").select(HEAD_SELECT).eq("id", bookingIdFromBody).maybeSingle();

    if (exErr) {
      await reportOperationalIssue("error", "admin/bookings/with-payment", exErr.message, { bookingId: bookingIdFromBody });
      return NextResponse.json({ error: "Could not load booking." }, { status: 500 });
    }

    if (!existing || typeof existing !== "object" || !("id" in existing)) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    const row = existing as BookingHead;
    if (String(row.payment_status ?? "").trim().toLowerCase() === "pending_monthly") {
      return NextResponse.json(
        {
          error: "This booking is on monthly consolidated billing. Send the monthly invoice payment link instead.",
          bookingId: row.id,
        },
        { status: 409 },
      );
    }

    const status = String(row.status ?? "").trim().toLowerCase();

    if (status !== "pending_payment") {
      const paymentStatus = deriveAdminClientPaymentStatus(row);
      await logSystemEvent({
        level: "info",
        source: "admin_booking_with_payment",
        message: "admin_checkout_rejected_already_paid",
        context: {
          type: "admin_checkout_guard",
          booking_id: row.id,
          admin_id: adminAuth.userId,
          booking_status: row.status,
          payment_status: paymentStatus,
        },
      });
      return NextResponse.json(
        {
          error: "Booking is not awaiting payment (already paid or closed).",
          payment_status: paymentStatus,
          bookingId: row.id,
        },
        { status: 409 },
      );
    }

    if (isStoredPaymentLinkUsable(row) && row.payment_link && row.paystack_reference) {
      await logSystemEvent({
        level: "info",
        source: "admin_booking_with_payment",
        message: "admin_payment_link_reused",
        context: {
          type: "admin_checkout_idempotent",
          booking_id: row.id,
          admin_id: adminAuth.userId,
          resend_notifications: resendNotifications,
        },
      });

      if (resendNotifications) {
        const gate = paymentLinkSendAllowed(row);
        if (!gate.allowed) {
          return NextResponse.json(
            { error: "Please wait before resending payment notifications.", retryAfterSec: gate.retryAfterSec },
            { status: 429, headers: { "Retry-After": String(gate.retryAfterSec) } },
          );
        }
        await sendAdminPaystackDeliveryForRow(admin, {
          row,
          authorizationUrl: row.payment_link,
          reference: row.paystack_reference,
          notificationMode,
          locked: body.locked,
          passType: "admin_resend",
        });
      }

      return NextResponse.json({
        ok: true,
        reused: true,
        authorizationUrl: row.payment_link,
        reference: row.paystack_reference,
        bookingId: row.id,
        payment_status: deriveAdminClientPaymentStatus(row),
        payment_link_expires_at: row.payment_link_expires_at,
        notificationsSent: resendNotifications,
      });
    }
  }

  // M-3: Same `admin_booking_create_idempotency` claim used by the main admin POST so identical
  // retries (Idempotency-Key + customer + slot + service + location) replay the cached response
  // instead of starting a second Paystack initialize / inserting another pending_payment row.
  // Only the new-checkout path runs through this — the `bookingIdFromBody` reuse branch above
  // already short-circuits without creating new rows.
  const lockedForFingerprint = parseLockedBookingFromUnknown(body.locked);
  let claimId: string | null = null;
  if (lockedForFingerprint) {
    let customerUserIdForFp: string | null = null;
    const customerRaw = body.customer;
    if (customerRaw && typeof customerRaw === "object" && !Array.isArray(customerRaw)) {
      const cuid =
        typeof (customerRaw as Record<string, unknown>).userId === "string"
          ? String((customerRaw as Record<string, unknown>).userId).trim()
          : "";
      if (/^[0-9a-f-]{36}$/i.test(cuid)) customerUserIdForFp = cuid;
    }
    if (!customerUserIdForFp) {
      const emailForLookup = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (emailForLookup) {
        const { data: uid, error: rpcErr } = await admin.rpc("resolve_auth_user_id_by_email", {
          p_email: emailForLookup,
        });
        if (!rpcErr && typeof uid === "string" && /^[0-9a-f-]{36}$/i.test(uid)) {
          customerUserIdForFp = uid;
        }
      }
    }

    if (customerUserIdForFp) {
      const idem = await claimAdminBookingCreateIdempotency(admin, request, {
        customerUserId: customerUserIdForFp,
        serviceDate: String(lockedForFingerprint.date ?? ""),
        serviceTime: String(lockedForFingerprint.time ?? ""),
        serviceSlug: adminBookingServiceSlug(String(lockedForFingerprint.service ?? "")),
        locationHash: adminBookingLocationFingerprint(String(lockedForFingerprint.location ?? "")),
      });
      if (idem.kind === "replay") return idem.response;
      if (idem.kind === "in_flight") return idem.response;
      if (idem.kind === "error") return idem.response;
      if (idem.kind === "proceed") claimId = idem.claimId;
    }
  }

  const bail = async (res: NextResponse) => {
    if (claimId) await abandonAdminBookingCreateIdempotency(admin, claimId);
    return res;
  };

  const result = await processPaystackInitializeBody(body);
  if (!result.ok) {
    return bail(
      NextResponse.json(
        { error: result.error, ...(result.errorCode != null ? { errorCode: result.errorCode } : {}) },
        { status: result.status },
      ),
    );
  }

  const finalized = await finalizeAdminPaystackCheckout({
    admin,
    adminUserId: adminAuth.userId,
    result,
    locked: body.locked,
    notificationMode,
    ignoreCleanerSlotConflict,
    cleanerSlotOverrideReason: cleanerSlotOverrideReasonForDb,
  });
  if (!finalized.ok) {
    return bail(NextResponse.json({ error: finalized.error }, { status: 500 }));
  }

  const { data: row } = await admin.from("bookings").select(HEAD_SELECT).eq("id", result.bookingId!).maybeSingle();
  const head = row && typeof row === "object" ? (row as BookingHead) : null;

  const responseBody: Record<string, unknown> = {
    ok: true,
    reused: false,
    authorizationUrl: result.authorizationUrl,
    reference: result.reference,
    bookingId: result.bookingId,
    payment_status: head
      ? deriveAdminClientPaymentStatus({ ...head, payment_link_expires_at: finalized.expiresAt })
      : "pending",
    payment_link_expires_at: finalized.expiresAt,
  };
  if (claimId) await finalizeAdminBookingCreateIdempotency(admin, claimId, 200, responseBody);
  return NextResponse.json(responseBody);
}
