"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { PromptOptions } from "./types";

type PromptState = PromptOptions & {
  resolve: (value: string | null) => void;
};

let pushPrompt: ((state: PromptState) => void) | null = null;

export function prompt(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    if (!pushPrompt) {
      console.warn("[prompt] NotificationProvider not mounted — falling back to native prompt.");
      resolve(globalThis.prompt(options.title, options.defaultValue ?? "") ?? null);
      return;
    }
    pushPrompt({ ...options, resolve });
  });
}

export function PromptDialogHost() {
  const [state, setState] = useState<PromptState | null>(null);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    pushPrompt = setState;
    return () => {
      pushPrompt = null;
    };
  }, []);

  useEffect(() => {
    if (!state) return;
    setValue(state.defaultValue ?? "");
    const id = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, [state]);

  const confirmLabel = state?.confirmLabel ?? "OK";
  const cancelLabel = state?.cancelLabel ?? "Cancel";

  function close(result: string | null) {
    if (!state) return;
    state.resolve(result);
    setState(null);
  }

  return (
    <Dialog open={state != null} onOpenChange={(open) => !open && close(null)}>
      <DialogContent hideClose className="max-w-md gap-0 overflow-hidden p-0">
        <div className="space-y-4 px-6 pb-2 pt-6">
          <DialogHeader className="space-y-2 text-left">
            <DialogTitle className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {state?.title}
            </DialogTitle>
            {state?.description ? (
              <DialogDescription className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                {state.description}
              </DialogDescription>
            ) : null}
          </DialogHeader>

          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={state?.placeholder}
            className="rounded-xl"
            onKeyDown={(e) => {
              if (e.key === "Enter") close(value);
            }}
          />
        </div>

        <DialogFooter className="gap-2 border-t border-zinc-100 px-6 py-4 sm:justify-end dark:border-zinc-800">
          <button
            type="button"
            onClick={() => close(null)}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => close(value)}
            className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
