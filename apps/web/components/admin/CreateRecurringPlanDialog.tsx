"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { emitAdminToast } from "@/lib/admin/toastBus";
import { buildAdminBookingLocationString } from "@/lib/admin/buildBookingLocationFromSavedAddress";
import type { CustomerAddressRow } from "@/lib/dashboard/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

type CreateFreq = "weekly" | "biweekly" | "monthly";
type CreateSvc = "standard" | "deep" | "move";

type CustomerHit = {
  id: string;
  email: string | null;
  full_name: string | null;
  billing_type: string;
  schedule_type: string;
};

function emptyCreateForm() {
  return {
    customerQuery: "",
    selectedCustomer: null as CustomerHit | null,
    customerEmail: "",
    customerName: "",
    customerPhone: "",
    frequency: "weekly" as CreateFreq,
    days: [] as number[],
    startDate: "",
    price: "",
    address: "",
    service: "standard" as CreateSvc,
    visitTime: "09:00",
  };
}

export type CreateRecurringPlanDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void | Promise<void>;
};

export function CreateRecurringPlanDialog({ open, onOpenChange, onCreated }: CreateRecurringPlanDialogProps) {
  const [form, setForm] = useState(emptyCreateForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchHits, setSearchHits] = useState<CustomerHit[]>([]);
  const [searching, setSearching] = useState(false);

  const searchCustomers = useCallback(async (q: string) => {
    const t = q.trim();
    if (t.length < 2) {
      setSearchHits([]);
      return;
    }
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) return;
    setSearching(true);
    try {
      const digits = t.replace(/\D/g, "");
      const looksLikePhone = digits.length >= 9 || t.startsWith("+");
      const url = looksLikePhone
        ? `/api/admin/bookings/customers?phone=${encodeURIComponent(t)}`
        : `/api/admin/bookings/customers?q=${encodeURIComponent(t)}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => ({}))) as { customers?: CustomerHit[]; error?: string };
      if (!res.ok) {
        setSearchHits([]);
        return;
      }
      setSearchHits(json.customers ?? []);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => void searchCustomers(form.customerQuery), 300);
    return () => window.clearTimeout(t);
  }, [form.customerQuery, open, searchCustomers]);

  async function hydrateCustomerFields(hit: CustomerHit) {
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    let address = "";
    if (token) {
      const res = await fetch(
        `/api/admin/bookings/customer-saved-addresses?user_id=${encodeURIComponent(hit.id)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const json = (await res.json().catch(() => ({}))) as { addresses?: CustomerAddressRow[] };
      if (res.ok && json.addresses?.length) {
        const row = json.addresses.find((a) => a.is_default) ?? json.addresses[0];
        if (row) address = buildAdminBookingLocationString(row);
      }
    }
    setForm((s) => ({
      ...s,
      selectedCustomer: hit,
      customerQuery: hit.email ?? hit.full_name ?? hit.id,
      customerEmail: hit.email ?? s.customerEmail,
      customerName: hit.full_name ?? s.customerName,
      address: address || s.address,
    }));
    setSearchHits([]);
  }

  function toggleDay(day: number) {
    setForm((f) => {
      const has = f.days.includes(day);
      const days = has ? f.days.filter((d) => d !== day) : [...f.days, day].sort((a, b) => a - b);
      return { ...f, days };
    });
  }

  async function submit() {
    setFormError(null);
    const em = form.customerEmail.trim();
    const name = form.customerName.trim();
    const phone = form.customerPhone.trim();
    const address = form.address.trim();
    const start = form.startDate.trim();
    const priceN = Number(form.price);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setFormError("Enter a valid customer email.");
      return;
    }
    if (name.length < 2) {
      setFormError("Customer name must be at least 2 characters.");
      return;
    }
    if (!address) {
      setFormError("Service address is required.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) {
      setFormError("Pick a valid start date.");
      return;
    }
    if (form.days.length < 1) {
      setFormError("Select at least one weekday.");
      return;
    }
    if (!Number.isFinite(priceN) || priceN <= 0) {
      setFormError("Price must be greater than zero.");
      return;
    }

    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) {
      setFormError("Not signed in.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/recurring", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: { email: em, name, ...(phone ? { phone } : {}) },
          frequency: form.frequency,
          days_of_week: form.days,
          start_date: start,
          price: priceN,
          address,
          service: form.service,
          visit_time: form.visitTime || "09:00",
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        if (res.status === 404) {
          setFormError("Customer not found — create an account for this email first.");
          return;
        }
        setFormError(json.error ?? "Create failed.");
        return;
      }
      emitAdminToast("Recurring plan created", "success");
      onOpenChange(false);
      setForm(emptyCreateForm());
      setSearchHits([]);
      await onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setFormError(null);
          setForm(emptyCreateForm());
          setSearchHits([]);
        }
      }}
    >
      <DialogContent className="max-h-[min(90vh,720px)] max-w-lg overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New recurring plan</DialogTitle>
          <DialogDescription>
            Creates an active schedule. Visit template uses standard defaults (2 bed / 1 bath) with your address,
            price, and time until we add full quote integration.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-1">
          <div className="space-y-2">
            <Label htmlFor="cr-customer-search">Customer</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
              <Input
                id="cr-customer-search"
                className="pl-9"
                placeholder="Search by name, email, or phone…"
                value={form.customerQuery}
                onChange={(e) => {
                  setForm((s) => ({
                    ...s,
                    customerQuery: e.target.value,
                    selectedCustomer: null,
                    customerEmail: "",
                    customerName: "",
                  }));
                }}
                disabled={submitting}
                autoComplete="off"
              />
            </div>
            {searching ? (
              <p className="text-xs text-zinc-500">Searching…</p>
            ) : searchHits.length > 0 && !form.selectedCustomer ? (
              <ul className="max-h-48 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                {searchHits.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      className="flex w-full flex-col items-start gap-0.5 border-b border-zinc-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/80"
                      onClick={() => void hydrateCustomerFields(h)}
                    >
                      <span className="font-medium text-zinc-900 dark:text-zinc-50">{h.full_name ?? "—"}</span>
                      <span className="text-xs text-zinc-500">{h.email ?? h.id}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : form.customerQuery.trim().length >= 2 && !form.selectedCustomer && !searching ? (
              <p className="text-xs text-zinc-500">No customers found. You can still enter details manually below.</p>
            ) : null}
            {form.selectedCustomer ? (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900/60">
                <p className="font-medium text-zinc-900 dark:text-zinc-50">
                  {form.selectedCustomer.full_name ?? "—"}{" "}
                  <span className="font-normal text-zinc-500">
                    ({form.selectedCustomer.email ?? form.selectedCustomer.id})
                  </span>
                </p>
              </div>
            ) : null}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="cr-email">Customer email</Label>
              <Input
                id="cr-email"
                type="email"
                autoComplete="email"
                value={form.customerEmail}
                onChange={(e) => setForm((s) => ({ ...s, customerEmail: e.target.value, selectedCustomer: null }))}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="cr-name">Customer name</Label>
              <Input
                id="cr-name"
                autoComplete="name"
                value={form.customerName}
                onChange={(e) => setForm((s) => ({ ...s, customerName: e.target.value, selectedCustomer: null }))}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="cr-phone">Phone (optional)</Label>
              <Input
                id="cr-phone"
                type="tel"
                value={form.customerPhone}
                onChange={(e) => setForm((s) => ({ ...s, customerPhone: e.target.value }))}
                disabled={submitting}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              id="cr-frequency"
              label="Frequency"
              value={form.frequency}
              onChange={(e) => setForm((s) => ({ ...s, frequency: e.target.value as CreateFreq }))}
              disabled={submitting}
            >
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="monthly">Monthly</option>
            </Select>
            <Select
              id="cr-service"
              label="Service type"
              value={form.service}
              onChange={(e) => setForm((s) => ({ ...s, service: e.target.value as CreateSvc }))}
              disabled={submitting}
            >
              <option value="standard">Standard</option>
              <option value="deep">Deep</option>
              <option value="move">Move-out</option>
            </Select>
          </div>
          <div className="space-y-2">
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Days of week</span>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_SHORT.map((label, i) => {
                const day = i + 1;
                const on = form.days.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={submitting}
                    onClick={() => toggleDay(day)}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                      on
                        ? "border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-600"
                        : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cr-start">Start date</Label>
              <Input
                id="cr-start"
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((s) => ({ ...s, startDate: e.target.value }))}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cr-time">Visit time</Label>
              <Input
                id="cr-time"
                type="time"
                value={form.visitTime}
                onChange={(e) => setForm((s) => ({ ...s, visitTime: e.target.value }))}
                disabled={submitting}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cr-address">Address</Label>
            <Input
              id="cr-address"
              autoComplete="street-address"
              value={form.address}
              onChange={(e) => setForm((s) => ({ ...s, address: e.target.value }))}
              disabled={submitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cr-price">Price (ZAR)</Label>
            <Input
              id="cr-price"
              type="number"
              inputMode="decimal"
              min={1}
              step={1}
              value={form.price}
              onChange={(e) => setForm((s) => ({ ...s, price: e.target.value }))}
              disabled={submitting}
            />
          </div>
          {formError ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {formError}
            </p>
          ) : null}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Creating…
              </>
            ) : (
              "Create plan"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
