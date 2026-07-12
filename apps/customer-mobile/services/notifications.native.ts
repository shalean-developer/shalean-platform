import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { getCustomerDevicesApi } from "@/services/customerApi";
import type { PushRegistrationResult } from "@/services/notificationsTypes";

export type { PushRegistrationResult } from "@/services/notificationsTypes";

const PUSH_TOKEN_KEY = "shalean.customer.push.expo_token.v1";

type NotificationsModule = typeof import("expo-notifications");

let notificationsMod: NotificationsModule | null | undefined;
let handlerConfigured = false;

/** Lazy-load so Expo Go can boot even when remote push APIs are unavailable (SDK 53+). */
export async function getNotifications(): Promise<NotificationsModule | null> {
  if (notificationsMod !== undefined) return notificationsMod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native-only
    notificationsMod = require("expo-notifications") as NotificationsModule;
    return notificationsMod;
  } catch (e) {
    if (__DEV__) {
      console.warn(
        "[customer-mobile] expo-notifications unavailable",
        e instanceof Error ? e.message : e,
      );
    }
    notificationsMod = null;
    return null;
  }
}

async function ensureNotificationHandler(): Promise<NotificationsModule | null> {
  const Notifications = await getNotifications();
  if (!Notifications || handlerConfigured) return Notifications;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    handlerConfigured = true;
  } catch (e) {
    if (__DEV__) {
      console.warn(
        "[customer-mobile] setNotificationHandler failed (Expo Go limitation)",
        e instanceof Error ? e.message : e,
      );
    }
  }
  return Notifications;
}

export async function getStoredPushToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Request OS permission, obtain Expo push token, persist locally, and register with backend.
 * Soft-fails on simulator / denied / Expo Go — never throws to callers.
 */
export async function registerForPushNotifications(): Promise<PushRegistrationResult> {
  const Notifications = await ensureNotificationHandler();
  if (!Notifications) {
    return {
      ok: false,
      reason: "unavailable",
      message: "Push notifications require a development build (not Expo Go).",
    };
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
      const result = await getCustomerDevicesApi().register({
        token,
        platform: Platform.OS,
      });
      serverRegistered = result.ok;
      if (!result.ok && __DEV__) {
        console.warn("[customer-mobile] Push token server register failed", result.error);
      }
    } catch (e) {
      if (__DEV__) {
        console.warn(
          "[customer-mobile] Push token server register error",
          e instanceof Error ? e.message : e,
        );
      }
    }

    return { ok: true, token, serverRegistered };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Push registration failed.";
    return { ok: false, reason: "error", message };
  }
}

/** Best-effort unregister on sign-out. */
export async function unregisterPushTokenFromServer(token?: string | null): Promise<void> {
  const t = (token ?? (await getStoredPushToken()) ?? "").trim();
  if (!t) return;
  try {
    await getCustomerDevicesApi().unregister({ token: t });
  } catch {
    // ignore
  }
}
