import type { PushRegistrationResult } from "@/services/notificationsTypes";

export type { PushRegistrationResult } from "@/services/notificationsTypes";

/** Web stubs — no expo-notifications in the web Metro graph. */

export async function getStoredPushToken(): Promise<string | null> {
  return null;
}

export async function registerForPushNotifications(): Promise<PushRegistrationResult> {
  return {
    ok: false,
    reason: "web",
    message: "Push notifications are not available on web.",
  };
}

export async function unregisterPushTokenFromServer(_token?: string | null): Promise<void> {
  // no-op
}

export async function getNotifications(): Promise<null> {
  return null;
}
