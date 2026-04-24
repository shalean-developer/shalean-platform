"use client";

import type { BookingFlowStep } from "@/lib/booking/bookingFlow";
import { BOOKING_FLOW_STEPS } from "@/lib/booking/bookingFlow";
import { ProgressBar } from "@/components/booking/ProgressBar";

type BookingProgressBarProps = {
  step: BookingFlowStep;
  className?: string;
};

/** Booking flow adapter around {@link ProgressBar} (1-based step from URL state). */
export function BookingProgressBar({ step, className }: BookingProgressBarProps) {
  const raw = BOOKING_FLOW_STEPS.indexOf(step);
  const activeIndex = raw === -1 ? 0 : raw;
  return <ProgressBar currentStep={activeIndex + 1} className={className} />;
}
