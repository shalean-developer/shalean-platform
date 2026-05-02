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
};

function notificationHint(): { icon: "on" | "off" | "default"; title: string; body: string; showRequest?: boolean } {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return {
      icon: "default",
      title: "Job alerts",
      body: "New offers appear at the top of this screen when you're online.",
    };
  }
  const p = Notification.permission;
  if (p === "granted") {
    return { icon: "on", title: "Notifications are on", body: "We'll use browser alerts when we can, and always show offers here." };
  }
  if (p === "denied") {
    return {
      icon: "off",
      title: "Browser notifications are off",
      body: "You can enable them in your browser settings so you never miss a rush offer.",
    };
  }
  return {
    icon: "default",
    title: "Turn on notifications",
    body: "Allow alerts so a new offer can ping you even when this tab is in the background.",
    showRequest: true,
  };
}

/** Shown when there is no “next” open job to pin — keeps the dashboard feeling responsive. */
export function NextJobEmptyHint({
  receivingOffers = false,
  browserOnline = true,
  onNotificationsGranted,
  embedded,
}: NextJobEmptyHintProps) {
  const [hint, setHint] = useState(() => notificationHint());

  useEffect(() => {
    setHint(notificationHint());
  }, []);

  const requestNotify = () => {
    if (typeof Notification === "undefined" || Notification.permission !== "default") return;
    void Notification.requestPermission().then((p) => {
      setHint(notificationHint());
      if (p === "granted") onNotificationsGranted?.();
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
          <p className="text-lg font-bold tracking-tight">No upcoming jobs</p>
          {browserOnline && receivingOffers ? (
            <p className="mt-1 text-sm font-medium text-foreground/90">We&apos;re finding jobs for you nearby</p>
          ) : null}
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            We&apos;ll surface the next visit here as soon as you&apos;re assigned one.
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-start gap-2 rounded-xl border border-border/60 bg-background/60 px-3 py-2.5">
        <Icon className="mt-0.5 size-4 shrink-0 text-foreground/80" aria-hidden />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold text-foreground">{hint.title}</p>
          <p className="mt-0.5 text-muted-foreground">{hint.body}</p>
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
