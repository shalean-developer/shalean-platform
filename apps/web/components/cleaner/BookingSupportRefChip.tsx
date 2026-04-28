"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bookingSupportRefLabel } from "@/lib/booking/bookingSupportRef";

type Props = {
  bookingId: string;
  className?: string;
};

/**
 * Tap-to-copy support ref plus full booking UUID (plain text for ops / WhatsApp).
 */
export function BookingSupportRefChip({ bookingId, className = "" }: Props) {
  const label = bookingSupportRefLabel(bookingId);
  /** Per-booking copied state survives list re-order (keyed by id). */
  const [copiedById, setCopiedById] = useState<Record<string, true>>({});
  /** Browser `window.setTimeout` handle (`number`); avoids Node `Timeout` vs DOM mismatch in tsc. */
  const timersRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    return () => {
      for (const t of timersRef.current.values()) window.clearTimeout(t);
      timersRef.current.clear();
    };
  }, []);

  const onTap = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${label}\n${bookingId}`);
      setCopiedById((m) => ({ ...m, [bookingId]: true }));
      const prev = timersRef.current.get(bookingId);
      if (prev) window.clearTimeout(prev);
      const t = window.setTimeout(() => {
        setCopiedById((m) => {
          const next = { ...m };
          delete next[bookingId];
          return next;
        });
        timersRef.current.delete(bookingId);
      }, 2000);
      timersRef.current.set(bookingId, t);
    } catch {
      /* ignore */
    }
  }, [bookingId, label]);

  const copied = Boolean(copiedById[bookingId]);

  return (
    <button
      type="button"
      onClick={() => void onTap()}
      title="Tap to copy reference and booking id"
      className={`relative inline-block min-w-[5.5rem] text-left ${className}`.trim()}
    >
      <span
        className={
          `inline rounded px-1 py-0.5 font-mono text-[0.95em] font-semibold underline decoration-dotted underline-offset-2 ` +
          `text-amber-950 hover:bg-amber-200/50 dark:text-amber-100 dark:hover:bg-amber-900/40 ` +
          `transition-opacity duration-500 ease-out`
        }
      >
        <span className={`relative block min-h-[1.25em] ${copied ? "opacity-100" : "opacity-100"}`}>
          <span
            className={`absolute inset-0 flex items-center whitespace-nowrap transition-opacity duration-500 ease-out ${
              copied ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
            aria-hidden={!copied}
          >
            ✓ Copied
          </span>
          <span
            className={`block transition-opacity duration-500 ease-out ${
              copied ? "pointer-events-none opacity-0" : "opacity-100"
            }`}
            aria-hidden={copied}
          >
            {label}
          </span>
        </span>
      </span>
    </button>
  );
}
