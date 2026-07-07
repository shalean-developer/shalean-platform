"use client";

import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { ToastDetail, ToastKind } from "./types";

const EVENT = "app-toast";
const DISMISS_MS = 4200;

/** Trailing debounce per kind so bursts coalesce (last message wins). */
const DEBOUNCE_MS = 280;
const pending = new Map<ToastKind, { message: string; timer: number }>();

export function showToast(message: string, kind: ToastKind = "info"): void {
  if (typeof window === "undefined") return;
  const cur = pending.get(kind);
  if (cur) window.clearTimeout(cur.timer);
  const timer = window.setTimeout(() => {
    pending.delete(kind);
    window.dispatchEvent(new CustomEvent<ToastDetail>(EVENT, { detail: { message, kind } }));
  }, DEBOUNCE_MS) as unknown as number;
  pending.set(kind, { message, timer });
}

function subscribeToast(handler: (detail: ToastDetail) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const fn = (e: Event) => {
    const ce = e as CustomEvent<ToastDetail>;
    if (ce.detail) handler(ce.detail);
  };
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

function toneClass(kind: ToastKind): string {
  switch (kind) {
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/90 dark:text-emerald-50";
    case "error":
      return "border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900/50 dark:bg-rose-950/90 dark:text-rose-50";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/90 dark:text-amber-50";
    default:
      return "border-zinc-200 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
  }
}

function ToastIcon({ kind }: { kind: ToastKind }) {
  const cls = "h-4 w-4 shrink-0";
  switch (kind) {
    case "success":
      return <CheckCircle2 className={cn(cls, "text-emerald-600 dark:text-emerald-400")} aria-hidden />;
    case "error":
      return <XCircle className={cn(cls, "text-rose-600 dark:text-rose-400")} aria-hidden />;
    case "warning":
      return <AlertTriangle className={cn(cls, "text-amber-600 dark:text-amber-400")} aria-hidden />;
    default:
      return <Info className={cn(cls, "text-zinc-500 dark:text-zinc-400")} aria-hidden />;
  }
}

export function ToastHost() {
  const [toast, setToast] = useState<ToastDetail | null>(null);

  useEffect(() => subscribeToast(setToast), []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [toast]);

  if (!toast) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-6 left-1/2 z-[200] flex w-[min(100%,420px)] -translate-x-1/2 justify-center px-4"
      role="status"
      aria-live="polite"
    >
      <div
        className={cn(
          "pointer-events-auto flex w-full items-start gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg",
          toneClass(toast.kind),
        )}
      >
        <ToastIcon kind={toast.kind} />
        <span className="min-w-0 flex-1 leading-snug">{toast.message}</span>
      </div>
    </div>
  );
}

/** React hook for components that prefer hook-based toast access. */
export function useToast(): (message: string, kind?: ToastKind) => void {
  return useCallback((message: string, kind: ToastKind = "info") => {
    showToast(message, kind);
  }, []);
}
