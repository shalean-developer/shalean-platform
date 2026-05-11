"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NextJobEmptyHintProps = {
  receivingOffers?: boolean;
  browserOnline?: boolean;
  onNotificationsGranted?: () => void;
  embedded?: boolean;
  /** When the list below still has future/today jobs but nothing is “next” (edge). */
  nextScheduleLine?: string | null;
  /**
   * True only after the dashboard has confirmed the queue is empty
   * (`computeConfirmedIdle`). When false we render the softer
   * "Checking for nearby jobs..." copy so we never tell the cleaner
   * "Nothing next" while data is still loading or partially errored.
   */
  confirmedIdle?: boolean;
};

type NotifPermission = "granted" | "denied" | "default" | "unsupported";

function readPermission(): NotifPermission {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "unsupported";
  return Notification.permission as NotifPermission;
}

/**
 * Compact "looking for jobs" strip — operational cockpit variant.
 *
 * Shape:
 *   ┌────────────────────────────────────────────┐
 *   │ 🔍  Looking for nearby jobs                 │
 *   │     Next: Sun 14:00 — Sea Point             │   (only if scheduled)
 *   │                                  [Enable 🔔] │   (only if needed)
 *   └────────────────────────────────────────────┘
 *
 * Replaces the previous two-card stack (giant heading + nested notification
 * card) with a single dense row. The notification permission CTA is inline
 * and only renders when the browser actually supports a prompt and hasn't
 * been answered yet.
 */
export function NextJobEmptyHint({
  receivingOffers = false,
  browserOnline = true,
  onNotificationsGranted,
  embedded,
  nextScheduleLine,
  confirmedIdle = true,
}: NextJobEmptyHintProps) {
  const [permission, setPermission] = useState<NotifPermission>(() => readPermission());

  useEffect(() => {
    const sync = () => setPermission(readPermission());
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  const requestNotify = () => {
    if (typeof Notification === "undefined" || Notification.permission !== "default") return;
    void Notification.requestPermission().then((p) => {
      setPermission(readPermission());
      if (p === "granted") onNotificationsGranted?.();
    });
  };

  const headline = !browserOnline
    ? "You're offline"
    : !confirmedIdle
      ? "Checking for nearby jobs…"
      : receivingOffers
        ? "Looking for nearby jobs"
        : "Paused — no new jobs";

  const Icon = permission === "denied" ? BellOff : permission === "granted" ? Bell : Search;
  const showEnableCta = browserOnline && receivingOffers && permission === "default";

  return (
    <section
      aria-label="Next job"
      className={cn(
        "flex items-center gap-3 border border-border bg-muted/25 text-foreground transition-colors",
        embedded ? "rounded-xl px-3 py-3" : "rounded-xl px-4 py-3",
      )}
    >
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/60",
          confirmedIdle && receivingOffers && browserOnline && "motion-safe:animate-pulse",
        )}
      >
        <Icon className="size-4 text-muted-foreground" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight">{headline}</p>
        {nextScheduleLine ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">Next: {nextScheduleLine}</p>
        ) : null}
      </div>
      {showEnableCta ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-8 shrink-0 rounded-full px-3 text-xs font-semibold active:scale-[0.98]"
          onClick={requestNotify}
        >
          <Bell className="mr-1 size-3.5" aria-hidden />
          Enable alerts
        </Button>
      ) : null}
    </section>
  );
}
