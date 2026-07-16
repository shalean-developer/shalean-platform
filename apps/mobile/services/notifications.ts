import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { diagnosticLog } from "@/lib/diagnostics/logger";
import { CleanerApi } from "@/services/cleanerApi";

const PUSH_TOKEN_KEY = "shalean.push.expo_token.v1";

export type PushRegistrationResult =
  | { ok: true; token: string; serverRegistered?: boolean }
  | { ok: false; reason: "web" | "simulator" | "denied" | "unavailable" | "error"; message?: string };

/** Push APIs are native-only — skip handler setup on web to avoid boot crashes. */
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function getStoredPushToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Request permission, persist token locally, and register with `/api/cleaner/devices`. */
export async function registerForPushNotifications(): Promise<PushRegistrationResult> {
  if (Platform.OS === "web") {
    return { ok: false, reason: "web", message: "Push notifications are not available on web." };
  }

  if (!Device.isDevice) {
    return { ok: false, reason: "simulator", message: "Push requires a physical device." };
  }

  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== "granted") {
      diagnosticLog.warn("Push permission denied");
      return { ok: false, reason: "denied", message: "Notification permission was not granted." };
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      undefined;

    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const token = tokenResponse.data;
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);

    let serverRegistered = false;
    try {
      const result = await CleanerApi.registerPushDevice({
        token,
        platform: Platform.OS,
      });
      serverRegistered = result.ok === true;
      if (!result.ok) {
        diagnosticLog.warn("Push token server register failed", {
          error: "error" in result ? String(result.error) : "unknown",
        });
      }
    } catch (e) {
      diagnosticLog.warn("Push token server register error", {
        message: e instanceof Error ? e.message : String(e),
      });
    }

    diagnosticLog.info("Expo push token registered", {
      tokenPrefix: token.slice(0, 24),
      serverRegistered,
    });
    return { ok: true, token, serverRegistered };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Push registration failed.";
    diagnosticLog.error("Push registration error", { message });
    return { ok: false, reason: "error", message };
  }
}

/** Best-effort unregister on sign-out. */
export async function unregisterPushTokenFromServer(token?: string | null): Promise<void> {
  const t = (token ?? (await getStoredPushToken()) ?? "").trim();
  if (!t) return;
  try {
    await CleanerApi.unregisterPushDevice({ token: t });
  } catch {
    // ignore
  }
}

/** Map a notification response to an in-app path (foundation only). */
export function resolveNotificationDeepLink(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  const path = typeof data.path === "string" ? data.path.trim() : "";
  if (path.startsWith("/")) return path;

  const bookingId = typeof data.bookingId === "string" ? data.bookingId.trim() : "";
  if (bookingId) return `/(cleaner)/job/${bookingId}`;

  const type = typeof data.type === "string" ? data.type.trim() : "";
  if (type === "jobs" || type === "today") return "/(cleaner)/(tabs)";

  return null;
}
