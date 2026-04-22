"use client";

import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle: string;
  actions?: ReactNode;
};

export default function AdminHeader({ title, subtitle, actions }: Props) {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{title}</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
