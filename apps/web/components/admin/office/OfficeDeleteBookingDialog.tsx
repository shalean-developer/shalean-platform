"use client";

import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type OfficeDeleteBookingTarget = {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  service: string | null;
  service_slug: string | null;
  date: string | null;
  time: string | null;
  status: string | null;
};

type OfficeDeleteBookingDialogProps = {
  open: boolean;
  booking: OfficeDeleteBookingTarget | null;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

const BLOCKED_REASONS = [
  "Paid or completed bookings",
  "Monthly invoice line items",
  "Cleaner payouts or frozen earnings",
  "Any booking with recorded payment",
] as const;

export function OfficeDeleteBookingDialog({
  open,
  booking,
  busy = false,
  onOpenChange,
  onConfirm,
}: OfficeDeleteBookingDialogProps) {
  const customer = booking?.customer_name ?? booking?.customer_email ?? "Unknown customer";
  const service = (booking?.service_slug ?? booking?.service ?? "service").replace(/-/g, " ");
  const when =
    booking?.date != null
      ? `${booking.date}${booking.time ? ` · ${booking.time.slice(0, 5)}` : ""}`
      : "Date not set";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="max-w-md border-slate-200 p-0 dark:border-slate-800">
        <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
          <DialogHeader className="space-y-3 text-left">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-100 text-red-700">
              <Trash2 className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <DialogTitle className="text-xl text-slate-900 dark:text-slate-50">Delete this booking?</DialogTitle>
              <DialogDescription className="mt-1.5 text-slate-600 dark:text-slate-400">
                This permanently removes the booking and related records. It cannot be undone.
              </DialogDescription>
            </div>
          </DialogHeader>
        </div>

        {booking ? (
          <div className="space-y-4 px-6 py-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
              <p className="font-mono text-xs font-bold uppercase tracking-wide text-blue-600">
                {booking.id.slice(0, 8)}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{customer}</p>
              <p className="mt-0.5 text-xs capitalize text-slate-500">{service}</p>
              <p className="mt-1 text-xs text-slate-500">{when}</p>
              {booking.status ? (
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Status: {booking.status.replace(/_/g, " ")}
                </p>
              ) : null}
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/30">
              <div className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
                <div>
                  <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">Some bookings cannot be deleted</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-amber-900/90 dark:text-amber-100/90">
                    {BLOCKED_REASONS.map((reason) => (
                      <li key={reason}>{reason}</li>
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
            Keep booking
          </button>
          <button
            type="button"
            disabled={busy || !booking}
            onClick={onConfirm}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50",
            )}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
            {busy ? "Deleting…" : "Delete permanently"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
