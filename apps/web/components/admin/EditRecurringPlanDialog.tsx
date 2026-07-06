"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { adminFetch } from "@/hooks/useAdminData";
import { emitAdminToast } from "@/lib/admin/toastBus";
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
import { AdminPreferredCleanerSelect } from "@/components/admin/create-booking/AdminPreferredCleanerSelect";
import { cn } from "@/lib/utils";

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

type EditFreq = "weekly" | "biweekly" | "monthly";
type EditSvc = "standard" | "deep" | "move";

export type EditRecurringPlanTarget = {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  frequency: string;
  days_of_week: number[];
  start_date: string | null;
  end_date: string | null;
  price: number;
  service_label: string | null;
  template_location: string | null;
  template_visit_time: string | null;
  preferred_cleaner_id: string | null;
};

function serviceFromLabel(label: string | null): EditSvc {
  const l = (label ?? "").toLowerCase();
  if (l.includes("deep")) return "deep";
  if (l.includes("move")) return "move";
  return "standard";
}

function normalizeTimeInput(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "09:00";
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return "09:00";
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function formFromPlan(plan: EditRecurringPlanTarget) {
  return {
    frequency: (["weekly", "biweekly", "monthly"].includes(plan.frequency.toLowerCase())
      ? plan.frequency.toLowerCase()
      : "weekly") as EditFreq,
    days: [...(plan.days_of_week ?? [])].sort((a, b) => a - b),
    startDate: plan.start_date ?? "",
    endDate: plan.end_date ?? "",
    price: String(Math.round(plan.price ?? 0) || ""),
    address: plan.template_location ?? "",
    service: serviceFromLabel(plan.service_label),
    visitTime: normalizeTimeInput(plan.template_visit_time),
    preferredCleanerIds: plan.preferred_cleaner_id ? [plan.preferred_cleaner_id] : [],
  };
}

export type EditRecurringPlanDialogProps = {
  open: boolean;
  plan: EditRecurringPlanTarget | null;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void | Promise<void>;
};

export function EditRecurringPlanDialog({ open, plan, onOpenChange, onUpdated }: EditRecurringPlanDialogProps) {
  const [form, setForm] = useState(() => (plan ? formFromPlan(plan) : null));
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && plan) {
      setForm(formFromPlan(plan));
      setFormError(null);
    }
  }, [open, plan]);

  function toggleDay(day: number) {
    setForm((f) => {
      if (!f) return f;
      const has = f.days.includes(day);
      const days = has ? f.days.filter((d) => d !== day) : [...f.days, day].sort((a, b) => a - b);
      return { ...f, days };
    });
  }

  async function submit() {
    if (!plan || !form) return;
    setFormError(null);

    const start = form.startDate.trim();
    const end = form.endDate.trim();
    const address = form.address.trim();
    const priceN = Number(form.price);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) {
      setFormError("Pick a valid start date.");
      return;
    }
    if (end && !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      setFormError("End date must be YYYY-MM-DD or empty.");
      return;
    }
    if (form.days.length < 1) {
      setFormError("Select at least one weekday.");
      return;
    }
    if (!address) {
      setFormError("Service address is required.");
      return;
    }
    if (!Number.isFinite(priceN) || priceN <= 0) {
      setFormError("Price must be greater than zero.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await adminFetch(`/api/admin/recurring/${encodeURIComponent(plan.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          frequency: form.frequency,
          days_of_week: form.days,
          start_date: start,
          end_date: end || null,
          price: priceN,
          address,
          visit_time: form.visitTime || "09:00",
          service: form.service,
          preferred_cleaner_ids: form.preferredCleanerIds,
        }),
      });
      if (!res.ok) {
        setFormError(res.error ?? "Update failed.");
        return;
      }

      const propagation = (res.data as { propagation?: {
        bookings_updated?: number;
        bookings_cleaner_updated?: number;
        bookings_cancelled?: number;
        bookings_created?: number;
        bookings_cancel_skipped?: number;
        bookings_cancel_skipped_locked_invoice?: number;
        bookings_cancel_skipped_locked_payout?: number;
        bookings_skipped_finalized?: number;
        bookings_skipped_locked_invoice?: number;
        earnings_recomputed?: number;
        invoices_recomputed?: number;
        errors?: string[];
      } } | undefined)?.propagation;

      if (propagation) {
        const parts: string[] = [];
        if (propagation.bookings_cancelled) parts.push(`${propagation.bookings_cancelled} extra visit(s) removed`);
        if (propagation.bookings_created) parts.push(`${propagation.bookings_created} visit(s) added`);
        if (propagation.bookings_updated) parts.push(`${propagation.bookings_updated} visit(s) repriced`);
        if (propagation.bookings_cleaner_updated) {
          parts.push(`${propagation.bookings_cleaner_updated} visit(s) cleaner updated`);
        }
        if (propagation.invoices_recomputed) parts.push(`${propagation.invoices_recomputed} invoice(s) updated`);
        if (propagation.earnings_recomputed) parts.push(`${propagation.earnings_recomputed} payout(s) refreshed`);
        if (parts.length > 0) {
          emitAdminToast(parts.join(" · "), "success");
        } else {
          emitAdminToast("Plan saved", "success");
        }
        if (propagation.bookings_cancel_skipped_locked_invoice) {
          emitAdminToast(
            `${propagation.bookings_cancel_skipped_locked_invoice} visit(s) on sent/paid invoices were not removed`,
            "error",
          );
        }
        if (propagation.bookings_cancel_skipped_locked_payout) {
          emitAdminToast(
            `${propagation.bookings_cancel_skipped_locked_payout} visit(s) could not be removed (cleaner payout already locked)`,
            "error",
          );
        }
        if (
          propagation.bookings_cancel_skipped &&
          !propagation.bookings_cancel_skipped_locked_invoice &&
          !propagation.bookings_cancel_skipped_locked_payout
        ) {
          emitAdminToast(
            `${propagation.bookings_cancel_skipped} extra visit(s) could not be removed`,
            "error",
          );
        }
        if (propagation.bookings_skipped_finalized) {
          emitAdminToast(
            `${propagation.bookings_skipped_finalized} visit(s) skipped (earnings already finalized)`,
            "error",
          );
        }
        if (propagation.bookings_skipped_locked_invoice) {
          emitAdminToast(
            `${propagation.bookings_skipped_locked_invoice} visit(s) on sent/paid invoices were not changed`,
            "error",
          );
        }
        if (propagation.errors?.length) {
          emitAdminToast(propagation.errors[0] ?? "Some rows could not be updated", "error");
        }
      } else {
        emitAdminToast("Plan saved", "success");
      }

      onOpenChange(false);
      await onUpdated();
    } finally {
      setSubmitting(false);
    }
  }

  const customer = plan?.customer_name ?? plan?.customer_email ?? "Recurring plan";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setFormError(null);
      }}
    >
      <DialogContent className="max-h-[min(90vh,720px)] max-w-lg overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit recurring plan</DialogTitle>
          <DialogDescription>
            Update schedule, price, address, or visit time for <span className="font-medium text-slate-700">{customer}</span>.
            Saving also updates open occurrence bookings, draft invoices, and cleaner earnings where allowed.
          </DialogDescription>
        </DialogHeader>

        {form ? (
          <div className="grid gap-4 py-1">
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                id="er-frequency"
                label="Frequency"
                value={form.frequency}
                onChange={(e) => setForm((s) => (s ? { ...s, frequency: e.target.value as EditFreq } : s))}
                disabled={submitting}
              >
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
              </Select>
              <Select
                id="er-service"
                label="Service type"
                value={form.service}
                onChange={(e) => setForm((s) => (s ? { ...s, service: e.target.value as EditSvc } : s))}
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
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50",
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
                <Label htmlFor="er-start">Start date</Label>
                <Input
                  id="er-start"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((s) => (s ? { ...s, startDate: e.target.value } : s))}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="er-end">End date (optional)</Label>
                <Input
                  id="er-end"
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm((s) => (s ? { ...s, endDate: e.target.value } : s))}
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="er-time">Visit time</Label>
                <Input
                  id="er-time"
                  type="time"
                  value={form.visitTime}
                  onChange={(e) => setForm((s) => (s ? { ...s, visitTime: e.target.value } : s))}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="er-price">Price (ZAR)</Label>
                <Input
                  id="er-price"
                  type="number"
                  inputMode="decimal"
                  min={1}
                  step={1}
                  value={form.price}
                  onChange={(e) => setForm((s) => (s ? { ...s, price: e.target.value } : s))}
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="er-address">Address</Label>
              <Input
                id="er-address"
                autoComplete="street-address"
                value={form.address}
                onChange={(e) => setForm((s) => (s ? { ...s, address: e.target.value } : s))}
                disabled={submitting}
              />
            </div>

            <AdminPreferredCleanerSelect
              id="er-cleaner"
              value={form.preferredCleanerIds}
              onChange={(preferredCleanerIds) =>
                setForm((s) => (s ? { ...s, preferredCleanerIds } : s))
              }
              visitDate={form.startDate}
              visitTime={form.visitTime}
              disabled={submitting}
            />

            {formError ? (
              <p className="text-sm text-red-600" role="alert">
                {formError}
              </p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={submitting || !form}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Saving…
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
