"use client";

import { MoreHorizontal } from "lucide-react";
import {
  autoUpdate,
  flip,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import { useState } from "react";

export type ActionMenuItem = {
  label: string;
  onSelect: () => void;
  tone?: "default" | "danger";
};

export default function ActionMenu({ items, ariaLabel = "Actions" }: { items: ActionMenuItem[]; ariaLabel?: string }) {
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom-end",
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "menu" });
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role]);

  return (
    <div className="relative inline-flex">
      <button
        ref={refs.setReference}
        type="button"
        aria-label={ariaLabel}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        {...getReferenceProps()}
      >
        <MoreHorizontal size={16} />
      </button>
      {open ? (
        <div
          ref={refs.setFloating}
          style={floatingStyles}
          className="z-50 w-48 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
          {...getFloatingProps()}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                item.onSelect();
                setOpen(false);
              }}
              className={[
                "block w-full rounded-lg px-3 py-2 text-left text-sm transition",
                item.tone === "danger"
                  ? "text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
                  : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800",
              ].join(" ")}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
