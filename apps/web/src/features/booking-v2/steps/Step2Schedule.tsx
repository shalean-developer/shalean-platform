"use client";

import { useEffect, useState } from "react";
import { useFormContext, Controller } from "react-hook-form";
import {
  CalendarDays,
  CalendarRange,
  CalendarPlus,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SERVICE_CONFIG } from "@/src/features/booking-v2/config/serviceConfig";
import type {
  AvailableCleanerV2,
  BookingV2FormData,
  ServiceSlug,
} from "@/src/features/booking-v2/types";
import { useBookingV2 } from "@/src/features/booking-v2/BookingV2Context";
import {
  CleanerPreferenceSection,
  prefetchAvailableCleaners,
} from "@/src/features/booking-v2/components/CleanerPreferenceSection";
import { TeamAvailabilitySection } from "@/src/features/booking-v2/components/TeamAvailabilitySection";
import {
  RECURRING_FREQUENCY_OPTIONS,
  RECURRING_WEEKDAYS,
  shouldShowRecurringDayPicker,
} from "@/src/features/booking-v2/config/recurringScheduleOptions";
import {
  filterCustomerOnlineBookingTimeSlots,
  formatCustomerBookingSlotLabel,
} from "@/lib/booking-v2/customerBookingTimeSlots";
import { useBookingV2ScheduleAvailability } from "@/lib/booking-v2/useBookingV2ScheduleAvailability";
import { isSelectedBookingSlotVerified } from "@/lib/booking-v2/bookingV2ScheduleVerification";
import {
  DEEP_CLEANING_RECURRING_FREQUENCY,
  recurringFrequenciesForService,
  serviceAllowsRecurringBookings,
  serviceUsesRecurringDayPicker,
} from "@/lib/booking-v2/serviceRecurringPolicy";
import {
  adjacentRegularCleaningScheduleStage,
  type RegularCleaningScheduleStage,
} from "@/src/features/booking-v2/steps/regularCleaningScheduleProgressiveDisclosure";
import { usesProgressiveIndividualSchedule } from "@/src/features/booking-v2/steps/serviceProgressiveDisclosure";

// ─── Constants ─────────────────────────────────────────────────────────────────

const RECURRING_FREQUENCIES = RECURRING_FREQUENCY_OPTIONS;

const WEEKDAYS = [...RECURRING_WEEKDAYS];

const FREQUENCY_PRESENTATION = {
  custom: {
    description: "Choose the visit days that suit you.",
    icon: CalendarRange,
  },
  weekly: {
    description: "Cleaning every week.",
    icon: CalendarDays,
  },
  fortnightly: {
    description: "Cleaning every second week.",
    icon: CalendarRange,
  },
  monthly: {
    description: "Cleaning once a month.",
    icon: CalendarPlus,
  },
} as const;

// ─── Per-service copy ──────────────────────────────────────────────────────────

const STEP2_COPY: Record<
  ServiceSlug,
  {
    title: string;
    subtitle: string;
    cleanerTitle: string;
    cleanerSubtitle: string;
  }
> = {
  "regular-cleaning": {
    title: "Schedule your clean",
    subtitle: "Choose a date, time, and how often you'd like us to come.",
    cleanerTitle: "Choose your cleaner",
    cleanerSubtitle: "Pick a preferred cleaner for your regular visits.",
  },
  "deep-cleaning": {
    title: "Book your deep clean",
    subtitle: "Select a date and time — our full team will handle the rest.",
    cleanerTitle: "Available team slots",
    cleanerSubtitle: "We assign a dedicated team of 3 for all deep cleans.",
  },
  "moving-cleaning": {
    title: "Book your move clean",
    subtitle: "Moving dates fill up fast — secure your slot early.",
    cleanerTitle: "Available team slots",
    cleanerSubtitle: "Our specialist move-clean team will tackle every room.",
  },
  "office-cleaning": {
    title: "Schedule office cleaning",
    subtitle: "Pick a time that fits around your business hours.",
    cleanerTitle: "Choose your cleaners",
    cleanerSubtitle: "Select the cleaners you'd like for your workspace.",
  },
  "carpet-cleaning": {
    title: "Schedule carpet cleaning",
    subtitle: "Allow 2–4 hours for a thorough steam treatment.",
    cleanerTitle: "Choose your specialist",
    cleanerSubtitle: "Our carpet specialists bring all their own equipment.",
  },
  "airbnb-cleaning": {
    title: "Schedule the turnover",
    subtitle: "We'll be ready and waiting before your next guest arrives.",
    cleanerTitle: "Choose your cleaner",
    cleanerSubtitle: "Pick a cleaner who knows Airbnb standards inside out.",
  },
};

// ─── Shared micro-components ───────────────────────────────────────────────────

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-center text-xs text-red-500">{message}</p>;
}

const CALENDAR_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const CALENDAR_WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;

function formatBookingDate(value: string): string {
  if (!value) return "Choose a date";
  return new Intl.DateTimeFormat("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function BookingDateDropdown({
  id,
  value,
  onChange,
  minDate,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  minDate: string;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedDate = value ? new Date(`${value}T00:00:00`) : new Date(`${minDate}T00:00:00`);
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth());

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const days: Array<number | null> = [
    ...Array(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  while (days.length % 7 !== 0) days.push(null);

  function dateValue(day: number): string {
    return `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function moveMonth(direction: -1 | 1) {
    const next = new Date(viewYear, viewMonth + direction, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen && value) {
      const next = new Date(`${value}T00:00:00`);
      setViewYear(next.getFullYear());
      setViewMonth(next.getMonth());
    }
    setOpen(nextOpen);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          className="flex min-h-12 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-800 shadow-sm transition hover:border-blue-300 focus-visible:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <Calendar className="h-4 w-4" aria-hidden />
            </span>
            {formatBookingDate(value)}
          </span>
          <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] p-4">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => moveMonth(-1)}
            aria-label="Previous month"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-blue-50 hover:text-blue-700"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <p className="text-sm font-bold text-slate-900">
            {CALENDAR_MONTHS[viewMonth]} {viewYear}
          </p>
          <button
            type="button"
            onClick={() => moveMonth(1)}
            aria-label="Next month"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-blue-50 hover:text-blue-700"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="grid grid-cols-7">
          {CALENDAR_WEEKDAYS.map((weekday) => (
            <span key={weekday} className="py-1 text-center text-xs font-semibold text-slate-400">
              {weekday}
            </span>
          ))}
          {days.map((day, index) => {
            if (day == null) return <span key={`empty-${index}`} />;
            const nextValue = dateValue(day);
            const unavailable = nextValue < minDate;
            const selected = nextValue === value;
            return (
              <button
                key={nextValue}
                type="button"
                disabled={unavailable}
                onClick={() => {
                  onChange(nextValue);
                  setOpen(false);
                }}
                className={cn(
                  "mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-sm transition",
                  selected && "bg-blue-600 font-bold text-white shadow-sm",
                  !selected && !unavailable && "text-slate-700 hover:bg-blue-50 hover:text-blue-700",
                  unavailable && "cursor-not-allowed text-slate-300",
                )}
              >
                {day}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function BookingTimeDropdown({
  id,
  value,
  onChange,
  slots,
  disabled,
  loading,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  slots: string[];
  disabled: boolean;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const label = value
    ? formatCustomerBookingSlotLabel(value)
    : loading
      ? "Checking available times…"
      : slots.length === 0
        ? "No times available"
        : "Select a time";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-busy={loading || undefined}
          className="flex min-h-12 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-800 shadow-sm transition hover:border-blue-300 focus-visible:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <Clock3 className="h-4 w-4" aria-hidden />
            </span>
            {label}
          </span>
          <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-64 overflow-y-auto p-1.5">
        {slots.map((slot) => {
          const selected = value === slot;
          return (
            <button
              key={slot}
              type="button"
              onClick={() => {
                onChange(slot);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium transition",
                selected
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-700 hover:bg-slate-50",
              )}
            >
              {formatCustomerBookingSlotLabel(slot)}
              {selected ? <Check className="h-4 w-4" aria-hidden /> : null}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

// ─── Step 2 ─────────────────────────────────────────────────────────────────────

export function Step2Schedule() {
  const {
    serviceSlug,
    liveConfig,
    scheduling,
    goToStep,
    goBack,
    goNext,
    scheduleSectionOverride,
    editScheduleSection,
  } = useBookingV2();
  const config = SERVICE_CONFIG[serviceSlug];
  const copy = STEP2_COPY[serviceSlug];
  const isTeamMode = (liveConfig?.cleanerMode ?? config.cleanerMode) === "team";

  const {
    control,
    watch,
    setValue,
    clearErrors,
    formState: { errors },
  } = useFormContext<BookingV2FormData>();

  const bookingType = watch("bookingType");
  const date = watch("date");
  const time = watch("time");
  const suburb = watch("suburb");
  const serviceAreaLocationId = watch("serviceAreaLocationId");
  const serviceDetails = watch("serviceDetails") ?? {};
  const selectedExtras = watch("selectedExtras") ?? [];
  const cleanerCount = watch("cleanerCount") ?? 1;
  const recurringFrequency = watch("recurringFrequency");
  const recurringStartDate = watch("recurringStartDate");
  const recurringEndDate = watch("recurringEndDate");
  const selectedCleanerIds = watch("selectedCleanerIds") ?? [];
  const selectedCleanerDetails = watch("selectedCleanerDetails") ?? [];
  const assignedTeamId = watch("assignedTeamId") ?? "";
  const isRegularCleaning = serviceSlug === "regular-cleaning";
  const isDeepCleaning = serviceSlug === "deep-cleaning";
  const isMovingCleaning = serviceSlug === "moving-cleaning";
  const isCarpetCleaning = serviceSlug === "carpet-cleaning";
  const isAirbnbCleaning = serviceSlug === "airbnb-cleaning";
  const skipsBookingTypeStage = isCarpetCleaning || isAirbnbCleaning;
  const progressiveIndividualSchedule = usesProgressiveIndividualSchedule(serviceSlug);
  const allowsRecurringBookings = serviceAllowsRecurringBookings(serviceSlug);
  const serviceRecurringFrequencies = recurringFrequenciesForService(serviceSlug);
  const recurringFrequencyOptions = RECURRING_FREQUENCIES.filter((option) =>
    serviceRecurringFrequencies.includes(option.value),
  );
  const activeScheduleStage = progressiveIndividualSchedule
    ? scheduleSectionOverride ?? (skipsBookingTypeStage ? "date_time" : "booking_type")
    : null;
  const isBookingTypeStage =
    progressiveIndividualSchedule && activeScheduleStage === "booking_type";
  const showBookingTypeSelection = progressiveIndividualSchedule
    ? activeScheduleStage === "booking_type"
    : allowsRecurringBookings;

  const durationMinutes = Math.round(
    (watch("pricingSummary")?.estimated_duration_minutes ??
      (liveConfig?.estimatedDurationHours ?? config.estimatedDurationHours) * 60),
  );

  const areaResolved = Boolean(serviceAreaLocationId?.trim());
  const { availability, loading: slotsLoading, fetchError: slotsFetchError, slotsVerified } =
    useBookingV2ScheduleAvailability({
      dateYmd: date || null,
      locationId: serviceAreaLocationId?.trim() || null,
      serviceSlug,
      serviceDetails,
      selectedExtras,
      durationMinutes,
      scheduling,
    });

  const today = new Date().toISOString().split("T")[0];
  const availableTimeSlots =
    date && areaResolved && slotsVerified && availability != null
      ? filterCustomerOnlineBookingTimeSlots(date, { scheduling }).filter(
          (slot) => availability[slot] === true,
        )
      : [];

  const teamScheduleReady =
    isTeamMode &&
    Boolean(
      bookingType &&
        (bookingType !== "recurring" || recurringFrequency) &&
        date &&
        areaResolved &&
        isSelectedBookingSlotVerified(time, availability, slotsVerified) &&
        assignedTeamId,
    );

  useEffect(() => {
    if (allowsRecurringBookings || bookingType === "once_off") return;
    setValue("bookingType", "once_off", { shouldDirty: true, shouldValidate: true });
    setValue("recurringFrequency", "", { shouldDirty: true, shouldValidate: true });
    setValue("recurringDays", [], { shouldDirty: true, shouldValidate: true });
  }, [allowsRecurringBookings, bookingType, setValue]);

  useEffect(() => {
    if (!isCarpetCleaning) return;
    if (cleanerCount !== 1) {
      setValue("cleanerCount", 1, { shouldDirty: true, shouldValidate: true });
    }
    if (selectedCleanerIds.length > 1) {
      setValue("selectedCleanerIds", selectedCleanerIds.slice(0, 1), { shouldDirty: true });
      setValue("selectedCleanerDetails", selectedCleanerDetails.slice(0, 1), { shouldDirty: true });
    }
  }, [
    cleanerCount,
    isCarpetCleaning,
    selectedCleanerDetails,
    selectedCleanerIds,
    setValue,
  ]);

  useEffect(() => {
    if (!isDeepCleaning || bookingType !== "recurring") return;
    if (recurringFrequency !== DEEP_CLEANING_RECURRING_FREQUENCY) {
      setValue("recurringFrequency", DEEP_CLEANING_RECURRING_FREQUENCY, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
    setValue("recurringDays", [], { shouldDirty: true, shouldValidate: true });
  }, [bookingType, isDeepCleaning, recurringFrequency, setValue]);

  // The calendar date starts the recurring series; recurring bookings are open-ended.
  useEffect(() => {
    if (bookingType !== "recurring") return;
    if (date && recurringStartDate !== date) {
      setValue("recurringStartDate", date, { shouldDirty: true });
    }
    if (recurringEndDate) {
      setValue("recurringEndDate", "", { shouldDirty: true });
    }
  }, [bookingType, date, recurringEndDate, recurringStartDate, setValue]);

  useEffect(() => {
    if (!date || !slotsVerified || availability == null) return;
    const verifiedAvailableTimeSlots = filterCustomerOnlineBookingTimeSlots(date, {
      scheduling,
    }).filter((slot) => availability[slot] === true);
    if (time && !verifiedAvailableTimeSlots.includes(time)) {
      setValue("time", "", { shouldValidate: true });
    } else if (time) {
      clearErrors("time");
    }
  }, [availability, clearErrors, date, scheduling, setValue, slotsVerified, time]);

  // Start cleaner eligibility as soon as a verified slot is selected. By the
  // time the customer advances to cleaner preference, the shared request cache
  // normally already contains the server-authoritative list.
  useEffect(() => {
    if (
      isTeamMode ||
      !date ||
      !time ||
      !serviceAreaLocationId?.trim() ||
      !isSelectedBookingSlotVerified(time, availability, slotsVerified)
    ) {
      return;
    }
    void prefetchAvailableCleaners({
      serviceSlug,
      date,
      time,
      durationMinutes,
      locationId: serviceAreaLocationId.trim(),
    }).catch(() => undefined);
  }, [
    availability,
    date,
    durationMinutes,
    isTeamMode,
    serviceAreaLocationId,
    serviceSlug,
    slotsVerified,
    time,
  ]);

  function toggleCleaner(cleaner: AvailableCleanerV2) {
    const ids = selectedCleanerIds;
    const details = selectedCleanerDetails;
    if (ids.includes(cleaner.id)) {
      setValue("selectedCleanerIds", ids.filter((c) => c !== cleaner.id));
      setValue("selectedCleanerDetails", details.filter((c) => c.id !== cleaner.id));
    } else if (ids.length < cleanerCount) {
      setValue("selectedCleanerIds", [...ids, cleaner.id]);
      setValue("selectedCleanerDetails", [...details, cleaner]);
    } else {
      // Replace oldest selection when at capacity
      setValue("selectedCleanerIds", [...ids.slice(1), cleaner.id]);
      setValue("selectedCleanerDetails", [...details.slice(1), cleaner]);
    }
  }

  function clearCleanerSelection() {
    setValue("selectedCleanerIds", []);
    setValue("selectedCleanerDetails", []);
  }

  function stageIsReady(stage: RegularCleaningScheduleStage): boolean {
    if (stage === "booking_type") {
      return Boolean(
        bookingType && (bookingType !== "recurring" || recurringFrequency),
      );
    }
    if (stage === "date_time") {
      return Boolean(
        date &&
          areaResolved &&
          isSelectedBookingSlotVerified(time, availability, slotsVerified),
      );
    }
    return cleanerCount > 0;
  }

  function moveScheduleStage(direction: "back" | "next") {
    if (!activeScheduleStage) return;

    if (skipsBookingTypeStage) {
      if (activeScheduleStage === "date_time") {
        if (direction === "back") goBack();
        else editScheduleSection("cleaner");
        return;
      }
      if (activeScheduleStage === "cleaner") {
        if (direction === "back") editScheduleSection("date_time");
        else void goNext();
        return;
      }
    }

    const adjacent = adjacentRegularCleaningScheduleStage(
      activeScheduleStage,
      direction,
      bookingType,
    );
    if (adjacent) {
      editScheduleSection(adjacent);
    } else if (direction === "back") {
      goBack();
    } else {
      void goNext();
    }
  }

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="text-center">
        <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">
          {isBookingTypeStage ? "How often do you need help?" : copy.title}
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          {isBookingTypeStage ? "How often do you need the service?" : copy.subtitle}
        </p>
      </div>

      {!areaResolved ? (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          <p className="font-medium">Confirm your suburb in Step 1 before choosing a date.</p>
          <p className="mt-1 text-amber-900/80">
            {suburb?.trim()
              ? "We could not match that suburb to a service area yet."
              : "A supported service area is required for availability."}
          </p>
          <button
            type="button"
            onClick={() => goToStep(1)}
            className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-amber-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-amber-800"
          >
            Return to Step 1
          </button>
        </div>
      ) : null}

      {showBookingTypeSelection ? <hr className="border-slate-200" /> : null}

      {/* ── Booking type ── */}
      {showBookingTypeSelection && (
        <section
          className="space-y-4"
          data-booking-type-options={progressiveIndividualSchedule ? "true" : undefined}
        >
        {!progressiveIndividualSchedule ? (
          <h3 className="text-center text-sm font-semibold uppercase tracking-wide text-slate-400">
            Booking type
          </h3>
        ) : null}
        <Controller
          name="bookingType"
          control={control}
          render={({ field }) => (
            <div className={cn(
              "w-full",
              progressiveIndividualSchedule
                ? "mx-auto grid max-w-[500px] grid-cols-1 gap-4 pt-2 sm:grid-cols-2 sm:gap-5"
                : "flex flex-col gap-3 sm:flex-row sm:justify-center",
            )}>
              {[
                {
                  value: "once_off",
                  label: progressiveIndividualSchedule ? "One Time" : "Once-off",
                  description: "For a once-off service that will not repeat.",
                  icon: CalendarPlus,
                },
                {
                  value: "recurring",
                  label: progressiveIndividualSchedule ? "Repeat" : isDeepCleaning ? "Monthly" : "Recurring",
                  description: isDeepCleaning
                    ? "One deep clean every month, charged monthly."
                    : "For repeat services every few days or weeks.",
                  icon: RefreshCw,
                },
              ].filter((opt) => opt.value === "once_off" || allowsRecurringBookings).map((opt) => {
                const selected = field.value === opt.value;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      field.onChange(opt.value);
                      if (isDeepCleaning) {
                        setValue(
                          "recurringFrequency",
                          opt.value === "recurring" ? DEEP_CLEANING_RECURRING_FREQUENCY : "",
                          { shouldDirty: true, shouldValidate: true },
                        );
                        setValue("recurringDays", [], { shouldDirty: true, shouldValidate: true });
                      }
                    }}
                    disabled={!areaResolved}
                    className={cn(
                      progressiveIndividualSchedule
                        ? "relative min-h-[120px] overflow-hidden rounded-xl border bg-white p-3 pl-2 text-left shadow-md transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                        : "min-h-11 w-full rounded-xl border px-6 py-3 text-sm font-semibold transition sm:w-auto sm:min-w-[120px]",
                      selected
                        ? "border-blue-600 bg-blue-50/60 text-blue-700 ring-2 ring-blue-600/15"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                      !areaResolved && "cursor-not-allowed opacity-50",
                    )}
                  >
                    {progressiveIndividualSchedule ? (
                      <>
                        <span className="flex items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                            <Icon className="h-5 w-5" aria-hidden />
                          </span>
                          <span className="text-base font-bold leading-6 text-slate-900">{opt.label}</span>
                        </span>
                        <span className="mt-2 line-clamp-2 block text-sm leading-5 text-slate-600">
                          {opt.description}
                        </span>
                      </>
                    ) : opt.label}
                  </button>
                );
              })}
            </div>
          )}
        />
        </section>
      )}

      {!progressiveIndividualSchedule || activeScheduleStage === "date_time" ? <hr className="border-slate-200" /> : null}

      {/* ── Date & time ── */}
      {(!progressiveIndividualSchedule || activeScheduleStage === "date_time") && <section className="space-y-4">
        <h3 className="text-center text-sm font-semibold uppercase tracking-wide text-slate-400">
          Date &amp; time
        </h3>

        <div
          className="mx-auto grid w-full max-w-3xl gap-4 sm:grid-cols-2"
          data-compact-date-time-controls="true"
        >
          <div className="min-w-0">
            <label htmlFor="booking-date" className="mb-2 block text-sm font-semibold text-slate-800">
              Pick a date <span className="text-red-500">*</span>
            </label>
            <Controller
              name="date"
              control={control}
              rules={{ required: "Select a date" }}
              render={({ field }) => (
                <BookingDateDropdown
                  id="booking-date"
                  minDate={today}
                  value={field.value ?? ""}
                  onChange={(nextDate) => {
                    if (isTeamMode && nextDate !== field.value) {
                      setValue("assignedTeamId", "", {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                      setValue("assignedTeamName", "", {
                        shouldDirty: true,
                      });
                    }
                    field.onChange(nextDate);
                  }}
                  disabled={!areaResolved}
                />
              )}
            />
            <FieldError message={errors.date?.message} />
          </div>

          <div className="min-w-0">
            <label htmlFor="booking-time" className="mb-2 block text-sm font-semibold text-slate-800">
              Pick a time <span className="text-red-500">*</span>
            </label>
            <Controller
              name="time"
              control={control}
              rules={{ required: "Select a time" }}
              render={({ field }) => (
                <BookingTimeDropdown
                  id="booking-time"
                  value={field.value ?? ""}
                  onChange={(nextTime) => {
                    setValue("time", nextTime, {
                      shouldDirty: true,
                      shouldTouch: true,
                      shouldValidate: true,
                    });
                    clearErrors("time");
                  }}
                  slots={availableTimeSlots}
                  loading={slotsLoading || Boolean(date && !slotsVerified)}
                  disabled={
                    !date ||
                    !areaResolved ||
                    slotsLoading ||
                    !slotsVerified ||
                    availableTimeSlots.length === 0
                  }
                />
              )}
            />
            <FieldError message={errors.time?.message} />
            {slotsFetchError ? (
              <p className="mt-2 text-xs text-red-600" role="status">
                Could not load live availability. Please try another date or try again.
              </p>
            ) : null}
          </div>
        </div>
      </section>}

      {/* ── Recurring schedule ── */}
      {allowsRecurringBookings && bookingType === "recurring" && !isDeepCleaning && (!progressiveIndividualSchedule || activeScheduleStage === "booking_type") && (
        <>
          <hr className="border-slate-200" />
          <section className="space-y-5">
            <h3 className="text-center text-sm font-semibold uppercase tracking-wide text-slate-400">
              Recurring schedule
            </h3>

            {/* Frequency */}
            <div>
              <p className="text-center text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                Frequency <span className="text-red-500">*</span>
              </p>
              <p className="mt-2 text-center text-sm text-slate-500">
                Select how often you need cleaning.
              </p>
              <Controller
                name="recurringFrequency"
                control={control}
                render={({ field }) => (
                  <div className="mx-auto mt-6 grid w-full max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {recurringFrequencyOptions.map((opt) => {
                      const selected = field.value === opt.value;
                      const presentation = FREQUENCY_PRESENTATION[opt.value];
                      const Icon = presentation.icon;

                      return (
                        <button
                          key={opt.value}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => field.onChange(opt.value)}
                          className={cn(
                            "relative min-h-36 overflow-hidden rounded-xl border bg-white p-4 text-left shadow-md transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:aspect-auto sm:h-[100px] sm:min-h-0 sm:px-3 sm:py-2",
                            selected
                              ? "border-blue-600 bg-blue-50/60 ring-2 ring-blue-600/15"
                              : "border-slate-200 text-slate-800",
                          )}
                        >
                          <span className="flex items-center gap-3 sm:gap-2">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700 sm:h-8 sm:w-8">
                              <Icon className="h-5 w-5" aria-hidden />
                            </span>
                            <span className="whitespace-nowrap text-base font-bold leading-6 text-slate-900">
                              {opt.label}
                            </span>
                          </span>
                          <span className="mt-2 block text-sm leading-5 text-slate-600 sm:mt-1 sm:text-[13px] sm:leading-4">
                            {presentation.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              />
              <FieldError message={errors.recurringFrequency?.message} />
            </div>

            {/* Preferred days (part of weekly / fortnightly / monthly) */}
            {serviceUsesRecurringDayPicker(serviceSlug) && shouldShowRecurringDayPicker(recurringFrequency) && (
              <div className="flex flex-col items-center gap-3">
                <p className="text-sm font-medium text-slate-700">
                  Preferred days
                </p>
                <p className="text-xs text-slate-500">
                  Select every visit day. Choosing multiple days means multiple visits in each schedule cycle.
                </p>
                <Controller
                  name="recurringDays"
                  control={control}
                  render={({ field }) => (
                    <div className="flex flex-wrap justify-center gap-2">
                      {WEEKDAYS.map((day) => {
                        const checked = (field.value ?? []).includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => {
                              const current = field.value ?? [];
                              field.onChange(
                                checked
                                  ? current.filter((d) => d !== day)
                                  : [...current, day],
                              );
                            }}
                            className={cn(
                              "rounded-xl border px-3 py-1.5 text-sm font-medium transition",
                              checked
                                ? "border-blue-600 bg-blue-50 text-blue-700"
                                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                            )}
                          >
                            {day.slice(0, 3)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                />
              </div>
            )}

          </section>
        </>
      )}

      {!progressiveIndividualSchedule || activeScheduleStage === "cleaner" ? <hr className="border-slate-200" /> : null}

      {/* ── Team availability (deep / moving cleaning) ── */}
      {isTeamMode && (!progressiveIndividualSchedule || activeScheduleStage === "cleaner") && (
        <section>
          <TeamAvailabilitySection
            date={date}
            serviceSlug={serviceSlug}
            selectedTeamId={assignedTeamId}
            onSelect={(id, name) => {
              setValue("assignedTeamId", id, {
                shouldDirty: true,
                shouldValidate: true,
              });
              setValue("assignedTeamName", name, {
                shouldDirty: true,
              });
            }}
            autoAssign
          />
          <FieldError message={errors.assignedTeamId?.message} />
        </section>
      )}

      {/* ── Cleaner count + preference (individual mode) ── */}
      {!isTeamMode && (!progressiveIndividualSchedule || activeScheduleStage === "cleaner") && (
        <section className="space-y-6">
          {!isCarpetCleaning ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-sm font-medium text-slate-600">
                {cleanerCount === 1 ? "1 cleaner" : `${cleanerCount} cleaners`}
              </span>
              <div className="flex flex-wrap justify-center gap-2">
                {cleanerCount < 3 ? (
                  <button
                    type="button"
                    onClick={() => setValue("cleanerCount", cleanerCount + 1, { shouldDirty: true })}
                    className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
                  >
                    Add another cleaner
                  </button>
                ) : null}
                {cleanerCount > 1 ? (
                  <button
                    type="button"
                    onClick={() => {
                      const next = cleanerCount - 1;
                      setValue("cleanerCount", next, { shouldDirty: true });
                      if (selectedCleanerIds.length > next) {
                        setValue("selectedCleanerIds", selectedCleanerIds.slice(0, next));
                        setValue("selectedCleanerDetails", selectedCleanerDetails.slice(0, next));
                      }
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    Remove extra cleaner
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <CleanerPreferenceSection
            serviceSlug={serviceSlug}
            date={date}
            time={time}
            durationMinutes={durationMinutes}
            locationId={serviceAreaLocationId?.trim() ?? ""}
            selectedIds={selectedCleanerIds}
            selectedDetails={selectedCleanerDetails}
            maxSelect={isCarpetCleaning ? 1 : cleanerCount}
            heading={isCarpetCleaning ? "Choose your specialist" : undefined}
            personLabel={isCarpetCleaning ? "specialist" : undefined}
            onToggle={toggleCleaner}
            onClearAll={clearCleanerSelection}
            onResync={(matched) =>
              setValue("selectedCleanerDetails", [
                ...selectedCleanerDetails.filter((d) => !matched.some((m) => m.id === d.id)),
                ...matched,
              ])
            }
          />
        </section>
      )}

      {isTeamMode && (isDeepCleaning || isMovingCleaning) ? (
        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={goBack}
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 sm:w-auto"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={() => void goNext()}
            disabled={!teamScheduleReady}
            className="min-h-11 w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            Continue to Review →
          </button>
        </div>
      ) : null}

      {progressiveIndividualSchedule && activeScheduleStage ? (
        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => moveScheduleStage("back")}
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 sm:w-auto"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={() => moveScheduleStage("next")}
            disabled={!stageIsReady(activeScheduleStage)}
            className="min-h-11 w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {activeScheduleStage === "cleaner" ? "Continue to Review →" : "Continue →"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
