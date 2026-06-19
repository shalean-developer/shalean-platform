"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { adminFetch } from "@/hooks/useAdminData";
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
        }),
      });
      if (!res.ok) {
        setFormError(res.error ?? "Update failed.");
        return;
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
            Next visit date is recalculated after saving.
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
