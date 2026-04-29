"use client";

import { Button } from "@/components/ui/button";
import type { ConversionBookingFormState } from "@/components/booking/conversion/conversionBookingTypes";
import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConversionBookingStep2Props = {
  form: ConversionBookingFormState;
  setForm: React.Dispatch<React.SetStateAction<ConversionBookingFormState>>;
  onSubmit: () => void;
  submitDisabled: boolean;
  loading: boolean;
  error: string | null;
};

export function ConversionBookingStep2({
  form,
  setForm,
  onSubmit,
  submitDisabled,
  loading,
  error,
}: ConversionBookingStep2Props) {
  const inputClass =
    "h-14 w-full rounded-2xl border border-zinc-200/90 bg-white px-4 text-base text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";

  return (
    <section className="space-y-6 pb-4 lg:pb-0" aria-labelledby="conversion-step2-heading">
      <div>
        <h1 id="conversion-step2-heading" className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
          Your details
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Almost done — add your contact info so we can confirm your clean.</p>
      </div>

      <div className="space-y-2">
        <label htmlFor="conv-email" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Email
        </label>
        <input
          id="conv-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={(e) => setForm((p) => ({ ...p, email: e.target.value.trim() }))}
          className={inputClass}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="conv-name" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Full name
        </label>
        <input
          id="conv-name"
          autoComplete="name"
          placeholder="Jane Doe"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          className={inputClass}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="conv-phone" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Phone number
        </label>
        <input
          id="conv-phone"
          type="tel"
          autoComplete="tel"
          placeholder="082 000 0000"
          value={form.phone}
          onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
          className={inputClass}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="conv-address" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {form.serviceAreaLocationId ? "Street / unit (optional)" : "Service address"}
        </label>
        <input
          id="conv-address"
          type="text"
          autoComplete="street-address"
          placeholder={
            form.serviceAreaLocationId ? "Gate, unit, street number…" : "Street, suburb, city"
          }
          value={form.address}
          onChange={(e) => setForm((p) => ({ ...p, address: e.target.value.slice(0, 500) }))}
          className={inputClass}
        />
      </div>

      <div
        className="rounded-2xl border border-zinc-200/80 bg-zinc-50/90 p-4 dark:border-zinc-700 dark:bg-zinc-900/50"
        role="region"
        aria-label="Trust and guarantees"
      >
        <ul className="space-y-3 text-sm font-medium text-zinc-800 dark:text-zinc-200">
          <li className="flex items-start gap-2">
            <Lock className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <span>Secure payment via Paystack</span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <span>No hidden fees</span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <span>Cancel anytime before we dispatch</span>
          </li>
        </ul>
      </div>

      {error ? (
        <p className="hidden text-sm font-medium text-red-700 dark:text-red-400 lg:block" role="alert">
          {error}
        </p>
      ) : null}

      <div className="hidden lg:block">
        <Button
          type="button"
          size="lg"
          disabled={submitDisabled || loading}
          onClick={onSubmit}
          className={cn("h-14 w-full rounded-2xl text-base font-bold shadow-md")}
        >
          {loading ? "Opening payment…" : "Continue to secure payment"}
        </Button>
      </div>
    </section>
  );
}
