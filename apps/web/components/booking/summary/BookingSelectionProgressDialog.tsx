"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SelectedExtraRow } from "@/components/booking/BookingSelectedExtrasList";
import { formatCheckoutDateOnly, formatCheckoutTimeDisplay } from "@/components/booking/summary/formatCheckoutWhenLabel";
import type { CheckoutSummaryStep } from "@/lib/booking/checkoutSidebarPricing";

const STEP_TITLES: readonly [string, string, string, string] = [
  "Your home & service",
  "When should we come?",
  "Preferred cleaner",
  "Review & pay",
];

type BookingSelectionProgressDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checkoutStep: CheckoutSummaryStep;
  whatLabel: string;
  bedrooms: number;
  bathrooms: number;
  extraRooms: number;
  extrasRows: SelectedExtraRow[];
  whereLabel: string;
  bookingDate: string | null;
  bookingTime: string | null;
  cleanerId: string | null;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
};

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="shrink-0 text-gray-500 dark:text-zinc-400">{label}</span>
      <span className="min-w-0 text-right font-medium text-gray-900 dark:text-zinc-100">{value}</span>
    </div>
  );
}

function StepBlock({ stepNumber, title, children }: { stepNumber: number; title: string; children: ReactNode }) {
  return (
    <section className="border-b border-gray-100 pb-4 last:border-b-0 last:pb-0 dark:border-zinc-800">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
        Step {stepNumber} — {title}
      </h3>
      <div className="mt-2 space-y-0.5">{children}</div>
    </section>
  );
}

export function BookingSelectionProgressDialog({
  open,
  onOpenChange,
  checkoutStep,
  whatLabel,
  bedrooms,
  bathrooms,
  extraRooms,
  extrasRows,
  whereLabel,
  bookingDate,
  bookingTime,
  cleanerId,
  customerName,
  customerEmail,
  customerPhone,
}: BookingSelectionProgressDialogProps) {
  const [cleanerName, setCleanerName] = useState<string | null>(null);
  const [cleanerLoading, setCleanerLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!cleanerId) {
      setCleanerName(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setCleanerLoading(true);
      try {
        const res = await fetch("/api/cleaners/available");
        const json = (await res.json()) as { cleaners?: unknown[] };
        const raw = Array.isArray(json.cleaners) ? json.cleaners : [];
        let name: string | null = null;
        for (const row of raw) {
          if (!row || typeof row !== "object") continue;
          const r = row as Record<string, unknown>;
          const id = typeof r.id === "string" ? r.id : "";
          if (id === cleanerId) {
            name = typeof r.name === "string" && r.name.trim() ? r.name.trim() : "Selected cleaner";
            break;
          }
        }
        if (!cancelled) setCleanerName(name);
      } catch {
        if (!cancelled) setCleanerName("Selected cleaner");
      } finally {
        if (!cancelled) setCleanerLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, cleanerId]);

  const extrasSummary =
    extrasRows.length === 0
      ? "None"
      : extrasRows.map((r) => r.label).join(", ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(85dvh,640px)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-left text-base font-semibold text-gray-900 dark:text-zinc-50">
            Your selection so far
          </DialogTitle>
          <p className="text-left text-sm font-normal text-gray-500 dark:text-zinc-400">
            Each step adds more detail. You are on step {checkoutStep} of 4.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {checkoutStep >= 1 ? (
            <StepBlock stepNumber={1} title={STEP_TITLES[0]!}>
              <DetailLine label="Service" value={whatLabel} />
              <DetailLine label="Bedrooms" value={String(bedrooms)} />
              <DetailLine label="Bathrooms" value={String(bathrooms)} />
              <DetailLine label="Extra rooms" value={String(extraRooms)} />
              <DetailLine label="Extras" value={extrasSummary} />
            </StepBlock>
          ) : null}

          {checkoutStep >= 2 ? (
            <StepBlock stepNumber={2} title={STEP_TITLES[1]!}>
              <DetailLine label="Where" value={whereLabel} />
              <DetailLine label="Date" value={formatCheckoutDateOnly(bookingDate)} />
              <DetailLine label="Time" value={formatCheckoutTimeDisplay(bookingTime)} />
            </StepBlock>
          ) : null}

          {checkoutStep >= 3 ? (
            <StepBlock stepNumber={3} title={STEP_TITLES[2]!}>
              <DetailLine
                label="Cleaner"
                value={
                  cleanerLoading
                    ? "Loading…"
                    : !cleanerId || cleanerId === ""
                      ? "Best available (auto-match)"
                      : cleanerName ?? "Selected cleaner"
                }
              />
            </StepBlock>
          ) : null}

          {checkoutStep >= 4 ? (
            <StepBlock stepNumber={4} title={STEP_TITLES[3]!}>
              <DetailLine label="Name" value={customerName?.trim() || "—"} />
              <DetailLine label="Email" value={customerEmail?.trim() || "—"} />
              <DetailLine label="Phone" value={customerPhone?.trim() || "—"} />
            </StepBlock>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
