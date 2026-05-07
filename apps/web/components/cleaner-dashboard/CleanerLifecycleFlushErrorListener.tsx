"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  CLEANER_LIFECYCLE_FLUSH_ERROR_EVENT,
  type CleanerLifecycleFlushErrorDetail,
} from "@/lib/cleaner/cleanerLifecycleFlushErrorBus";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Surfaces flush failures from {@link useCleanerLifecycleOrchestrator} (e.g. 412 accept races)
 * so cleaners are not left with a silent no-op after offline sync.
 */
export function CleanerLifecycleFlushErrorListener() {
  const [banner, setBanner] = useState<CleanerLifecycleFlushErrorDetail | null>(null);

  const onEvent = useCallback((e: Event) => {
    const ce = e as CustomEvent<CleanerLifecycleFlushErrorDetail>;
    const d = ce.detail;
    if (!d || typeof d.message !== "string") return;
    setBanner(d);
  }, []);

  useEffect(() => {
    window.addEventListener(CLEANER_LIFECYCLE_FLUSH_ERROR_EVENT, onEvent);
    return () => window.removeEventListener(CLEANER_LIFECYCLE_FLUSH_ERROR_EVENT, onEvent);
  }, [onEvent]);

  useEffect(() => {
    if (!banner) return;
    const t = window.setTimeout(() => setBanner(null), 12_000);
    return () => window.clearTimeout(t);
  }, [banner]);

  if (!banner) return null;

  const destructive = banner.kind === "booking_changed";
  return (
    <div
      className={cn(
        "pointer-events-auto fixed left-3 right-3 z-[80] max-w-lg rounded-xl border p-3 shadow-lg sm:left-1/2 sm:right-auto sm:-translate-x-1/2",
        destructive
          ? "bottom-[calc(4.75rem+env(safe-area-inset-bottom))] border-destructive/40 bg-destructive/10 text-destructive-foreground"
          : "bottom-[calc(4.75rem+env(safe-area-inset-bottom))] border-amber-600/35 bg-amber-500/10 text-amber-950 dark:text-amber-50",
      )}
      role="status"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 text-sm leading-snug">
          <p className="font-semibold">
            {destructive ? "Booking updated elsewhere" : "Could not sync an action"}
          </p>
          <p className="mt-0.5 opacity-90">{banner.message}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="size-8 shrink-0 p-0"
          aria-label="Dismiss"
          onClick={() => setBanner(null)}
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
