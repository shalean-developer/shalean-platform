"use client";

import BookingLayout from "@/components/booking/BookingLayout";
import { Step3CleanerSelection } from "@/components/booking/Step3CleanerSelection";
import { useLockedBooking } from "@/components/booking/useLockedBooking";
import { usePersistedBookingSummaryState } from "@/components/booking/usePersistedBookingSummaryState";
import { useSelectedCleaner } from "@/components/booking/useSelectedCleaner";
import { lockedToStep1State } from "@/lib/booking/lockedBooking";

type StepCleanerProps = {
  onNext: () => void;
};

export function StepCleaner({ onNext }: StepCleanerProps) {
  const step1 = usePersistedBookingSummaryState();
  const locked = useLockedBooking();
  const selectedCleaner = useSelectedCleaner();
  const summaryState = step1 ?? (locked ? lockedToStep1State(locked) : null);

  const canContinue = Boolean(locked && selectedCleaner);
  const continueLabel = selectedCleaner
    ? `Continue with ${selectedCleaner.name}`
    : "Select a cleaner to continue";

  return (
    <BookingLayout
      summaryState={summaryState ?? undefined}
      canContinue={canContinue}
      onContinue={onNext}
      continueLabel={continueLabel}
    >
      {!locked ? (
        <div className="space-y-4">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Choose your cleaner
          </h1>
          <p className="text-sm text-amber-800 dark:text-amber-400/90">
            Lock a time first — then you can pick your cleaner here.
          </p>
        </div>
      ) : (
        <Step3CleanerSelection slotTime={locked.time} />
      )}
    </BookingLayout>
  );
}
