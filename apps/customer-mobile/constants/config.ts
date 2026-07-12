/**
 * Customer mobile public configuration.
 * Values come from EXPO_PUBLIC_* (local .env or EAS Secrets). Never commit secrets.
 *
 * Pattern aligned with apps/mobile/constants/config.ts.
 */
import { APP_BUILD_NUMBER, APP_VERSION, resolveAppEnv } from "@/constants/appMeta";
import Constants from "expo-constants";
import { Platform } from "react-native";

const extra = (Constants.expoConfig?.extra ?? {}) as {
  apiBaseUrl?: string;
  appEnv?: string;
  paystackPublicKey?: string;
};

const configuredApiBaseUrl =
  (typeof process !== "undefined" && process.env.EXPO_PUBLIC_API_BASE_URL?.trim()) ||
  extra.apiBaseUrl?.trim() ||
  (__DEV__ ? "https://shalean.co.za" : "");

/**
 * Upstream API origin (always absolute when configured).
 * On Expo web in __DEV__, browsers cannot call this directly (no CORS) — use
 * {@link API_BASE_URL} (same-origin) so Metro can proxy `/api/*`.
 */
export const API_UPSTREAM_URL = configuredApiBaseUrl;

/**
 * Base URL used by the HTTP client.
 * Empty string on web __DEV__ → relative `/api/...` via the Metro proxy.
 */
export const API_BASE_URL =
  Platform.OS === "web" && __DEV__ ? "" : configuredApiBaseUrl;

/** Supabase project URL — required for JWT refresh after login (Milestone 3). */
export const SUPABASE_URL =
  (typeof process !== "undefined" && process.env.EXPO_PUBLIC_SUPABASE_URL?.trim()) || "";

/** Supabase anon key — required for JWT refresh after login (Milestone 3). */
export const SUPABASE_ANON_KEY =
  (typeof process !== "undefined" && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim()) || "";

/** Paystack public key only — never ship the secret key in the app (Milestone 6). */
export const PAYSTACK_PUBLIC_KEY =
  extra.paystackPublicKey?.trim() ||
  (typeof process !== "undefined" && process.env.EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY?.trim()) ||
  "";

export const APP_SCHEME = "shalean-customer";

export const APP_ENV =
  (typeof process !== "undefined" && process.env.EXPO_PUBLIC_APP_ENV?.trim()) ||
  extra.appEnv?.trim() ||
  resolveAppEnv(configuredApiBaseUrl || "https://localhost");

export { APP_BUILD_NUMBER, APP_VERSION };

/** Core config needed to boot (auth + API). Paystack public key is checked on the pay screen. */
export function assertCustomerConfig(): { ok: true } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  if (!configuredApiBaseUrl) missing.push("EXPO_PUBLIC_API_BASE_URL");
  if (!SUPABASE_URL) missing.push("EXPO_PUBLIC_SUPABASE_URL");
  if (!SUPABASE_ANON_KEY) missing.push("EXPO_PUBLIC_SUPABASE_ANON_KEY");
  return missing.length ? { ok: false, missing } : { ok: true };
}
