"use client";

import { useEffect, useMemo } from "react";
import { CleanerCard } from "@/components/booking/CleanerCard";
import { useSelectedCleaner } from "@/components/booking/useSelectedCleaner";
import {
  getCleanersAvailableForTime,
  getRecommendedCleaner,
  type CleanerProfile,
} from "@/lib/booking/cleanersMock";
import { writeSelectedCleanerToStorage } from "@/lib/booking/cleanerSelection";

const RECOMMEND_HINT =
  "Recommended based on your location and service.";

type Step3CleanerSelectionProps = {
  /** Locked arrival time — filters who is “available”. */
  slotTime: string | null;
};

export function Step3CleanerSelection({ slotTime }: Step3CleanerSelectionProps) {
  const selected = useSelectedCleaner();

  const pool = useMemo(() => getCleanersAvailableForTime(slotTime), [slotTime]);

  const recommended = useMemo(() => getRecommendedCleaner(pool), [pool]);
  const others = useMemo(() => {
    if (!recommended) return pool.slice(0, 4);
    return pool.filter((c) => c.id !== recommended.id).slice(0, 4);
  }, [pool, recommended]);

  /** Pre-select recommended once when nothing stored (hydration-safe). */
  useEffect(() => {
    if (!recommended) return;
    if (selected) return;
    writeSelectedCleanerToStorage({ id: recommended.id, name: recommended.name });
  }, [recommended, selected]);

  function selectCleaner(c: CleanerProfile) {
    writeSelectedCleanerToStorage({ id: c.id, name: c.name });
  }

  if (pool.length === 0) {
    return (
      <p className="text-sm text-amber-800 dark:text-amber-400/90">
        No cleaners available for this time slot. Go back and pick a different time.
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
