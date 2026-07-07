"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { showToast } from "@/components/ui/notifications";
import type { ToastKind } from "@/components/ui/notifications";

const DashboardToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});

export function useDashboardToast(): (message: string, kind?: ToastKind) => void {
  return useContext(DashboardToastContext);
}

export function DashboardToastProvider({ children }: { children: ReactNode }) {
  const show = useCallback((message: string, kind: ToastKind = "success") => {
    showToast(message, kind);
  }, []);

  const value = useMemo(() => show, [show]);

  return <DashboardToastContext.Provider value={value}>{children}</DashboardToastContext.Provider>;
}
