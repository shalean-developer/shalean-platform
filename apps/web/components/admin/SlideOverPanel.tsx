"use client";

import type { ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
};

export default function SlideOverPanel({ open, title, subtitle, onClose, children }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <button type="button" className="absolute inset-0 bg-black/35" onClick={onClose} aria-label="Close panel" />
      <aside className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto border-l border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
              {subtitle ? <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p> : null}
            </div>
            <button type="button" onClick={onClose} className="rounded-lg border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700">
              Close
            </button>
          </div>
        </div>
        <div className="space-y-4 p-5">{children}</div>
      </aside>
    </div>
  );
}
