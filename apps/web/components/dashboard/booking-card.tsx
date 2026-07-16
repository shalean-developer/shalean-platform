"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Clock,
  MapPin,
  User,
  CreditCard,
  MoreHorizontal,
  CalendarClock,
  Eye,
} from "lucide-react";
import { formatBookingLocation } from "@/lib/dashboard/bookingUtils";
import type { DashboardBooking } from "@/lib/dashboard/types";
import { filterBookableTimeSlots, johannesburgTodayYmd, lastYmdInSameMonthAs } from "@/lib/dashboard/bookingSlotTimes";
import { customerCancelBookingHint } from "@/lib/dashboard/customerCancelCopy";
import { rescheduleCrossMonthBlocked } from "@/lib/dashboard/dashboardRescheduleGuard";
import { Button } from "@/components/ui/button";
import { CustomerBookingStatusBadge } from "@/components/dashboard/customer-booking-status-badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useDashboardToast } from "@/components/dashboard/dashboard-toast-context";
import { cn } from "@/lib/utils";
import { dashboardBookingCustomerSurface } from "@/lib/dashboard/dashboardBookingOperational";
import { rebookBookUrlFromBookingRow } from "@/lib/booking-v2/rebookFromBookingRow";

function formatTime12(time: string): string | null {
  const trimmed = time.trim();
  if (!/^\d{1,2}:\d{2}$/.test(trimmed)) return null;
  const parts = trimmed.split(":");
  const hour = parseInt(parts[0] ?? "9", 10);
  const min = parseInt(parts[1] ?? "0", 10);
  if (!Number.isFinite(hour) || !Number.isFinite(min) || hour < 0 || hour > 23 || min < 0 || min > 59) {
    return null;
  }
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${String(min).padStart(2, "0")} ${ampm}`;
}

function addHoursToTime(time: string, hours: number): string | null {
  if (!Number.isFinite(hours) || hours <= 0) return null;
  const start = formatTime12(time);
  if (!start) return null;
  const parts = time.trim().split(":");
  const h = parseInt(parts[0] ?? "9", 10);
  const m = parseInt(parts[1] ?? "0", 10);
  const totalMins = h * 60 + m + Math.round(hours * 60);
  const endH = Math.floor(totalMins / 60) % 24;
  const endM = totalMins % 60;
  return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
}

function formatDateNice(date: string): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "—";
  const parts = date.split("-").map(Number);
  const y = parts[0] ?? 2024;
  const mo = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return new Date(y, mo - 1, d).toLocaleDateString("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getServiceGradient(serviceName: string): string {
  const n = serviceName.toLowerCase();
  if (n.includes("office") || n.includes("commercial")) return "from-teal-500 to-cyan-600";
  if (n.includes("deep") || n.includes("spring")) return "from-purple-500 to-violet-600";
  if (n.includes("move") || n.includes("vacate") || n.includes("end of lease")) return "from-amber-400 to-orange-500";
  if (n.includes("carpet") || n.includes("upholstery")) return "from-rose-400 to-pink-500";
  if (n.includes("window")) return "from-sky-400 to-blue-500";
  return "from-blue-500 to-indigo-600";
}

function getConfirmationBadge(booking: DashboardBooking): { label: string; className: string } | null {
  const st = booking.status;
  if (st === "cancelled") return null;
  if (st === "failed") return null;
  if (st === "completed") return null;

  const rawStatus = String(booking.raw.status ?? "").trim().toLowerCase();
  const ps = String(booking.raw.payment_status ?? "").trim().toLowerCase();
  const hasCleaner = Boolean(booking.cleaner?.name?.trim());

  if (rawStatus === "pending_payment" || st === "pending_payment") {
    return {
      label: "Awaiting payment",
      className: "bg-amber-50 text-amber-700 border border-amber-200",
    };
  }

  if (ps === "pending_monthly") {
    return {
      label: "Billed monthly",
      className: "bg-sky-50 text-sky-700 border border-sky-200",
    };
  }

  if (rawStatus === "pending" || st === "pending") {
    return {
      label: hasCleaner ? "Confirmed" : "Awaiting cleaner",
      className: hasCleaner
        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
        : "bg-amber-50 text-amber-700 border border-amber-200",
    };
  }

  return {
    label: "Confirmed",
    className: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  };
}

function getPaymentStatusDisplay(booking: DashboardBooking): { label: string; className: string } {
  const rawStatus = String(booking.raw.status ?? "").trim().toLowerCase();
  const ps = String(booking.raw.payment_status ?? "").trim().toLowerCase();
  const refundStatus = String(booking.raw.refund_status ?? "").trim().toLowerCase();
  const refundedAt = String(booking.raw.refunded_at ?? "").trim();

  if (
    rawStatus === "pending_payment" ||
    ps === "pending_monthly" ||
    booking.status === "pending_payment"
  ) {
    return { label: "Awaiting payment", className: "text-orange-500 font-semibold" };
  }

  if (booking.status === "cancelled" || booking.status === "failed") {
    return { label: "Not charged", className: "text-gray-400 font-medium" };
  }

  // Prefer refund_status over capture payment_status (MODEL A — capture stays success).
  if (ps === "refunded" || refundStatus === "full" || refundStatus === "chargeback" || refundStatus === "reversed") {
    return {
      label: refundStatus === "chargeback" ? "Chargeback" : "Fully refunded",
      className: "text-gray-500 font-semibold",
    };
  }
  if (refundStatus === "partial" || refundedAt) {
    return { label: "Partially refunded", className: "text-orange-500 font-semibold" };
  }

  return { label: "Paid", className: "text-emerald-600 font-semibold" };
}

type BookingCardProps = {
  booking: DashboardBooking;
  showActions?: boolean;
  className?: string;
  detailHref?: string;
  leaveReviewHref?: string | null;
  onCancel?: (id: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  onReschedule?: (id: string, date: string, time: string) => Promise<{ ok: true } | { ok: false; message: string }>;
};

export function BookingCard({
  booking,
  showActions = true,
  className,
  detailHref,
  leaveReviewHref = null,
  onCancel,
  onReschedule,
}: BookingCardProps) {
  const toast = useDashboardToast();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resDate, setResDate] = useState(booking.date);
  const [resTime, setResTime] = useState(booking.time);

  const { modifiable, showRebook } = useMemo(() => dashboardBookingCustomerSurface(booking), [booking]);

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
      toast("Bookings can't be moved to another billing month.", "error");
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

  const viewDetailsHref = detailHref ?? `/account/bookings/${booking.id}`;
  const gradient = getServiceGradient(booking.serviceName);
  const confirmBadge = getConfirmationBadge(booking);
  const paymentDisplay = getPaymentStatusDisplay(booking);
  const endTime = booking.durationHours != null ? addHoursToTime(booking.time, booking.durationHours) : null;
  const startTimeLabel = formatTime12(booking.time);
  const endTimeLabel = endTime ? formatTime12(endTime) : null;
  const showTimeRange = booking.scheduleConfirmed && startTimeLabel != null && endTimeLabel != null;
  const durationHours = booking.durationHours;
  const durationLabel =
    durationHours != null && Number.isFinite(durationHours) && durationHours > 0
      ? durationHours % 1 === 0
        ? `${durationHours} hr${durationHours !== 1 ? "s" : ""}`
        : `${durationHours} hrs`
      : null;
  const fullAddress = formatBookingLocation(booking);

  return (
    <>
      <div
        className={cn(
          "overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-shadow hover:shadow-md",
          className,
        )}
      >
        <div className="flex flex-col sm:flex-row">
          {/* Service image / gradient */}
          <div
            className={cn(
              "relative h-40 w-full shrink-0 overflow-hidden sm:h-auto sm:w-36 md:w-44",
              `bg-gradient-to-br ${gradient}`,
            )}
          >
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
                <CalendarClock className="h-6 w-6 text-white" strokeWidth={1.5} />
              </div>
              <span className="text-center text-xs font-semibold leading-tight text-white/90">
                {booking.serviceName}
              </span>
            </div>
          </div>

          {/* Main card content */}
          <div className="flex flex-1 flex-col p-4 sm:p-5">
            {/* Top row: service name + badges + status badge + price */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                {/* Service name + confirmation badge */}
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-bold text-gray-900">{booking.serviceName}</h3>
                  {confirmBadge ? (
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        confirmBadge.className,
                      )}
                    >
                      {confirmBadge.label}
                    </span>
                  ) : null}
                </div>

                {/* Date · Time range · Duration */}
                <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                    {formatDateNice(booking.date)}
                  </span>
                  <span className="text-gray-300">·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                    {showTimeRange ? `${startTimeLabel} – ${endTimeLabel}` : "Time to be confirmed"}
                  </span>
                  {durationLabel ? (
                    <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                      {durationLabel}
                    </span>
                  ) : null}
                </div>

                {/* Address */}
                <div className="flex items-start gap-1.5 text-sm text-gray-500">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
                  <span className="line-clamp-1">{fullAddress}</span>
                </div>

                {/* Cleaner */}
                <div className="flex items-center gap-1.5 text-sm text-gray-500">
                  <User className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                  <span>
                    Cleaner:{" "}
                    <span className="font-medium text-gray-700">
                      {booking.cleaner?.name ?? "To be assigned"}
                    </span>
                  </span>
                </div>

                {/* Payment */}
                <div className="flex items-center gap-1.5 text-sm text-gray-500">
                  <CreditCard className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                  <span>
                    Payment:{" "}
                    <span className={paymentDisplay.className}>{paymentDisplay.label}</span>
                  </span>
                </div>
              </div>

              {/* Right: status badge + price + more options */}
              <div className="flex flex-col items-end gap-2 shrink-0">
                <div className="flex items-center gap-2">
                  <CustomerBookingStatusBadge booking={booking} />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition hover:border-gray-300 hover:bg-gray-50 hover:text-gray-600"
                        aria-label="More options"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem asChild>
                        <Link href={viewDetailsHref} className="flex items-center gap-2">
                          <Eye className="h-4 w-4" />
                          View details
                        </Link>
                      </DropdownMenuItem>
                      {leaveReviewHref ? (
                        <DropdownMenuItem asChild>
                          <Link href={leaveReviewHref}>Leave review</Link>
                        </DropdownMenuItem>
                      ) : null}
                      {modifiable && onReschedule ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              setResDate(booking.date);
                              setResTime(booking.time);
                              setRescheduleOpen(true);
                            }}
                          >
                            Reschedule
                          </DropdownMenuItem>
                        </>
                      ) : null}
                      {modifiable && onCancel ? (
                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-600"
                          disabled={invoiceClosed}
                          onClick={() => setCancelOpen(true)}
                        >
                          Cancel booking
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="text-right">
                  <p className="text-xl font-bold tabular-nums text-gray-900">
                    R {booking.priceZar.toLocaleString("en-ZA")}
                  </p>
                  <p className="text-xs text-gray-400">Total (VAT incl.)</p>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            {showActions ? (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-50 pt-4">
                <Button
                  asChild
                  size="sm"
                  className="rounded-xl bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                >
                  <Link href={viewDetailsHref}>
                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                    View details
                  </Link>
                </Button>

                {leaveReviewHref ? (
                  <Button
                    asChild
                    size="sm"
                    className="rounded-xl bg-amber-500 text-white hover:bg-amber-600"
                  >
                    <Link href={leaveReviewHref}>Leave review</Link>
                  </Button>
                ) : null}

                {modifiable && onReschedule ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-xl border-gray-200 text-gray-700 hover:bg-gray-50"
                    onClick={() => {
                      setResDate(booking.date);
                      setResTime(booking.time);
                      setRescheduleOpen(true);
                    }}
                  >
                    <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
                    Reschedule
                  </Button>
                ) : null}

                {modifiable && onCancel ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-xl border-red-100 text-red-600 hover:bg-red-50 hover:border-red-200"
                    disabled={invoiceClosed}
                    title={
                      invoiceClosed
                        ? "This billing month is closed online. Contact support to change this visit."
                        : undefined
                    }
                    onClick={() => setCancelOpen(true)}
                  >
                    Cancel
                  </Button>
                ) : null}

                {showRebook ? (
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="rounded-xl border-gray-200 text-gray-700 hover:bg-gray-50"
                  >
                    <Link href={rebookBookUrlFromBookingRow(booking.raw)}>Rebook</Link>
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Cancel Dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Cancel this booking?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">{customerCancelBookingHint(booking.raw)}</p>
          <p className="mt-2 text-sm text-gray-400">This will mark your visit as cancelled.</p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => setCancelOpen(false)}
              disabled={busy}
            >
              Keep booking
            </Button>
            <Button
              type="button"
              className="rounded-xl bg-red-600 hover:bg-red-700"
              onClick={() => void confirmCancel()}
              disabled={busy}
            >
              {busy ? "Working…" : "Yes, cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reschedule Dialog */}
      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Reschedule booking</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`rd-${booking.id}`}>New date</Label>
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
              <Label htmlFor={`rt-${booking.id}`}>New time</Label>
              <Select
                id={`rt-${booking.id}`}
                value={resTime.trim().slice(0, 5)}
                onChange={(e) => setResTime(e.target.value)}
                className="w-full"
              >
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
            <p className="text-sm font-medium text-amber-800">
              Bookings can&apos;t be moved to another billing month. Pick a date in{" "}
              {booking.date.slice(0, 7)} or contact support.
            </p>
          ) : null}
          {rescheduleSlots.length === 0 && !crossMonthBlocked ? (
            <p className="text-sm text-gray-500">
              No times available on this day with enough notice. Try another date.
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => setRescheduleOpen(false)}
              disabled={busy}
            >
              Close
            </Button>
            <Button
              type="button"
              className="rounded-xl bg-blue-600 hover:bg-blue-700"
              onClick={() => void confirmReschedule()}
              disabled={busy || rescheduleSaveDisabled}
            >
              {busy ? "Saving…" : "Save new time"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
