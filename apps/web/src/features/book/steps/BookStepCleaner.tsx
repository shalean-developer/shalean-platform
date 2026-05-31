"use client";

import { useEffect, useMemo } from "react";
import { CleanerCard } from "@/components/booking/CleanerCard";
import { useCleaners, type LiveCleaner } from "@/components/booking/useCleaners";
import type { BookFlowFormState } from "@/src/features/book/bookFlowTypes";
import { bookServiceIdFromForm } from "@/src/features/book/bookFlowTypes";

const RECOMMEND_HINT = "Recommended based on your location and service.";

type BookStepCleanerProps = {
  form: BookFlowFormState;
  onChange: (patch: Partial<BookFlowFormState>) => void;
};

export function BookStepCleaner({ form, onChange }: BookStepCleanerProps) {
  const durationMinutes = 120;
  const serviceType = bookServiceIdFromForm(form.service);

  const { cleaners: pool, recommendedCleaner: recommended, loading, error } = useCleaners({
    selectedDate: form.date,
    selectedTime: form.time,
    durationMinutes,
    locationId: form.serviceAreaLocationId,
    serviceType,
  });

  const others = useMemo(() => {
    if (!recommended) return pool.slice(0, 4);
    return pool.filter((c) => c.id !== recommended.id).slice(0, 4);
  }, [pool, recommended]);

  useEffect(() => {
    if (!recommended || form.cleaner) return;
    onChange({ cleaner: { id: recommended.id, name: recommended.full_name } });
  }, [recommended, form.cleaner, onChange]);

  function selectCleaner(c: LiveCleaner) {
    onChange({ cleaner: { id: c.id, name: c.full_name } });
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="h-40 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900" />
        <div className="h-40 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-rose-700 dark:text-rose-400">{error}</p>;
  }

  if (pool.length === 0) {
    return (
      <p className="text-sm text-amber-800 dark:text-amber-400/90">
        No cleaners available for this time. Try a different slot.
      </p>
    );
  }

  return (
    <section className="space-y-4" aria-labelledby="book-step-cleaner-heading">
      <div>
        <h1
          id="book-step-cleaner-heading"
          className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
        >
          Choose your cleaner
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          We&apos;ve recommended the best match for your booking.
        </p>
      </div>

      {recommended ? (
        <CleanerCard
          cleaner={recommended}
          variant="featured"
          selected={form.cleaner?.id === recommended.id}
          onSelect={() => selectCleaner(recommended)}
          showTrustBadges
          recommendHint={RECOMMEND_HINT}
          compactMobile
        />
      ) : null}

      {others.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Other cleaners available</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {others.map((c) => (
              <CleanerCard
                key={c.id}
                cleaner={c}
                variant="compact"
                selected={form.cleaner?.id === c.id}
                onSelect={() => selectCleaner(c)}
                compactMobile
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
