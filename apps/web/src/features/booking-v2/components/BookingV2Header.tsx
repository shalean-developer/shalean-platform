"use client";

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

export function BookingV2Header({ serviceSlug: _serviceSlug, currentStep, onStepClick }: Props) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto w-full max-w-[var(--ui-container-wide)] px-[var(--ui-page-gutter)] py-2">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <Link href="/" aria-label="Shalean home" className="shrink-0">
            <ShaleanNavLogo className="h-7 w-auto max-w-[112px] sm:max-w-[140px]" />
          </Link>

          <div className="hidden min-w-0 flex-1 justify-center px-2 sm:flex">
            <BookingV2StepIndicator currentStep={currentStep} onStepClick={onStepClick} />
          </div>

          <HeaderLoginButton avatarOnly />
        </div>

        <div className="mt-2 min-w-0 sm:hidden">
          <BookingV2StepIndicator currentStep={currentStep} onStepClick={onStepClick} />
        </div>
      </div>
    </header>
  );
}
