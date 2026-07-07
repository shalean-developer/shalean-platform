"use client";

import type { ReactNode } from "react";
import { NotificationProvider } from "@/components/ui/notifications";

export function AppNotificationProviders({ children }: { children: ReactNode }) {
  return <NotificationProvider>{children}</NotificationProvider>;
}
