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
    <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/95 backdrop-blur-sm pt-[env(safe-area-inset-top)]">
      <div className="flex w-full min-w-0 items-center gap-1.5 px-3 py-2.5 sm:gap-3 sm:px-6 sm:py-3 lg:px-8">
        {/* Logo */}
        <Link href="/" aria-label="Shalean home" className="shrink-0">
          <ShaleanNavLogo className="h-7 w-auto max-w-[100px] sm:h-8 sm:max-w-[140px]" />
        </Link>

        {/* Stepper — shrinkable center */}
        <div className="flex min-w-0 flex-1 justify-center px-0.5 sm:px-2">
          <BookingV2StepIndicator currentStep={currentStep} onStepClick={onStepClick} />
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <HeaderLoginButton />

          {/* Phone — desktop */}
          <a
            href="tel:0871535250"
            className="hidden shrink-0 items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-blue-600 sm:flex"
          >
            <Phone className="h-4 w-4" aria-hidden />
            087 153 5250
          </a>
          {/* Phone — mobile icon */}
          <a
            href="tel:0871535250"
            aria-label="Call us"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 sm:hidden"
          >
            <Phone className="h-4 w-4" aria-hidden />
          </a>
        </div>
      </div>
    </header>
  );
}
