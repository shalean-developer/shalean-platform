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
  isRegularCleaningScheduleStageComplete,
  type RegularCleaningScheduleStage,
} from "@/src/features/booking-v2/steps/regularCleaningScheduleProgressiveDisclosure";
import {
  bookingDetailsFinalStage,
  bookingDetailsStage,
  bookingDetailsStageIndex,
  isProgressiveBookingDetailsService,
  usesProgressiveIndividualSchedule,
  type BookingDetailsStage,
} from "@/src/features/booking-v2/steps/serviceProgressiveDisclosure";

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
        serviceSlug: values.serviceSlug,
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
  const editDetail = (section: BookingDetailsStage) => () => {
    goToStep(1);
    editDetailsSection(section);
  };
  const editSchedule = (section: RegularCleaningScheduleStage) => () => {
    goToStep(2);
    editScheduleSection(section);
  };

  const addressLabel = [values.address, values.suburb, values.city].filter(Boolean).join(", ");
  const isCarpetCleaning = values.serviceSlug === "carpet-cleaning";
  const cleanerLabel = values.cleanerMode === "team"
    ? values.assignedTeamName?.trim() || "Best available team"
    : values.selectedCleanerDetails.length > 0
      ? values.selectedCleanerDetails.map((cleaner) => cleaner.name).join(", ")
      : isCarpetCleaning
        ? "Shalean chooses specialist"
        : `${values.cleanerCount} cleaner${values.cleanerCount === 1 ? "" : "s"}`;
  const priceLabel = hasPriceBreakdown
    ? `R${displayTotal.toLocaleString("en-ZA")}`
    : `From R${(liveConfig?.basePrice ?? config.basePrice).toLocaleString("en-ZA")}`;
  const checkoutPriceLabel = recurringPrepayment
    ? `R${recurringPrepayment.grossPackageZar.toLocaleString("en-ZA")}`
    : priceLabel;
  const isRegularCleaning = values.serviceSlug === "regular-cleaning";
  const isDeepCleaning = values.serviceSlug === "deep-cleaning";
  const isMovingCleaning = values.serviceSlug === "moving-cleaning";
  const progressiveDetails = isProgressiveBookingDetailsService(values.serviceSlug);
  const progressiveSchedule = usesProgressiveIndividualSchedule(values.serviceSlug);
  const bookingDetails = {
    address: values.address,
    suburb: values.suburb,
    contactPhone: values.contactPhone,
    serviceAreaLocationId: values.serviceAreaLocationId,
  };
  const questions = liveConfig?.step1Questions ?? config.step1Questions;
  const detailsStage = bookingDetailsStage(
    values.serviceSlug,
    values.serviceDetails,
    bookingDetails,
    questions,
  );
  const displayedDetailsStage = detailsSectionOverride ?? detailsStage;
  const detailsStageIndex = bookingDetailsStageIndex(
    values.serviceSlug,
    displayedDetailsStage,
  );
  const finalDetailsStage = bookingDetailsFinalStage(values.serviceSlug);
  const finalDetailsStageIndex = bookingDetailsStageIndex(
    values.serviceSlug,
    finalDetailsStage,
  );
  const optionLabel = (key: string, raw: unknown): string => {
    const value = String(raw ?? "");
    return (
      questions
        .find((question) => question.key === key)
        ?.options?.find((option) => option.value === value)?.label ?? value
    );
  };

  const propertyLabel =
    values.serviceSlug === "office-cleaning"
      ? optionLabel("officeType", values.serviceDetails.officeType)
      : optionLabel("propertyType", values.serviceDetails.propertyType);

  const bedrooms = String(values.serviceDetails.bedrooms ?? "");
  const bathrooms = String(values.serviceDetails.bathrooms ?? "");
  const extraRooms = String(values.serviceDetails.extraRooms ?? "");
  const homeRoomsComplete = [bedrooms, bathrooms, extraRooms].every(
    (value) => value.trim() !== "",
  );
  const homeRoomsLabel = homeRoomsComplete
    ? `${bedrooms} bed · ${bathrooms} bath${extraRooms !== "0" ? ` · ${extraRooms} extra` : ""}`
    : "";

  const roomsLabel =
    values.serviceSlug === "office-cleaning"
      ? [
          optionLabel("officeSize", values.serviceDetails.officeSize),
          bathrooms ? `${bathrooms} bathroom${bathrooms === "1" ? "" : "s"}` : "",
        ].filter(Boolean).join(" · ")
      : values.serviceSlug === "carpet-cleaning"
        ? [
            values.serviceDetails.carpetRooms
              ? `${values.serviceDetails.carpetRooms} carpeted room${String(values.serviceDetails.carpetRooms) === "1" ? "" : "s"}`
              : "",
            values.serviceDetails.rugCount
              ? `${values.serviceDetails.rugCount} rug${String(values.serviceDetails.rugCount) === "1" ? "" : "s"}`
              : "",
            optionLabel("carpetType", values.serviceDetails.carpetType),
          ].filter(Boolean).join(" · ")
        : homeRoomsLabel;

  const moveType = String(values.serviceDetails.moveType ?? "");
  const moveTypeLabel =
    moveType === "move_in" ? "Move-in" : moveType === "move_out" ? "Move-out" : "";

  const petsLabel = petAnswerLabel(values.serviceDetails.hasPets);
  const equipmentLabel =
    values.equipmentRequired === "yes" ? "Shalean supplies" : "Customer supplies";

  const finalDetailValues =
    values.serviceSlug === "regular-cleaning"
      ? [petsLabel, equipmentLabel]
      : values.serviceSlug === "deep-cleaning"
        ? [
            optionLabel("lastCleaned", values.serviceDetails.lastCleaned),
            petsLabel,
          ]
        : values.serviceSlug === "moving-cleaning"
          ? [
              optionLabel("furnished", values.serviceDetails.furnished),
              petsLabel,
              values.serviceDetails.depositInspection
                ? `Deposit inspection: ${optionLabel("depositInspection", values.serviceDetails.depositInspection)}`
                : "",
            ]
          : values.serviceSlug === "office-cleaning"
            ? []
            : values.serviceSlug === "carpet-cleaning"
              ? [
                  values.serviceDetails.stains
                    ? `Visible stains: ${optionLabel("stains", values.serviceDetails.stains)}`
                    : "",
                ]
              : [
                  optionLabel("linens", values.serviceDetails.linens),
                  optionLabel("guestCheckout", values.serviceDetails.guestCheckout),
                  optionLabel("keyAccess", values.serviceDetails.keyAccess),
                  optionLabel("welcomeBasket", values.serviceDetails.welcomeBasket),
                ];
  const moreDetailsLabel = finalDetailValues.filter(Boolean).join(" · ");

  const displayedScheduleStage =
    scheduleSectionOverride ?? (isCarpetCleaning ? "date_time" : "booking_type");
  const cleanerIsVisible =
    hasCleaner &&
    !(isDeepCleaning && currentStep === 1) &&
    (!progressiveSchedule || currentStep > 2 || displayedScheduleStage === "cleaner");
  const bookingTypeLabel = values.bookingType === "recurring" ? "Recurring" : "Once-off";
  const scheduleIsVisible =
    !(isDeepCleaning && currentStep === 1) &&
    (isCarpetCleaning
      ? currentStep > 2 || displayedScheduleStage === "cleaner"
      : !progressiveSchedule ||
        currentStep > 2 ||
        isRegularCleaningScheduleStageComplete(
          "booking_type",
          displayedScheduleStage,
          values.bookingType,
        ));
  const dateIsVisible =
    hasDate &&
    !(isDeepCleaning && currentStep === 1) &&
    (!progressiveSchedule ||
      currentStep > 2 ||
      isRegularCleaningScheduleStageComplete(
        "date_time",
        displayedScheduleStage,
        values.bookingType,
      ));
  const scheduleLabel = [
    !isCarpetCleaning
      ? values.bookingType === "recurring" && values.recurringFrequency
        ? recurringFrequencyLabel(values.recurringFrequency)
        : bookingTypeLabel
      : "",
    dateIsVisible ? formatDate(values.date) : "",
    dateIsVisible && values.time ? values.time : "",
  ].filter(Boolean).join(" · ");

  const propertyIsVisible =
    progressiveDetails &&
    Boolean(propertyLabel) &&
    (currentStep > 1 || detailsStageIndex >= 2);
  const roomsAreVisible =
    progressiveDetails &&
    Boolean(roomsLabel) &&
    (currentStep > 1 || detailsStageIndex > 2);
  const homeLabel = [propertyIsVisible ? propertyLabel : "", roomsAreVisible ? roomsLabel : ""]
    .filter(Boolean)
    .join(" · ");
  const finalDetailsVisible =
    progressiveDetails &&
    Boolean(moreDetailsLabel) &&
    (currentStep > 1 || detailsStageIndex >= finalDetailsStageIndex);
  const equipmentIsVisible = isRegularCleaning && currentStep > 1;
  const hasMoreDetails = finalDetailsVisible || equipmentIsVisible;

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

          {hasAddress && (!progressiveDetails || currentStep > 1 || detailsStageIndex >= finalDetailsStageIndex) ? (
            <SummaryRow label="Address" value={addressLabel} onEdit={progressiveDetails ? editDetail("address") : edit(1)} />
          ) : null}
          <SummaryRow label="Service" value={config.label} onEdit={progressiveDetails ? editDetail("property") : edit(1)} />
          {scheduleIsVisible ? (
            <SummaryRow
              label="Schedule"
              value={scheduleLabel}
              onEdit={
                progressiveSchedule
                  ? editSchedule(
                      isCarpetCleaning
                        ? "date_time"
                        : dateIsVisible
                          ? "date_time"
                          : "booking_type",
                    )
                  : edit(2)
              }
            />
          ) : null}
          {cleanerIsVisible ? (
            <SummaryRow
              label={isCarpetCleaning ? "Specialist" : "Cleaners"}
              value={cleanerLabel}
              onEdit={progressiveSchedule ? editSchedule("cleaner") : edit(2)}
            />
          ) : null}
          {isMovingCleaning && moveTypeLabel && (currentStep > 1 || detailsStageIndex >= 3) ? (
            <SummaryRow label="Move" value={moveTypeLabel} onEdit={editDetail("move")} />
          ) : null}
          {homeLabel ? (
            <SummaryRow
              label={
                isCarpetCleaning
                  ? "Carpet scope"
                  : values.serviceSlug === "office-cleaning"
                    ? "Office scope"
                    : "Home"
              }
              value={homeLabel}
              onEdit={editDetail("property")}
            />
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
                    label={isCarpetCleaning ? "Condition" : "Details"}
                    value={moreDetailsLabel}
                    onEdit={editDetail(finalDetailsStage)}
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
                    {isDeepCleaning ? "Monthly plan" : "First 30 days"} · {recurringPrepayment.visitCount} visit{recurringPrepayment.visitCount === 1 ? "" : "s"}
                  </span>
                  {` · ${isDeepCleaning ? "Pay this month now" : "Pay all visits now"}`}
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
