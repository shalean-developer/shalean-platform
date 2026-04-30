"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function AvailabilityCard({
  isAvailable,
  busy,
  onSetOn,
  onSetOff,
}: {
  isAvailable: boolean;
  busy: boolean;
  onSetOn: () => void | Promise<void>;
  onSetOff: () => void | Promise<void>;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-950/40">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Availability</p>
      <div className="mt-2 flex items-center gap-2">
        <span
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            isAvailable ? "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.25)]" : "bg-zinc-400 dark:bg-zinc-500",
          )}
          aria-hidden
        />
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{isAvailable ? "On" : "Off"}</span>
      </div>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        {isAvailable ? "You're receiving job requests" : "You're not receiving jobs"}
      </p>
      <p className="mt-2 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
        This only controls whether you are on or off right now. Which weekdays you can be booked is set above and
        changed by admin.
      </p>
      <div className="mt-3 flex rounded-xl border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-600 dark:bg-zinc-900/60">
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => void onSetOn()}
          className={cn(
            "h-11 flex-1 rounded-lg text-sm font-semibold",
            isAvailable ? "bg-emerald-600 text-white shadow-sm hover:bg-emerald-600 hover:text-white dark:bg-emerald-600" : "",
          )}
        >
          On
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => void onSetOff()}
          className={cn(
            "h-11 flex-1 rounded-lg text-sm font-semibold",
            !isAvailable ? "bg-zinc-700 text-white shadow-sm hover:bg-zinc-700 hover:text-white dark:bg-zinc-600" : "",
          )}
        >
          Off
        </Button>
      </div>
    </section>
  );
}
