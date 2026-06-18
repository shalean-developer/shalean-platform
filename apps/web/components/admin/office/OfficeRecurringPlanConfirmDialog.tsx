"use client";

import { AlertTriangle, Loader2, RotateCcw, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type OfficeRecurringPlanConfirmTarget = {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  service_label: string | null;
  frequency: string;
  next_run_date: string | null;
  price: number;
};

export type RecurringPlanConfirmVariant = "cancel" | "backfill";

type OfficeRecurringPlanConfirmDialogProps = {
  open: boolean;
  variant: RecurringPlanConfirmVariant | null;
  plan: OfficeRecurringPlanConfirmTarget | null;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

const FREQ_LABELS: Record<string, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  biweekly: "Fortnightly",
  monthly: "Monthly",
  custom: "Custom",
};

const VARIANT_CONFIG = {
  cancel: {
    icon: XCircle,
    iconCls: "bg-red-100 text-red-700",
    title: "Cancel recurring plan?",
    description: "The schedule stops generating new visits. Bookings already created for this plan will stay on the calendar.",
    warningTitle: "What happens next",
    warningItems: [
      "No new visits will be scheduled after cancellation",
      "Existing generated bookings are not removed automatically",
      "You can still view or manage those visits from Bookings",
    ],
    dismissLabel: "Keep plan",
    confirmLabel: "Cancel plan",
    confirmBusyLabel: "Cancelling…",
    confirmCls: "bg-red-600 hover:bg-red-700",
  },
  backfill: {
    icon: RotateCcw,
    iconCls: "bg-blue-100 text-blue-700",
    title: "Backfill missing visits?",
    description: "Creates recurring visit rows for the current Johannesburg calendar month. Dates that already exist are skipped.",
    warningTitle: "Safe to run",
    warningItems: [
      "Only missing dates in the current month are added",
      "Duplicate dates are skipped automatically",
      "Active or paused plans can be backfilled",
    ],
    dismissLabel: "Not now",
    confirmLabel: "Backfill visits",
    confirmBusyLabel: "Backfilling…",
    confirmCls: "bg-blue-600 hover:bg-blue-700",
  },
} as const;

export function OfficeRecurringPlanConfirmDialog({
  open,
  variant,
  plan,
  busy = false,
  onOpenChange,
  onConfirm,
}: OfficeRecurringPlanConfirmDialogProps) {
  const config = variant ? VARIANT_CONFIG[variant] : null;
  const Icon = config?.icon ?? XCircle;
  const customer = plan?.customer_name ?? plan?.customer_email ?? "Unknown customer";
  const frequency = plan ? (FREQ_LABELS[plan.frequency.toLowerCase()] ?? plan.frequency) : "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="max-w-md border-slate-200 p-0 dark:border-slate-800">
        {config ? (
          <>
            <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
              <DialogHeader className="space-y-3 text-left">
                <div className={cn("flex h-11 w-11 items-center justify-center rounded-2xl", config.iconCls)}>
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <DialogTitle className="text-xl text-slate-900 dark:text-slate-50">{config.title}</DialogTitle>
                  <DialogDescription className="mt-1.5 text-slate-600 dark:text-slate-400">
                    {config.description}
                  </DialogDescription>
                </div>
              </DialogHeader>
            </div>

            {plan ? (
              <div className="space-y-4 px-6 py-5">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
                  <p className="font-mono text-xs font-bold uppercase tracking-wide text-blue-600">
                    {plan.id.slice(0, 8)}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{customer}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{plan.service_label ?? "Standard Cleaning"}</p>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>{frequency}</span>
                    {plan.next_run_date ? <span>Next: {plan.next_run_date}</span> : null}
                    <span>R {Math.round(plan.price ?? 0).toLocaleString("en-ZA")}/visit</span>
                  </div>
                </div>

                <div
                  className={cn(
                    "rounded-xl border px-4 py-3",
                    variant === "cancel"
                      ? "border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30"
                      : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50",
                  )}
                >
                  <div className="flex gap-2">
                    <AlertTriangle
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        variant === "cancel" ? "text-amber-700 dark:text-amber-400" : "text-slate-500",
                      )}
                      aria-hidden
                    />
                    <div>
                      <p
                        className={cn(
                          "text-sm font-semibold",
                          variant === "cancel"
                            ? "text-amber-950 dark:text-amber-100"
                            : "text-slate-800 dark:text-slate-100",
                        )}
                      >
                        {config.warningTitle}
                      </p>
                      <ul
                        className={cn(
                          "mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed",
                          variant === "cancel"
                            ? "text-amber-900/90 dark:text-amber-100/90"
                            : "text-slate-600 dark:text-slate-400",
                        )}
                      >
                        {config.warningItems.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <DialogFooter className="gap-2 border-t border-slate-100 px-6 py-4 sm:justify-end dark:border-slate-800">
              <button
                type="button"
                disabled={busy}
                onClick={() => onOpenChange(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {config.dismissLabel}
              </button>
              <button
                type="button"
                disabled={busy || !plan}
                onClick={onConfirm}
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50",
                  config.confirmCls,
                )}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Icon className="h-4 w-4" aria-hidden />
                )}
                {busy ? config.confirmBusyLabel : config.confirmLabel}
              </button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
