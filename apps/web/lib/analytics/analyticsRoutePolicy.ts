"use client";

import { isGa4PathExcluded } from "@/lib/analytics/ga4Config";
import { gaDisableKey, setGa4Disabled } from "@/lib/analytics/ga4Events";

/** Synchronously readable by GTM exception triggers (`{{shalean_analytics_route_eligible}}`). */
export const SHALEAN_ANALYTICS_ROUTE_ELIGIBLE_KEY = "__shaleanAnalyticsRouteEligible";
export const SHALEAN_ROUTE_POLICY_EVENT = "shalean_route_policy";
export const SHALEAN_ANALYTICS_TAG_LOADED_EVENT = "shalean:analytics-tag-loaded";

/** Deferred gtag/GTM loaders call this after replacing `dataLayer.push`. */
export function notifyAnalyticsTagLoaded(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SHALEAN_ANALYTICS_TAG_LOADED_EVENT));
}

declare global {
  interface Window {
    __shaleanAnalyticsRouteEligible?: boolean;
    __shaleanDataLayerGuardInstalled?: boolean;
    __shaleanDataLayerGuardPush?: (...items: unknown[]) => number;
  }
}

/** Valid Google Ads conversion ID (`AW-` prefix). */
export function isGoogleAdsMeasurementId(value: string | null | undefined): boolean {
  return typeof value === "string" && /^AW-\d+$/i.test(value.trim());
}

/** Client-visible Google Ads destination configured for gtag. */
export function getGoogleAdsMeasurementId(): string {
  const fromEnv =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim() : "";
  if (fromEnv && isGoogleAdsMeasurementId(fromEnv)) return fromEnv;
  return "AW-11050850519";
}

/** Every AW-* destination that must be silenced on internal routes. */
export function googleAdsDisableTargetIds(): string[] {
  const id = getGoogleAdsMeasurementId();
  return id ? [id] : [];
}

/** Toggle Google Ads collection via the standard `ga-disable-AW-*` flag. */
export function setGoogleAdsDisabled(disabled: boolean): void {
  if (typeof window === "undefined") return;
  const flags = window as unknown as Record<string, boolean>;
  for (const id of googleAdsDisableTargetIds()) {
    flags[gaDisableKey(id)] = disabled;
  }
}

function isAllowedDataLayerPushWhenBlocked(entry: unknown): boolean {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
  return (entry as Record<string, unknown>).event === SHALEAN_ROUTE_POLICY_EVENT;
}

function isShaleanDataLayerGuard(pushFn: unknown): boolean {
  return typeof window !== "undefined" && pushFn === window.__shaleanDataLayerGuardPush;
}

/**
 * Wrap `dataLayer.push` so an already-loaded GTM container cannot receive new
 * marketing events on excluded SPA routes. Policy updates always pass through.
 * Re-wraps when deferred gtag/GTM loaders replace `push` after hydration.
 */
export function installDataLayerGuard(): void {
  if (typeof window === "undefined") return;

  const dl = (window.dataLayer = window.dataLayer || []) as unknown[] & {
    push: (...items: unknown[]) => number;
  };
  if (isShaleanDataLayerGuard(dl.push)) return;

  const currentPush = dl.push;
  const priorPush = currentPush.bind(dl);
  const guardedPush = (...items: unknown[]) => {
    const eligible = window.__shaleanAnalyticsRouteEligible !== false;
    if (eligible || isAllowedDataLayerPushWhenBlocked(items[0])) {
      return priorPush(...items);
    }
    return dl.length;
  };

  window.__shaleanDataLayerGuardPush = guardedPush;
  dl.push = guardedPush;
  window.__shaleanDataLayerGuardInstalled = true;
}

/** Publish route eligibility synchronously for gtag disable flags and GTM/dataLayer consumers. */
export function setAnalyticsRouteEligible(eligible: boolean): void {
  if (typeof window === "undefined") return;
  window.__shaleanAnalyticsRouteEligible = eligible;
  installDataLayerGuard();
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: SHALEAN_ROUTE_POLICY_EVENT,
    shalean_analytics_route_eligible: eligible,
  });
}

/** Disable GA4 + Ads + GTM dataLayer intake on excluded routes; restore on public routes. */
export function applyAnalyticsRoutePolicy(pathname: string | null): void {
  const excluded = isGa4PathExcluded(pathname);
  setGa4Disabled(excluded);
  setGoogleAdsDisabled(excluded);
  setAnalyticsRouteEligible(!excluded);
}
