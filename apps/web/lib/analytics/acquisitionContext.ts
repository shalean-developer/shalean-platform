"use client";

const FIRST_TOUCH_KEY = "shalean_acquisition_first_touch_v1";

export type AcquisitionFirstTouch = {
  landing_pathname: string;
  landing_search: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  gclid: string | null;
  fbclid: string | null;
  msclkid: string | null;
  /** Detect Google Business Profile style referrals when present in query string. */
  gbp_source: string | null;
  captured_at_iso: string;
};

function readParam(params: URLSearchParams, key: string): string | null {
  const v = params.get(key)?.trim();
  return v ? v.slice(0, 500) : null;
}

/** Persist first-touch acquisition once per browser (SEO / ads / GBP attribution). */
export function captureAcquisitionFirstTouchIfNeeded(): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(FIRST_TOUCH_KEY)) return;
    const params = new URLSearchParams(window.location.search);
    const utmSource = readParam(params, "utm_source");
    const body: AcquisitionFirstTouch = {
      landing_pathname: window.location.pathname.slice(0, 500),
      landing_search: window.location.search ? window.location.search.slice(0, 2000) : null,
      utm_source: utmSource,
      utm_medium: readParam(params, "utm_medium"),
      utm_campaign: readParam(params, "utm_campaign"),
      utm_term: readParam(params, "utm_term"),
      utm_content: readParam(params, "utm_content"),
      gclid: readParam(params, "gclid"),
      fbclid: readParam(params, "fbclid"),
      msclkid: readParam(params, "msclkid"),
      gbp_source:
        utmSource && /gmb|google[_-]?business|business_profile|gbp/i.test(utmSource) ? utmSource : null,
      captured_at_iso: new Date().toISOString(),
    };
    window.localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(body));
  } catch {
    /* ignore */
  }
}

/** Fields merged onto growth payloads for attribution dashboards. */
export function getAcquisitionPayloadFields(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(FIRST_TOUCH_KEY);
    if (!raw) return {};
    const ft = JSON.parse(raw) as AcquisitionFirstTouch;
    if (!ft || typeof ft !== "object") return {};
    return {
      acquisition_first_touch: ft,
      landing_page_slug: ft.landing_pathname,
      utm_source: ft.utm_source,
      utm_medium: ft.utm_medium,
      utm_campaign: ft.utm_campaign,
      utm_term: ft.utm_term,
      utm_content: ft.utm_content,
      gclid: ft.gclid,
      fbclid: ft.fbclid,
      msclkid: ft.msclkid,
      gbp_attribution: ft.gbp_source,
    };
  } catch {
    return {};
  }
}
