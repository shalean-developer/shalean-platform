"use client";

import Link from "next/link";
import { Phone } from "lucide-react";
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
      <div className="mx-auto flex w-full max-w-[var(--ui-container-wide)] min-w-0 items-center gap-1.5 px-[var(--ui-page-gutter)] py-2.5 sm:gap-3 sm:py-3">
        <Link href="/" aria-label="Shalean home" className="shrink-0">
          <ShaleanNavLogo className="h-7 w-auto max-w-[100px] sm:h-8 sm:max-w-[140px]" />
        </Link>

        <div className="flex min-w-0 flex-1 justify-center px-0.5 sm:px-2">
          <BookingV2StepIndicator currentStep={currentStep} onStepClick={onStepClick} />
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <HeaderLoginButton />

          <a
            href="tel:0871535250"
            className="hidden shrink-0 items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-primary sm:flex"
          >
            <Phone className="h-4 w-4" aria-hidden />
            087 153 5250
          </a>
          <a
            href="tel:0871535250"
            aria-label="Call us"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-primary shadow-[var(--ui-shadow-sm)] transition hover:bg-accent sm:hidden"
          >
            <Phone className="h-4 w-4" aria-hidden />
          </a>
        </div>
      </div>
    </header>
  );
}
