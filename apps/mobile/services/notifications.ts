import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { diagnosticLog } from "@/lib/diagnostics/logger";

const PUSH_TOKEN_KEY = "shalean.push.expo_token.v1";

export type PushRegistrationResult =
  | { ok: true; token: string }
  | { ok: false; reason: "web" | "simulator" | "denied" | "unavailable" | "error"; message?: string };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function getStoredPushToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Request permission and return an Expo push token. Local persistence only — no server registration yet. */
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
    diagnosticLog.info("Expo push token registered", { tokenPrefix: token.slice(0, 24) });
    return { ok: true, token };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Push registration failed.";
    diagnosticLog.error("Push registration error", { message });
    return { ok: false, reason: "error", message };
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
  if (type === "jobs" || type === "today") return "/(cleaner)";

  return null;
}
