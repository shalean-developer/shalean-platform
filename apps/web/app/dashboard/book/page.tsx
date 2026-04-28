"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { SERVICE_CATEGORIES, type BookingServiceId } from "@/components/booking/serviceCategories";
import { useAddresses } from "@/hooks/useAddresses";
import { useUserBillingProfile } from "@/hooks/useUserBillingProfile";
import { dashboardFetchJson } from "@/lib/dashboard/dashboardFetch";
import { addCalendarDaysToYmd, filterBookableTimeSlots, johannesburgTodayYmd } from "@/lib/dashboard/bookingSlotTimes";
import type { CustomerAddressRow } from "@/lib/dashboard/types";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-skeletons";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const SERVICE_IDS: BookingServiceId[] = ["quick", "standard", "airbnb", "deep", "carpet", "move"];

function serviceOptions(): { id: BookingServiceId; name: string }[] {
  const out: { id: BookingServiceId; name: string }[] = [];
  for (const cat of SERVICE_CATEGORIES) {
    for (const s of cat.services) {
      if (SERVICE_IDS.includes(s.id)) out.push({ id: s.id, name: s.name });
    }
  }
  return out;
}

function formatAddressLine(a: { line1: string; suburb: string; city: string; postal_code: string }): string {
  const parts = [a.line1, a.suburb, a.city, a.postal_code].map((p) => p.trim()).filter(Boolean);
  return parts.join(", ");
}

function propertyOptionLabel(a: CustomerAddressRow): string {
  const label = a.label.trim() || "Property";
  const tail = [a.line1, a.suburb].filter(Boolean).join(" · ");
  return tail ? `${label} – ${tail}` : label;
}

export default function DashboardBookPage() {
  const { addresses, loading: addrLoading, insertAddress } = useAddresses();
  const { billingType, loading: billLoading } = useUserBillingProfile();
  const todayJhb = useMemo(() => johannesburgTodayYmd(), []);
  const [date, setDate] = useState(todayJhb);
  const [time, setTime] = useState(() => {
    const slots = filterBookableTimeSlots(johannesburgTodayYmd());
    return slots[0] ?? "09:00";
  });
  const [service, setService] = useState<BookingServiceId>("standard");
  const [addressId, setAddressId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [addPropertyOpen, setAddPropertyOpen] = useState(false);
  const [newPropLabel, setNewPropLabel] = useState("");
  const [newPropLine1, setNewPropLine1] = useState("");
  const [newPropSuburb, setNewPropSuburb] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);

  const services = useMemo(() => serviceOptions(), []);
  const availableTimes = useMemo(() => filterBookableTimeSlots(date), [date]);

  const nextAvailableHint = useMemo(() => {
    const now = new Date();
    const tj = johannesburgTodayYmd(now);
    if (date !== tj) return null;
    const slots = filterBookableTimeSlots(tj, { now });
    if (slots.length > 0) return null;
    const tom = addCalendarDaysToYmd(tj, 1);
    const tomFirst = filterBookableTimeSlots(tom, { now })[0] ?? "07:00";
    return `Next available: Tomorrow ${tomFirst}`;
  }, [date]);

  const earliestTodayLabel = useMemo(() => {
    const now = new Date();
    if (date !== johannesburgTodayYmd(now)) return null;
    if (availableTimes.length === 0 || availableTimes.length > 4) return null;
    return `Earliest: ${availableTimes[0]}`;
  }, [date, availableTimes]);

  const defaultAddr = useMemo(() => addresses.find((a) => a.is_default) ?? addresses[0], [addresses]);
  const effectiveAddressId = addressId || defaultAddr?.id || "";

  const location = useMemo(() => {
    if (!effectiveAddressId) return "";
    const a = addresses.find((x) => x.id === effectiveAddressId);
    return a ? formatAddressLine(a) : "";
  }, [effectiveAddressId, addresses]);

  useEffect(() => {
    const slots = filterBookableTimeSlots(date);
    if (slots.length === 0) return;
    const t = time.trim().slice(0, 5);
    if (!slots.includes(t)) {
      setTime(slots[0] ?? "09:00");
    }
  }, [date, time]);

  if (addrLoading || billLoading) {
    return <DashboardPageSkeleton />;
  }

  if (billingType !== "monthly") {
    return (
      <div>
        <PageHeader
          title="Book Cleaning"
          description="Dashboard booking is for monthly-billed home-care plans. Pay-as-you-go customers use the main booking flow."
        />
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 dark:border-amber-900 dark:bg-amber-950/30">
          <p className="font-semibold text-amber-950 dark:text-amber-100">Monthly billing only</p>
          <p className="mt-2 text-sm text-amber-900/90 dark:text-amber-200/90">
            Self-service bookings here are only available when your account is on monthly billing. To pay per visit, use
            the standard booking flow — prices are confirmed at checkout.
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="xl" className="rounded-2xl">
            <Link href="/booking">Go to standard booking</Link>
          </Button>
          <Button asChild variant="outline" size="xl" className="rounded-2xl">
            <Link href="/dashboard/bookings">View my bookings</Link>
          </Button>
        </div>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (!location.trim()) {
      setError("Please choose a saved property for this visit.");
      return;
    }
    const tNorm = time.trim().slice(0, 5);
    if (!availableTimes.includes(tNorm)) {
      setError("Please pick a valid time with enough notice (Johannesburg time).");
      return;
    }
    setSubmitting(true);
    const out = await dashboardFetchJson<{ ok?: boolean; bookingId?: string; error?: string }>("/api/dashboard/bookings", {
      method: "POST",
      json: {
        date: date.trim(),
        time: tNorm,
        service,
        location: location.trim(),
        notes: notes.trim(),
      },
    });
    setSubmitting(false);
    if (!out.ok) {
      setError(out.error);
      return;
    }
    setSuccess(true);
    setNotes("");
  }

  const fewSlotsToday =
    date === todayJhb && availableTimes.length > 0 && availableTimes.length <= 4;

  async function saveNewProperty() {
    setAddErr(null);
    const label = newPropLabel.trim();
    const line1 = newPropLine1.trim();
    const suburb = newPropSuburb.trim();
    if (!label || !line1 || !suburb) {
      setAddErr("Please fill in property name, street, and suburb.");
      return;
    }
    setAddBusy(true);
    const r = await insertAddress({
      label,
      line1,
      suburb,
      city: "Cape Town",
      postal_code: "",
      is_default: addresses.length === 0,
    });
    setAddBusy(false);
    if (!r.ok) {
      setAddErr(r.message);
      return;
    }
    setAddressId(r.id);
    setNewPropLabel("");
    setNewPropLine1("");
    setNewPropSuburb("");
    setAddPropertyOpen(false);
  }

  return (
    <div>
      <PageHeader
        title="Book Cleaning"
        description="Pick a date and time. Visits on your monthly plan are added to your month-end invoice — not paid one-by-one here."
      />

      <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 dark:border-blue-900 dark:bg-blue-950/40">
        <p className="font-semibold text-blue-950 dark:text-blue-100">No payment today</p>
        <p className="mt-1 text-sm text-blue-900/90 dark:text-blue-100/90">
          This visit will be added to your monthly invoice. You won&apos;t pay here at checkout.
        </p>
      </div>

      {success ? (
        <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 px-4 py-4 dark:border-green-900 dark:bg-green-950/30">
          <p className="font-semibold text-green-900 dark:text-green-100">Booking confirmed</p>
          <p className="mt-2 text-sm text-green-800/90 dark:text-green-200/90">Booking confirmed. This will be billed monthly.</p>
        </div>
      ) : null}

      {error ? (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <p className="font-semibold">Something went wrong</p>
          <p className="mt-1">{error}</p>
        </div>
      ) : null}

      <Card className="rounded-2xl border-zinc-200/80 bg-white shadow-md dark:border-zinc-800 dark:bg-zinc-900">
        <CardContent className="p-6 sm:p-8">
          <form className="space-y-6" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="dash-book-date">Date</Label>
              <Input
                id="dash-book-date"
                type="date"
                required
                min={todayJhb}
                value={date}
                onChange={(ev) => setDate(ev.target.value)}
                className="rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dash-book-time">Time</Label>
              {earliestTodayLabel ? (
                <p className="text-xs font-medium text-blue-800 dark:text-blue-200">{earliestTodayLabel}</p>
              ) : null}
              <Select
                id="dash-book-time"
                value={time.trim().slice(0, 5)}
                onChange={(e) => setTime(e.target.value)}
                className="w-full"
                disabled={availableTimes.length === 0}
              >
                {availableTimes.length === 0 ? (
                  <option value="">No times available — pick another day</option>
                ) : (
                  availableTimes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))
                )}
              </Select>
              {fewSlotsToday ? (
                <p className="text-xs text-amber-800 dark:text-amber-200">Same-day slots are limited — book soon if you need this visit.</p>
              ) : null}
              {nextAvailableHint ? (
                <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{nextAvailableHint}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="dash-book-service">Service</Label>
              <Select
                id="dash-book-service"
                value={service}
                onChange={(e) => setService(e.target.value as BookingServiceId)}
                className="w-full"
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dash-book-address">My properties</Label>
              {addresses.length > 0 ? (
                <Select id="dash-book-address" value={effectiveAddressId} onChange={(e) => setAddressId(e.target.value)} className="w-full">
                  {addresses.map((a) => (
                    <option key={a.id} value={a.id}>
                      {propertyOptionLabel(a)}
                    </option>
                  ))}
                </Select>
              ) : (
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Save a property first.{" "}
                  <Link href="/dashboard/addresses" className="font-semibold underline">
                    Manage my properties
                  </Link>
                </p>
              )}
              {addresses.length > 0 ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Tip: clear names (e.g. “Sea Point – Studio”) help you pick the right place.
                  </p>
                  <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => setAddPropertyOpen(true)}>
                    + Add property
                  </Button>
                  <Link href="/dashboard/addresses" className="text-xs font-medium text-blue-600 underline">
                    Manage all
                  </Link>
                </div>
              ) : (
                <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => setAddPropertyOpen(true)}>
                  + Add property
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="dash-book-notes">Notes (optional)</Label>
              <Textarea
                id="dash-book-notes"
                rows={4}
                maxLength={4000}
                value={notes}
                onChange={(ev) => setNotes(ev.target.value)}
                placeholder="Access instructions, pets, parking, or anything we should know."
                className="rounded-xl"
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="submit"
                size="xl"
                className="min-h-14 flex-1 rounded-2xl"
                disabled={submitting || addresses.length === 0 || availableTimes.length === 0}
              >
                <Sparkles className="h-5 w-5" />
                {submitting ? "Sending…" : "Confirm booking"}
              </Button>
              <Button asChild type="button" variant="outline" size="xl" className="min-h-14 flex-1 rounded-2xl">
                <Link href="/dashboard/bookings">My bookings</Link>
              </Button>
            </div>
            <p className="text-center text-xs text-zinc-500 dark:text-zinc-400 sm:text-left">
              You&apos;ll receive one invoice at month end for all visits in that month.
            </p>
          </form>
        </CardContent>
      </Card>

      <Dialog open={addPropertyOpen} onOpenChange={setAddPropertyOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Add a property</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="np-label">Property name</Label>
              <Input
                id="np-label"
                value={newPropLabel}
                onChange={(e) => setNewPropLabel(e.target.value)}
                placeholder="e.g. Sea Point – Studio"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="np-line1">Street / building</Label>
              <Input id="np-line1" value={newPropLine1} onChange={(e) => setNewPropLine1(e.target.value)} className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="np-suburb">Suburb</Label>
              <Input id="np-suburb" value={newPropSuburb} onChange={(e) => setNewPropSuburb(e.target.value)} className="rounded-xl" />
            </div>
            {addErr ? <p className="text-sm text-red-600">{addErr}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => setAddPropertyOpen(false)} disabled={addBusy}>
              Cancel
            </Button>
            <Button type="button" className="rounded-xl" onClick={() => void saveNewProperty()} disabled={addBusy}>
              {addBusy ? "Saving…" : "Save & use"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
