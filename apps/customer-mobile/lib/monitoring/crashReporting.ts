import { sanitizeExtras } from "@/lib/monitoring/sanitizeExtras";

export { sanitizeExtras };

/**
 * Default / web implementation — no @sentry/* imports.
 * Native overrides via `crashReporting.native.ts` (Metro platform resolution).
 */
export function initCrashReporting(): { enabled: boolean } {
  if (__DEV__) {
    console.info("[customer-mobile] Crash reporting skipped on web");
  }
  return { enabled: false };
}

export function captureAppException(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (__DEV__) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("[customer-mobile] captured exception", err.message, context);
  }
}
