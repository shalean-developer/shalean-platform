import "server-only";

import crypto from "crypto";
import type { AdsPurchaseConversion } from "@/lib/ads/purchaseConversionTypes";
import { GA4_BRANCH, getGa4MeasurementId } from "@/lib/analytics/ga4Config";
import { reportOperationalIssue } from "@/lib/logging/systemLog";

/** Bound Meta/GA4 waits so payment finalize cannot hang the verify/webhook response. */
const ADS_CONVERSION_FETCH_TIMEOUT_MS = 4_000;

function conversionFetchSignal(): AbortSignal | undefined {
  try {
    return AbortSignal.timeout(ADS_CONVERSION_FETCH_TIMEOUT_MS);
  } catch {
    return undefined;
  }
}

function sha256Norm(value: string): string {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

function hashEmail(email: string | null | undefined): string | null {
  const e = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!e || !e.includes("@")) return null;
  return sha256Norm(e);
}

/** Digits only; ZA numbers often stored as 0… or +27… — Meta wants E.164 without +. */
function hashPhone(phone: string | null | undefined): string | null {
  const raw = typeof phone === "string" ? phone.trim() : "";
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 10) digits = `27${digits.slice(1)}`;
  if (digits.length < 8) return null;
  return sha256Norm(digits);
}

function hashName(part: string | null | undefined): string | null {
  const p = typeof part === "string" ? part.trim().toLowerCase() : "";
  if (p.length < 1) return null;
  return sha256Norm(p);
}

type MetaCapiResult = { ok: true } | { ok: false; skipped: true; reason: string } | { ok: false; error: string };

/**
 * Meta Conversions API Purchase — pairs with Pixel via matching `event_id` (Paystack reference).
 * Requires `META_PIXEL_ID` (or `NEXT_PUBLIC_META_PIXEL_ID`) + `META_CAPI_ACCESS_TOKEN`.
 */
export async function sendMetaCapiPurchase(payload: AdsPurchaseConversion): Promise<MetaCapiResult> {
  const pixelId =
    process.env.META_PIXEL_ID?.trim() || process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() || "";
  const token = process.env.META_CAPI_ACCESS_TOKEN?.trim() || "";
  if (!pixelId || !token) {
    return { ok: false, skipped: true, reason: "meta_capi_not_configured" };
  }

  const eventId = payload.eventId.trim();
  if (!eventId) return { ok: false, skipped: true, reason: "missing_event_id" };

  const userData: Record<string, string> = {};
  const em = hashEmail(payload.email);
  const ph = hashPhone(payload.phone);
  const fn = hashName(payload.firstName);
  const ln = hashName(payload.lastName);
  if (em) userData.em = em;
  if (ph) userData.ph = ph;
  if (fn) userData.fn = fn;
  if (ln) userData.ln = ln;
  if (payload.fbp?.trim()) userData.fbp = payload.fbp.trim();
  if (payload.fbc?.trim()) userData.fbc = payload.fbc.trim();
  if (payload.clientUserAgent?.trim()) userData.client_user_agent = payload.clientUserAgent.trim();
  if (payload.clientIp?.trim()) userData.client_ip_address = payload.clientIp.trim();
  if (payload.fbclid?.trim() && !userData.fbc) {
    userData.fbc = `fb.1.${Date.now()}.${payload.fbclid.trim()}`;
  }

  const customData: Record<string, unknown> = {
    currency: (payload.currency || "ZAR").toUpperCase(),
    value: payload.valueZar,
    content_type: "product",
    num_items: 1,
  };
  if (payload.bookingId) {
    customData.content_ids = [payload.bookingId];
  }

  const body: Record<string, unknown> = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: "website",
        event_source_url: payload.eventSourceUrl?.trim() || undefined,
        user_data: userData,
        custom_data: customData,
      },
    ],
  };

  const testCode = process.env.META_CAPI_TEST_EVENT_CODE?.trim();
  if (testCode) body.test_event_code = testCode;

  try {
    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: conversionFetchSignal(),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string }; events_received?: number };
    if (!res.ok) {
      const msg = json.error?.message || `Meta CAPI HTTP ${res.status}`;
      void reportOperationalIssue("warn", "ads/metaCapi", msg, { eventId, pixelId });
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    void reportOperationalIssue("warn", "ads/metaCapi", msg, { eventId });
    return { ok: false, error: msg };
  }
}

type Ga4Result = { ok: true } | { ok: false; skipped: true; reason: string } | { ok: false; error: string };

/**
 * GA4 Measurement Protocol purchase — sole path for the primary `purchase` conversion.
 * Requires `GA4_MEASUREMENT_PROTOCOL_SECRET` + canonical Measurement ID (`G-GEVTBDWTQW`).
 * Idempotency is enforced by the caller (`ads_purchase` claim per Paystack reference).
 * Never includes PII (email/phone/name stay on the Meta CAPI path only).
 */
export async function sendGa4MeasurementPurchase(payload: AdsPurchaseConversion): Promise<Ga4Result> {
  const measurementId = getGa4MeasurementId();
  const apiSecret = process.env.GA4_MEASUREMENT_PROTOCOL_SECRET?.trim() || "";
  if (!apiSecret) {
    return { ok: false, skipped: true, reason: "ga4_mp_not_configured" };
  }

  const eventId = payload.eventId.trim();
  if (!eventId) return { ok: false, skipped: true, reason: "missing_event_id" };

  const service =
    typeof payload.service === "string" && payload.service.trim()
      ? payload.service.trim()
      : "cleaning";

  const browserClientId =
    typeof payload.gaClientId === "string" && /^\d+\.\d+$/.test(payload.gaClientId.trim())
      ? payload.gaClientId.trim()
      : null;
  const synthetic = crypto.createHash("sha256").update(`shalean:${eventId}`).digest("hex").slice(0, 32);
  const clientId = browserClientId || `${synthetic.slice(0, 16)}.${synthetic.slice(16)}`;

  const eventParams: Record<string, unknown> = {
    transaction_id: eventId,
    value: payload.valueZar,
    currency: (payload.currency || "ZAR").toUpperCase(),
    service,
    branch: GA4_BRANCH,
    engagement_time_msec: 1,
    items: [
      {
        item_id: service,
        item_name: service,
        item_category: GA4_BRANCH,
        quantity: 1,
        price: payload.valueZar,
      },
    ],
  };
  if (typeof payload.gaSessionId === "string" && /^\d+$/.test(payload.gaSessionId.trim())) {
    eventParams.session_id = payload.gaSessionId.trim();
  }

  const body = {
    client_id: clientId,
    events: [
      {
        name: "purchase",
        params: eventParams,
      },
    ],
  };

  try {
    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: conversionFetchSignal(),
    });
    // MP returns 204 with empty body on success
    if (!res.ok) {
      const msg = `GA4 MP HTTP ${res.status}`;
      void reportOperationalIssue("warn", "ads/ga4Mp", msg, { eventId, measurementId });
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    void reportOperationalIssue("warn", "ads/ga4Mp", msg, { eventId });
    return { ok: false, error: msg };
  }
}

/**
 * Fire server-side purchase conversions (Meta CAPI + optional GA4 MP). Never throws.
 * Idempotent at the caller via Paystack reference / notification claim patterns.
 */
export async function sendServerPurchaseConversions(payload: AdsPurchaseConversion): Promise<void> {
  await Promise.all([sendMetaCapiPurchase(payload), sendGa4MeasurementPurchase(payload)]);
}
