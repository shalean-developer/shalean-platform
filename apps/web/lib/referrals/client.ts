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
