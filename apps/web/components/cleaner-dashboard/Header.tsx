"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { johannesburgCalendarYmd } from "@/lib/dashboard/johannesburgMonth";
import { hrefForNotificationKind } from "@/lib/notifications/notificationRoutes";
import { useCleanerNotifications } from "@/lib/notifications/notificationsStore";
import type { CleanerInAppNotification } from "@/lib/notifications/types";
import { addDaysYmd } from "@/lib/recurring/johannesburgCalendar";
import { cn } from "@/lib/utils";

type HeaderProps = {
  firstName?: string;
  notificationPermission?: "default" | "granted" | "denied" | "unsupported";
};

function formatNotifTime(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  try {
    return new Intl.DateTimeFormat("en-ZA", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Johannesburg",
    }).format(new Date(ms));
  } catch {
    return "";
  }
}

function groupNotificationsByJhbDay(items: readonly CleanerInAppNotification[]) {
  const now = new Date();
  const todayYmd = johannesburgCalendarYmd(now);
  const yesterdayYmd = addDaysYmd(todayYmd, -1);
  const today: CleanerInAppNotification[] = [];
  const yesterday: CleanerInAppNotification[] = [];
  const earlier: CleanerInAppNotification[] = [];
  for (const n of items) {
    const ms = Date.parse(n.created_at);
    if (!Number.isFinite(ms)) continue;
    const d = johannesburgCalendarYmd(new Date(ms));
    if (d === todayYmd) today.push(n);
    else if (d === yesterdayYmd) yesterday.push(n);
    else earlier.push(n);
  }
  return { today, yesterday, earlier };
}

function NotificationRow({
  n,
  onRead,
  onNavigate,
}: {
  n: CleanerInAppNotification;
  onRead: (id: string) => void;
  onNavigate: (href: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        className={cn(
          "flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/60",
          !n.read && "bg-muted/25",
        )}
        onClick={() => {
          onRead(n.id);
          onNavigate(hrefForNotificationKind(n.kind, n.booking_id, n.offer_token));
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="font-semibold text-foreground">{n.title}</span>
          {!n.read ? <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden /> : null}
        </div>
        {n.body ? <p className="text-muted-foreground">{n.body}</p> : null}
        <p className="text-xs text-muted-foreground">{formatNotifTime(n.created_at)}</p>
      </button>
    </li>
  );
}

function NotificationGroup({
  label,
  rows,
  onRead,
  onNavigate,
}: {
  label: string;
  rows: CleanerInAppNotification[];
  onRead: (id: string) => void;
  onNavigate: (href: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <li className="list-none">
      <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <ul className="divide-y divide-border" role="list">
        {rows.map((n) => (
          <NotificationRow key={n.id} n={n} onRead={onRead} onNavigate={onNavigate} />
        ))}
      </ul>
    </li>
  );
}

export function Header({ firstName = "there", notificationPermission = "unsupported" }: HeaderProps) {
  const router = useRouter();
  const { items, unreadCount, markRead, markAllRead } = useCleanerNotifications();
  const grouped = useMemo(() => groupNotificationsByJhbDay(items), [items]);
  const navigate = useMemo(
    () => (href: string) => {
      try {
        router.push(href);
      } catch {
        window.location.href = href;
      }
    },
    [router],
  );

  const BellIcon =
    notificationPermission === "granted" ? BellRing : notificationPermission === "denied" ? BellOff : Bell;
  const bellTitle =
    notificationPermission === "granted"
      ? "Browser alerts on — open your inbox"
      : notificationPermission === "denied"
        ? "Browser notifications blocked"
        : notificationPermission === "default"
          ? "Open notifications inbox"
          : "Notifications inbox";

  const ringClass =
    notificationPermission === "granted"
      ? "border-2 border-emerald-500/45 bg-emerald-500/10 text-emerald-800 dark:text-emerald-100"
      : "border border-border bg-muted/40 text-muted-foreground";

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Hi, {firstName} <span aria-hidden>👋</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Here&apos;s what matters right now.</p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "relative flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              ringClass,
            )}
            title={bellTitle}
            aria-label={bellTitle}
          >
            <BellIcon className="size-5" aria-hidden />
            {unreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full px-1">
                <Badge variant="destructive" className="h-5 min-w-5 justify-center px-1.5 text-[10px] tabular-nums">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </Badge>
              </span>
            ) : null}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="w-[min(100vw-1.5rem,22rem)] max-h-[min(70dvh,420px)] overflow-y-auto rounded-xl border border-border bg-card p-0 text-card-foreground shadow-lg">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <p className="text-sm font-semibold text-foreground">Notifications</p>
            {unreadCount > 0 ? (
              <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0 px-2 text-xs" onClick={() => markAllRead()}>
                Mark all read
              </Button>
            ) : null}
          </div>
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No notifications yet. New offers and assignments show up here.</p>
          ) : (
            <ul className="flex flex-col" role="list">
              <NotificationGroup label="Today" rows={grouped.today} onRead={markRead} onNavigate={navigate} />
              <NotificationGroup label="Yesterday" rows={grouped.yesterday} onRead={markRead} onNavigate={navigate} />
              <NotificationGroup label="Earlier" rows={grouped.earlier} onRead={markRead} onNavigate={navigate} />
            </ul>
          )}
          <DropdownMenuSeparator className="my-0 bg-border" />
          <p className="px-3 py-2 text-xs text-muted-foreground">
            {notificationPermission === "granted"
              ? "Desktop alerts are on when the browser allows."
              : notificationPermission === "denied"
                ? "Unblock notifications in browser settings to get desktop alerts."
                : notificationPermission === "default"
                  ? "Use “Enable notifications” below to allow desktop alerts."
                  : "This browser does not support Notification API."}
          </p>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
