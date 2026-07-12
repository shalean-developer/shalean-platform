import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Dynamic Expo config for the Shalean Customer app.
 *
 * EAS: create a NEW Expo project (do not reuse the Cleaner project id).
 * Until `eas init` is run, leave EAS_PROJECT_ID empty — OTA URL is omitted.
 *
 * Required EAS Secrets (or local .env):
 * - EXPO_PUBLIC_API_BASE_URL
 * - EXPO_PUBLIC_SUPABASE_URL
 * - EXPO_PUBLIC_SUPABASE_ANON_KEY
 * - EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY (public pk_ only — never the secret)
 * - EXPO_PUBLIC_APP_ENV (development | preview | production)
 * - EXPO_PUBLIC_SENTRY_DSN (optional until crash project is created)
 * - EXPO_PUBLIC_EAS_PROJECT_ID (after eas init — required for OTA)
 *
 * @see docs/customer-mobile-prd.md
 */

/** Set after `eas init` for apps/customer-mobile — must not equal Cleaner project. */
const EAS_PROJECT_ID =
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() || "07f0ce6e-ae59-40b8-b051-66d7def20097";
const EAS_OWNER = "shalean-cleaning-services";
const EAS_SLUG = "shalean-customer";

const APP_ENV = (process.env.EXPO_PUBLIC_APP_ENV || "development").trim();
const VERSION = "0.1.0";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || "";
const PAYSTACK_PUBLIC_KEY = process.env.EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY?.trim() || "";

/**
 * Static SSR (`expo-router/node/render.js`) retains Metro memory under repeated
 * `expo start` web requests. Use `single` for local/dev; keep `static` for
 * production web export (`expo export` / NODE_ENV=production) or an explicit override.
 */
function resolveWebOutput(): "single" | "static" {
  const override = process.env.EXPO_PUBLIC_WEB_OUTPUT?.trim();
  if (override === "static" || override === "single") return override;
  return process.env.NODE_ENV === "production" ? "static" : "single";
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const expoConfig: ExpoConfig = {
    ...config,
    name: "Shalean",
    slug: EAS_SLUG,
    owner: EAS_OWNER,
    version: VERSION,
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "shalean-customer",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    runtimeVersion: {
      policy: "appVersion",
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "za.co.shalean.customer",
      infoPlist: {
        UIBackgroundModes: ["remote-notification"],
      },
    },
    android: {
      package: "za.co.shalean.customer",
      versionCode: 1,
      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
        backgroundColor: "#2563eb",
      },
      edgeToEdgeEnabled: true,
      permissions: ["RECEIVE_BOOT_COMPLETED", "VIBRATE", "POST_NOTIFICATIONS"],
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: false,
          data: [{ scheme: "shalean-customer" }],
          category: ["BROWSABLE", "DEFAULT"],
        },
      ],
    },
    web: {
      bundler: "metro",
      output: resolveWebOutput(),
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "expo-router",
      "expo-secure-store",
      "expo-updates",
      "expo-web-browser",
      // Sentry native plugin omitted until org/project + auth token are configured —
      // otherwise release Gradle fails on createBundleReleaseJsAndAssets_SentryUpload.
      // JS crash reporting still soft-inits when EXPO_PUBLIC_SENTRY_DSN is set.
      [
        "expo-notifications",
        {
          // Soft-fail without credentials in simulators; EAS credentials required for device push.
          color: "#2563eb",
        },
      ],
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 220,
          resizeMode: "contain",
          backgroundColor: "#2563eb",
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      appEnv: APP_ENV,
      apiBaseUrl: API_BASE_URL || undefined,
      paystackPublicKey: PAYSTACK_PUBLIC_KEY || undefined,
      eas: EAS_PROJECT_ID ? { projectId: EAS_PROJECT_ID } : undefined,
      router: {},
    },
  };

  if (EAS_PROJECT_ID) {
    expoConfig.updates = {
      url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
      fallbackToCacheTimeout: 0,
    };
  }

  return expoConfig;
};
