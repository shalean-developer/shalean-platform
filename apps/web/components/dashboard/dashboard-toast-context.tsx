"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error";

type ToastState = { message: string; kind: ToastKind } | null;

const DashboardToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});

export function useDashboardToast(): (message: string, kind?: ToastKind) => void {
  return useContext(DashboardToastContext);
}

export function DashboardToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null);

  const show = useCallback((message: string, kind: ToastKind = "success") => {
    setToast({ message, kind });
    window.setTimeout(() => setToast(null), 4200);
  }, []);

  const value = useMemo(() => show, [show]);

  return (
    <DashboardToastContext.Provider value={value}>
      {children}
      {toast ? (
        <div
          role="status"
          className={cn(
            "fixed bottom-20 left-1/2 z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border px-4 py-3 text-sm font-medium shadow-lg md:bottom-6",
            toast.kind === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-100"
              : "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/80 dark:text-red-100",
          )}
        >
          {toast.message}
        </div>
      ) : null}
    </DashboardToastContext.Provider>
  );
}
