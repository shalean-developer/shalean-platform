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

/** Prefer env; empty in CI until secrets are set (preview/prod builds must set secrets). */
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || "";

export default ({ config }: ConfigContext): ExpoConfig => {
  return {
    ...config,
    name: "Shalean Cleaner",
    slug: EAS_SLUG,
    owner: EAS_OWNER,
    version: VERSION,
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "shalean",
    // Product screens are light-only; force light to avoid mismatched nav chrome.
    userInterfaceStyle: "light",
    newArchEnabled: true,
    runtimeVersion: {
      policy: "appVersion",
    },
    updates: {
      url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
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
      package: "za.co.shalean.mobile",
      versionCode: 1,
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
              scheme: "shalean",
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
      apiBaseUrl: API_BASE_URL || undefined,
      eas: {
        projectId: EAS_PROJECT_ID,
      },
      router: {},
    },
  };
};
