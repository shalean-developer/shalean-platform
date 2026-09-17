"use client";

import { useState } from "react";
import { useFormContext } from "react-hook-form";
import { ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { petAnswerLabel } from "@/lib/booking-v2/petOptions";
import { SERVICE_CONFIG } from "@/src/features/booking-v2/config/serviceConfig";
import { recurringFrequencyLabel } from "@/src/features/booking-v2/config/recurringScheduleOptions";
import type { BookingV2FormData, BookingStep } from "@/src/features/booking-v2/types";
import { useBookingV2 } from "@/src/features/booking-v2/BookingV2Context";
import { estimatedCleaningHoursFromMinutes } from "@/lib/booking-v2/formatEstimatedCleaningTime";
import { buildRecurringPrepaymentQuote } from "@/lib/recurring/recurringPrepayment";
import {
  isRegularCleaningStageComplete,
  regularCleaningDetailsStage,
  type RegularCleaningDetailsStage,
} from "@/src/features/booking-v2/steps/regularCleaningProgressiveDisclosure";
import {
  isRegularCleaningScheduleStageComplete,
  type RegularCleaningScheduleStage,
} from "@/src/features/booking-v2/steps/regularCleaningScheduleProgressiveDisclosure";
import { deepCleaningDetailsStage } from "@/src/features/booking-v2/steps/deepCleaningProgressiveDisclosure";

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(`${dateStr}T00:00:00`);
    return date.toLocaleDateString("en-ZA", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function SummaryRow({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="min-w-0 flex-1 truncate text-sm text-slate-700" title={`${label}: ${value}`}>
        <span className="font-medium text-slate-500">{label}:</span>{" "}
        <span className="font-semibold text-slate-900">{value}</span>
      </p>
      <button
        type="button"
        onClick={onEdit}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-blue-600 transition hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
        aria-label={`Edit ${label.toLowerCase()}`}
      >
        <Pencil className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

export function BookingV2SummaryPanel({ collapsed: defaultCollapsed = false }: { collapsed?: boolean }) {
  const [open, setOpen] = useState(!defaultCollapsed);
  const [moreDetailsOpen, setMoreDetailsOpen] = useState(false);
  const [priceBreakdownOpen, setPriceBreakdownOpen] = useState(false);
  const { watch } = useFormContext<BookingV2FormData>();
  const {
    currentStep,
    liveConfig,
    goToStep,
    detailsSectionOverride,
    editDetailsSection,
    scheduleSectionOverride,
    editScheduleSection,
  } = useBookingV2();
  const values = watch();

  const config = SERVICE_CONFIG[values.serviceSlug];
  const pricing = values.pricingSummary;
  const displayTotal = pricing.estimated_total ?? pricing.total ?? 0;
  const recurringPrepayment = values.bookingType === "recurring" && values.recurringFrequency
    ? buildRecurringPrepaymentQuote({
        startDate: values.recurringStartDate || values.date,
        frequency: values.recurringFrequency,
        recurringDays: values.recurringDays ?? [],
        perVisitZar: displayTotal,
      })
    : null;
  const durationHours = estimatedCleaningHoursFromMinutes(
    pricing.estimated_duration_minutes,
    liveConfig?.estimatedDurationHours ?? config.estimatedDurationHours,
  );
  const hasAddress = values.address.length >= 5;
  const hasDate = /^\d{4}-\d{2}-\d{2}$/.test(values.date);
  const hasCleaner = values.cleanerMode === "team" || values.cleanerCount > 0;
  const hasPriceBreakdown = pricing.lineItems.length > 0;
  const edit = (step: BookingStep) => () => goToStep(step);
  const editDetail = (section: RegularCleaningDetailsStage) => () => {
    goToStep(1);
    editDetailsSection(section);
  };
  const editSchedule = (section: RegularCleaningScheduleStage) => () => {
    goToStep(2);
    editScheduleSection(section);
  };

  const addressLabel = [values.address, values.suburb, values.city].filter(Boolean).join(", ");
  const cleanerLabel = values.cleanerMode === "team"
    ? values.assignedTeamName?.trim() || "Best available team"
    : values.selectedCleanerDetails.length > 0
      ? values.selectedCleanerDetails.map((cleaner) => cleaner.name).join(", ")
      : `${values.cleanerCount} cleaner${values.cleanerCount === 1 ? "" : "s"}`;
  const priceLabel = hasPriceBreakdown
    ? `R${displayTotal.toLocaleString("en-ZA")}`
    : `From R${(liveConfig?.basePrice ?? config.basePrice).toLocaleString("en-ZA")}`;
  const checkoutPriceLabel = recurringPrepayment
    ? `R${recurringPrepayment.grossPackageZar.toLocaleString("en-ZA")}`
    : priceLabel;
  const isRegularCleaning = values.serviceSlug === "regular-cleaning";
  const isDeepCleaning = values.serviceSlug === "deep-cleaning";
  const isProgressiveHomeCleaning = isRegularCleaning || isDeepCleaning;
  const bookingDetails = {
    address: values.address,
    suburb: values.suburb,
    contactPhone: values.contactPhone,
    serviceAreaLocationId: values.serviceAreaLocationId,
  };
  const detailsStage = isDeepCleaning
    ? deepCleaningDetailsStage(values.serviceDetails, bookingDetails)
    : regularCleaningDetailsStage(values.serviceDetails, bookingDetails);
  const displayedDetailsStage = detailsSectionOverride ?? detailsStage;
  const propertyType = String(values.serviceDetails.propertyType ?? "");
  const propertyLabel = config.step1Questions
    .find((question) => question.key === "propertyType")
    ?.options?.find((option) => option.value === propertyType)?.label ?? propertyType;
  const bedrooms = String(values.serviceDetails.bedrooms ?? "");
  const bathrooms = String(values.serviceDetails.bathrooms ?? "");
  const extraRooms = String(values.serviceDetails.extraRooms ?? "0");
  const roomsLabel = `${bedrooms} bed · ${bathrooms} bath${extraRooms !== "0" ? ` · ${extraRooms} extra` : ""}`;
  const petsLabel = petAnswerLabel(values.serviceDetails.hasPets);
  const equipmentLabel = values.equipmentRequired === "yes" ? "Shalean supplies" : "Customer supplies";
  const displayedScheduleStage = scheduleSectionOverride ?? "booking_type";
  const cleanerIsVisible =
    hasCleaner &&
    (!isRegularCleaning || currentStep > 2 || displayedScheduleStage === "cleaner");
  const bookingTypeLabel = values.bookingType === "recurring" ? "Recurring" : "Once-off";
  const scheduleIsVisible =
    !isRegularCleaning ||
    currentStep > 2 ||
    isRegularCleaningScheduleStageComplete("booking_type", displayedScheduleStage, values.bookingType);
  const dateIsVisible =
    hasDate &&
    (!isRegularCleaning ||
      currentStep > 2 ||
      isRegularCleaningScheduleStageComplete("date_time", displayedScheduleStage, values.bookingType));
  const scheduleLabel = [
    values.bookingType === "recurring" && values.recurringFrequency
      ? recurringFrequencyLabel(values.recurringFrequency)
      : bookingTypeLabel,
    dateIsVisible ? formatDate(values.date) : "",
    dateIsVisible && values.time ? values.time : "",
  ].filter(Boolean).join(" · ");
  const propertyIsVisible =
    isProgressiveHomeCleaning && isRegularCleaningStageComplete("property", displayedDetailsStage);
  const roomsAreVisible =
    isProgressiveHomeCleaning && isRegularCleaningStageComplete("rooms", displayedDetailsStage);
  const homeLabel = [propertyIsVisible ? propertyLabel : "", roomsAreVisible ? roomsLabel : ""]
    .filter(Boolean)
    .join(" · ");
  const petsAreVisible =
    isProgressiveHomeCleaning && isRegularCleaningStageComplete("pets", displayedDetailsStage);
  const equipmentIsVisible = isRegularCleaning && currentStep > 1;
  const hasMoreDetails = petsAreVisible || equipmentIsVisible;
  const moreDetailsLabel = [
    petsAreVisible ? petsLabel : "",
    equipmentIsVisible ? equipmentLabel : "",
  ].filter(Boolean).join(" · ");

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-10 w-full items-center justify-between gap-2 px-3 py-2.5 lg:hidden"
        aria-expanded={open}
      >
        <span className="truncate text-sm font-semibold text-slate-900">Booking summary</span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-bold text-blue-600">{priceLabel}</span>
          {open
            ? <ChevronUp className="h-4 w-4 text-slate-400" aria-hidden />
            : <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden />}
        </span>
      </button>

      <div className={cn("lg:block", !open && "hidden")}>
        <div className="space-y-2 p-3">
          <h2 className="hidden text-xl font-bold tracking-tight text-slate-900 lg:block">Booking summary</h2>

          {hasAddress && (!isProgressiveHomeCleaning || displayedDetailsStage === "equipment") ? (
            <SummaryRow label="Address" value={addressLabel} onEdit={isProgressiveHomeCleaning ? editDetail("address") : edit(1)} />
          ) : null}
          <SummaryRow label="Service" value={config.label} onEdit={isProgressiveHomeCleaning ? editDetail("property") : edit(1)} />
          {scheduleIsVisible ? (
            <SummaryRow
              label="Schedule"
              value={scheduleLabel}
              onEdit={
                isRegularCleaning
                  ? editSchedule(dateIsVisible ? "date_time" : "booking_type")
                  : edit(2)
              }
            />
          ) : null}
          {cleanerIsVisible ? (
            <SummaryRow label="Cleaners" value={cleanerLabel} onEdit={isRegularCleaning ? editSchedule("cleaner") : edit(2)} />
          ) : null}
          {homeLabel ? (
            <SummaryRow label="Home" value={homeLabel} onEdit={editDetail("property")} />
          ) : null}

          {hasMoreDetails ? (
            <div>
              <button
                type="button"
                onClick={() => setMoreDetailsOpen((current) => !current)}
                className="flex w-full items-center justify-between gap-2 px-1 py-1.5 text-sm font-medium text-slate-600 transition hover:text-slate-900"
                aria-expanded={moreDetailsOpen}
              >
                <span>More details</span>
                {moreDetailsOpen
                  ? <ChevronUp className="h-4 w-4" aria-hidden />
                  : <ChevronDown className="h-4 w-4" aria-hidden />}
              </button>
              {moreDetailsOpen ? (
                <div className="rounded-xl bg-slate-50 p-2">
                  <SummaryRow
                    label="Pets & supplies"
                    value={moreDetailsLabel}
                    onEdit={editDetail(petsAreVisible ? "pets" : "equipment")}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {values.equipmentRequired === "yes" && values.equipmentQuote?.manual_quote_required && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
              {values.equipmentQuote.manual_quote_message}
            </p>
          )}

          {hasPriceBreakdown && (
            <div>
              <button
                type="button"
                onClick={() => setPriceBreakdownOpen((current) => !current)}
                className="flex w-full items-center justify-between gap-2 px-1 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
                aria-expanded={priceBreakdownOpen}
              >
                <span>View price breakdown</span>
                {priceBreakdownOpen
                  ? <ChevronUp className="h-4 w-4" aria-hidden />
                  : <ChevronDown className="h-4 w-4" aria-hidden />}
              </button>
              {priceBreakdownOpen && (
                <ul className="mt-1 space-y-1.5 rounded-xl bg-slate-50 px-3 py-2.5">
                  {pricing.lineItems.map((item, index) => (
                    <li key={`${item.label}-${index}`} className="flex items-center justify-between gap-2 text-xs text-slate-600">
                      <span className="min-w-0 truncate">{item.label}</span>
                      <span className="shrink-0 tabular-nums">
                        {item.amountZar < 0 ? "-" : ""}R{Math.abs(item.amountZar).toLocaleString("en-ZA")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {recurringPrepayment ? (
              <div className="rounded-xl bg-blue-50 px-3 py-2 text-xs text-slate-600">
                <p>
                  <span className="font-semibold text-slate-800">
                    First 30 days · {recurringPrepayment.visitCount} visit{recurringPrepayment.visitCount === 1 ? "" : "s"}
                  </span>
                  {` · Pay all visits now`}
                </p>
              </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 bg-slate-950 px-3 py-3 text-white">
          <div className="flex flex-col items-center justify-center border-r border-blue-500/50 px-2 text-center">
            <span className="text-2xl font-semibold tabular-nums">{durationHours}</span>
            <span className="text-[11px] font-medium text-slate-300">Est. hours</span>
          </div>
          <div className="flex flex-col items-center justify-center px-2 text-center">
            <span className="text-2xl font-semibold tabular-nums">{checkoutPriceLabel}</span>
            <span className="text-[11px] font-medium text-slate-300">
              {recurringPrepayment ? "Due today" : "Est. price"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
