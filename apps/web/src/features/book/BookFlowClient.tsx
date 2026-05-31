"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useUser } from "@/hooks/useUser";
import { BookStepIndicator } from "@/src/features/book/components/BookStepIndicator";
import { BookFlowLayout } from "@/src/features/book/components/BookFlowLayout";
import { BookStepService } from "@/src/features/book/steps/BookStepService";
import { BookStepProperty } from "@/src/features/book/steps/BookStepProperty";
import { BookStepSchedule } from "@/src/features/book/steps/BookStepSchedule";
import { BookStepCleaner } from "@/src/features/book/steps/BookStepCleaner";
import { BookStepAuth } from "@/src/features/book/steps/BookStepAuth";
import { BookStepSummary } from "@/src/features/book/steps/BookStepSummary";
import {
  getBookFlowGateRedirect,
  isBookStepComplete,
  nextBookFlowStep,
  normalizeBookFlowStep,
  prevBookFlowStep,
} from "@/src/features/book/bookFlowSteps";
import {
  initialBookFlowFormState,
  type BookFlowFormState,
  type BookFlowStep,
} from "@/src/features/book/bookFlowTypes";
import {
  readBookFlowFormFromStorage,
  writeBookFlowFormToStorage,
  clearBookFlowFormFromStorage,
} from "@/src/features/book/bookFlowStorage";
import { useBookCustomerProfile } from "@/src/features/book/hooks/useBookCustomerProfile";
import { confirmBookFlowBooking } from "@/src/features/book/confirmBookFlowBooking";

function bookHref(step: BookFlowStep): string {
  return step === "service" ? "/book" : `/book?step=${step}`;
}

async function lockBookFlowPrice(form: BookFlowFormState): Promise<number | null> {
  try {
    const res = await fetch("/api/booking/widget-quote", {
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
        location: form.location,
      }),
    });
    const json = (await res.json()) as { total_paid_zar?: number };
    if (!res.ok || typeof json.total_paid_zar !== "number" || !Number.isFinite(json.total_paid_zar)) {
      return null;
    }
    return Math.round(json.total_paid_zar);
  } catch {
    return null;
  }
}

function BookFlowInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const step = normalizeBookFlowStep(searchParams.get("step"));
  const { user, loading: userLoading } = useUser();
  const isAuthenticated = Boolean(user);
  const { customer, loading: profileLoading, refresh: refreshProfile } = useBookCustomerProfile();

  const [form, setForm] = useState<BookFlowFormState>(() => readBookFlowFormFromStorage() ?? initialBookFlowFormState());
  const [continueBusy, setContinueBusy] = useState(false);
  const [continueError, setContinueError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const patchForm = useCallback((patch: Partial<BookFlowFormState>) => {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      writeBookFlowFormToStorage(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (userLoading) return;
    const redirect = getBookFlowGateRedirect(step, form, isAuthenticated);
    if (redirect && redirect !== step) {
      router.replace(bookHref(redirect));
    }
  }, [step, form, isAuthenticated, userLoading, router]);

  useEffect(() => {
    if (step !== "summary" || !isAuthenticated || form.estimatedPriceZar != null) return;
    let cancelled = false;
    void (async () => {
      const price = await lockBookFlowPrice(form);
      if (!cancelled && price != null) patchForm({ estimatedPriceZar: price });
    })();
    return () => {
      cancelled = true;
    };
  }, [step, isAuthenticated, form, patchForm]);

  const stepComplete = isBookStepComplete(step, form);
  const nextStep = nextBookFlowStep(step, isAuthenticated);
  const prevStep = prevBookFlowStep(step, isAuthenticated);

  const continueDisabled = useMemo(() => {
    if (step === "summary") return true;
    if (step === "auth") return true;
    return !stepComplete;
  }, [step, stepComplete]);

  const handleContinue = useCallback(async () => {
    if (!nextStep || continueBusy) return;
    setContinueError(null);

    if (step === "cleaner" && !isAuthenticated) {
      router.push(bookHref("auth"));
      return;
    }

    if (step === "cleaner" && isAuthenticated) {
      setContinueBusy(true);
      const price = await lockBookFlowPrice(form);
      setContinueBusy(false);
      if (price == null) {
        setContinueError("Could not calculate price. Try again.");
        return;
      }
      patchForm({ estimatedPriceZar: price });
    }

    if (nextStep === "summary" && isAuthenticated) {
      setContinueBusy(true);
      const price = form.estimatedPriceZar ?? (await lockBookFlowPrice(form));
      setContinueBusy(false);
      if (price == null) {
        setContinueError("Could not calculate price. Try again.");
        return;
      }
      patchForm({ estimatedPriceZar: price });
      await refreshProfile();
    }

    router.push(bookHref(nextStep));
  }, [nextStep, continueBusy, step, isAuthenticated, router, form, patchForm, refreshProfile]);

  const handleBack = useCallback(() => {
    if (!prevStep) return;
    router.push(bookHref(prevStep));
  }, [prevStep, router]);

  const handleAuthenticated = useCallback(async () => {
    setContinueError(null);
    setContinueBusy(true);
    const price = await lockBookFlowPrice(form);
    setContinueBusy(false);
    if (price == null) {
      setContinueError("Could not calculate price. Try again.");
      return;
    }
    patchForm({ estimatedPriceZar: price });
    await refreshProfile();
    router.push(bookHref("summary"));
    router.refresh();
  }, [form, patchForm, refreshProfile, router]);

  const handleConfirm = useCallback(async () => {
    if (!isAuthenticated || !customer || confirming) return;
    setConfirmError(null);
    setConfirming(true);
    try {
      const r = await confirmBookFlowBooking({ form });
      if (!r.success) {
        setConfirmError(r.error);
        return;
      }
      clearBookFlowFormFromStorage();
      router.push(`/booking/payment?bookingId=${encodeURIComponent(r.bookingId)}&mode=funnel`);
    } finally {
      setConfirming(false);
    }
  }, [isAuthenticated, customer, confirming, form, router]);

  const showLayoutNav = step !== "summary" && step !== "auth";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <BookStepIndicator current={step} skipAuth={isAuthenticated} />

      {continueError ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200" role="alert">
          {continueError}
        </p>
      ) : null}

      {step === "service" ? <BookStepService form={form} onChange={patchForm} /> : null}
      {step === "property" ? <BookStepProperty form={form} onChange={patchForm} /> : null}
      {step === "schedule" ? <BookStepSchedule form={form} onChange={patchForm} /> : null}
      {step === "cleaner" ? <BookStepCleaner form={form} onChange={patchForm} /> : null}
      {step === "auth" ? <BookStepAuth onAuthenticated={() => void handleAuthenticated()} /> : null}
      {step === "summary" && customer && !profileLoading ? (
        <BookStepSummary
          form={form}
          customer={customer}
          confirming={confirming}
          confirmError={confirmError}
          onConfirm={() => void handleConfirm()}
        />
      ) : null}
      {step === "summary" && (profileLoading || !customer) ? (
        <p className="text-sm text-zinc-500">Loading your account details…</p>
      ) : null}

      {showLayoutNav ? (
        <BookFlowLayout
          onBack={prevStep ? handleBack : undefined}
          onContinue={() => void handleContinue()}
          continueDisabled={continueDisabled}
          continueBusy={continueBusy}
          continueLabel={step === "cleaner" && !isAuthenticated ? "Continue to sign in" : "Continue"}
        />
      ) : step === "summary" && prevStep ? (
        <BookFlowLayout onBack={handleBack} />
      ) : null}

      <p className="text-center text-xs text-zinc-500">
        <Link href="/booking" className="underline-offset-2 hover:underline">
          Use the current booking flow
        </Link>
      </p>
    </div>
  );
}

export function BookFlowClient() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl px-4 py-16 text-center text-sm text-zinc-500">Loading booking flow…</div>
      }
    >
      <BookFlowInner />
    </Suspense>
  );
}
