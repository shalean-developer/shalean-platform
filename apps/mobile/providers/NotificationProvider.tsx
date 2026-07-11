import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import { diagnosticLog } from "@/lib/diagnostics/logger";
import { useAuth } from "@/providers/AuthProvider";
import {
  getStoredPushToken,
  registerForPushNotifications,
  resolveNotificationDeepLink,
  type PushRegistrationResult,
} from "@/services/notifications";

type NotificationContextValue = {
  pushToken: string | null;
  registration: PushRegistrationResult | null;
  refreshPushRegistration: () => Promise<void>;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [registration, setRegistration] = useState<PushRegistrationResult | null>(null);

  const refreshPushRegistration = async () => {
    if (status !== "signedIn") return;
    const result = await registerForPushNotifications();
    setRegistration(result);
    setPushToken(result.ok ? result.token : null);
  };

  useEffect(() => {
    if (status !== "signedIn") {
      setPushToken(null);
      setRegistration(null);
      return;
    }
    void getStoredPushToken().then((stored) => {
      if (stored) setPushToken(stored);
    });
    void refreshPushRegistration();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- register once per signed-in session
  }, [status]);

  useEffect(() => {
    // expo-notifications listeners / cold-start APIs are native-only.
    if (Platform.OS === "web") return;

    const received = Notifications.addNotificationReceivedListener((notification) => {
      diagnosticLog.info("Notification received (foreground)", {
        id: notification.request.identifier,
      });
    });

    const response = Notifications.addNotificationResponseReceivedListener((res) => {
      const data = res.notification.request.content.data as Record<string, unknown> | undefined;
      const path = resolveNotificationDeepLink(data);
      diagnosticLog.info("Notification response", { path });
      if (path) {
        try {
          router.push(path as never);
        } catch (e) {
          diagnosticLog.warn("Deep link navigation failed", {
            path,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    });

    void Notifications.getLastNotificationResponseAsync().then((last) => {
      if (!last) return;
      const data = last.notification.request.content.data as Record<string, unknown> | undefined;
      const path = resolveNotificationDeepLink(data);
      if (path) {
        diagnosticLog.info("Cold-start notification deep link", { path });
        try {
          router.push(path as never);
        } catch {
          // ignore navigation races at boot
        }
      }
    });

    return () => {
      received.remove();
      response.remove();
    };
  }, [router]);

  const value = useMemo(
    () => ({
      pushToken,
      registration,
      refreshPushRegistration,
    }),
    [pushToken, registration],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}
