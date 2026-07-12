import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { PushRegistrationResult } from "@/services/notificationsTypes";

type NotificationContextValue = {
  pushToken: string | null;
  registration: PushRegistrationResult | null;
  refreshPushRegistration: () => Promise<void>;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

/**
 * Web stub — does not import expo-notifications (avoids SSR side effects and graph bloat).
 * Native implementation: NotificationProvider.native.tsx
 */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const value = useMemo<NotificationContextValue>(
    () => ({
      pushToken: null,
      registration: {
        ok: false,
        reason: "web",
        message: "Push notifications are not available on web.",
      },
      refreshPushRegistration: async () => undefined,
    }),
    [],
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
