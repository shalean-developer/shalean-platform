"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Bell, Check } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useDashboardToast } from "@/components/dashboard/dashboard-toast-context";
import { DashboardListSkeleton } from "@/components/dashboard/dashboard-skeletons";

export default function DashboardNotificationsPage() {
  const toast = useDashboardToast();
  const { notifications, loading, error, refetch, markRead, markAllRead } = useNotifications();

  async function onMarkRead(id: string) {
    const r = await markRead(id);
    if (!r.ok) toast(r.message, "error");
  }

  async function onMarkAll() {
    const r = await markAllRead();
    if (!r.ok) toast(r.message, "error");
    else toast("All caught up.", "success");
  }

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Booking updates, assignments, and reminders."
        action={
          <Button type="button" variant="outline" size="lg" className="rounded-xl" onClick={() => void onMarkAll()}>
            <Check className="h-4 w-4" />
            Mark all read
          </Button>
        }
      />

      {error ? (
        <p className="mb-4 text-sm text-red-600">
          {error}{" "}
          <button type="button" className="font-semibold underline" onClick={() => void refetch()}>
            Retry
          </button>
        </p>
      ) : null}

      {loading ? (
        <DashboardListSkeleton rows={4} />
      ) : notifications.length === 0 ? (
        <p className="text-sm text-zinc-500">No notifications yet.</p>
      ) : (
        <ul className="space-y-3">
          {notifications.map((n) => {
            const unread = !n.read_at;
            const when = formatDistanceToNow(new Date(n.created_at), { addSuffix: true });
            const href =
              typeof n.booking_id === "string" && /^[0-9a-f-]{36}$/i.test(n.booking_id)
                ? `/dashboard/bookings/${n.booking_id}`
                : null;
            return (
              <li key={n.id}>
                <Card
                  className={cn(
                    "rounded-2xl border-zinc-200/80 shadow-md transition dark:border-zinc-800 dark:bg-zinc-900",
                    unread && "border-blue-200 ring-1 ring-blue-100 dark:border-blue-900 dark:ring-blue-950/50",
                    href && "hover:border-blue-200/80 dark:hover:border-blue-900/60",
                  )}
                >
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex gap-3">
                      <div
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                          unread ? "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-200" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800",
                        )}
                      >
                        <Bell className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-zinc-900 dark:text-zinc-50">{n.title}</p>
                          {unread ? <span className="h-2 w-2 rounded-full bg-blue-600" aria-label="Unread" /> : null}
                        </div>
                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{n.body}</p>
                        <p className="mt-1 text-xs text-zinc-400">{when}</p>
                        {href ? (
                          <Link
                            href={href}
                            className="mt-2 inline-flex text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                          >
                            View booking →
                          </Link>
                        ) : null}
                      </div>
                    </div>
                    {unread ? (
                      <Button type="button" variant="outline" size="sm" className="shrink-0 rounded-xl" onClick={() => void onMarkRead(n.id)}>
                        Mark read
                      </Button>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
