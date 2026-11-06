"use client";

import { regularSimplifiedPreviewEnabled, REGULAR_SIMPLIFIED_STAGE_CONTRACT } from "@/src/features/booking-v2/regularSimplifiedJourneyContract";
import Link from "next/link";
import { ShaleanNavLogo } from "@/components/brand/ShaleanNavLogo";
import { HeaderLoginButton } from "@/components/nav/HeaderLoginButton";
import type { ServiceSlug } from "@/src/features/booking-v2/config/serviceConfig";
import { BookingV2StepIndicator } from "@/src/features/booking-v2/components/BookingV2StepIndicator";
import type { BookingStep } from "@/src/features/booking-v2/types";

type Props = {
  serviceSlug: ServiceSlug;
  currentStep: BookingStep;
  onStepClick?: (step: BookingStep) => void;
};

export function BookingV2Header({ serviceSlug, currentStep, onStepClick }: Props) {
  const labels = regularSimplifiedPreviewEnabled(serviceSlug)
    ? Object.fromEntries(REGULAR_SIMPLIFIED_STAGE_CONTRACT.map(({ step, label }) => [step, label])) as Record<BookingStep, string>
    : undefined;
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto w-full max-w-[var(--ui-container-wide)] px-[var(--ui-page-gutter)] py-2">
        <div className="hidden min-w-0 items-center justify-between gap-3 sm:flex">
          <Link href="/" aria-label="Shalean home" className="shrink-0">
            <ShaleanNavLogo className="h-7 w-auto max-w-[140px]" />
          </Link>
          <div className="min-w-0 flex-1 justify-center px-2">
            <BookingV2StepIndicator currentStep={currentStep} onStepClick={onStepClick} labels={labels} />
          </div>
          <HeaderLoginButton avatarOnly />
        </div>

        <div className="flex min-w-0 items-start sm:hidden">
          <div className="min-w-0 flex-1 pt-1">
            <BookingV2StepIndicator currentStep={currentStep} onStepClick={onStepClick} labels={labels} />
          </div>
          <div className="ml-2 shrink-0">
            <HeaderLoginButton avatarOnly />
          </div>
        </div>
      </div>
    </header>
  );
}
