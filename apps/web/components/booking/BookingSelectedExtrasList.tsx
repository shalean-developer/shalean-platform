"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type SelectedExtraRow = {
  id: string;
  label: string;
  priceZar?: number;
};

type BookingSelectedExtrasListProps = {
  items: SelectedExtraRow[];
  onRemove?: (id: string) => void;
};

const COLLAPSE_AT = 6;

function formatAddonZar(n: number): string {
  return `+R${Math.round(n).toLocaleString("en-ZA")}`;
}

export function BookingSelectedExtrasList({ items, onRemove }: BookingSelectedExtrasListProps) {
  const [expanded, setExpanded] = useState(false);
  const count = items.length;

  const visibleItems = useMemo(() => {
    if (count <= COLLAPSE_AT || expanded) return items;
    return items.slice(0, COLLAPSE_AT);
  }, [count, expanded, items]);

  return (
    <div className="mt-2 space-y-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
        Extras ({count} selected)
      </h3>

      {count === 0 ? (
        <p className="text-sm text-gray-500 dark:text-zinc-400">No extras selected</p>
      ) : (
        <>
          <motion.ul
            layout
            className="grid grid-cols-2 gap-x-3 gap-y-2"
            transition={{ layout: { duration: 0.28, ease: [0.4, 0, 0.2, 1] } }}
          >
            {visibleItems.map((row) => (
              <motion.li key={row.id} layout className="min-w-0">
                <div
                  className={cn(
                    "flex min-h-0 items-center justify-between gap-2 rounded-md px-2 py-2 transition-colors",
                    onRemove && "hover:bg-gray-50 dark:hover:bg-zinc-800/70",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {row.label}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    {row.priceZar != null && Number.isFinite(row.priceZar) ? (
                      <span className="text-xs tabular-nums text-gray-500 dark:text-zinc-400">
                        {formatAddonZar(row.priceZar)}
                      </span>
                    ) : null}
                    {onRemove ? (
                      <button
                        type="button"
                        aria-label={`Remove ${row.label}`}
                        onClick={() => onRemove(row.id)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-base leading-none text-gray-500 transition hover:bg-gray-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                </div>
              </motion.li>
            ))}
          </motion.ul>

          {count > COLLAPSE_AT ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-xs font-medium text-gray-500 underline-offset-2 transition hover:text-zinc-800 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              {expanded ? "Show less" : `Show all (${count})`}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
