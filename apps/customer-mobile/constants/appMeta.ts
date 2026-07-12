/**
 * App identity metadata — keep free of imports from `@/constants/config`
 * to avoid circular init during Metro SSR/static export.
 */
export const APP_VERSION = "0.1.0";

export const APP_BUILD_NUMBER =
  (typeof process !== "undefined" && process.env.EXPO_PUBLIC_BUILD_NUMBER?.trim()) || "0";

export function resolveAppEnv(apiBaseUrl: string): string {
  const fromEnv = typeof process !== "undefined" && process.env.EXPO_PUBLIC_APP_ENV?.trim();
  if (fromEnv) return fromEnv;
  const base = String(apiBaseUrl ?? "");
  if (base.includes("localhost") || base.includes("127.0.0.1")) return "development";
  return "production";
}
