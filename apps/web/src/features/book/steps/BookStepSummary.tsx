"use client";

import { format } from "date-fns";
import { getServiceLabel } from "@/components/booking/serviceCategories";
import { formatCheckoutAddress } from "@/lib/booking/formatCheckoutAddress";
import { Button } from "@/components/ui/button";
import type { BookCustomerDetails, BookFlowFormState } from "@/src/features/book/bookFlowTypes";
import { bookServiceIdFromForm } from "@/src/features/book/bookFlowTypes";

type BookStepSummaryProps = {
  form: BookFlowFormState;
  customer: BookCustomerDetails;
  confirming: boolean;
  confirmError: string | null;
  onConfirm: () => void;
};

function formatScheduleLabel(date: string, time: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Not set";
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const day = format(dt, "EEE d MMM yyyy");
  return `${day} at ${time}`;
}

function formatPrice(zar: number | null): string {
  if (zar == null || !Number.isFinite(zar)) return "—";
  return `R${Math.round(zar).toLocaleString("en-ZA")}`;
}

export function BookStepSummary({ form, customer, confirming, confirmError, onConfirm }: BookStepSummaryProps) {
  const serviceLabel = getServiceLabel(bookServiceIdFromForm(form.service));
  const propertyLine = formatCheckoutAddress({
    serviceAreaName: form.serviceAreaName,
    streetAddress: form.location,
  });
  const bedsLine = `${form.bedrooms} bed${form.bedrooms === 1 ? "" : "s"} · ${form.bathrooms} bath${form.bathrooms === 1 ? "" : "s"}${
    form.extraRooms > 0 ? ` · ${form.extraRooms} extra room${form.extraRooms === 1 ? "" : "s"}` : ""
  }`;

  return (
    <section className="space-y-6" aria-labelledby="book-step-summary-heading">
      <div>
        <h1
          id="book-step-summary-heading"
          className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
        >
          Booking summary
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Review your booking details before confirming.
        </p>
      </div>

      <dl className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-700 dark:bg-zinc-900">
        <SummaryRow label="Service" value={serviceLabel} />
        <SummaryRow label="Property" value={`${propertyLine}\n${bedsLine}`} multiline />
        <SummaryRow label="Date & time" value={formatScheduleLabel(form.date, form.time)} />
        <SummaryRow label="Cleaner" value={form.cleaner?.name ?? "Not selected"} />
        <SummaryRow label="Full name" value={customer.fullName || "—"} />
        <SummaryRow label="Cell number" value={customer.phone || "—"} />
        <SummaryRow label="Email" value={customer.email || "—"} />
        <SummaryRow label="Estimated price" value={formatPrice(form.estimatedPriceZar)} highlight />
      </dl>

      {confirmError ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200" role="alert">
          {confirmError}
        </p>
      ) : null}

      <Button
        type="button"
        size="lg"
        disabled={confirming || !customer.email || !customer.fullName || !customer.phone}
        onClick={onConfirm}
        className="h-12 w-full rounded-2xl text-base font-semibold"
      >
        {confirming ? "Confirming…" : "Confirm booking"}
      </Button>
    </section>
  );
}

function SummaryRow({
  label,
  value,
  multiline = false,
  highlight = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd
        className={[
          "text-sm font-medium text-zinc-900 dark:text-zinc-50",
          multiline ? "whitespace-pre-line text-right sm:max-w-[60%]" : "",
          highlight ? "text-lg font-semibold text-emerald-700 dark:text-emerald-400" : "",
        ].join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}
