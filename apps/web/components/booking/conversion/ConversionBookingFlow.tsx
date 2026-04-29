"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BookingSummary } from "@/components/booking/conversion/BookingSummary";
import { ConversionBookingStep1 } from "@/components/booking/conversion/ConversionBookingStep1";
import { ConversionBookingStep2 } from "@/components/booking/conversion/ConversionBookingStep2";
import {
  CONVERSION_CHECKOUT_STORAGE_KEY,
  initialConversionFormState,
  type ConversionBookingFormState,
} from "@/components/booking/conversion/conversionBookingTypes";
import { BOOKING_DATA_STORAGE_KEY, parseWidgetIntakeFromUnknown } from "@/lib/booking/bookingWidgetDraft";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ConversionBookingFlow() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState<ConversionBookingFormState>(() => initialConversionFormState());
  const [isLocked, setIsLocked] = useState(false);
  const [locking, setLocking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  /** Homepage estimate widget already captured date, time & area — hide those editors on step 1. */
  const [scheduleFromHomeEstimate, setScheduleFromHomeEstimate] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(BOOKING_DATA_STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      const intake = parseWidgetIntakeFromUnknown(parsed);
      if (!intake) return;
      if (intake.estimateOnly) {
        setScheduleFromHomeEstimate(true);
        setForm((prev) => ({
          ...prev,
          service: intake.service,
          date: intake.date,
          time: intake.time,
          address: intake.location?.trim() ? intake.location : prev.address,
          ...(intake.serviceAreaLocationId
            ? {
                serviceAreaLocationId: intake.serviceAreaLocationId,
                serviceAreaCityId: intake.serviceAreaCityId ?? null,
                serviceAreaName: intake.serviceAreaName ?? "",
              }
            : {}),
        }));
        return;
      }
      setForm((prev) => ({
        ...prev,
        service: intake.service,
        bedrooms: intake.bedrooms,
        bathrooms: intake.bathrooms,
        extraRooms: intake.extraRooms ?? 0,
        extras: [...intake.extras],
        date: intake.date,
        time: intake.time,
        address: intake.location?.trim() ? intake.location : prev.address,
        ...(intake.serviceAreaLocationId
          ? {
              serviceAreaLocationId: intake.serviceAreaLocationId,
              serviceAreaCityId: intake.serviceAreaCityId ?? null,
              serviceAreaName: intake.serviceAreaName ?? "",
            }
          : {}),
      }));
    } catch {
      /* ignore */
    }
  }, []);

  const step1Ready = useMemo(() => {
    return Boolean(
      form.date &&
        form.time &&
        form.bedrooms >= 1 &&
        form.bathrooms >= 1 &&
        form.serviceAreaLocationId &&
        /^\d{4}-\d{2}-\d{2}$/.test(form.date),
    );
  }, [form.date, form.time, form.bedrooms, form.bathrooms, form.serviceAreaLocationId]);

  const lockPriceAndContinue = useCallback(async () => {
    if (!step1Ready || locking) return;
    setLocking(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service: form.service,
          bedrooms: form.bedrooms,
          bathrooms: form.bathrooms,
          extraRooms: form.extraRooms,
          extras: form.extras,
          date: form.date,
          time: form.time,
          location: "",
          dryRun: true,
        }),
      });
      const json = (await res.json()) as { total_paid_zar?: number; error?: string };
      if (!res.ok) {
        setSubmitError(typeof json.error === "string" ? json.error : "Could not lock price.");
        return;
      }
      const n = json.total_paid_zar;
      if (typeof n !== "number" || !Number.isFinite(n)) {
        setSubmitError("Invalid price from server.");
        return;
      }
      setSubmitError(null);
      setForm((p) => ({ ...p, price: Math.round(n) }));
      setIsLocked(true);
      setStep(2);
    } catch {
      setSubmitError("Network error. Check your connection and try again.");
    } finally {
      setLocking(false);
    }
  }, [
    form.bathrooms,
    form.bedrooms,
    form.extraRooms,
    form.date,
    form.extras,
    form.service,
    form.time,
    form.serviceAreaLocationId,
    locking,
    step1Ready,
  ]);

  const step2Ready = useMemo(() => {
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
    const addressOk =
      form.serviceAreaLocationId != null
        ? true
        : form.address.trim().length >= 3;
    return (
      emailOk &&
      form.name.trim().length >= 2 &&
      form.phone.trim().length >= 5 &&
      addressOk &&
      form.price != null &&
      isLocked
    );
  }, [form.email, form.name, form.phone, form.address, form.serviceAreaLocationId, form.price, isLocked]);

  const handleSubmit = useCallback(() => {
    if (!step2Ready || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      sessionStorage.setItem(CONVERSION_CHECKOUT_STORAGE_KEY, JSON.stringify({ form }));
      router.push("/checkout");
    } catch {
      setSubmitError("Could not open checkout. Try again or use private mode off.");
    } finally {
      setSubmitting(false);
    }
  }, [form, router, step2Ready, submitting]);

  const mobilePrimaryLabel =
    step === 1 ? (locking ? "Locking your price…" : "Continue") : submitting ? "Opening payment…" : "Continue to payment";

  const mobilePrimaryAction = step === 1 ? () => void lockPriceAndContinue() : () => void handleSubmit();
  const mobilePrimaryDisabled =
    step === 1 ? !step1Ready || locking : !step2Ready || submitting;

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="border-b border-zinc-200/80 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Book a clean</p>
          <div className="flex items-center gap-3" role="status" aria-live="polite">
            <span
              className={cn(
                "h-2 flex-1 rounded-full sm:max-w-[200px]",
                step >= 1 ? "bg-emerald-500" : "bg-zinc-200 dark:bg-zinc-700",
              )}
            />
            <span className="text-xs font-medium tabular-nums text-zinc-500 dark:text-zinc-400">Step {step} of 2</span>
            <span
              className={cn(
                "h-2 flex-1 rounded-full sm:max-w-[200px]",
                step >= 2 ? "bg-emerald-500" : "bg-zinc-200 dark:bg-zinc-700",
              )}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-10 lg:py-10">
        <div className={cn("min-w-0", "pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-0")}>
          {step === 1 ? (
            <ConversionBookingStep1
              form={form}
              setForm={setForm}
              onContinue={() => void lockPriceAndContinue()}
              continueDisabled={!step1Ready}
              locking={locking}
              hideScheduleFields={scheduleFromHomeEstimate}
            />
          ) : (
            <ConversionBookingStep2
              form={form}
              setForm={setForm}
              onSubmit={() => void handleSubmit()}
              submitDisabled={!step2Ready}
              loading={submitting}
              error={submitError}
            />
          )}
        </div>

        <div className="hidden lg:block">
          <BookingSummary
            form={form}
            isLocked={isLocked}
            variant="sidebar"
            schedulePrefilledFromHome={scheduleFromHomeEstimate}
          />
        </div>
      </div>

      {/* Mobile: sticky summary + primary CTA */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 lg:hidden",
          "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        )}
      >
        <BookingSummary
          form={form}
          isLocked={isLocked}
          variant="mobileDock"
          schedulePrefilledFromHome={scheduleFromHomeEstimate}
        />
        {submitError ? (
          <div className="border-x border-t border-zinc-200 bg-red-50 px-4 py-2 dark:border-zinc-700 dark:bg-red-950/40">
            <p className="text-center text-xs font-medium text-red-800 dark:text-red-200" role="alert">
              {submitError}
            </p>
          </div>
        ) : null}
        <div className="border-t border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900">
          <Button
            type="button"
            size="lg"
            disabled={mobilePrimaryDisabled}
            onClick={mobilePrimaryAction}
            className="h-14 w-full rounded-2xl text-base font-bold shadow-md"
          >
            {mobilePrimaryLabel}
          </Button>
        </div>
      </div>

      {/* Desktop duplicate error for step 1 (step1 has no inline error slot) */}
      {step === 1 && submitError ? (
        <div className="mx-auto hidden max-w-6xl px-4 pb-4 lg:block">
          <p className="text-sm font-medium text-red-700 dark:text-red-400" role="alert">
            {submitError}
          </p>
        </div>
      ) : null}
    </div>
  );
}
