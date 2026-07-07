"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ConfirmOptions } from "./types";

type ConfirmState = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

let pushConfirm: ((state: ConfirmState) => void) | null = null;

export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!pushConfirm) {
      console.warn("[confirm] NotificationProvider not mounted — falling back to native confirm.");
      resolve(globalThis.confirm(options.title + (options.description ? `\n\n${options.description}` : "")));
      return;
    }
    pushConfirm({ ...options, resolve });
  });
}

export function ConfirmDialogHost() {
  const [state, setState] = useState<ConfirmState | null>(null);

  useEffect(() => {
    pushConfirm = setState;
    return () => {
      pushConfirm = null;
    };
  }, []);

  const isDestructive = state?.variant === "destructive";
  const confirmLabel = state?.confirmLabel ?? (isDestructive ? "Confirm" : "OK");
  const cancelLabel = state?.cancelLabel ?? "Cancel";

  function close(result: boolean) {
    if (!state) return;
    state.resolve(result);
    setState(null);
  }

  return (
    <Dialog open={state != null} onOpenChange={(open) => !open && close(false)}>
      <DialogContent hideClose className="max-w-md gap-0 overflow-hidden p-0">
        <div className="px-6 pb-2 pt-6">
          <DialogHeader className="space-y-3 text-left">
            {isDestructive ? (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                <AlertTriangle className="h-5 w-5" aria-hidden />
              </div>
            ) : null}
            <div>
              <DialogTitle className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                {state?.title}
              </DialogTitle>
              {state?.description ? (
                <DialogDescription className="mt-2 whitespace-pre-line text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {state.description}
                </DialogDescription>
              ) : null}
            </div>
          </DialogHeader>
        </div>

        <DialogFooter className="gap-2 border-t border-zinc-100 px-6 py-4 sm:justify-end dark:border-zinc-800">
          <button
            type="button"
            onClick={() => close(false)}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => close(true)}
            className={cn(
              "rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition",
              isDestructive
                ? "bg-rose-600 hover:bg-rose-700 dark:bg-rose-600 dark:hover:bg-rose-500"
                : "bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200",
            )}
          >
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
