/**
 * Mobile app public configuration.
 * Values come from EXPO_PUBLIC_* (local .env or EAS Secrets). Never commit secrets.
 */
import { APP_BUILD_NUMBER, APP_VERSION, resolveAppEnv } from "@/constants/appMeta";
import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as {
  apiBaseUrl?: string;
  appEnv?: string;
};

export const API_BASE_URL =
  (typeof process !== "undefined" && process.env.EXPO_PUBLIC_API_BASE_URL?.trim()) ||
  extra.apiBaseUrl?.trim() ||
  // Local/dev convenience only — EAS Preview/Production must set the secret explicitly.
  (__DEV__ ? "https://shalean.co.za" : "");

/** Supabase project URL — required for JWT refresh after login. */
export const SUPABASE_URL =
  (typeof process !== "undefined" && process.env.EXPO_PUBLIC_SUPABASE_URL?.trim()) || "";

/** Supabase anon key — required for JWT refresh after login. */
export const SUPABASE_ANON_KEY =
  (typeof process !== "undefined" && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim()) || "";

export const APP_SCHEME = "shalean";

export const APP_ENV =
  (typeof process !== "undefined" && process.env.EXPO_PUBLIC_APP_ENV?.trim()) ||
  extra.appEnv?.trim() ||
  resolveAppEnv(API_BASE_URL || "https://localhost");

export { APP_BUILD_NUMBER, APP_VERSION };

export function assertMobileConfig(): { ok: true } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  if (!API_BASE_URL) missing.push("EXPO_PUBLIC_API_BASE_URL");
  if (!SUPABASE_URL) missing.push("EXPO_PUBLIC_SUPABASE_URL");
  if (!SUPABASE_ANON_KEY) missing.push("EXPO_PUBLIC_SUPABASE_ANON_KEY");
  return missing.length ? { ok: false, missing } : { ok: true };
}
