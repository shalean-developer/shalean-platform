"use client";

import { getAcquisitionPayloadFields } from "@/lib/analytics/acquisitionContext";
import type { AdsPurchaseConversion } from "@/lib/ads/purchaseConversionTypes";
import { purchaseValueZar } from "@/lib/ads/purchaseConversionTypes";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function buildFbc(fbclid: string | null | undefined): string | null {
  const fromCookie = readCookie("_fbc");
  if (fromCookie) return fromCookie;
  const id = typeof fbclid === "string" ? fbclid.trim() : "";
  if (!id) return null;
  return `fb.1.${Date.now()}.${id}`;
}

/**
 * Fire browser purchase conversions (Meta Pixel + Google Ads) once per Paystack reference.
 *
 * GA4 `purchase` is intentionally omitted here — it is fired exactly once from the server
 * Measurement Protocol after authoritative payment verification (`sendGa4MeasurementPurchase`),
 * deduped via `ads_purchase` notification claims. That prevents double-counting on refresh,
 * Paystack callback retry, webhook retry, or revisiting `/account/success`.
 */
export function trackClientPurchase(params: {
  reference: string;
  bookingId?: string | null;
  amountCents?: number | null;
  valueZar?: number | null;
  currency?: string | null;
  email?: string | null;
  phone?: string | null;
}): void {
  if (typeof window === "undefined") return;
  const eventId = String(params.reference ?? "").trim();
  if (!eventId) return;

  const storageKey = `shalean_ads_purchase_${eventId}`;
  try {
    if (sessionStorage.getItem(storageKey)) return;
    sessionStorage.setItem(storageKey, "1");
  } catch {
    /* continue — still fire once this call */
  }

  const acq = getAcquisitionPayloadFields();
  const value = purchaseValueZar(params.amountCents, params.valueZar);
  const currency = (params.currency?.trim() || "ZAR").toUpperCase();
  const gclid = typeof acq.gclid === "string" ? acq.gclid : null;
  const fbclid = typeof acq.fbclid === "string" ? acq.fbclid : null;

  const payload: AdsPurchaseConversion = {
    eventId,
    valueZar: value,
    currency,
    bookingId: params.bookingId ?? null,
    email: params.email ?? null,
    phone: params.phone ?? null,
    gclid,
    fbclid,
    fbp: readCookie("_fbp"),
    fbc: buildFbc(fbclid),
    eventSourceUrl: typeof window !== "undefined" ? window.location.href.slice(0, 2000) : null,
  };

  // dataLayer: Google Ads / Meta listeners only — do NOT emit GA4 ecommerce purchase
  // (server MP is the single source of truth for GA4 purchase).
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: "ads_purchase_browser",
      transaction_id: eventId,
      value,
      currency,
      gclid: payload.gclid,
      fbclid: payload.fbclid,
    });
  } catch {
    /* ignore */
  }

  const adsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim() || "AW-11050850519";
  const adsLabel = process.env.NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL?.trim();
  try {
    if (typeof window.gtag === "function" && adsId && adsLabel) {
      window.gtag("event", "conversion", {
        send_to: `${adsId}/${adsLabel}`,
        value,
        currency,
        transaction_id: eventId,
      });
    }
  } catch {
    /* ignore */
  }

  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();
  try {
    if (pixelId && typeof window.fbq === "function") {
      window.fbq(
        "track",
        "Purchase",
        {
          value,
          currency,
          content_ids: payload.bookingId ? [payload.bookingId] : [eventId],
          content_type: "product",
          num_items: 1,
        },
        { eventID: eventId },
      );
    }
  } catch {
    /* ignore */
  }
}
