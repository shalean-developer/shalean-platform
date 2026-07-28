import "server-only";

import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { enqueueFailedJob } from "@/lib/booking/failedJobs";
import { upsertBookingFromPaystack } from "@/lib/booking/upsertBookingFromPaystack";
import { resolvePaystackUserId } from "@/lib/booking/resolvePaystackUserId";
import { recordReferralCheckoutRedemption } from "@/lib/referrals/validateReferral";
import { enrichPaystackMetadataWithBookingReferral } from "@/lib/referrals/referralCheckoutMetadata";
import { bookingIdForPaystackReference } from "@/lib/booking/paystackBookingIdLookup";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logPaymentStructured } from "@/lib/observability/paymentStructuredLog";
import { notifyBookingEvent } from "@/lib/notifications/notifyBookingEvent";
import { notifyBookingDebug } from "@/lib/notifications/notifyBookingDebug";
import { bookingPaystackFinalizeTraceEnabled } from "@/lib/logging/bookingPaymentDebug";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { isInlineDecoupledPaystackReference } from "@/lib/booking/paystackBookingIdLookup";
import { reportPaidBookingAdsConversions } from "@/lib/ads/reportPaidBookingAdsConversions";

export type PaystackPersistSource = "verify" | "webhook" | "retry";

export type FinalizePaystackChargeSuccessParams = {
  source: PaystackPersistSource;
  paystackReference: string;
  amountCents: number;
  currency: string;
  customerEmail: string;
  snapshot: BookingSnapshotV1 | null;
  paystackMetadata: Record<string, string | undefined>;
  paystackAuthorizationCode: string | null;
  paystackCustomerCode: string | null;
  paidAtIso: string | null;
};

/**
 * Single path for Paystack `charge.success` / verify-after-success: upsert booking, redeem referral, notify.
 * Notifications and referral redemption must not throw or block persistence.
 */
export async function finalizePaystackChargeSuccess(
  params: FinalizePaystackChargeSuccessParams,
): Promise<Awaited<ReturnType<typeof upsertBookingFromPaystack>>> {
  notifyBookingDebug("finalize_paystack_start", {
    reference: params.paystackReference,
    source: params.source,
    snapshotHasCustomerEmail: Boolean(params.snapshot?.customer?.email?.trim()),
  });

  const metaPath = params.paystackMetadata?.payment_path?.trim();
  logPaymentStructured("payment_finalize_signal", {
    reference: params.paystackReference,
    finalize_source: params.source,
    payment_path:
      metaPath ||
      (isInlineDecoupledPaystackReference(params.paystackReference) ? "inline_checkout" : "legacy_or_unknown"),
    metadata_contract_v: params.paystackMetadata?.shalean_checkout_meta_v ?? null,
    booking_snapshot_version: params.paystackMetadata?.booking_snapshot_version ?? null,
    selected_cleaner_meta_present: Boolean(params.paystackMetadata?.selected_cleaner_id?.trim()),
  });

  if (bookingPaystackFinalizeTraceEnabled()) {
    console.log("[FINALIZE START]", {
      reference: params.paystackReference,
      amountCents: params.amountCents,
      currency: params.currency,
      source: params.source,
      snapshotLockedAt: params.snapshot?.locked?.lockedAt ?? null,
      snapshotHasCustomerEmail: Boolean(params.snapshot?.customer?.email?.trim()),
    });
  }

  const admin = getSupabaseAdmin();
  let paystackMetadata = params.paystackMetadata;
  if (admin) {
    const bookingIdForReferral = await bookingIdForPaystackReference(admin, params.paystackReference);
    if (bookingIdForReferral) {
      paystackMetadata = await enrichPaystackMetadataWithBookingReferral(
        admin,
        bookingIdForReferral,
        paystackMetadata,
      );
    }
  }

  let result: Awaited<ReturnType<typeof upsertBookingFromPaystack>>;
  try {
    result = await upsertBookingFromPaystack({
      paystackReference: params.paystackReference,
      amountCents: params.amountCents,
      currency: params.currency,
      customerEmail: params.customerEmail,
      snapshot: params.snapshot,
      paystackMetadata,
      paystackAuthorizationCode: params.paystackAuthorizationCode,
      paystackCustomerCode: params.paystackCustomerCode,
      paidAtIso: params.paidAtIso,
      paystackPersistSource: params.source,
    });
    notifyBookingDebug("finalize_paystack_upsert", {
      reference: params.paystackReference,
      ok: result.ok,
      skipped: result.skipped,
      bookingId: result.bookingId,
      error: result.error ?? null,
    });
    if (bookingPaystackFinalizeTraceEnabled()) {
      console.log("[UPSERT RESULT]", {
        ok: result.ok,
        skipped: result.skipped,
        bookingId: result.bookingId,
        error: result.error?.slice(0, 500) ?? null,
        reason: result.reason ?? null,
      });
    }
  } catch (e) {
    notifyBookingDebug("finalize_paystack_upsert_throw", {
      reference: params.paystackReference,
      message: e instanceof Error ? e.message : String(e),
    });
    const msg = e instanceof Error ? e.message : String(e);
    await reportOperationalIssue("critical", "finalizePaystackChargeSuccess", `upsert threw: ${msg}`, {
      reference: params.paystackReference,
      source: params.source,
    });
    result = { ok: false, skipped: false, bookingId: null, error: msg };
    void enqueueFailedJob("booking_finalize", {
      paystackReference: params.paystackReference,
      error: msg,
      payload: params.paystackMetadata,
    });
  }

  let resolvedCustomerEmail = normalizeEmail(params.customerEmail || "");
  if ((!resolvedCustomerEmail || resolvedCustomerEmail.length < 3) && result.bookingId && admin) {
    const { data: br } = await admin
      .from("bookings")
      .select("customer_email")
      .eq("id", result.bookingId)
      .maybeSingle();
    resolvedCustomerEmail = normalizeEmail(String((br as { customer_email?: string | null })?.customer_email ?? ""));
  }
  if (!resolvedCustomerEmail || resolvedCustomerEmail.length < 3) {
    resolvedCustomerEmail = normalizeEmail(params.snapshot?.customer?.email ?? "");
  }

  if (result.bookingId && !result.error && admin) {
    try {
      await recordReferralCheckoutRedemption({
        admin,
        metadata: paystackMetadata,
        bookingId: result.bookingId,
        userId: resolvePaystackUserId(params.snapshot, paystackMetadata),
        customerEmail: resolvedCustomerEmail,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await reportOperationalIssue("error", "finalizePaystackChargeSuccess/referral", msg, {
        bookingId: result.bookingId,
        reference: params.paystackReference,
      });
    }
  }

  // Payment notifications must run on every verify/webhook success for this reference, including
  // idempotent upsert replays (`result.skipped === true`). Upsert stays skipped; duplicate sends are
  // prevented inside `notifyBookingEvent` via `tryClaimNotificationIdempotency` (Paystack reference key).
  if (result.bookingId && !result.error && admin) {
    notifyBookingDebug("finalize_paystack_calling_notify", {
      bookingId: result.bookingId,
      skipped: result.skipped,
      reference: params.paystackReference,
      resolvedCustomerEmailSet: Boolean(resolvedCustomerEmail?.trim()),
    });
    try {
      await notifyBookingEvent({
        type: "payment_confirmed",
        supabase: admin,
        bookingId: result.bookingId,
        snapshot: params.snapshot,
        customerEmail: resolvedCustomerEmail,
        amountCents: params.amountCents,
        paymentReference: params.paystackReference,
      });
    } catch (err) {
      notifyBookingDebug("finalize_paystack_notify_throw", {
        bookingId: result.bookingId,
        message: err instanceof Error ? err.message : String(err),
      });
      await reportOperationalIssue("error", "finalizePaystackChargeSuccess/notifyBookingEvent", String(err), {
        bookingId: result.bookingId,
        reference: params.paystackReference,
      });
    }

    try {
      const { data: softRow } = await admin
        .from("bookings")
        .select(
          "fulfillment_mode, suburb, date, time, service_slug, customer_name, customer_email, customer_phone, booking_snapshot",
        )
        .eq("id", result.bookingId)
        .maybeSingle();
      const mode = String((softRow as { fulfillment_mode?: string | null } | null)?.fulfillment_mode ?? "")
        .trim()
        .toLowerCase();
      if (mode === "ops_assignment") {
        const { notifyOfficeSoftFulfillment } = await import("@/lib/notifications/notifyOfficeSoftFulfillment");
        const row = softRow as {
          suburb?: string | null;
          date?: string | null;
          time?: string | null;
          service_slug?: string | null;
          customer_name?: string | null;
          customer_email?: string | null;
          customer_phone?: string | null;
        } | null;
        void notifyOfficeSoftFulfillment({
          supabase: admin,
          bookingId: result.bookingId,
          kind: "ops_assignment",
          suburb: row?.suburb,
          dateYmd: row?.date,
          timeHm: row?.time,
          serviceSlug: row?.service_slug,
          customerName: row?.customer_name,
          customerEmail: row?.customer_email ?? resolvedCustomerEmail,
          customerPhone: row?.customer_phone,
        });
      }

      const meta = paystackMetadata;
      const gclid = typeof meta.gclid === "string" ? meta.gclid.trim() : "";
      const fbclid = typeof meta.fbclid === "string" ? meta.fbclid.trim() : "";
      const snapAnalytics = (() => {
        const snap = (softRow as { booking_snapshot?: unknown } | null)?.booking_snapshot;
        if (!snap || typeof snap !== "object" || Array.isArray(snap)) return null;
        const analytics = (snap as { analytics?: unknown }).analytics;
        if (!analytics || typeof analytics !== "object" || Array.isArray(analytics)) return null;
        return analytics as { ga_client_id?: unknown; ga_session_id?: unknown };
      })();
      const gaClientIdFromSnap =
        typeof snapAnalytics?.ga_client_id === "string" && /^\d+\.\d+$/.test(snapAnalytics.ga_client_id.trim())
          ? snapAnalytics.ga_client_id.trim()
          : "";
      const gaSessionIdFromSnap =
        typeof snapAnalytics?.ga_session_id === "string" && /^\d+$/.test(snapAnalytics.ga_session_id.trim())
          ? snapAnalytics.ga_session_id.trim()
          : "";
      const gaClientId =
        (typeof meta.ga_client_id === "string" && /^\d+\.\d+$/.test(meta.ga_client_id.trim())
          ? meta.ga_client_id.trim()
          : "") || gaClientIdFromSnap;
      const gaSessionId =
        (typeof meta.ga_session_id === "string" && /^\d+$/.test(meta.ga_session_id.trim())
          ? meta.ga_session_id.trim()
          : "") || gaSessionIdFromSnap;
      const serviceFromRow =
        typeof (softRow as { service_slug?: string | null } | null)?.service_slug === "string"
          ? String((softRow as { service_slug?: string | null }).service_slug).trim()
          : "";
      const serviceFromMeta =
        (typeof meta.service_slug === "string" && meta.service_slug.trim()) ||
        (typeof meta.service === "string" && meta.service.trim()) ||
        "";
      const serviceFromSnapshot =
        (typeof params.snapshot?.locked?.service_type === "string" &&
          params.snapshot.locked.service_type.trim()) ||
        (typeof params.snapshot?.locked?.service === "string" && params.snapshot.locked.service.trim()) ||
        (typeof params.snapshot?.flat?.service === "string" && params.snapshot.flat.service.trim()) ||
        "";
      await reportPaidBookingAdsConversions({
        admin,
        paystackReference: params.paystackReference,
        bookingId: result.bookingId,
        amountCents: params.amountCents,
        currency: params.currency,
        email: resolvedCustomerEmail || null,
        phone: params.snapshot?.customer?.phone ?? null,
        customerName: params.snapshot?.customer?.name ?? null,
        service: serviceFromRow || serviceFromMeta || serviceFromSnapshot || null,
        gclid: gclid || null,
        fbclid: fbclid || null,
        gaClientId: gaClientId || null,
        gaSessionId: gaSessionId || null,
      });
    } catch {
      /* non-fatal — ads conversions must not block finalize success */
      try {
        const meta = paystackMetadata;
        const gclid = typeof meta.gclid === "string" ? meta.gclid.trim() : "";
        const fbclid = typeof meta.fbclid === "string" ? meta.fbclid.trim() : "";
        const gaClientId =
          typeof meta.ga_client_id === "string" && /^\d+\.\d+$/.test(meta.ga_client_id.trim())
            ? meta.ga_client_id.trim()
            : "";
        const gaSessionId =
          typeof meta.ga_session_id === "string" && /^\d+$/.test(meta.ga_session_id.trim())
            ? meta.ga_session_id.trim()
            : "";
        await reportPaidBookingAdsConversions({
          admin,
          paystackReference: params.paystackReference,
          bookingId: result.bookingId,
          amountCents: params.amountCents,
          currency: params.currency,
          email: resolvedCustomerEmail || null,
          phone: params.snapshot?.customer?.phone ?? null,
          customerName: params.snapshot?.customer?.name ?? null,
          gclid: gclid || null,
          fbclid: fbclid || null,
          gaClientId: gaClientId || null,
          gaSessionId: gaSessionId || null,
        });
      } catch {
        /* swallow — payment already finalized */
      }
    }
  }

  return result;
}
