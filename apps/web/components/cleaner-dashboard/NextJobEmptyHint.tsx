"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CleanerDashboardInfoHint } from "./CleanerDashboardInfoHint";
import { cn } from "@/lib/utils";

type NextJobEmptyHintProps = {
  receivingOffers?: boolean;
  browserOnline?: boolean;
  onNotificationsGranted?: () => void;
  embedded?: boolean;
  /** When the list below still has future/today jobs but nothing is “next” (edge). */
  nextScheduleLine?: string | null;
};

function notificationHint(): { icon: "on" | "off" | "default"; title: string; body: string; showRequest?: boolean } {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return {
      icon: "default",
      title: "Job alerts",
      body: "Offers show on this screen when you're online.\n\nThis browser can't prompt for desktop alerts.",
    };
  }
  const p = Notification.permission;
  if (p === "granted") {
    return {
      icon: "on",
      title: "Browser notifications allowed",
      body: "Desktop alerts can fire when this tab is in the background.\n\nNew offers always appear on this dashboard too.",
    };
  }
  if (p === "denied") {
    return {
      icon: "off",
      title: "Browser notifications blocked",
      body: "Turn alerts on in your browser site settings if you want desktop pings.\n\nOffers still show here.",
    };
  }
  return {
    icon: "default",
    title: "Enable browser notifications",
    body: "Optional: allow alerts so a new offer can ping you when this tab is in the background.",
    showRequest: true,
  };
}

/** Shown when there is no “next” open job to pin — keeps the dashboard feeling responsive. */
export function NextJobEmptyHint({
  receivingOffers = false,
  browserOnline = true,
  onNotificationsGranted,
  embedded,
  nextScheduleLine,
}: NextJobEmptyHintProps) {
  const [hint, setHint] = useState(() => notificationHint());

  useEffect(() => {
    const sync = () => setHint(notificationHint());
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  const requestNotify = () => {
    if (typeof Notification === "undefined" || Notification.permission !== "default") return;
    void Notification.requestPermission().then((p) => {
      setHint(notificationHint());
      if (p === "granted") {
        onNotificationsGranted?.();
      }
    });
  };

  const Icon = hint.icon === "off" ? BellOff : Bell;

  return (
    <section
      aria-label="Next job"
      className={cn(
        "border border-border bg-muted/30 text-foreground transition-colors duration-200 hover:bg-muted/40",
        embedded ? "rounded-xl px-3 py-3" : "rounded-2xl px-4 py-4",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted/60 motion-safe:animate-pulse">
          <Search className="size-5 text-muted-foreground" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-lg font-bold tracking-tight">Nothing next in your queue</p>
            <CleanerDashboardInfoHint
              text={`Your soonest open visit (today or a future day) shows here.\n\nThis is not limited to “today only” — tomorrow and later bookings count too.`}
              label="About the next job slot"
            />
          </div>
          {nextScheduleLine ? (
            <p className="mt-1 text-sm font-medium text-foreground/90">
              Next: <span className="text-foreground">{nextScheduleLine}</span>
            </p>
          ) : null}
          {browserOnline && receivingOffers ? (
            <p className="mt-1 text-sm font-medium text-foreground/90">We&apos;re finding jobs for you nearby</p>
          ) : null}
        </div>
      </div>
      <div className="mt-4 flex items-start gap-2 rounded-xl border border-border/60 bg-background/60 px-3 py-2.5">
        <Icon className="mt-0.5 size-4 shrink-0 text-foreground/80" aria-hidden />
        <div className="min-w-0 flex-1 text-sm">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="font-semibold text-foreground">{hint.title}</p>
            <CleanerDashboardInfoHint text={hint.body} label={hint.title} />
          </div>
          {hint.showRequest ? (
            <Button type="button" size="sm" variant="secondary" className="mt-2 h-9 active:scale-[0.98]" onClick={requestNotify}>
              Enable notifications
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
