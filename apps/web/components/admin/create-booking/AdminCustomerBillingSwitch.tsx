"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { trackAdminBillingSwitchClicked } from "@/lib/analytics/adminBilling";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { BookingServiceId } from "@/components/booking/serviceCategories";
import { BillingSwitchCode } from "@/lib/admin/billingSwitchCodes";

export type AdminBillingCustomer = {
  id: string;
  billing_type: string;
  schedule_type: string;
};

type Props = {
  customer: AdminBillingCustomer;
  service: BookingServiceId;
  disabled?: boolean;
  onBillingUpdated: (next: { billing_type: string; schedule_type: string }) => void;
};

type Pending = {
  billing_type: "per_booking" | "monthly";
  schedule_type: "fixed_schedule" | "on_demand";
};

type ImpactPreview = {
  bookings_count: number;
  invoice_status: string | null;
  invoice_month: string | null;
  has_month_invoice?: boolean;
};

function normBilling(s: string): "per_booking" | "monthly" {
  return s.toLowerCase() === "monthly" ? "monthly" : "per_booking";
}

function normSchedule(s: string): "fixed_schedule" | "on_demand" {
  return s.toLowerCase() === "fixed_schedule" ? "fixed_schedule" : "on_demand";
}

function billingSuccessLabel(t: string): string {
  return normBilling(t) === "monthly" ? "Monthly" : "Per booking";
}

export function AdminCustomerBillingSwitch({ customer, service, disabled = false, onBillingUpdated }: Props) {
  const billingIdempotencyKeyRef = useRef<string | null>(null);
  const patchInFlightRef = useRef(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [activityWarn, setActivityWarn] = useState<{
    bookings_count: number;
    invoice_status: string | null;
  } | null>(null);
  const [strictWarn, setStrictWarn] = useState(false);
  const [impactPreview, setImpactPreview] = useState<ImpactPreview | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [inlineImpact, setInlineImpact] = useState<ImpactPreview | null>(null);
  const [inlineImpactLoading, setInlineImpactLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [billingSuccess, setBillingSuccess] = useState<string | null>(null);

  const currentBilling = normBilling(customer.billing_type);
  const currentSchedule = normSchedule(customer.schedule_type);
  const controlsLocked = disabled || saving;
  const monthlyLocksSchedule = currentBilling === "monthly" || pending?.billing_type === "monthly";
  /** While confirming monthly, show On-demand as selected (coercion preview). */
  const scheduleHighlight =
    modalOpen && pending?.billing_type === "monthly" ? ("on_demand" as const) : currentSchedule;

  const resetModal = useCallback(() => {
    setPending(null);
    setActivityWarn(null);
    setStrictWarn(false);
    setImpactPreview(null);
    setImpactLoading(false);
    setError(null);
    setSaving(false);
    billingIdempotencyKeyRef.current = null;
  }, []);

  const openChange = useCallback(
    (next: Pending) => {
      if (controlsLocked) return;
      const coerced: Pending =
        next.billing_type === "monthly" ? { billing_type: "monthly", schedule_type: "on_demand" } : next;
      if (coerced.billing_type === currentBilling && coerced.schedule_type === currentSchedule) return;
      trackAdminBillingSwitchClicked({
        customer_id: customer.id,
        action: "open_modal",
        billing_to: coerced.billing_type,
      });
      billingIdempotencyKeyRef.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      setPending(coerced);
      setActivityWarn(null);
      setStrictWarn(false);
      setImpactPreview(null);
      setError(null);
      setModalOpen(true);
    },
    [controlsLocked, currentBilling, currentSchedule, customer.id],
  );

  useEffect(() => {
    if (!modalOpen || !pending) return;
    let cancelled = false;
    (async () => {
      const sb = getSupabaseBrowser();
      const token = (await sb?.auth.getSession())?.data.session?.access_token;
      if (!token) {
        if (!cancelled) setError("Not signed in.");
        return;
      }
      setImpactLoading(true);
      trackAdminBillingSwitchClicked({ customer_id: customer.id, action: "preview_fetch" });
      try {
        const res = await fetch(`/api/admin/customers/${encodeURIComponent(customer.id)}/billing`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          impact?: ImpactPreview;
        };
        if (!res.ok) {
          if (!cancelled) setError(typeof json.error === "string" ? json.error : "Could not load impact preview.");
          return;
        }
        if (!cancelled && json.impact) {
          setImpactPreview(json.impact);
        }
      } catch {
        if (!cancelled) setError("Could not load impact preview.");
      } finally {
        if (!cancelled) setImpactLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modalOpen, pending, customer.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = getSupabaseBrowser();
      const token = (await sb?.auth.getSession())?.data.session?.access_token;
      if (!token) {
        if (!cancelled) setInlineImpact(null);
        return;
      }
      if (!cancelled) setInlineImpactLoading(true);
      try {
        const res = await fetch(`/api/admin/customers/${encodeURIComponent(customer.id)}/billing`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string; impact?: ImpactPreview };
        if (!res.ok || !json.impact) {
          if (!cancelled) setInlineImpact(null);
          return;
        }
        if (!cancelled) setInlineImpact(json.impact);
      } catch {
        if (!cancelled) setInlineImpact(null);
      } finally {
        if (!cancelled) setInlineImpactLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customer.id, customer.billing_type, customer.schedule_type]);

  const applyPatch = useCallback(
    async (body: Pending & { confirm?: boolean; confirm_strict?: boolean }) => {
      if (patchInFlightRef.current) return;
      patchInFlightRef.current = true;
      setSaving(true);
      setError(null);
      try {
        const sb = getSupabaseBrowser();
        const token = (await sb?.auth.getSession())?.data.session?.access_token;
        if (!token) {
          setError("Not signed in.");
          return;
        }

        const idem = billingIdempotencyKeyRef.current;
        const idemHeaders =
          idem != null && idem.length > 0
            ? ({ "Idempotency-Key": idem } as Record<string, string>)
            : ({} as Record<string, string>);

        type PatchJson = {
          ok?: boolean;
          error?: string;
          code?: string;
          requires_confirmation?: boolean;
          requires_strict_confirmation?: boolean;
          billing_type?: string;
          schedule_type?: string;
          schedule_enforced?: boolean;
          details?: { bookings_count?: number; invoice_status?: string | null };
        };

        let patch: Pending & { confirm?: boolean; confirm_strict?: boolean } = { ...body };
        for (let _strictRetry = 0; _strictRetry < 2; _strictRetry++) {
          const res = await fetch(`/api/admin/customers/${encodeURIComponent(customer.id)}/billing`, {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              ...idemHeaders,
            },
            body: JSON.stringify({
              billing_type: patch.billing_type,
              schedule_type: patch.schedule_type,
              ...(patch.confirm ? { confirm: true } : {}),
              ...(patch.confirm_strict ? { confirm_strict: true } : {}),
            }),
          });
          const idempotentReplayed = res.headers.get("X-Idempotent-Replayed") === "1";
          let json: PatchJson;
          try {
            json = (await res.json()) as PatchJson;
          } catch {
            json = {};
          }
          if (!res.ok) {
            setError(
              typeof json.error === "string"
                ? json.error
                : "Could not update billing. Check your connection and try again.",
            );
            return;
          }
          if (json.requires_confirmation && !patch.confirm) {
            setActivityWarn({
              bookings_count: typeof json.details?.bookings_count === "number" ? json.details.bookings_count : 0,
              invoice_status:
                typeof json.details?.invoice_status === "string" || json.details?.invoice_status === null
                  ? (json.details?.invoice_status ?? null)
                  : null,
            });
            return;
          }
          if (json.requires_strict_confirmation === true && !patch.confirm_strict) {
            setStrictWarn(true);
            setActivityWarn({
              bookings_count: typeof json.details?.bookings_count === "number" ? json.details.bookings_count : 0,
              invoice_status:
                typeof json.details?.invoice_status === "string" || json.details?.invoice_status === null
                  ? (json.details?.invoice_status ?? null)
                  : null,
            });
            patch = { ...patch, confirm: true, confirm_strict: true };
            continue;
          }
          if (typeof json.billing_type === "string" && typeof json.schedule_type === "string") {
            onBillingUpdated({ billing_type: json.billing_type, schedule_type: json.schedule_type });
            if (
              idempotentReplayed &&
              (json.code === BillingSwitchCode.NO_CHANGE || json.code === BillingSwitchCode.UPDATED)
            ) {
              setBillingSuccess("No changes applied (already updated).");
            } else {
              const base = `✔ Billing updated to ${billingSuccessLabel(json.billing_type)}`;
              const monthlyCoercionLine = " Schedule set to On-demand (required for monthly billing).";
              const extra =
                normBilling(json.billing_type) === "monthly" || json.schedule_enforced === true
                  ? monthlyCoercionLine
                  : "";
              setBillingSuccess(base + extra);
            }
            window.setTimeout(() => setBillingSuccess(null), 6000);
          }
          resetModal();
          setModalOpen(false);
          return;
        }
        setError("Could not complete billing update. Try again.");
        return;
      } catch {
        setError("Could not update billing. Check your connection and try again.");
      } finally {
        patchInFlightRef.current = false;
        setSaving(false);
      }
    },
    [customer.id, onBillingUpdated, resetModal],
  );

  const onConfirm = useCallback(() => {
    if (!pending || saving || patchInFlightRef.current) return;
    trackAdminBillingSwitchClicked({
      customer_id: customer.id,
      action: "confirm",
      billing_to: pending.billing_type,
    });
    void applyPatch({
      ...pending,
      confirm: activityWarn != null,
      confirm_strict: strictWarn,
    });
  }, [activityWarn, applyPatch, customer.id, pending, saving, strictWarn]);

  const segBtn = (active: boolean) =>
    cn(
      "h-9 rounded-lg px-3 text-sm font-medium transition-colors",
      active
        ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
        : "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800",
    );

  return (
    <div className="mt-3 space-y-3 border-t border-zinc-200 pt-3 dark:border-zinc-700">
      {billingSuccess ? (
        <p
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
          role="status"
        >
          {billingSuccess}
        </p>
      ) : null}

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Billing</Label>
        {inlineImpactLoading ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">This month (Johannesburg): loading…</p>
        ) : inlineImpact ? (
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            This month: {inlineImpact.bookings_count} booking{inlineImpact.bookings_count === 1 ? "" : "s"}
            {" · "}
            Invoice:{" "}
            {inlineImpact.invoice_status != null ? inlineImpact.invoice_status : "none"}
            {inlineImpact.invoice_month ? ` (${inlineImpact.invoice_month})` : ""}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={controlsLocked}
            className={segBtn(currentBilling === "per_booking")}
            onClick={() => openChange({ billing_type: "per_booking", schedule_type: currentSchedule })}
          >
            Per booking
          </button>
          <button
            type="button"
            disabled={controlsLocked}
            className={segBtn(currentBilling === "monthly" || (modalOpen && pending?.billing_type === "monthly"))}
            onClick={() => openChange({ billing_type: "monthly", schedule_type: "on_demand" })}
          >
            Monthly
          </button>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Schedule</Label>
        {monthlyLocksSchedule ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Monthly billing requires on-demand schedule.</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={controlsLocked || monthlyLocksSchedule}
            title={monthlyLocksSchedule ? "Monthly billing requires on-demand schedule." : undefined}
            className={segBtn(scheduleHighlight === "fixed_schedule")}
            onClick={() => openChange({ billing_type: currentBilling, schedule_type: "fixed_schedule" })}
          >
            Fixed
          </button>
          <button
            type="button"
            disabled={controlsLocked}
            className={segBtn(scheduleHighlight === "on_demand")}
            onClick={() => openChange({ billing_type: currentBilling, schedule_type: "on_demand" })}
          >
            On-demand
          </button>
        </div>
      </div>

      {service === "airbnb" && currentBilling === "per_booking" ? (
        <div
          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
          role="status"
        >
          <p className="font-medium">
            This customer is set to per-booking. Airbnb customers should use monthly billing.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 border-amber-700/40 bg-white text-amber-950 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-50"
            disabled={controlsLocked}
            onClick={() => openChange({ billing_type: "monthly", schedule_type: "on_demand" })}
          >
            Switch to monthly billing
          </Button>
        </div>
      ) : null}

      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) resetModal();
        }}
      >
        <DialogContent className="max-w-md" aria-busy={saving}>
          <DialogHeader>
            <DialogTitle>Switch billing type?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-left text-sm text-zinc-700 dark:text-zinc-300">
                {impactLoading ? <p className="text-xs text-zinc-500">Loading impact for this month…</p> : null}
                {impactPreview && !impactLoading ? (
                  <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-200">
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">This month (Johannesburg)</p>
                    <p className="mt-1">
                      Bookings: {impactPreview.bookings_count}
                      {" · "}
                      Invoice:{" "}
                      {impactPreview.invoice_status != null
                        ? impactPreview.invoice_status
                        : "none for this bucket"}
                      {impactPreview.invoice_month ? ` (${impactPreview.invoice_month})` : ""}
                    </p>
                    <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                      Changing billing may affect how this month&apos;s work is charged or invoiced.
                    </p>
                  </div>
                ) : null}

                {pending && currentBilling === "monthly" && pending.billing_type === "per_booking" ? (
                  <div
                    className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100"
                    role="alert"
                  >
                    <p className="font-medium">Switching to per-booking</p>
                    <p className="mt-1 text-xs">
                      Payment links will be sent again when bookings are created. The monthly invoice flow for this
                      customer will stop for new visits.
                    </p>
                  </div>
                ) : null}

                {pending && pending.billing_type === "monthly" ? (
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    Schedule will be set to <span className="font-semibold text-zinc-900 dark:text-zinc-100">On-demand</span>{" "}
                    (required for monthly billing).
                  </p>
                ) : null}

                {pending && pending.billing_type !== currentBilling ? (
                  <p>
                    {pending.billing_type === "monthly" ? (
                      <>
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">Monthly:</span> visits roll into
                        the monthly invoice — no Paystack link per visit; settled at month-end per your rules.
                      </>
                    ) : (
                      <>
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">Per booking:</span> a payment
                        link is generated and sent when each booking is created.
                      </>
                    )}
                  </p>
                ) : null}
                {pending && pending.schedule_type !== currentSchedule ? (
                  <p>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">Schedule:</span>{" "}
                    {pending.schedule_type === "on_demand"
                      ? "On-demand — no auto-generated visits from a recurring template."
                      : "Fixed — recurring engine may create future visits where configured."}
                  </p>
                ) : null}
                {activityWarn ? (
                  <div
                    className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100"
                    role="alert"
                  >
                    <p className="font-medium">Confirm: this customer already has activity this month (Johannesburg).</p>
                    <p className="mt-1 text-xs">
                      Bookings this month: {activityWarn.bookings_count}
                      {activityWarn.invoice_status != null ? ` · Invoice: ${activityWarn.invoice_status}` : ""}
                      . Changing billing may affect invoicing — confirm only if you intend this.
                    </p>
                  </div>
                ) : null}
                {strictWarn ? (
                  <div
                    className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-rose-950 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100"
                    role="alert"
                  >
                    <p className="font-medium">Mid-cycle monthly billing change</p>
                    <p className="mt-1 text-xs">
                      This customer has both bookings and a monthly invoice this month. Confirm again only if your team
                      intends to change billing mid-cycle.
                    </p>
                  </div>
                ) : null}
                {error ? (
                  <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                    {error}
                  </p>
                ) : null}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => {
                resetModal();
                setModalOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button type="button" disabled={saving || !pending} onClick={() => void onConfirm()}>
              {saving
                ? "Saving…"
                : strictWarn
                  ? "Confirm mid-cycle switch"
                  : activityWarn
                    ? "Update billing (I understand)"
                    : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
