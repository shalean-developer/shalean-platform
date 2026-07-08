"use client";

const REF_KEY = "shalean_referral_code";
const REF_KIND_KEY = "shalean_referral_kind";

export function setReferralCapture(code: string, kind: "customer" | "cleaner"): void {
  if (typeof window === "undefined") return;
  const v = code.trim().toUpperCase();
  if (!v) return;
  window.localStorage.setItem(REF_KEY, v);
  window.localStorage.setItem(REF_KIND_KEY, kind);
}

export function getStoredReferral(kind?: "customer" | "cleaner"): string | null {
  if (typeof window === "undefined") return null;
  const code = window.localStorage.getItem(REF_KEY);
  const k = window.localStorage.getItem(REF_KIND_KEY) as "customer" | "cleaner" | null;
  if (!code) return null;
  if (kind && k && k !== kind) return null;
  return code;
}

export function clearStoredReferral(kind?: "customer" | "cleaner"): void {
  if (typeof window === "undefined") return;
  const k = window.localStorage.getItem(REF_KIND_KEY) as "customer" | "cleaner" | null;
  if (kind && k && kind !== k) return;
  window.localStorage.removeItem(REF_KEY);
  window.localStorage.removeItem(REF_KIND_KEY);
}

/** Append stored customer referral code to a booking URL (fallback if capture ran on another page). */
export function appendStoredReferralToHref(href: string, kind: "customer" | "cleaner" = "customer"): string {
  const code = getStoredReferral(kind);
  if (!code) return href;
  try {
    const url = new URL(href, typeof window !== "undefined" ? window.location.origin : "https://shalean.co.za");
    if (!url.searchParams.get("ref")) {
      url.searchParams.set("ref", code);
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    const join = href.includes("?") ? "&" : "?";
    return `${href}${join}ref=${encodeURIComponent(code)}`;
  }
}
