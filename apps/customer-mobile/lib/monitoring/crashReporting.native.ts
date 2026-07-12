import { APP_BUILD_NUMBER, APP_VERSION } from "@/constants/appMeta";
import { APP_ENV } from "@/constants/config";
import { sanitizeExtras } from "@/lib/monitoring/sanitizeExtras";

export { sanitizeExtras };

type SentryModule = typeof import("@sentry/react-native");

let initialized = false;
let Sentry: SentryModule | null = null;

function sentryDsn(): string {
  return (
    (typeof process !== "undefined" && process.env.EXPO_PUBLIC_SENTRY_DSN?.trim()) ||
    ""
  );
}

function loadSentry(): SentryModule | null {
  if (Sentry) return Sentry;
  try {
    // Native-only file — Metro never resolves this module on web.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native load
    Sentry = require("@sentry/react-native") as SentryModule;
    return Sentry;
  } catch {
    return null;
  }
}

/**
 * Soft-init crash reporting on native. No-op when DSN is unset or Sentry fails to load.
 * Enable in preview/production via EAS Secret `EXPO_PUBLIC_SENTRY_DSN`.
 */
export function initCrashReporting(): { enabled: boolean } {
  if (initialized) return { enabled: Boolean(Sentry && sentryDsn()) };
  initialized = true;

  const dsn = sentryDsn();
  if (!dsn) {
    if (__DEV__) {
      console.info("[customer-mobile] Crash reporting disabled (no EXPO_PUBLIC_SENTRY_DSN)");
    }
    return { enabled: false };
  }

  const mod = loadSentry();
  if (!mod) {
    if (__DEV__) {
      console.info("[customer-mobile] Crash reporting skipped (Sentry unavailable)");
    }
    return { enabled: false };
  }

  const enableInDev =
    typeof process !== "undefined" &&
    process.env.EXPO_PUBLIC_SENTRY_DEV?.trim() === "1";

  mod.init({
    dsn,
    enabled: !__DEV__ || enableInDev,
    environment: APP_ENV,
    release: `shalean-customer@${APP_VERSION}+${APP_BUILD_NUMBER}`,
    tracesSampleRate: APP_ENV === "production" ? 0.15 : 0.4,
    sendDefaultPii: false,
  });

  return { enabled: true };
}

export function captureAppException(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  const err = error instanceof Error ? error : new Error(String(error));
  if (__DEV__) {
    console.error("[customer-mobile] captured exception", err.message, context);
  }
  const mod = Sentry ?? loadSentry();
  if (!mod || !sentryDsn()) return;
  mod.withScope((scope) => {
    if (context) {
      scope.setExtras(sanitizeExtras(context));
    }
    mod.captureException(err);
  });
}
