"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Calendar, Clock, MapPin, Banknote } from "lucide-react";
import type { DashboardBooking } from "@/lib/dashboard/types";
import { formatBookingWhen } from "@/lib/dashboard/bookingUtils";
import { filterBookableTimeSlots, johannesburgTodayYmd, lastYmdInSameMonthAs } from "@/lib/dashboard/bookingSlotTimes";
import { customerCancelBookingHint } from "@/lib/dashboard/customerCancelCopy";
import { rescheduleCrossMonthBlocked } from "@/lib/dashboard/dashboardRescheduleGuard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CustomerBookingStatusBadge } from "@/components/dashboard/customer-booking-status-badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useDashboardToast } from "@/components/dashboard/dashboard-toast-context";
import { cn } from "@/lib/utils";

type BookingCardProps = {
  booking: DashboardBooking;
  showActions?: boolean;
  className?: string;
  /** When set (e.g. completed clean, cleaner assigned, no review yet), show “Leave review”. */
  leaveReviewHref?: string | null;
  onCancel?: (id: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  onReschedule?: (id: string, date: string, time: string) => Promise<{ ok: true } | { ok: false; message: string }>;
};

function canCustomerModify(b: DashboardBooking): boolean {
  const st = b.status;
  if (st === "completed" || st === "cancelled" || st === "failed") return false;
  if (b.raw.started_at || b.raw.en_route_at) return false;
  return st === "pending" || st === "confirmed" || st === "assigned";
}

export function BookingCard({
  booking,
  showActions = true,
  className,
  leaveReviewHref = null,
  onCancel,
  onReschedule,
}: BookingCardProps) {
  const toast = useDashboardToast();
  const when = formatBookingWhen(booking.date, booking.time);
  const addr = `${booking.addressLine}, ${booking.suburb}`;
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resDate, setResDate] = useState(booking.date);
  const [resTime, setResTime] = useState(booking.time);

  const modifiable = canCustomerModify(booking);

  const rescheduleSlots = useMemo(() => filterBookableTimeSlots(resDate), [resDate]);
  const crossMonthBlocked = useMemo(() => rescheduleCrossMonthBlocked(booking, resDate), [booking, resDate]);

  useEffect(() => {
    if (!rescheduleOpen) return;
    const slots = filterBookableTimeSlots(resDate);
    const t = resTime.trim().slice(0, 5);
    if (slots.length > 0 && !slots.includes(t)) {
      setResTime(slots[0] ?? "09:00");
    }
  }, [rescheduleOpen, resDate, resTime]);

  const rescheduleSaveDisabled =
    crossMonthBlocked || rescheduleSlots.length === 0 || !rescheduleSlots.includes(resTime.trim().slice(0, 5));

  const invoiceClosed = Boolean((booking.raw.monthly_invoices as { is_closed?: boolean } | null | undefined)?.is_closed);

  async function confirmCancel() {
    if (!onCancel) return;
    setBusy(true);
    const r = await onCancel(booking.id);
    setBusy(false);
    if (r.ok) {
      toast("Booking cancelled.", "success");
      setCancelOpen(false);
    } else {
      toast(r.message, "error");
    }
  }

  async function confirmReschedule() {
    if (!onReschedule) return;
    if (crossMonthBlocked) {
      toast("Bookings can’t be moved to another billing month.", "error");
      return;
    }
    const tNorm = resTime.trim().slice(0, 5);
    if (!rescheduleSlots.includes(tNorm)) {
      toast("Please pick a valid time with enough notice.", "error");
      return;
    }
    setBusy(true);
    const r = await onReschedule(booking.id, resDate.trim(), tNorm);
    setBusy(false);
    if (r.ok) {
      toast("Booking rescheduled.", "success");
      setRescheduleOpen(false);
    } else {
      toast(r.message, "error");
    }
  }

  return (
    <>
      <Card className={cn("overflow-hidden rounded-2xl border-zinc-200/80 bg-white shadow-md dark:border-zinc-800 dark:bg-zinc-900", className)}>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-semibold text-zinc-900 dark:text-zinc-50">{booking.serviceName}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-4 w-4 shrink-0 text-blue-600" />
                  {when}
                </span>
              </div>
              <p className="inline-flex items-start gap-1 text-sm text-zinc-500 dark:text-zinc-400">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                <span className="line-clamp-2">{addr}</span>
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <CustomerBookingStatusBadge booking={booking} />
              <p className="flex items-center gap-1 text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
                <Banknote className="h-4 w-4 text-blue-600" aria-hidden />
                R {booking.priceZar.toLocaleString("en-ZA")}
              </p>
            </div>
          </div>

          {booking.cleaner ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
              <Clock className="h-4 w-4 text-blue-600" />
              Cleaner: <span className="font-medium text-zinc-900 dark:text-zinc-100">{booking.cleaner.name}</span>
            </p>
          ) : null}

          {showActions ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild size="lg" className="min-h-12 flex-1 rounded-xl sm:flex-none">
                <Link href={`/dashboard/bookings/${booking.id}`}>View Details</Link>
              </Button>
              {leaveReviewHref ? (
                <Button asChild size="lg" className="min-h-12 flex-1 rounded-xl bg-amber-500 text-white hover:bg-amber-600 sm:flex-none">
                  <Link href={leaveReviewHref}>Leave review</Link>
                </Button>
              ) : null}
              {modifiable && onReschedule ? (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="min-h-12 flex-1 rounded-xl sm:flex-none"
                  onClick={() => {
                    setResDate(booking.date);
                    setResTime(booking.time);
                    setRescheduleOpen(true);
                  }}
                >
                  Reschedule
                </Button>
              ) : null}
              {modifiable && onCancel ? (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="min-h-12 flex-1 rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 sm:flex-none"
                  disabled={invoiceClosed}
                  title={invoiceClosed ? "This billing month is closed online. Contact support to change this visit." : undefined}
                  onClick={() => setCancelOpen(true)}
                >
                  Cancel
                </Button>
              ) : null}
              {booking.status === "completed" || booking.status === "cancelled" ? (
                <Button asChild variant="outline" size="lg" className="min-h-12 flex-1 rounded-xl sm:flex-none">
                  <Link href="/booking">Rebook</Link>
                </Button>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Cancel this booking?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">{customerCancelBookingHint(booking.raw)}</p>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">This will mark your visit as cancelled.</p>
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => setCancelOpen(false)} disabled={busy}>
              Keep booking
            </Button>
            <Button type="button" className="rounded-xl bg-red-600 hover:bg-red-700" onClick={() => void confirmCancel()} disabled={busy}>
              {busy ? "Working…" : "Yes, cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Reschedule</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`rd-${booking.id}`}>Date</Label>
              <Input
                id={`rd-${booking.id}`}
                type="date"
                min={johannesburgTodayYmd()}
                value={resDate}
                onChange={(e) => {
                  const v = e.target.value;
                  if (rescheduleCrossMonthBlocked(booking, v)) {
                    setResDate(lastYmdInSameMonthAs(booking.date));
                  } else {
                    setResDate(v);
                  }
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`rt-${booking.id}`}>Time</Label>
              <Select id={`rt-${booking.id}`} value={resTime.trim().slice(0, 5)} onChange={(e) => setResTime(e.target.value)} className="w-full">
                {rescheduleSlots.length === 0 ? (
                  <option value="">No times left</option>
                ) : (
                  rescheduleSlots.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))
                )}
              </Select>
            </div>
          </div>
          {crossMonthBlocked ? (
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Bookings can&apos;t be moved to another billing month. Pick a date in {booking.date.slice(0, 7)} or contact support.
            </p>
          ) : null}
          {rescheduleSlots.length === 0 && !crossMonthBlocked ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">No times available on this day with enough notice. Try another date.</p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => setRescheduleOpen(false)} disabled={busy}>
              Close
            </Button>
            <Button type="button" className="rounded-xl" onClick={() => void confirmReschedule()} disabled={busy || rescheduleSaveDisabled}>
              {busy ? "Saving…" : "Save new time"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
