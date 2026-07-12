import { useRouter } from "expo-router";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { resolveCustomerNotificationDeepLink } from "@/lib/notifications/resolveCustomerNotificationDeepLink";
import { useAuth } from "@/providers/AuthProvider";
import {
  getNotifications,
  getStoredPushToken,
  registerForPushNotifications,
  unregisterPushTokenFromServer,
  type PushRegistrationResult,
} from "@/services/notifications.native";

type NotificationContextValue = {
  pushToken: string | null;
  registration: PushRegistrationResult | null;
  refreshPushRegistration: () => Promise<void>;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

/** Native push registration + deep-link handling (not loaded on web). */
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
      if (status === "signedOut") {
        void unregisterPushTokenFromServer();
      }
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
    let received: { remove: () => void } | undefined;
    let response: { remove: () => void } | undefined;
    let cancelled = false;

    const navigateFromData = (data: Record<string, unknown> | undefined) => {
      const path = resolveCustomerNotificationDeepLink(data);
      if (!path) return;
      try {
        router.push(path as never);
      } catch {
        // ignore navigation races at boot
      }
    };

    void (async () => {
      const Notifications = await getNotifications();
      if (!Notifications || cancelled) return;

      try {
        received = Notifications.addNotificationReceivedListener(() => {
          // Foreground receive — inbox refetch is handled when user opens Notifications screen.
        });
        response = Notifications.addNotificationResponseReceivedListener((res) => {
          const data = res.notification.request.content.data as
            | Record<string, unknown>
            | undefined;
          navigateFromData(data);
        });
        const last = await Notifications.getLastNotificationResponseAsync();
        if (last && !cancelled) {
          const data = last.notification.request.content.data as
            | Record<string, unknown>
            | undefined;
          navigateFromData(data);
        }
      } catch (e) {
        if (__DEV__) {
          console.warn(
            "[customer-mobile] Notification listeners unavailable",
            e instanceof Error ? e.message : e,
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      received?.remove();
      response?.remove();
    };
  }, [router]);

  const value = useMemo(
    () => ({
      pushToken,
      registration,
      refreshPushRegistration,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh closes over status
    [pushToken, registration],
  );

  return (
    <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}
