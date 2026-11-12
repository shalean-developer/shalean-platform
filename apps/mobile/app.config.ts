import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Dynamic Expo config for EAS Build profiles.
 *
 * Linked Expo project:
 *   @shalean-cleaning-services/shalean-cleaning-services
 *   projectId f4898b65-cf04-4243-b14d-5871da658c8e
 *
 * Secrets and environment-specific values must come from EAS Secrets / .env —
 * never commit real keys. The EAS projectId is a public identifier (safe to commit).
 *
 * Required EAS Secrets (or env for local):
 * - EXPO_PUBLIC_API_BASE_URL
 * - EXPO_PUBLIC_SUPABASE_URL
 * - EXPO_PUBLIC_SUPABASE_ANON_KEY
 * - EXPO_PUBLIC_APP_ENV (development | preview | production)
 * - EXPO_PUBLIC_BUILD_NUMBER (optional; EAS autoIncrement also bumps android.versionCode)
 */

const EAS_PROJECT_ID = "f4898b65-cf04-4243-b14d-5871da658c8e";
const EAS_OWNER = "shalean-cleaning-services";
const EAS_SLUG = "shalean-cleaning-services";

const APP_ENV = (process.env.EXPO_PUBLIC_APP_ENV || "development").trim();
const VERSION = "0.1.0";
const IS_PREVIEW = APP_ENV === "preview";
const IS_LOCAL_PREVIEW = process.env.SHALEAN_LOCAL_PREVIEW === "1";
if (IS_LOCAL_PREVIEW && !IS_PREVIEW) {
  throw new Error("Local preview builds require EXPO_PUBLIC_APP_ENV=preview.");
}
const BUILD_NUMBER = Number(process.env.EXPO_PUBLIC_BUILD_NUMBER || "1");
if (!Number.isSafeInteger(BUILD_NUMBER) || BUILD_NUMBER < 1 || BUILD_NUMBER > 2100000000) {
  throw new Error("EXPO_PUBLIC_BUILD_NUMBER must be a positive Android version code.");
}
// Local test signing is independent of the installed EAS preview's certificate.
const ANDROID_PACKAGE = IS_LOCAL_PREVIEW ? "za.co.shalean.cleaner.staging"
  : IS_PREVIEW ? "za.co.shalean.cleaner.preview" : "za.co.shalean.mobile";
const APP_SCHEME = IS_LOCAL_PREVIEW ? "shalean-cleaner-staging" : "shalean";
const PREVIEW_PROJECT_ID = process.env.EXPO_PUBLIC_PREVIEW_EAS_PROJECT_ID?.trim() || "";
const PREVIEW_OWNER = process.env.EXPO_PUBLIC_PREVIEW_EAS_OWNER?.trim() || "";
// The original Expo account is not currently accessible. Preview must be
// deliberately linked to a separately owned EAS project, never silently
// repointed from the existing production project.
if (process.env.EAS_BUILD_PROFILE === "preview" && !IS_LOCAL_PREVIEW) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(PREVIEW_PROJECT_ID) || !PREVIEW_OWNER) {
    throw new Error("Preview build requires EXPO_PUBLIC_PREVIEW_EAS_PROJECT_ID and EXPO_PUBLIC_PREVIEW_EAS_OWNER.");
  }
}
const ACTIVE_PROJECT_ID = IS_PREVIEW && PREVIEW_PROJECT_ID ? PREVIEW_PROJECT_ID : EAS_PROJECT_ID;
const ACTIVE_OWNER = IS_PREVIEW && PREVIEW_OWNER ? PREVIEW_OWNER : EAS_OWNER;
// The new preview Expo project has its own slug. Do not change production identity.
const ACTIVE_SLUG = IS_PREVIEW && PREVIEW_PROJECT_ID ? "shaleancleaning" : EAS_SLUG;

/** Prefer env; empty in CI until secrets are set (preview/prod builds must set secrets). */
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || "";

// Prevent an internal test APK from silently connecting to live customer data.
// EAS exposes EAS_BUILD_PROFILE during remote builds.
if (IS_PREVIEW || process.env.EAS_BUILD_PROFILE === "preview") {
  if (!IS_PREVIEW) throw new Error("Preview profile requires EXPO_PUBLIC_APP_ENV=preview.");
  if (!API_BASE_URL) {
    throw new Error("Preview APK requires EXPO_PUBLIC_API_BASE_URL (staging API).");
  }
  let host: string;
  try {
    const url = new URL(API_BASE_URL);
    if (url.protocol !== "https:") throw new Error("HTTPS required");
    host = url.hostname.toLowerCase();
  } catch {
    throw new Error("Preview APK requires a valid HTTPS EXPO_PUBLIC_API_BASE_URL.");
  }
  if (host === "shalean.co.za" || host === "www.shalean.co.za") {
    throw new Error("Preview APK cannot use the live Shalean API; configure staging.");
  }
}

export default ({ config }: ConfigContext): ExpoConfig => {
  return {
    ...config,
    name: IS_LOCAL_PREVIEW ? "Shalean Cleaner Staging" : "Shalean Cleaner",
    slug: ACTIVE_SLUG,
    owner: ACTIVE_OWNER,
    version: VERSION,
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: APP_SCHEME,
    // Product screens are light-only; force light to avoid mismatched nav chrome.
    userInterfaceStyle: "light",
    newArchEnabled: true,
    runtimeVersion: {
      policy: "appVersion",
    },
    updates: {
      // Local test binaries must never load an update from the production project.
      enabled: !IS_LOCAL_PREVIEW,
      url: IS_LOCAL_PREVIEW ? undefined : `https://u.expo.dev/${ACTIVE_PROJECT_ID}`,
      fallbackToCacheTimeout: 0,
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "za.co.shalean.mobile",
      infoPlist: {
        UIBackgroundModes: ["remote-notification"],
        NSCameraUsageDescription:
          "Allow Shalean to use your camera to take before and after job photos.",
        NSPhotoLibraryUsageDescription:
          "Allow Shalean to access your photos so you can upload before and after job photos.",
      },
    },
    android: {
      package: ANDROID_PACKAGE,
      versionCode: BUILD_NUMBER,
      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
        backgroundColor: "#2563eb",
      },
      edgeToEdgeEnabled: true,
      permissions: [
        "CAMERA",
        "READ_MEDIA_IMAGES",
        "RECEIVE_BOOT_COMPLETED",
        "VIBRATE",
        "POST_NOTIFICATIONS",
      ],
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: false,
          data: [
            {
              scheme: APP_SCHEME,
            },
          ],
          category: ["BROWSABLE", "DEFAULT"],
        },
      ],
    },
    web: {
      bundler: "metro",
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "expo-router",
      "expo-secure-store",
      "expo-updates",
      [
        "expo-image-picker",
        {
          photosPermission:
            "Allow Shalean to access your photos so you can upload before and after job photos.",
          cameraPermission:
            "Allow Shalean to use your camera to take before and after job photos.",
        },
      ],
      [
        "expo-notifications",
        {
          icon: "./assets/images/notification-icon.png",
          color: "#2563eb",
          defaultChannel: "default",
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
      localPreview: IS_LOCAL_PREVIEW,
      apiBaseUrl: API_BASE_URL || undefined,
      eas: {
        projectId: IS_LOCAL_PREVIEW ? undefined : ACTIVE_PROJECT_ID,
      },
      router: {},
    },
  };
};
