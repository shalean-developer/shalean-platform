"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import type { BookingServiceGroupKey, BookingServiceId, BookingServiceTypeKey } from "@/components/booking/serviceCategories";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type ServiceChoice = "standard" | "deep" | "move";

const SERVICE_OPTIONS: { value: ServiceChoice; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "deep", label: "Deep" },
  { value: "move", label: "Move-out" },
];

function serviceMeta(serviceId: ServiceChoice): {
  service_group: BookingServiceGroupKey;
  service_type: BookingServiceTypeKey;
  selectedCategory: BookingServiceGroupKey;
  service: BookingServiceId;
} {
  if (serviceId === "standard") {
    return {
      service: "standard",
      service_group: "regular",
      service_type: "standard_cleaning",
      selectedCategory: "regular",
    };
  }
  if (serviceId === "deep") {
    return {
      service: "deep",
      service_group: "specialised",
      service_type: "deep_cleaning",
      selectedCategory: "specialised",
    };
  }
  return {
    service: "move",
    service_group: "specialised",
    service_type: "move_cleaning",
    selectedCategory: "specialised",
  };
}

/** Payload `locked` must satisfy {@link parseLockedBookingFromUnknown} on the server. */
function buildLockedPayload(params: {
  serviceId: ServiceChoice;
  dateYmd: string;
  timeHm: string;
  location: string;
  finalPriceZar: number;
}): Record<string, unknown> {
  const meta = serviceMeta(params.serviceId);
  const finalPrice = Math.max(1, Math.round(params.finalPriceZar));
  return {
    locked: true,
    lockedAt: new Date().toISOString(),
    date: params.dateYmd,
    time: params.timeHm,
    finalPrice,
    finalHours: 3,
    surge: 1,
    rooms: 2,
    bathrooms: 1,
    extraRooms: 0,
    extras: [],
    location: params.location.trim().slice(0, 500),
    propertyType: "apartment",
    cleaningFrequency: "one_time",
    ...meta,
  };
}

type FormState = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  serviceType: ServiceChoice;
  date: string;
  time: string;
  address: string;
  price: string;
};

const emptyForm: FormState = {
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  serviceType: "standard",
  date: "",
  time: "",
  address: "",
  price: "",
};

function normalizeTimeHm(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (!m) return null;
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function validateForm(f: FormState): string | null {
  const name = f.customerName.trim();
  const email = f.customerEmail.trim();
  const phone = f.customerPhone.trim();
  if (name.length < 2) return "Enter the customer’s full name (at least 2 characters).";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid customer email.";
  if (phone.length < 5) return "Enter a valid phone number (at least 5 characters).";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date.trim())) return "Pick a valid date.";
  const timeHm = normalizeTimeHm(f.time);
  if (!timeHm) return "Pick a valid time (HH:mm).";
  if (!f.address.trim()) return "Enter the service address.";
  const price = Number(f.price);
  if (!Number.isFinite(price) || price <= 0) return "Price must be greater than zero.";
  return null;
}

type WithPaymentResponse = {
  ok?: boolean;
  error?: string;
  bookingId?: string;
};

async function handleCreateBooking(params: {
  accessToken: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  serviceType: ServiceChoice;
  date: string;
  time: string;
  address: string;
  priceZar: number;
}): Promise<{ ok: true; bookingId?: string } | { ok: false; error: string; status?: number }> {
  const email = params.customerEmail.trim();
  const timeHm = normalizeTimeHm(params.time);
  if (!timeHm) {
    return { ok: false, error: "Invalid time." };
  }

  const locked = buildLockedPayload({
    serviceId: params.serviceType,
    dateYmd: params.date.trim(),
    timeHm,
    location: params.address,
    finalPriceZar: params.priceZar,
  });

  const body = {
    email,
    customer: {
      type: "guest" as const,
      name: params.customerName.trim(),
      email,
      phone: params.customerPhone.trim(),
    },
    locked,
    relaxedLockValidation: true,
  };

  const res = await fetch("/api/admin/bookings/with-payment", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => ({}))) as WithPaymentResponse & { message?: string };

  if (!res.ok) {
    return {
      ok: false,
      error: typeof json.error === "string" ? json.error : json.message ?? "Request failed.",
      status: res.status,
    };
  }

  return { ok: true, bookingId: typeof json.bookingId === "string" ? json.bookingId : undefined };
}

export default function AdminCreateBookingPage() {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastBookingId, setLastBookingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setFieldError(null);
      setApiError(null);
      setSuccess(null);
      setLastBookingId(null);

      const v = validateForm(form);
      if (v) {
        setFieldError(v);
        return;
      }

      const sb = getSupabaseBrowser();
      const token = (await sb?.auth.getSession())?.data.session?.access_token;
      if (!token) {
        setApiError("You are not signed in. Open admin login and try again.");
        return;
      }

      const priceZar = Number(form.price);
      setSubmitting(true);
      try {
        const result = await handleCreateBooking({
          accessToken: token,
          customerName: form.customerName,
          customerEmail: form.customerEmail,
          customerPhone: form.customerPhone,
          serviceType: form.serviceType,
          date: form.date.trim(),
          time: form.time,
          address: form.address,
          priceZar,
        });

        if (!result.ok) {
          setApiError(result.error);
          return;
        }

        setSuccess("Payment link sent");
        if (result.bookingId) setLastBookingId(result.bookingId);
        setForm(emptyForm);
      } finally {
        setSubmitting(false);
      }
    },
    [form],
  );

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Create booking</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Manual booking and Paystack payment link (email / SMS per platform rules).
          </p>
        </div>
        <Link
          href="/admin/bookings"
          className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          ← Back to bookings
        </Link>
      </div>

      <Card className="border-zinc-200 shadow-sm dark:border-zinc-800">
        <CardHeader>
          <CardTitle>Customer & visit</CardTitle>
          <CardDescription>Required fields are validated before the payment link is created.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="customerName">Customer name</Label>
              <Input
                id="customerName"
                name="customerName"
                autoComplete="name"
                value={form.customerName}
                onChange={(e) => setForm((s) => ({ ...s, customerName: e.target.value }))}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerEmail">Customer email</Label>
              <Input
                id="customerEmail"
                name="customerEmail"
                type="email"
                autoComplete="email"
                value={form.customerEmail}
                onChange={(e) => setForm((s) => ({ ...s, customerEmail: e.target.value }))}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerPhone">Phone</Label>
              <Input
                id="customerPhone"
                name="customerPhone"
                type="tel"
                autoComplete="tel"
                value={form.customerPhone}
                onChange={(e) => setForm((s) => ({ ...s, customerPhone: e.target.value }))}
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              <Select
                id="serviceType"
                name="serviceType"
                label="Service type"
                value={form.serviceType}
                onChange={(e) =>
                  setForm((s) => ({ ...s, serviceType: e.target.value as ServiceChoice }))
                }
                disabled={submitting}
              >
                {SERVICE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  name="date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((s) => ({ ...s, date: e.target.value }))}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="time">Time</Label>
                <Input
                  id="time"
                  name="time"
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm((s) => ({ ...s, time: e.target.value }))}
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                name="address"
                autoComplete="street-address"
                value={form.address}
                onChange={(e) => setForm((s) => ({ ...s, address: e.target.value }))}
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="price">Price (ZAR override)</Label>
              <Input
                id="price"
                name="price"
                type="number"
                inputMode="decimal"
                min={1}
                step={1}
                placeholder="e.g. 850"
                value={form.price}
                onChange={(e) => setForm((s) => ({ ...s, price: e.target.value }))}
                disabled={submitting}
              />
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Charged total follows checkout rules (tips / promos are not applied on this form).
              </p>
            </div>

            {fieldError ? (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {fieldError}
              </p>
            ) : null}
            {apiError ? (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {apiError}
              </p>
            ) : null}
            {success ? (
              <div
                className={cn(
                  "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900",
                  "dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100",
                )}
                role="status"
              >
                <p className="font-medium">{success}</p>
                {lastBookingId ? (
                  <p className="mt-1 text-xs opacity-90">
                    Booking ID:{" "}
                    <Link
                      href={`/admin/bookings/${lastBookingId}`}
                      className="font-mono underline decoration-emerald-700/50 hover:decoration-emerald-700"
                    >
                      {lastBookingId}
                    </Link>
                  </p>
                ) : null}
              </div>
            ) : null}

            <Button type="submit" className="w-full sm:w-auto" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Sending…
                </>
              ) : (
                "Send payment link"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
