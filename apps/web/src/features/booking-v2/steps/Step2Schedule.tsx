"use client";

import { useEffect, useState } from "react";
import { useFormContext, Controller } from "react-hook-form";
import {
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SERVICE_CONFIG } from "@/src/features/booking-v2/config/serviceConfig";
import type {
  AvailableCleanerV2,
  BookingV2FormData,
  ServiceSlug,
} from "@/src/features/booking-v2/types";
import { useBookingV2 } from "@/src/features/booking-v2/BookingV2Context";
import { CleanerCountSelector } from "@/src/features/booking-v2/components/CleanerCountSelector";
import { CleanerPreferenceSection } from "@/src/features/booking-v2/components/CleanerPreferenceSection";
import { TeamAvailabilitySection } from "@/src/features/booking-v2/components/TeamAvailabilitySection";
import {
  RECURRING_FREQUENCY_OPTIONS,
  RECURRING_WEEKDAYS,
  shouldShowRecurringDayPicker,
} from "@/src/features/booking-v2/config/recurringScheduleOptions";
import { TimeSlotPicker } from "@/src/features/booking-v2/components/TimeSlotPicker";
import { filterCustomerOnlineBookingTimeSlots } from "@/lib/booking-v2/customerBookingTimeSlots";

// ─── Constants ─────────────────────────────────────────────────────────────────

const RECURRING_FREQUENCIES = RECURRING_FREQUENCY_OPTIONS;

const WEEKDAYS = [...RECURRING_WEEKDAYS];

const MONTH_NAMES = [
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
];

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
    subtitle: "Select a date — our full team will handle the rest.",
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

// ─── Custom inline calendar ────────────────────────────────────────────────────

function CustomCalendar({
  value,
  onChange,
  minDate,
  embedded,
}: {
  value: string;
  onChange: (date: string) => void;
  minDate?: string;
  /** Drop outer card chrome when nested inside a parent card. */
  embedded?: boolean;
}) {
  const todayStr = new Date().toISOString().split("T")[0];

  const [viewYear, setViewYear] = useState<number>(() => {
    if (value) return parseInt(value.split("-")[0]);
    return new Date().getFullYear();
  });
  const [viewMonth, setViewMonth] = useState<number>(() => {
    if (value) return parseInt(value.split("-")[1]) - 1;
    return new Date().getMonth();
  });

  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  // Monday-first: Sun(0)→6, Mon(1)→0, Tue(2)→1 …
  const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }
  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  function toDateStr(day: number) {
    return `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return (
    <div
      className={cn(
        "w-full",
        embedded ? "max-w-none p-0" : "max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-sm",
      )}
    >
      {/* Month / year header */}
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={prevMonth}
          aria-label="Previous month"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold text-slate-800">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </p>
        <button
          type="button"
          onClick={nextMonth}
          aria-label="Next month"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="mb-1 grid grid-cols-7">
        {DAY_LABELS.map((d) => (
          <div
            key={d}
            className="py-1 text-center text-xs font-medium text-slate-400"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} />;
          const ds = toDateStr(day);
          const disabled = !!(minDate && ds < minDate);
          const selected = value === ds;
          const isToday = todayStr === ds;
          return (
            <button
              key={idx}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && onChange(ds)}
              className={cn(
                "flex h-9 w-full items-center justify-center rounded-lg text-sm transition",
                disabled && "cursor-not-allowed text-slate-200",
                !disabled &&
                  !selected &&
                  !isToday &&
                  "text-slate-700 hover:bg-blue-50 hover:text-blue-600",
                !disabled &&
                  isToday &&
                  !selected &&
                  "font-bold text-blue-600 ring-2 ring-blue-200 ring-offset-1",
                selected && "bg-blue-600 font-bold text-white shadow-sm",
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 2 ─────────────────────────────────────────────────────────────────────

export function Step2Schedule() {
  const { serviceSlug, liveConfig, scheduling } = useBookingV2();
  const config = SERVICE_CONFIG[serviceSlug];
  const copy = STEP2_COPY[serviceSlug];
  const isTeamMode = (liveConfig?.cleanerMode ?? config.cleanerMode) === "team";

  const {
    control,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<BookingV2FormData>();

  const bookingType = watch("bookingType");
  const date = watch("date");
  const time = watch("time");
  const cleanerCount = watch("cleanerCount") ?? 1;
  const recurringFrequency = watch("recurringFrequency");
  const selectedCleanerIds = watch("selectedCleanerIds") ?? [];
  const selectedCleanerDetails = watch("selectedCleanerDetails") ?? [];
  const assignedTeamId = watch("assignedTeamId") ?? "";

  const durationMinutes = Math.round(
    (watch("pricingSummary")?.estimated_duration_minutes ??
      (liveConfig?.estimatedDurationHours ?? config.estimatedDurationHours) * 60),
  );

  const today = new Date().toISOString().split("T")[0];

  // Legacy saved forms used "custom" as its own frequency — fold into weekly + day picker.
  useEffect(() => {
    if (bookingType === "recurring" && recurringFrequency === "custom") {
      setValue("recurringFrequency", "weekly", { shouldDirty: true });
    }
  }, [bookingType, recurringFrequency, setValue]);

  useEffect(() => {
    if (!date) return;
    const available = filterCustomerOnlineBookingTimeSlots(date, { scheduling });
    if (time && !available.includes(time)) {
      setValue("time", available[0] ?? "", { shouldValidate: true });
    }
  }, [date, time, setValue, scheduling]);

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

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="text-center">
        <h2 className="text-xl font-bold text-slate-900">{copy.title}</h2>
        <p className="mt-1 text-sm text-slate-500">{copy.subtitle}</p>
      </div>

      <hr className="border-slate-200" />

      {/* ── Booking type ── */}
      <section className="space-y-4">
        <h3 className="text-center text-sm font-semibold uppercase tracking-wide text-slate-400">
          Booking type
        </h3>
        <Controller
          name="bookingType"
          control={control}
          render={({ field }) => (
            <div className="flex justify-center gap-3">
              {[
                { value: "once_off", label: "Once-off" },
                { value: "recurring", label: "Recurring" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => field.onChange(opt.value)}
                  className={cn(
                    "min-w-[120px] rounded-xl border px-6 py-3 text-sm font-semibold transition",
                    field.value === opt.value
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        />
      </section>

      <hr className="border-slate-200" />

      {/* ── Date & time ── */}
      <section className="space-y-4">
        <h3 className="text-center text-sm font-semibold uppercase tracking-wide text-slate-400">
          Date &amp; time
        </h3>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Date card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-slate-800">Pick a date</p>
            <div className="flex justify-center">
              <Controller
                name="date"
                control={control}
                rules={{ required: "Select a date" }}
                render={({ field }) => (
                  <CustomCalendar
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    minDate={today}
                    embedded
                  />
                )}
              />
            </div>
            <FieldError message={errors.date?.message} />
          </div>

          {/* Time card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-1 text-sm font-semibold text-slate-800">
              Pick a time <span className="text-red-500">*</span>
            </p>
            <p className="mb-3 text-xs text-slate-500">
              {date ? "Online until 12:30" : "Select a date first."}
            </p>
            <Controller
              name="time"
              control={control}
              rules={{ required: "Select a time" }}
              render={({ field }) =>
                date ? (
                  <TimeSlotPicker
                    dateYmd={date}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    scheduling={scheduling}
                  />
                ) : (
                  <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
                    Choose a date to see available times
                  </p>
                )
              }
            />
            <FieldError message={errors.time?.message} />
          </div>
        </div>
      </section>

      {/* ── Recurring schedule ── */}
      {bookingType === "recurring" && (
        <>
          <hr className="border-slate-200" />
          <section className="space-y-5">
            <h3 className="text-center text-sm font-semibold uppercase tracking-wide text-slate-400">
              Recurring schedule
            </h3>

            {/* Frequency */}
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm font-medium text-slate-700">
                Frequency <span className="text-red-500">*</span>
              </p>
              <Controller
                name="recurringFrequency"
                control={control}
                render={({ field }) => (
                  <div className="flex flex-wrap justify-center gap-2">
                    {RECURRING_FREQUENCIES.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => field.onChange(opt.value)}
                        className={cn(
                          "rounded-xl border px-4 py-2 text-sm font-medium transition",
                          field.value === opt.value
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              />
              <FieldError message={errors.recurringFrequency?.message} />
            </div>

            {/* Preferred days (part of weekly / fortnightly / monthly) */}
            {shouldShowRecurringDayPicker(recurringFrequency) && (
              <div className="flex flex-col items-center gap-3">
                <p className="text-sm font-medium text-slate-700">
                  Preferred days
                </p>
                <p className="text-xs text-slate-500">
                  Select which days you&apos;d like us to visit on this schedule.
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

            {/* Start / end date */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="recurringStartDate"
                  className="mb-1.5 block text-center text-sm font-medium text-slate-700"
                >
                  Start date
                </label>
                <Controller
                  name="recurringStartDate"
                  control={control}
                  render={({ field }) => (
                    <input
                      id="recurringStartDate"
                      type="date"
                      min={today}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value)}
                      className="block w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  )}
                />
              </div>
              <div>
                <label
                  htmlFor="recurringEndDate"
                  className="mb-1.5 block text-center text-sm font-medium text-slate-700"
                >
                  End date (optional)
                </label>
                <Controller
                  name="recurringEndDate"
                  control={control}
                  render={({ field }) => (
                    <input
                      id="recurringEndDate"
                      type="date"
                      min={today}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value)}
                      className="block w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  )}
                />
              </div>
            </div>
          </section>
        </>
      )}

      <hr className="border-slate-200" />

      {/* ── Team availability (deep / moving cleaning) ── */}
      {isTeamMode && (
        <section>
          <TeamAvailabilitySection
            date={date}
            serviceSlug={serviceSlug}
            selectedTeamId={assignedTeamId}
            onSelect={(id) => setValue("assignedTeamId", id)}
          />
          <FieldError message={errors.assignedTeamId?.message} />
        </section>
      )}

      {/* ── Cleaner count + preference (individual mode) ── */}
      {!isTeamMode && (
        <section className="space-y-6">
          <CleanerCountSelector
            value={cleanerCount}
            onChange={(n) => {
              setValue("cleanerCount", n);
              // Trim excess selections when reducing count
              if (selectedCleanerIds.length > n) {
                setValue("selectedCleanerIds", selectedCleanerIds.slice(0, n));
                setValue("selectedCleanerDetails", selectedCleanerDetails.slice(0, n));
              }
            }}
          />

          <CleanerPreferenceSection
            serviceSlug={serviceSlug}
            date={date}
            time={time}
            durationMinutes={durationMinutes}
            selectedIds={selectedCleanerIds}
            selectedDetails={selectedCleanerDetails}
            maxSelect={cleanerCount}
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
    </div>
  );
}
