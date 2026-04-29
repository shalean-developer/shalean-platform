"use client";

import { useEffect, useMemo } from "react";
import { CleanerCard } from "@/components/booking/CleanerCard";
import { useSelectedCleaner } from "@/components/booking/useSelectedCleaner";
import { useCleaners, type LiveCleaner } from "@/components/booking/useCleaners";
import { writeSelectedCleanerToStorage } from "@/lib/booking/cleanerSelection";
import { mergeCleanerIdIntoLockedBooking } from "@/lib/booking/lockedBooking";
import { useLockedBooking } from "@/components/booking/useLockedBooking";
import { useBookingAvailabilityArea } from "@/components/booking/useBookingAvailabilityArea";

const RECOMMEND_HINT =
  "Recommended based on your location and service.";

type Step3CleanerSelectionProps = {
  /** Locked arrival time — filters who is “available”. */
  slotTime: string | null;
};

export function Step3CleanerSelection({ slotTime }: Step3CleanerSelectionProps) {
  const selected = useSelectedCleaner();
  const locked = useLockedBooking();
  const { locationId: resolvedLocationId } = useBookingAvailabilityArea({
    serviceAreaLocationId: locked?.serviceAreaLocationId,
    serviceAreaCityId: locked?.serviceAreaCityId,
    locationLabel: locked?.location,
    allowFreeTextFallback: locked?.allowLocationTextFallback === true,
  });
  const durationMinutes = useMemo(() => {
    const h = locked?.finalHours;
    if (typeof h === "number" && Number.isFinite(h)) return Math.max(30, Math.round(h * 60));
    return 120;
  }, [locked?.finalHours]);
  const { cleaners: pool, recommendedCleaner: recommended, loading, error } = useCleaners({
    selectedDate: locked?.date ?? null,
    selectedTime: slotTime,
    durationMinutes,
    locationId: resolvedLocationId,
  });
  const others = useMemo(() => {
    if (!recommended) return pool.slice(0, 4);
    return pool.filter((c) => c.id !== recommended.id).slice(0, 4);
  }, [pool, recommended]);

  /** Pre-select recommended once when nothing stored (hydration-safe). */
  useEffect(() => {
    if (!recommended) return;
    if (selected) return;
    writeSelectedCleanerToStorage({ id: recommended.id, name: recommended.full_name });
    mergeCleanerIdIntoLockedBooking(recommended.id);
  }, [recommended, selected]);

  function selectCleaner(c: LiveCleaner) {
    writeSelectedCleanerToStorage({ id: c.id, name: c.full_name });
    mergeCleanerIdIntoLockedBooking(c.id);
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
        No cleaners available for this time
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Choose your cleaner
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          We&apos;ve recommended the best match for you.
        </p>
      </div>

      {recommended ? (
        <section aria-labelledby="recommended-cleaner-heading" className="space-y-3">
          <h2 id="recommended-cleaner-heading" className="sr-only">
            Recommended cleaner
          </h2>
          <CleanerCard
            cleaner={recommended}
            variant="featured"
            selected={selected?.id === recommended.id}
            onSelect={() => selectCleaner(recommended)}
            showTrustBadges
            recommendHint={RECOMMEND_HINT}
          />
        </section>
      ) : null}

      {others.length > 0 ? (
        <section aria-labelledby="other-cleaners-heading" className="space-y-3">
          <h2
            id="other-cleaners-heading"
            className="text-sm font-semibold text-zinc-800 dark:text-zinc-200"
          >
            Other cleaners available
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {others.map((c) => (
              <CleanerCard
                key={c.id}
                cleaner={c}
                variant="compact"
                selected={selected?.id === c.id}
                onSelect={() => selectCleaner(c)}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
