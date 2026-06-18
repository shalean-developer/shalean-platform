"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Calendar, CalendarDays, Clock, MapPin, MessageCircle, Phone } from "lucide-react";
import { useBookingDetail } from "@/hooks/useBookings";
import { trackBookingPriceBreakdownShown } from "@/lib/analytics/bookingPricing";
import { customerAccountBookingReference } from "@/lib/booking/customerBookingReference";
import { formatBookingLocation, formatBookingWhen } from "@/lib/dashboard/bookingUtils";
import { filterBookableTimeSlots, johannesburgTodayYmd, lastYmdInSameMonthAs } from "@/lib/dashboard/bookingSlotTimes";
import { customerCancelBookingHint } from "@/lib/dashboard/customerCancelCopy";
import { rescheduleCrossMonthBlocked } from "@/lib/dashboard/dashboardRescheduleGuard";
import {
  alignStoredJobSplitToSubtotal,
  parseStoredJobPriceBreakdown,
  parseStoredPriceBreakdown,
} from "@/lib/dashboard/storedPriceBreakdown";
import type { DashboardBooking } from "@/lib/dashboard/types";
import { CustomerBookingStatusBadge } from "@/components/dashboard/customer-booking-status-badge";
import {
  canCustomerModifyDashboardBooking,
  customerBookingDetailTimelineConfirmedDone,
} from "@/lib/dashboard/dashboardBookingOperational";
import {
  customerBookingDetailHeaderDataAttributes,
  customerBookingDetailOperationalPhase,
  customerPreferredDispatchNotice,
} from "@/lib/dashboard/customerBookingDisplay";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/dashboard/empty-state";
import { useDashboardToast } from "@/components/dashboard/dashboard-toast-context";

type WindowWithBreakdownTrack = Window & { __trackedBookingBreakdown?: Record<string, true> };

type TimelineStep = { label: string; done: boolean; tone?: "danger" };

function formatZarLine(zar: number): string {
  const abs = Math.abs(Math.round(zar));
  const fmt = abs.toLocaleString("en-ZA");
  if (zar < 0) return `−R ${fmt}`;
  return `R ${fmt}`;
}

function timelineForBooking(b: DashboardBooking): TimelineStep[] {
  const phase = customerBookingDetailOperationalPhase(b);
  if (phase === "cancelled") {
    return [
      { label: "Booked", done: true },
      { label: "Confirmed", done: false },
      { label: "Cancelled", done: true, tone: "danger" },
    ];
  }
  if (phase === "failed") {
    return [
      { label: "Booked", done: true },
      { label: "Confirmed", done: false },
      { label: "Failed", done: true, tone: "danger" },
    ];
  }
  if (phase === "completed") {
    return [
      { label: "Booked", done: true },
      { label: "Confirmed", done: true },
      { label: "Completed", done: true },
    ];
  }
  return [
    { label: "Booked", done: true },
    { label: "Confirmed", done: customerBookingDetailTimelineConfirmedDone(b) },
    { label: "Completed", done: false },
  ];
}

export default function AccountBookingDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : undefined;
  const { booking, loading, error, refetch, cancelBooking, rescheduleBooking } = useBookingDetail(id);
  const toast = useDashboardToast();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resDate, setResDate] = useState("");
  const [resTime, setResTime] = useState("");

  const timeline = useMemo(() => (booking ? timelineForBooking(booking) : []), [booking]);
  const rescheduleSlots = useMemo(() => (resDate ? filterBookableTimeSlots(resDate) : []), [resDate]);
  const crossMonthBlocked = useMemo(
    () => (booking && resDate ? rescheduleCrossMonthBlocked(booking, resDate) : false),
    [booking, resDate],
  );
  const rescheduleSaveDisabled =
    crossMonthBlocked || rescheduleSlots.length === 0 || !rescheduleSlots.includes(resTime.trim().slice(0, 5));

  const invoiceClosed = Boolean(
    booking && (booking.raw.monthly_invoices as { is_closed?: boolean } | null | undefined)?.is_closed,
  );

  useEffect(() => {
    if (!rescheduleOpen || !booking) return;
    const slots = filterBookableTimeSlots(resDate);
    const t = resTime.trim().slice(0, 5);
    if (slots.length > 0 && !slots.includes(t)) {
      setResTime(slots[0] ?? "09:00");
    }
  }, [rescheduleOpen, resDate, resTime, booking]);

  const wa = useMemo(() => {
    const p = booking?.cleaner?.phone?.replace(/\D/g, "") ?? "";
    if (p) return p;
    return (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "27791234567").replace(/\D/g, "");
  }, [booking?.cleaner?.phone]);

  useEffect(() => {
    const b = booking;
    if (!b?.id || !b.priceDisplayFromCheckout) return;
    if (typeof window !== "undefined") {
      const w = window as WindowWithBreakdownTrack;
      w.__trackedBookingBreakdown ||= {};
      if (w.__trackedBookingBreakdown[b.id]) return;
    }
    const raw = b.raw.price_breakdown;
    if (raw == null || typeof raw !== "object") return;
    const q = parseStoredPriceBreakdown(raw);
    const job = parseStoredJobPriceBreakdown(raw);
    if (!q || !job) return;
    const sum0 = job.serviceBaseZar + job.roomsZar + job.extrasZar;
    if (Math.abs(sum0 - q.subtotalZar) > 1) return;
    const aligned = alignStoredJobSplitToSubtotal(job, q.subtotalZar, {
      pricingVersionId:
        typeof b.raw.pricing_version_id === "string" && b.raw.pricing_version_id.trim()
          ? b.raw.pricing_version_id.trim()
          : null,
      pricingCatalogCodeVersion: q.pricingVersion,
    });
    if (aligned.serviceBaseZar < 0 || aligned.roomsZar < 0 || aligned.extrasZar < 0) return;
    if (aligned.serviceBaseZar + aligned.roomsZar + aligned.extrasZar !== q.subtotalZar) return;
    trackBookingPriceBreakdownShown({
      bookingId: b.id,
      serviceBaseZar: aligned.serviceBaseZar,
      roomsZar: aligned.roomsZar,
      extrasZar: aligned.extrasZar,
    });
    if (typeof window !== "undefined") {
      const w = window as WindowWithBreakdownTrack;
      w.__trackedBookingBreakdown ||= {};
      w.__trackedBookingBreakdown[b.id] = true;
    }
  }, [booking]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 rounded-xl bg-muted" />
        <div className="h-56 rounded-2xl bg-muted" />
        <div className="h-40 rounded-2xl bg-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600">{error}</p>
        <Button type="button" variant="outline" className="rounded-xl" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!booking) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Booking not found"
        description="We could not load this booking for your account."
        action={
          <Button asChild size="lg" className="w-full rounded-xl">
            <Link href="/account/bookings">My Bookings</Link>
          </Button>
        }
      />
    );
  }

  const current = booking;
  const preferredDispatchNotice = customerPreferredDispatchNotice(current.raw.preferred_dispatch_status);
  const bookingRef = customerAccountBookingReference({
    bookingId: current.id,
    bookingReference: current.raw.booking_reference,
  });
  const when = booking.scheduleConfirmed
    ? formatBookingWhen(current.date, current.time)
    : "Date & time to be confirmed";
  const modifiable = canCustomerModifyDashboardBooking(current);

  async function confirmCancel() {
    setBusy(true);
    const r = await cancelBooking(current.id);
    setBusy(false);
    if (r.ok) {
      toast("Booking cancelled.", "success");
      setCancelOpen(false);
    } else {
      toast(r.message, "error");
    }
  }

  async function confirmReschedule() {
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
    const r = await rescheduleBooking(current.id, resDate.trim(), tNorm);
    setBusy(false);
    if (r.ok) {
      toast("Booking rescheduled.", "success");
      setRescheduleOpen(false);
    } else {
      toast(r.message, "error");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Booking details</h1>
          <p className="mt-1 text-sm text-muted-foreground">{when}</p>
        </div>
        <Button asChild variant="outline" className="rounded-xl">
          <Link href="/account/bookings">Back</Link>
        </Button>
      </div>

      {preferredDispatchNotice ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          {preferredDispatchNotice}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="rounded-2xl border-border shadow-sm">
            <CardHeader
              className="flex flex-row flex-wrap items-start justify-between gap-3 pb-2"
              {...customerBookingDetailHeaderDataAttributes(booking)}
            >
              <div>
                <CardTitle className="text-xl">{booking.serviceName}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Ref {bookingRef}</p>
              </div>
              <CustomerBookingStatusBadge booking={booking} />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                {booking.scheduleConfirmed ? (
                  <>
                    <span className="inline-flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-blue-600" />
                      {booking.date}
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <Clock className="h-4 w-4 text-blue-600" />
                      {booking.time} · {booking.durationHours}h
                    </span>
                  </>
                ) : (
                  <span className="inline-flex items-center gap-2 text-amber-800 dark:text-amber-200">
                    <Calendar className="h-4 w-4" />
                    Date & time to be confirmed
                  </span>
                )}
              </div>
              <p className="flex items-start gap-2 text-sm text-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                {formatBookingLocation(booking)}
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Rooms & extras</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">Rooms</p>
                {booking.rooms.length > 0 ? (
                  <ul className="mt-2 list-inside list-disc text-sm text-foreground">
                    {booking.rooms.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">No room details on file.</p>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">Extras</p>
                {booking.extras.length > 0 ? (
                  <ul className="mt-2 list-inside list-disc text-sm text-foreground">
                    {booking.extras.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">No extras selected.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {booking.cleanDetails.length > 0 ? (
            <Card className="rounded-2xl border-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Clean details</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-3 sm:grid-cols-2">
                  {booking.cleanDetails.map((line) => (
                    <div key={`${line.label}-${line.value}`}>
                      <dt className="text-xs font-semibold uppercase text-muted-foreground">{line.label}</dt>
                      <dd className="mt-1 text-sm text-foreground">{line.value}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          ) : null}

          {booking.accessNotes.length > 0 ? (
            <Card className="rounded-2xl border-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Access & arrival</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3">
                  {booking.accessNotes.map((line) => (
                    <div key={`${line.label}-${line.value}`}>
                      <dt className="text-xs font-semibold uppercase text-muted-foreground">{line.label}</dt>
                      <dd className="mt-1 text-sm text-foreground">{line.value}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          ) : null}

          <Card className="rounded-2xl border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Booking timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4">
                {timeline.map((step, i) => (
                  <li key={step.label} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <span
                        className={
                          step.done
                            ? "flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white"
                            : "flex h-9 w-9 items-center justify-center rounded-full border-2 border-border bg-muted text-xs font-bold text-muted-foreground"
                        }
                      >
                        {i + 1}
                      </span>
                      {i < timeline.length - 1 ? <span className="mt-1 h-8 w-px grow bg-border" /> : null}
                    </div>
                    <div className="pt-1">
                      <p
                        className={
                          step.tone === "danger"
                            ? "font-semibold text-red-600"
                            : step.done
                              ? "font-semibold text-foreground"
                              : "font-medium text-muted-foreground"
                        }
                      >
                        {step.label}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="rounded-2xl border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Price breakdown</CardTitle>
              {booking.priceDisplayFromCheckout ? (
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Price locked at checkout</p>
              ) : (
                <p className="text-xs text-muted-foreground">Total from your payment record.</p>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {booking.priceLines.map((line, index) => (
                <div key={`${booking.id}-price-${index}-${line.label}`} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{line.label}</span>
                  <span className="tabular-nums font-medium text-foreground">{formatZarLine(line.amountZar)}</span>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between text-base font-bold">
                <span>Total</span>
                <span className="tabular-nums text-blue-600">{formatZarLine(booking.priceZar)}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Cleaner</CardTitle>
            </CardHeader>
            <CardContent>
              {booking.cleaner ? (
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="text-base">{booking.cleaner.initials}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold text-foreground">{booking.cleaner.name}</p>
                    {booking.cleaner.phone ? (
                      <a
                        href={`tel:${booking.cleaner.phone}`}
                        className="mt-1 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        {booking.cleaner.phone}
                      </a>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {booking.cleaner ? "Your assigned cleaner." : "To be assigned before your visit."}
                </p>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-3">
            {modifiable ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="w-full rounded-xl"
                  onClick={() => {
                    setResDate(current.date);
                    setResTime(current.time);
                    setRescheduleOpen(true);
                  }}
                >
                  Reschedule
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="w-full rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                  disabled={invoiceClosed}
                  onClick={() => setCancelOpen(true)}
                >
                  Cancel booking
                </Button>
              </>
            ) : null}
            <Button
              asChild
              size="lg"
              className="w-full rounded-xl bg-[#25D366] text-white hover:bg-[#20bd5a]"
            >
              <a
                href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hi Shalean — question about booking ${bookingRef}`)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="h-5 w-5" />
                Contact support (WhatsApp)
              </a>
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Cancel this booking?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-foreground">{customerCancelBookingHint(current.raw)}</p>
          <p className="mt-2 text-sm text-muted-foreground">This will mark your visit as cancelled.</p>
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
              <Label htmlFor="res-d">Date</Label>
              <Input
                id="res-d"
                type="date"
                min={johannesburgTodayYmd()}
                value={resDate}
                onChange={(e) => {
                  const v = e.target.value;
                  if (current && rescheduleCrossMonthBlocked(current, v)) {
                    setResDate(lastYmdInSameMonthAs(current.date));
                  } else {
                    setResDate(v);
                  }
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="res-t">Time</Label>
              <Select id="res-t" value={resTime.trim().slice(0, 5)} onChange={(e) => setResTime(e.target.value)} className="w-full">
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
              Bookings can&apos;t be moved to another billing month. Pick a date in {current.date.slice(0, 7)}.
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => setRescheduleOpen(false)} disabled={busy}>
              Close
            </Button>
            <Button type="button" className="rounded-xl" onClick={() => void confirmReschedule()} disabled={busy || rescheduleSaveDisabled}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
