"use client";

import type { BookingExperimentAssignments } from "@/lib/booking/bookingExperiments";
import { formatBookingHoursCompact } from "@/lib/booking/formatBookingHours";

export function croCtaLabel(assignments: BookingExperimentAssignments): string {
  switch (assignments.cta_copy) {
    case "continue_schedule":
      return "Continue to schedule";
    case "see_available_times":
      return "See available times";
    case "book_your_time":
      return "Book your time";
    case "continue":
    default:
      return "Continue";
  }
}

export function croCtaShort(assignments: BookingExperimentAssignments): string {
  const label = croCtaLabel(assignments);
  return label === "Continue" ? "Continue ->" : `${label} ->`;
}

export function croPriceDisplay(
  assignments: BookingExperimentAssignments,
  totalZar: number | null | undefined,
  hours: number | null | undefined,
  fallbackCaption: string,
): { totalCaption: string; amountDisplayOverride: string | null; mobileHoursLine: string | null } {
  if (totalZar == null) {
    return { totalCaption: fallbackCaption, amountDisplayOverride: "-", mobileHoursLine: null };
  }

  const amount = `R ${totalZar.toLocaleString("en-ZA")}`;
  if (assignments.pricing_display === "from_total") {
    return { totalCaption: "Estimate", amountDisplayOverride: `From ${amount}`, mobileHoursLine: null };
  }

  if (assignments.pricing_display === "hours_total") {
    const hoursLine = hours != null ? formatBookingHoursCompact(hours) : null;
    return {
      totalCaption: "Total",
      amountDisplayOverride: hoursLine ? `${hoursLine} - ${amount} total` : `${amount} total`,
      mobileHoursLine: null,
    };
  }

  return {
    totalCaption: fallbackCaption,
    amountDisplayOverride: null,
    mobileHoursLine: hours != null ? formatBookingHoursCompact(hours) : null,
  };
}
