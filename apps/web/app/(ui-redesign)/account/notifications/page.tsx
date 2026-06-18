"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Bell, Check, CheckCheck, MessageCircle } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { HelpCard } from "@/components/account/HelpCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDashboardToast } from "@/components/dashboard/dashboard-toast-context";

export default function AccountNotificationsPage() {
  const toast = useDashboardToast();
  const { notifications, loading, error, refetch, markRead, markAllRead } = useNotifications();

  async function onMarkAll() {
    const r = await markAllRead();
    if (!r.ok) toast(r.message, "error");
    else toast("All notifications marked as read.", "success");
  }

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 rounded-xl bg-gray-100" />
        {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl bg-gray-100" />)}
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Notifications</h1>
          <p className="mt-1 text-sm text-gray-500">
            Booking updates, cleaner assignments, and reminders.
          </p>
        </div>
        {unreadCount > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl gap-1.5"
            onClick={() => void onMarkAll()}
          >
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </Button>
        ) : null}
      </div>

      {/* Error */}
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}{" "}
          <button type="button" className="font-semibold underline" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {/* Notification list */}
      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center shadow-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
            <Bell className="h-8 w-8 text-blue-400" strokeWidth={1.5} />
          </div>
          <h2 className="mt-5 text-lg font-semibold text-gray-900">All caught up</h2>
          <p className="mt-2 max-w-xs text-sm text-gray-500">
            No notifications yet. You&apos;ll see booking updates and reminders here.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {notifications.map((n) => {
            const unread = !n.read_at;
            const when = formatDistanceToNow(new Date(n.created_at), { addSuffix: true });
            const href =
              typeof n.booking_id === "string" && /^[0-9a-f-]{36}$/i.test(n.booking_id)
                ? `/account/bookings/${n.booking_id}`
                : null;
            return (
              <li key={n.id}>
                <div
                  className={cn(
                    "rounded-2xl border bg-white p-5 shadow-sm transition",
                    unread ? "border-blue-200 ring-1 ring-blue-100" : "border-gray-100",
                  )}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex gap-4">
                      <div
                        className={cn(
                          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                          unread ? "bg-blue-100" : "bg-gray-100",
                        )}
                      >
                        <Bell
                          className={cn("h-5 w-5", unread ? "text-blue-600" : "text-gray-400")}
                          strokeWidth={1.75}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-gray-900">{n.title}</p>
                          {unread ? (
                            <span className="h-2 w-2 rounded-full bg-blue-600" aria-label="Unread" />
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm text-gray-500">{n.body}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          <p className="text-xs text-gray-400">{when}</p>
                          {href ? (
                            <Link
                              href={href}
                              className="text-xs font-semibold text-blue-600 hover:underline"
                            >
                              View booking →
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    {unread ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0 rounded-xl"
                        onClick={() => void markRead(n.id)}
                      >
                        <Check className="mr-1.5 h-3.5 w-3.5" />
                        Mark read
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Help link */}
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600">
            <MessageCircle className="h-5 w-5 text-white" strokeWidth={1.75} />
          </div>
          <div>
            <p className="font-semibold text-blue-900">Need help with a notification?</p>
            <p className="mt-1 text-sm text-blue-700">
              If you received an unexpected notification or have questions, visit our{" "}
              <Link href="/account/help" className="font-semibold underline">
                Help &amp; Support
              </Link>{" "}
              page or chat with us on WhatsApp.
            </p>
          </div>
        </div>
      </div>

      <HelpCard />
    </div>
  );
}
