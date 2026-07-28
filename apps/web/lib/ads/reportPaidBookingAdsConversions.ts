import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendServerPurchaseConversions } from "@/lib/ads/sendServerPurchaseConversions";
import type { AdsPurchaseConversion } from "@/lib/ads/purchaseConversionTypes";
import { purchaseValueZar } from "@/lib/ads/purchaseConversionTypes";
import { tryClaimNotificationIdempotency } from "@/lib/notifications/notificationIdempotencyClaim";
import { reportOperationalIssue } from "@/lib/logging/systemLog";

/**
 * After a paid booking is persisted, send Meta CAPI + GA4 purchase (best-effort).
 * Deduped once per Paystack reference via notification_idempotency_claims.
 */
export async function reportPaidBookingAdsConversions(params: {
  admin: SupabaseClient;
  paystackReference: string;
  bookingId: string;
  amountCents: number;
  currency: string;
  email: string | null;
  phone?: string | null;
  customerName?: string | null;
  /** Service slug for GA4 purchase (no PII). */
  service?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
}): Promise<void> {
  const reference = params.paystackReference.trim();
  if (!reference || !params.bookingId) return;

  const claimed = await tryClaimNotificationIdempotency(params.admin, {
    reference,
    eventType: "ads_purchase",
    channel: "in_app",
    bookingId: params.bookingId,
  });
  if (!claimed) return;

  const name = (params.customerName ?? "").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? null;
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim() || "";
  const payload: AdsPurchaseConversion = {
    eventId: reference,
    valueZar: purchaseValueZar(params.amountCents),
    currency: params.currency || "ZAR",
    bookingId: params.bookingId,
    service: params.service ?? null,
    email: params.email,
    phone: params.phone ?? null,
    firstName,
    lastName,
    gclid: params.gclid ?? null,
    fbclid: params.fbclid ?? null,
    eventSourceUrl: appUrl ? `${appUrl.replace(/\/$/, "")}/account/success` : null,
  };

  try {
    await sendServerPurchaseConversions(payload);
  } catch (e) {
    void reportOperationalIssue("warn", "ads/reportPaidBookingAdsConversions", String(e), {
      reference,
      bookingId: params.bookingId,
    });
  }
}
