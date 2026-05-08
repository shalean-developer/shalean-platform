"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronDown, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { CustomerBookingStatusBadge } from "@/components/dashboard/customer-booking-status-badge";
import { Button } from "@/components/ui/button";
import { useBookings } from "@/hooks/useBookings";
import { useUser } from "@/hooks/useUser";
import { formatBookingWhen } from "@/lib/dashboard/bookingUtils";
import { cn } from "@/lib/utils";

const MAX_ROWS = 12;

/**
 * Mobile checkout only: “Details” opens a bottom sheet with recent booking history.
 */
export function BookingHistoryMobileSheet() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, loading: userLoading } = useUser();
  const { bookings, loading, error } = useBookings();

  const path = pathname?.startsWith("/") ? pathname : "/booking/details";
  const redirectPath = `${path}${searchParams?.toString() ? `?${searchParams.toString()}` : ""}`;
  const authRedirect = encodeURIComponent(redirectPath);

  const rows = useMemo(() => {
    return [...bookings]
      .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
      .slice(0, MAX_ROWS);
  }, [bookings]);

  return (
    <div className="flex justify-end px-3 pb-2 pt-1.5">
      <DialogPrimitive.Root>
        <DialogPrimitive.Trigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-white bg-blue-950 px-5 py-2.5 text-sm font-bold text-white",
              "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.95)] ring-2 ring-sky-400",
              "outline-none transition-colors hover:bg-blue-900 focus-visible:ring-4 focus-visible:ring-sky-300",
              "dark:bg-blue-950 dark:ring-sky-500 dark:hover:bg-blue-900",
            )}
            aria-label="Open booking history"
          >
            Details
            <ChevronDown className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
          </button>
        </DialogPrimitive.Trigger>

        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className="fixed inset-0 z-[100] bg-zinc-950/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          />
          <DialogPrimitive.Content
            className={cn(
              "fixed inset-x-0 bottom-0 z-[101] flex max-h-[min(88dvh,640px)] flex-col rounded-t-2xl border border-zinc-200 bg-white shadow-2xl",
              "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
              "dark:border-zinc-700 dark:bg-zinc-900",
            )}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <DialogPrimitive.Description className="sr-only">
              Recent and upcoming bookings linked to your account.
            </DialogPrimitive.Description>
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <DialogPrimitive.Title className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                Booking history
              </DialogPrimitive.Title>
              <DialogPrimitive.Close
                className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </DialogPrimitive.Close>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
              {userLoading ? (
                <ul className="space-y-2" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <li key={i} className="h-16 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
                  ))}
                </ul>
              ) : !user ? (
                <div className="space-y-3 py-2 text-center">
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">Sign in to see your past and upcoming cleans.</p>
                  <Button asChild className="w-full" size="default">
                    <Link href={`/auth?redirect=${authRedirect}`}>Log in</Link>
                  </Button>
                </div>
              ) : loading ? (
                <ul className="space-y-2" aria-hidden>
                  {[0, 1, 2, 3].map((i) => (
                    <li key={i} className="h-[4.5rem] animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
                  ))}
                </ul>
              ) : error ? (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              ) : rows.length === 0 ? (
                <p className="py-4 text-center text-sm text-zinc-600 dark:text-zinc-400">No bookings yet.</p>
              ) : (
                <ul className="space-y-2">
                  {rows.map((b) => (
                    <li key={b.id}>
                      <Link
                        href={`/dashboard/bookings/${b.id}`}
                        className="block rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 transition hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950/50 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/80"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="line-clamp-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                            {b.serviceName}
                          </p>
                          <span className="shrink-0 scale-90">
                            <CustomerBookingStatusBadge booking={b} />
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                          {formatBookingWhen(b.date, b.time)}
                        </p>
                        {b.suburb || b.addressLine ? (
                          <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500 dark:text-zinc-500">
                            {[b.addressLine, b.suburb].filter(Boolean).join(", ")}
                          </p>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {user && !userLoading && (
              <div className="shrink-0 border-t border-zinc-200 p-3 dark:border-zinc-800">
                <Button asChild variant="outline" className="w-full" size="default">
                  <Link href="/dashboard/bookings">View all bookings</Link>
                </Button>
              </div>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}
