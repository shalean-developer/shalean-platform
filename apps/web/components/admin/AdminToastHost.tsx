"use client";

import { useEffect, useState } from "react";
import { subscribeAdminToast, type AdminToastDetail, type AdminToastKind } from "@/lib/admin/toastBus";

export function AdminToastHost() {
  const [toast, setToast] = useState<AdminToastDetail | null>(null);

  useEffect(() => {
    return subscribeAdminToast((d) => {
      setToast(d);
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(id);
  }, [toast]);

  if (!toast) return null;

  const tone = toneClass(toast.kind);
  return (
    <div
      className="pointer-events-none fixed bottom-6 left-1/2 z-[200] flex w-[min(100%,420px)] -translate-x-1/2 justify-center px-4"
      role="status"
    >
      <div
        className={[
          "pointer-events-auto w-full rounded-xl border px-4 py-3 text-sm font-medium shadow-lg",
          tone,
        ].join(" ")}
      >
        {toast.message}
      </div>
    </div>
  );
}

function toneClass(kind: AdminToastKind): string {
  if (kind === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/90 dark:text-emerald-50";
  }
  if (kind === "error") {
    return "border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900/50 dark:bg-rose-950/90 dark:text-rose-50";
  }
  return "border-zinc-200 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
}
