"use client";

import { useEffect, useState } from "react";
import { useFormContext, Controller } from "react-hook-form";
import {
  Pencil,
  MapPin,
  Calendar,
  Users,
  Clock,
  Star,
  X,
  ChevronLeft,
  ChevronRight,
  Package,
} from "lucide-react";
import { CleanerPreferenceSection } from "@/src/features/booking-v2/components/CleanerPreferenceSection";
import { formatAreasServedPreview } from "@/src/features/booking-v2/components/CleanerCard";
import { EquipmentSection } from "@/src/features/booking-v2/components/EquipmentSection";
import { RoomCountSelector } from "@/src/features/booking-v2/components/RoomCountSelector";
import { TeamAvailabilitySection } from "@/src/features/booking-v2/components/TeamAvailabilitySection";
import type { AvailableCleanerV2 } from "@/src/features/booking-v2/types";
import { cachedClientRequest } from "@/lib/booking-v2/clientRequestCache";
import { cn } from "@/lib/utils";
import {
  SERVICE_CONFIG,
  serviceShowsEquipmentQuestion,
  type FormQuestion,
} from "@/src/features/booking-v2/config/serviceConfig";
import type {
  BookingV2FormData,
} from "@/src/features/booking-v2/types";
import { useBookingV2 } from "@/src/features/booking-v2/BookingV2Context";
import { formatEstimatedCleaningTimeLabel } from "@/lib/booking-v2/formatEstimatedCleaningTime";
import {
  RECURRING_FREQUENCY_OPTIONS,
  RECURRING_WEEKDAYS,
  recurringFrequencyLabel,
  shouldShowRecurringDayPicker,
} from "@/src/features/booking-v2/config/recurringScheduleOptions";
import { buildRecurringPrepaymentQuote } from "@/lib/recurring/recurringPrepayment";
import {
  DEEP_CLEANING_RECURRING_FREQUENCY,
  recurringFrequenciesForService,
  serviceAllowsRecurringBookings,
  serviceUsesRecurringDayPicker,
} from "@/lib/booking-v2/serviceRecurringPolicy";
import { TimeSlotPicker } from "@/src/features/booking-v2/components/TimeSlotPicker";
import {
  ServiceQuestionOptionCards,
  shouldUseHorizontalOptionCards,
} from "@/src/features/booking-v2/components/ServiceQuestionOptionCards";
import { getBookingLocationOptions } from "@/lib/locations/bookingLocations";
import {
  CONTACT_PHONE_VALIDATION_MESSAGE,
  isValidContactPhone,
} from "@/lib/booking/contactPhoneValidation";
import { bookingDetailsQuestionStage } from "@/src/features/booking-v2/steps/serviceProgressiveDisclosure";

// ─── Constants ─────────────────────────────────────────────────────────────────

import {
  CustomerPriceBreakdown,
  SelectedExtrasList,
} from "@/src/features/booking-v2/components/CustomerPriceBreakdown";

const RECURRING_FREQUENCIES = RECURRING_FREQUENCY_OPTIONS;

const WEEKDAYS = [...RECURRING_WEEKDAYS];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];


// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-ZA", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
  } catch {
    return dateStr;
  }
}


// ─── Custom inline calendar ────────────────────────────────────────────────────

function CustomCalendar({
  value,
  onChange,
  minDate,
}: {
  value: string;
  onChange: (date: string) => void;
  minDate?: string;
}) {
  const todayStr = new Date().toISOString().split("T")[0];
  const [viewYear, setViewYear] = useState<number>(() =>
    value ? parseInt(value.split("-")[0]) : new Date().getFullYear(),
  );
  const [viewMonth, setViewMonth] = useState<number>(() =>
    value ? parseInt(value.split("-")[1]) - 1 : new Date().getMonth(),
  );

  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }
  function toDateStr(day: number) {
    return `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <button type="button" onClick={prevMonth} aria-label="Previous month"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold text-slate-800">{MONTH_NAMES[viewMonth]} {viewYear}</p>
        <button type="button" onClick={nextMonth} aria-label="Next month"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="mb-1 grid grid-cols-7">
        {DAY_LABELS.map((d) => (
          <div key={d} className="py-1 text-center text-xs font-medium text-slate-400">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} />;
          const ds = toDateStr(day);
          const disabled = !!(minDate && ds < minDate);
          const selected = value === ds;
          const isToday = todayStr === ds;
          return (
            <button key={idx} type="button" disabled={disabled}
              onClick={() => !disabled && onChange(ds)}
              className={cn(
                "flex h-9 w-full items-center justify-center rounded-lg text-sm transition",
                disabled && "cursor-not-allowed text-slate-200",
                !disabled && !selected && !isToday && "text-slate-700 hover:bg-blue-50 hover:text-blue-600",
                !disabled && isToday && !selected && "font-bold text-blue-600 ring-2 ring-blue-200 ring-offset-1",
                selected && "bg-blue-600 font-bold text-white shadow-sm",
              )}>
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Simplified question field for modals ─────────────────────────────────────

function ModalQuestionField({ question }: { question: FormQuestion }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, control } = useFormContext() as any;
  const fieldKey = `serviceDetails.${question.key}`;

  if (
    question.key === "bedrooms" ||
    question.key === "bathrooms" ||
    question.key === "extraRooms"
  ) {
    const kind = question.key as "bedrooms" | "bathrooms" | "extraRooms";
    return (
      <div>
        <label htmlFor={question.key} className="mb-1.5 block text-sm font-medium text-slate-700">
          {question.label}
          {question.required && <span className="ml-1 text-red-500">*</span>}
        </label>
        <Controller
          name={fieldKey}
          control={control}
          render={({ field }) => (
            <RoomCountSelector
              id={question.key}
              kind={kind}
              value={String(field.value ?? "")}
              onChange={field.onChange}
            />
          )}
        />
        {question.hint && <p className="mt-1 text-xs text-slate-400">{question.hint}</p>}
      </div>
    );
  }

  if (shouldUseHorizontalOptionCards(question)) {
    return <ServiceQuestionOptionCards question={question} compact />;
  }

  if (question.type === "select") {
    return (
      <div>
        <label htmlFor={question.key} className="mb-1.5 block text-sm font-medium text-slate-700">
          {question.label}
          {question.required && <span className="ml-1 text-red-500">*</span>}
        </label>
        <Controller name={fieldKey} control={control}
          render={({ field }) => (
            <select id={question.key} value={String(field.value ?? "")}
              onChange={(e) => field.onChange(e.target.value)}
              className="block w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
              <option value="">Select…</option>
              {question.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}
        />
        {question.hint && <p className="mt-1 text-xs text-slate-400">{question.hint}</p>}
      </div>
    );
  }

  if (question.type === "textarea") {
    return (
      <div>
        <label htmlFor={question.key} className="mb-1.5 block text-sm font-medium text-slate-700">
          {question.label}
        </label>
        <textarea id={question.key} {...register(fieldKey)} rows={3}
          placeholder={question.placeholder}
          className="block w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={question.key} className="mb-1.5 block text-sm font-medium text-slate-700">
        {question.label}
      </label>
      <input id={question.key} type={question.type === "number" ? "number" : "text"}
        placeholder={question.placeholder}
        {...register(fieldKey)}
        className="block w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
    </div>
  );
}

// ─── Edit modal shell ──────────────────────────────────────────────────────────

function EditModal({
  title,
  onSave,
  onCancel,
  children,
}: {
  title: string;
  onSave: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-modal-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />

      {/* Card — dvh + safe-area so iOS Safari doesn't clip the footer */}
      <div
        className="relative z-10 flex w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        style={{ maxHeight: "min(90dvh, calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom)))" }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-5">
          <h3 id="edit-modal-title" className="min-w-0 pr-2 text-base font-bold text-slate-900">
            {title}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body — only scroll container inside the modal */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-5">
          <div className="space-y-5">{children}</div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-100 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            className="inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Location edit panel ───────────────────────────────────────────────────────

function LocationEditPanel() {
  const { register, control } = useFormContext<BookingV2FormData>();

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="edit-address" className="mb-1.5 block text-sm font-medium text-slate-700">
          Street address <span className="text-red-500">*</span>
        </label>
        <input
          id="edit-address"
          type="text"
          {...register("address", { required: true, minLength: 5 })}
          className="block w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

      <div>
        <label htmlFor="edit-suburb" className="mb-1.5 block text-sm font-medium text-slate-700">
          Suburb <span className="text-red-500">*</span>
        </label>
        <Controller
          name="suburb"
          control={control}
          render={({ field }) => (
            <select
              id="edit-suburb"
              value={field.value ?? ""}
              onChange={(e) => field.onChange(e.target.value)}
              className="block w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">Select suburb…</option>
              {getBookingLocationOptions().map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        />
      </div>

      <div>
        <label htmlFor="edit-contact-phone" className="mb-1.5 block text-sm font-medium text-slate-700">
          Contact phone <span className="text-red-500">*</span>
        </label>
        <input
          id="edit-contact-phone"
          type="tel"
          {...register("contactPhone", {
            required: "Enter a contact phone number",
            validate: (value) => isValidContactPhone(value) || CONTACT_PHONE_VALIDATION_MESSAGE,
          })}
          className="block w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

    </div>
  );
}

function EquipmentEditPanel() {
  return <EquipmentSection />;
}

function PropertyEditPanel() {
  const { serviceSlug, liveConfig } = useBookingV2();
  const { watch } = useFormContext<BookingV2FormData>();
  const config = SERVICE_CONFIG[serviceSlug];
  const serviceDetails = watch("serviceDetails") ?? {};
  const step1Questions = (liveConfig?.step1Questions ?? config.step1Questions).filter((question) => {
    if (bookingDetailsQuestionStage(serviceSlug, question) == null) return false;
    if (!question.showWhen) return true;
    return question.showWhen.values.includes(
      String(serviceDetails[question.showWhen.key] ?? ""),
    );
  });

  return (
    <div className="space-y-4">
      {step1Questions.map((q) => (
        <ModalQuestionField key={q.key} question={q} />
      ))}
    </div>
  );
}

// ─── Schedule edit panel ───────────────────────────────────────────────────────

function ScheduleEditPanel() {
  const { scheduling, serviceSlug } = useBookingV2();
  const isDeepCleaning = serviceSlug === "deep-cleaning";
  const isCarpetCleaning = serviceSlug === "carpet-cleaning";
  const isAirbnbCleaning = serviceSlug === "airbnb-cleaning";
  const allowsRecurringBookings = serviceAllowsRecurringBookings(serviceSlug);
  const serviceRecurringFrequencies = recurringFrequenciesForService(serviceSlug);
  const recurringFrequencyOptions = RECURRING_FREQUENCIES.filter((option) =>
    serviceRecurringFrequencies.includes(option.value),
  );

  const { control, watch, setValue } = useFormContext<BookingV2FormData>();
  const bookingType = watch("bookingType");
  const date = watch("date");
  const recurringFrequency = watch("recurringFrequency");

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (!allowsRecurringBookings && bookingType === "recurring") {
      setValue("bookingType", "once_off", { shouldDirty: true, shouldValidate: true });
      setValue("recurringFrequency", "", { shouldDirty: true, shouldValidate: true });
      setValue("recurringDays", [], { shouldDirty: true, shouldValidate: true });
      return;
    }
    if (bookingType !== "recurring") return;
    if (isDeepCleaning) {
      if (recurringFrequency !== DEEP_CLEANING_RECURRING_FREQUENCY) {
        setValue("recurringFrequency", DEEP_CLEANING_RECURRING_FREQUENCY, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
      setValue("recurringDays", [], { shouldDirty: true, shouldValidate: true });
      return;
    }
    if (recurringFrequency === "custom") {
      setValue("recurringFrequency", "weekly", { shouldDirty: true });
    }
  }, [allowsRecurringBookings, bookingType, isDeepCleaning, recurringFrequency, setValue]);

  return (
    <div className="space-y-5">
      {allowsRecurringBookings ? (
        <>
          {/* Booking type */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Booking type
            </p>
            <Controller name="bookingType" control={control}
              render={({ field }) => (
                <div className="flex gap-3">
                  {[{ value: "once_off", label: "Once-off" }, { value: "recurring", label: isDeepCleaning ? "Monthly" : "Recurring" }].map((opt) => (
                    <button key={opt.value} type="button" onClick={() => {
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
                      className={cn(
                        "flex-1 rounded-xl border py-2.5 text-sm font-semibold transition",
                        field.value === opt.value
                          ? "border-blue-600 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                      )}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            />
          </div>

          <hr className="border-slate-100" />
        </>
      ) : null}

      {/* Date */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Date
        </p>
        <Controller name="date" control={control}
          render={({ field }) => (
            <CustomCalendar value={field.value ?? ""} onChange={field.onChange} minDate={today} />
          )}
        />
      </div>

      <hr className="border-slate-100" />

      {/* Time */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Preferred time
        </p>
        <Controller
          name="time"
          control={control}
          render={({ field }) => (
            <TimeSlotPicker
              compact
              dateYmd={date || today}
              value={field.value ?? ""}
              onChange={field.onChange}
              scheduling={scheduling}
            />
          )}
        />
      </div>

      {/* Recurring options */}
      {allowsRecurringBookings && bookingType === "recurring" && !isDeepCleaning && (
        <>
          <hr className="border-slate-100" />
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Recurring schedule
            </p>
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Frequency</p>
              <Controller name="recurringFrequency" control={control}
                render={({ field }) => (
                  <div className="flex flex-wrap gap-2">
                    {recurringFrequencyOptions.map((opt) => (
                      <button key={opt.value} type="button" onClick={() => field.onChange(opt.value)}
                        className={cn(
                          "rounded-xl border px-4 py-2 text-sm font-medium transition",
                          field.value === opt.value
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                        )}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              />
            </div>

            {serviceUsesRecurringDayPicker(serviceSlug) && shouldShowRecurringDayPicker(recurringFrequency) && (
              <div>
                <p className="mb-1 text-sm font-medium text-slate-700">Preferred days</p>
                <p className="mb-2 text-xs text-slate-500">
                  Select which days you&apos;d like us to visit on this schedule.
                </p>
                <Controller name="recurringDays" control={control}
                  render={({ field }) => (
                    <div className="flex flex-wrap gap-2">
                      {WEEKDAYS.map((day) => {
                        const checked = (field.value ?? []).includes(day);
                        return (
                          <button key={day} type="button"
                            onClick={() => {
                              const current = field.value ?? [];
                              field.onChange(checked ? current.filter((d) => d !== day) : [...current, day]);
                            }}
                            className={cn(
                              "rounded-xl border px-3 py-1.5 text-sm font-medium transition",
                              checked
                                ? "border-blue-600 bg-blue-50 text-blue-700"
                                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                            )}>
                            {day.slice(0, 3)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                />
              </div>
            )}

          </div>
        </>
      )}
    </div>
  );
}

function CleanerEditPanel() {
  const { serviceSlug, liveConfig } = useBookingV2();
  const config = SERVICE_CONFIG[serviceSlug];
  const isTeamMode = (liveConfig?.cleanerMode ?? config.cleanerMode) === "team";
  const isCarpetCleaning = serviceSlug === "carpet-cleaning";

  const { watch, setValue } = useFormContext<BookingV2FormData>();
  const date = watch("date");
  const time = watch("time");
  const pricingSummary = watch("pricingSummary");
  const cleanerCount = isCarpetCleaning ? 1 : (watch("cleanerCount") ?? 1);
  const selectedCleanerIds = watch("selectedCleanerIds") ?? [];
  const selectedCleanerDetails = watch("selectedCleanerDetails") ?? [];
  const assignedTeamId = watch("assignedTeamId") ?? "";
  const serviceAreaLocationId = watch("serviceAreaLocationId") ?? "";

  const durationMinutes = Math.round(
    pricingSummary?.team_scaled_duration_minutes ??
      pricingSummary?.estimated_duration_minutes ??
      (liveConfig?.estimatedDurationHours ?? config.estimatedDurationHours) * 60,
  );

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
      setValue("selectedCleanerIds", [...ids.slice(1), cleaner.id]);
      setValue("selectedCleanerDetails", [...details.slice(1), cleaner]);
    }
  }

  function clearCleanerSelection() {
    setValue("selectedCleanerIds", []);
    setValue("selectedCleanerDetails", []);
  }

  return (
    <div className="space-y-4">
      {isTeamMode ? (
        <TeamAvailabilitySection
          date={date}
          serviceSlug={serviceSlug}
          selectedTeamId={assignedTeamId}
          onSelect={(id, name) => {
            setValue("assignedTeamId", id);
            setValue("assignedTeamName", name);
          }}
          autoAssign
        />
      ) : (
        <>
          {!isCarpetCleaning ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-sm font-medium text-slate-700">
                {cleanerCount === 1 ? "1 cleaner included" : `${cleanerCount} cleaners selected`}
              </span>
              {cleanerCount < 3 ? (
                <button type="button" onClick={() => setValue("cleanerCount", cleanerCount + 1, { shouldDirty: true })}
                  className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">
                  Add another cleaner
                </button>
              ) : null}
              {cleanerCount > 1 ? (
                <button type="button" onClick={() => {
                  const next = cleanerCount - 1;
                  setValue("cleanerCount", next, { shouldDirty: true });
                  if (selectedCleanerIds.length > next) {
                    setValue("selectedCleanerIds", selectedCleanerIds.slice(0, next));
                    setValue("selectedCleanerDetails", selectedCleanerDetails.slice(0, next));
                  }
                }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600">
                  Remove extra cleaner
                </button>
              ) : null}
            </div>
          ) : null}

          <CleanerPreferenceSection
            serviceSlug={serviceSlug}
            date={date}
            time={time}
            durationMinutes={durationMinutes}
            locationId={serviceAreaLocationId.trim()}
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
        </>
      )}
    </div>
  );
}

// ─── Extras edit panel ─────────────────────────────────────────────────────────

function ExtrasEditPanel() {
  const { liveConfig } = useBookingV2();
  const { watch, setValue } = useFormContext<BookingV2FormData>();
  const selectedExtras = watch("selectedExtras") ?? [];

  // Extras from DB catalog only (managed via /office/pricing)
  const extras = liveConfig?.extras ?? [];

  if (!extras.length) {
    return (
      <p className="text-sm text-slate-500">
        No add-ons are available for this service.
      </p>
    );
  }

  function toggleExtra(id: string) {
    const current = selectedExtras;
    const updated = current.includes(id)
      ? current.filter((e) => e !== id)
      : [...current, id];
    setValue("selectedExtras", updated, { shouldDirty: true });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Select extras
      </p>
      <div className="space-y-2">
        {extras.map((extra) => {
          const checked = selectedExtras.includes(extra.id);
          return (
            <button key={extra.id} type="button" onClick={() => toggleExtra(extra.id)}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl border p-4 text-left transition",
                checked ? "border-blue-600 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300",
              )}>
              <div className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition",
                checked ? "border-blue-600 bg-blue-600" : "border-slate-300",
              )}>
                {checked && (
                  <svg viewBox="0 0 12 10" className="h-3 w-3" aria-hidden>
                    <path d="M1 5l3.5 3.5L11 1" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" />
                  </svg>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className={cn("text-sm font-semibold", checked ? "text-blue-700" : "text-slate-800")}>
                    {extra.label}
                  </p>
                  <p className={cn("shrink-0 text-sm font-bold", checked ? "text-blue-600" : "text-slate-600")}>
                    +R{extra.priceZar}
                  </p>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{extra.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Cleaner preview card (read-only, used in the Review step) ─────────────────

function CleanerPreviewCard({
  cleaner,
  preferenceLabel = "Preferred cleaner",
}: {
  cleaner: AvailableCleanerV2;
  preferenceLabel?: string;
}) {
  const areas = formatAreasServedPreview(cleaner.areasServed);

  return (
    <div className="flex min-w-0 max-w-full items-start gap-3 overflow-hidden rounded-2xl border border-blue-100 bg-blue-50/60 p-3 sm:p-4">
      <div
        className={cn(
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold",
          cleaner.avatarColor,
        )}
        aria-hidden
      >
        {cleaner.initials}
      </div>

      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-semibold leading-snug text-slate-900">
          {cleaner.name}
        </p>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          {cleaner.rating != null ? (
            <span className="inline-flex items-center gap-0.5">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden />
              {cleaner.rating.toFixed(1)}
            </span>
          ) : null}
          <span>{cleaner.jobsCompleted.toLocaleString()} jobs</span>
        </div>

        {areas ? (
          <div className="mt-1.5 min-w-0 text-xs text-slate-400">
            <p className="line-clamp-2 break-words">{areas.primary}</p>
            {areas.moreCount > 0 ? (
              <p className="mt-0.5 font-medium">+{areas.moreCount} more</p>
            ) : null}
          </div>
        ) : null}

        <span className="mt-2 inline-flex rounded-full border border-blue-200 bg-white px-2.5 py-0.5 text-xs font-medium text-blue-700">
          {preferenceLabel}
        </span>
      </div>
    </div>
  );
}

// ─── Section container ─────────────────────────────────────────────────────────

function ReviewSection({
  number,
  title,
  onEdit,
  className,
  children,
}: {
  number: number;
  title: string;
  onEdit: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-2xl border border-slate-100 bg-white", className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-3.5 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
            {number}
          </span>
          <h3 className="truncate text-sm font-bold text-slate-800">{title}</h3>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-blue-600 transition hover:bg-blue-50 hover:text-blue-700"
        >
          <Pencil className="h-3 w-3" aria-hidden />
          Edit
        </button>
      </div>
      {/* Body */}
      <div className="min-w-0 px-3.5 py-2.5 sm:px-4">{children}</div>
    </div>
  );
}

// ─── Step 3 ─────────────────────────────────────────────────────────────────────

type EditPanel = "location" | "equipment" | "property" | "schedule" | "cleaner" | "extras" | null;

export function Step3Review() {
  const {
    serviceSlug,
    liveConfig,
    goToStep,
    editDetailsSection,
    editScheduleSection,
  } = useBookingV2();
  const config = SERVICE_CONFIG[serviceSlug];
  const isCarpetCleaning = serviceSlug === "carpet-cleaning";
  const isOfficeCleaning = serviceSlug === "office-cleaning";
  const isAirbnbCleaning = serviceSlug === "airbnb-cleaning";
  const step1Questions = liveConfig?.step1Questions ?? config.step1Questions;
  const estimatedDurationHours = liveConfig?.estimatedDurationHours ?? config.estimatedDurationHours;
  const { watch, getValues, reset, setValue } = useFormContext<BookingV2FormData>();
  const values = watch();

  const [editPanel, setEditPanel] = useState<EditPanel>(null);
  const [snapshot, setSnapshot] = useState<BookingV2FormData | null>(null);

  // If selectedCleanerIds exist but selectedCleanerDetails is empty (e.g. after localStorage
  // restore without Step 2 being mounted), fetch cleaners and populate the details.
  useEffect(() => {
    const ids = getValues("selectedCleanerIds") ?? [];
    const details = getValues("selectedCleanerDetails") ?? [];
    if (ids.length === 0 || details.length >= ids.length) return;

    const locationId = getValues("serviceAreaLocationId")?.trim() ?? "";
    const params = new URLSearchParams({ serviceSlug });
    const date = getValues("date");
    const time = getValues("time");
    const pricingSummary = getValues("pricingSummary");
    const duration = Math.round(
      pricingSummary?.team_scaled_duration_minutes ??
        pricingSummary?.estimated_duration_minutes ??
        estimatedDurationHours * 60,
    );
    if (date) params.set("date", date);
    if (time) params.set("time", time);
    params.set("durationMinutes", String(duration));
    if (locationId) params.set("locationId", locationId);

    const url = `/api/booking-v2/available-cleaners?${params.toString()}`;
    cachedClientRequest(
      `available-cleaners:${url}`,
      async () => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`available_cleaners_http_${response.status}`);
        return response.json() as Promise<{ cleaners?: AvailableCleanerV2[] }>;
      },
      20_000,
    )
      .then((json: { cleaners?: AvailableCleanerV2[] }) => {
        const all = json.cleaners ?? [];
        const matched = all.filter((c) => ids.includes(c.id));
        if (matched.length > 0) {
          const existing = getValues("selectedCleanerDetails") ?? [];
          const existingIds = new Set(existing.map((d) => d.id));
          const fresh = matched.filter((m) => !existingIds.has(m.id));
          if (fresh.length > 0) {
            setValue("selectedCleanerDetails", [...existing, ...fresh]);
          }
        }
      })
      .catch(() => { /* silently ignore — fallback text shown below */ });
  // Run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openEdit(panel: EditPanel) {
    setSnapshot(getValues());
    setEditPanel(panel);
  }

  function editOfficeDetails() {
    editDetailsSection("rooms");
  }

  function editOfficeSchedule() {
    editScheduleSection("booking_type");
    goToStep(2);
  }

  function editOfficeCleaner() {
    editScheduleSection("cleaner");
    goToStep(2);
  }

  function editCarpetDetails() {
    editDetailsSection("rooms");
  }

  function editCarpetSchedule() {
    editScheduleSection("date_time");
    goToStep(2);
  }

  function editCarpetCleaner() {
    editScheduleSection("cleaner");
    goToStep(2);
  }

  function editCarpetAddons() {
    editDetailsSection("condition");
  }

  function editAirbnbDetails() {
    editDetailsSection("property");
  }

  function editAirbnbSchedule() {
    editScheduleSection("date_time");
    goToStep(2);
  }

  function editAirbnbCleaner() {
    editScheduleSection("cleaner");
    goToStep(2);
  }

  function editAirbnbAddons() {
    editDetailsSection("turnover");
  }

  function saveEdit() {
    setEditPanel(null);
    setSnapshot(null);
  }
  function cancelEdit() {
    if (snapshot) reset(snapshot);
    setEditPanel(null);
    setSnapshot(null);
  }

  const visibleServiceDetailKeys = new Set(
    step1Questions
      .filter((question) => bookingDetailsQuestionStage(serviceSlug, question) != null)
      .map((question) => question.key),
  );
  const serviceDetails = Object.entries(values.serviceDetails ?? {}).filter(
    ([key, val]) =>
      visibleServiceDetailKeys.has(key) &&
      val !== "" &&
      val !== null &&
      val !== undefined,
  );
  const selectedExtras = values.selectedExtras ?? [];
  const pricingSummary = values.pricingSummary;
  const extrasSource = liveConfig?.extras ?? [];
  const showAddonsReview = extrasSource.length > 0 || selectedExtras.length > 0;
  const estimatedTotal =
    pricingSummary?.estimated_total ?? pricingSummary?.total ?? liveConfig?.basePrice ?? config.basePrice;
  const showEquipment =
    serviceShowsEquipmentQuestion(serviceSlug) &&
    (values.equipmentRequired === "yes" || values.equipmentRequired === "no");
  const hasServiceDetails = serviceDetails.length > 0;
  const detailSectionCount = Number(hasServiceDetails);
  const cleanDetailsNumber = 2 + Number(showEquipment);
  const scheduleNumber = 2 + Number(showEquipment) + detailSectionCount;
  const cleanerNumber = scheduleNumber + 1;
  const extrasNumber =
    scheduleNumber + 1 + Number(values.cleanerMode === "individual_cleaners");

  return (
    <>
      {/* ── Edit modals ── */}
      {editPanel === "location" && (
        <EditModal title="Edit location" onSave={saveEdit} onCancel={cancelEdit}>
          <LocationEditPanel />
        </EditModal>
      )}
      {showEquipment && editPanel === "equipment" && (
        <EditModal title="Edit equipment" onSave={saveEdit} onCancel={cancelEdit}>
          <EquipmentEditPanel />
        </EditModal>
      )}
      {editPanel === "property" && (
        <EditModal
          title={
            isCarpetCleaning
              ? "Edit carpet scope"
              : isOfficeCleaning
                ? "Edit office scope"
                : isAirbnbCleaning
                  ? "Edit Airbnb details"
                  : "Edit clean details"
          }
          onSave={saveEdit}
          onCancel={cancelEdit}
        >
          <PropertyEditPanel />
        </EditModal>
      )}
      {editPanel === "schedule" && (
        <EditModal title="Edit schedule" onSave={saveEdit} onCancel={cancelEdit}>
          <ScheduleEditPanel />
        </EditModal>
      )}
      {editPanel === "cleaner" && (
        <EditModal
          title={isCarpetCleaning ? "Edit specialist preference" : "Edit cleaner preference"}
          onSave={saveEdit}
          onCancel={cancelEdit}
        >
          <CleanerEditPanel />
        </EditModal>
      )}
      {editPanel === "extras" && (
        <EditModal title="Edit add-ons" onSave={saveEdit} onCancel={cancelEdit}>
          <ExtrasEditPanel />
        </EditModal>
      )}

      {/* ── Page ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

        {/* Header */}
        <div className="mb-1 text-center sm:col-span-2">
          <h2 className="text-xl font-bold text-slate-900">Review your booking</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Check the details below before payment.
          </p>
        </div>

        {/* ① Location */}
        <ReviewSection
          number={1}
          title="Location"
          onEdit={() => openEdit("location")}
          className={showEquipment ? undefined : "sm:col-span-2"}
        >
          <div className="flex items-center gap-2.5">
            <MapPin className="h-4 w-4 shrink-0 text-blue-500" aria-hidden />
            <p className="min-w-0 text-sm font-medium text-slate-800">
              {[values.address, values.suburb, values.city, values.postalCode].filter(Boolean).join(" · ")}
            </p>
          </div>

        </ReviewSection>

        {showEquipment && (
          <ReviewSection number={2} title="Equipment" onEdit={() => openEdit("equipment")}>
            <div className="flex items-start gap-2.5">
              <Package className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" aria-hidden />
              <div>
                <p className="text-sm font-medium text-slate-800">
                  {values.equipmentRequired === "yes"
                    ? "Shalean to bring cleaning equipment"
                    : "No equipment delivery needed"}
                </p>
                {values.equipmentRequired === "yes" && values.equipmentQuote?.manual_quote_required && (
                  <p className="mt-1 text-sm text-amber-700">
                    {values.equipmentQuote.manual_quote_message}
                  </p>
                )}
                {values.equipmentRequired === "yes" &&
                  values.equipmentQuote &&
                  !values.equipmentQuote.manual_quote_required &&
                  values.equipmentQuote.logistics_fee > 0 && (
                    <p className="mt-1 text-sm text-slate-600">
                      Logistics fee: R{values.equipmentQuote.logistics_fee.toLocaleString("en-ZA")} (
                      {values.equipmentQuote.distance_km} km)
                    </p>
                  )}
              </div>
            </div>
          </ReviewSection>
        )}

        {/* ② Service details / Carpet scope + condition */}
        {isCarpetCleaning ? (
          <ReviewSection
            number={cleanDetailsNumber}
            title="Carpet details"
            onEdit={editCarpetDetails}
            className="sm:col-span-2"
          >
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {serviceDetails.map(([key, val]) => {
                const question = step1Questions.find((q) => q.key === key);
                const displayVal = question?.options?.find((o) => o.value === String(val))?.label ?? String(val);
                return (
                  <span key={key} className="text-sm text-slate-700">
                    <span className="text-slate-400">{question?.label ?? key}: </span>
                    <span className="font-medium text-slate-800">
                      {key === "bedrooms" && String(val) === "0" ? "Studio / no bedrooms" : displayVal}
                    </span>
                  </span>
                );
              })}
            </div>
          </ReviewSection>
        ) : isAirbnbCleaning ? (
          <ReviewSection
            number={cleanDetailsNumber}
            title="Airbnb details"
            onEdit={editAirbnbDetails}
            className="sm:col-span-2"
          >
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {serviceDetails.map(([key, val]) => {
                const question = step1Questions.find((q) => q.key === key);
                const displayVal = question?.options?.find((o) => o.value === String(val))?.label ?? String(val);
                return (
                  <span key={key} className="text-sm text-slate-700">
                    <span className="text-slate-400">{question?.label ?? key}: </span>
                    <span className="font-medium text-slate-800">
                      {key === "bedrooms" && String(val) === "0" ? "Studio / no bedrooms" : displayVal}
                    </span>
                  </span>
                );
              })}
            </div>
          </ReviewSection>
        ) : serviceDetails.length > 0 ? (
          <ReviewSection
            number={cleanDetailsNumber}
            title={isOfficeCleaning ? "Office details" : "Clean details"}
            onEdit={() => openEdit("property")}
            className="sm:col-span-2"
          >
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {serviceDetails.map(([key, val]) => {
                const question = step1Questions.find((q) => q.key === key);
                const displayVal = question?.options?.find((o) => o.value === String(val))?.label ?? String(val);
                return (
                  <span key={key} className="text-sm text-slate-700">
                    <span className="text-slate-400">{question?.label ?? key}: </span>
                    <span className="font-medium text-slate-800">
                      {key === "bedrooms" && String(val) === "0" ? "Studio / no bedrooms" : displayVal}
                    </span>
                  </span>
                );
              })}
            </div>
          </ReviewSection>
        ) : null}

        {/* ③ Schedule */}
        <ReviewSection
          number={scheduleNumber}
          title="Schedule"
          onEdit={
            isOfficeCleaning
              ? editOfficeSchedule
              : isCarpetCleaning
                ? editCarpetSchedule
                : isAirbnbCleaning
                  ? editAirbnbSchedule
                  : () => openEdit("schedule")
          }
          className="sm:col-span-2"
        >
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
              <Calendar className="h-4 w-4 text-blue-500" aria-hidden />
              {values.date ? formatDate(values.date) : "—"}
            </span>
            <span className="inline-flex items-center gap-1.5 font-bold text-blue-600">
              <Clock className="h-4 w-4" aria-hidden />
              {values.time || "—"}
            </span>
            {!isCarpetCleaning && !isAirbnbCleaning ? (
              <span className="text-slate-500">
                {values.bookingType === "recurring"
                  ? `Recurring${values.recurringFrequency ? ` · ${recurringFrequencyLabel(values.recurringFrequency)}` : ""}`
                  : "Once-off"}
              </span>
            ) : null}
            <span className="text-slate-500">
              {values.pricingSummary?.estimated_duration_minutes > 0
                ? formatEstimatedCleaningTimeLabel(values.pricingSummary.estimated_duration_minutes)
                : `Estimated cleaning time: ${estimatedDurationHours} hours`}
            </span>
          </div>

          {/* Recurring preferred days */}
          {values.bookingType === "recurring" &&
            serviceUsesRecurringDayPicker(values.serviceSlug) &&
            shouldShowRecurringDayPicker(values.recurringFrequency) &&
            (values.recurringDays ?? []).length > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                Days: {values.recurringDays?.join(", ")}
              </p>
            )}
        </ReviewSection>

        {/* ④ Cleaner preference — only for individual-cleaner services */}
        {values.cleanerMode === "individual_cleaners" && (() => {
          const cleanerDetails = values.selectedCleanerDetails ?? [];
          const cleanerIds = values.selectedCleanerIds ?? [];
          // Show cards if we have stored details; show loading hint if IDs exist but details haven't synced yet
          const hasDetails = cleanerDetails.length > 0;
          const hasIds = cleanerIds.length > 0;
          return (
            <ReviewSection
              number={cleanerNumber}
              title={isCarpetCleaning ? "Specialist" : "Cleaner preference"}
              onEdit={
                isOfficeCleaning
                  ? editOfficeCleaner
                  : isCarpetCleaning
                    ? editCarpetCleaner
                    : isAirbnbCleaning
                      ? editAirbnbCleaner
                      : () => openEdit("cleaner")
              }
            >
              {!hasDetails && !hasIds ? (
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 shrink-0 text-blue-500" aria-hidden />
                  <p className="text-sm font-medium text-slate-800">
                    {isCarpetCleaning ? "Shalean chooses specialist" : "Best available cleaner"}
                  </p>
                </div>
              ) : hasDetails ? (
                <div className="grid grid-cols-1 gap-2.5">
                  {cleanerDetails.map((cleaner) => (
                    <CleanerPreviewCard
                      key={cleaner.id}
                      cleaner={cleaner}
                      preferenceLabel={
                        isCarpetCleaning ? "Preferred specialist" : "Preferred cleaner"
                      }
                    />
                  ))}
                </div>
              ) : (
                /* IDs saved but details not yet synced (e.g. navigated directly to Step 3) */
                <p className="text-sm text-slate-500">
                  {isCarpetCleaning
                    ? "Preferred specialist selected."
                    : `${cleanerIds.length} preferred cleaner${cleanerIds.length > 1 ? "s" : ""} selected.`}
                  <button
                    type="button"
                    onClick={
                      isOfficeCleaning
                        ? editOfficeCleaner
                        : isCarpetCleaning
                          ? editCarpetCleaner
                          : isAirbnbCleaning
                            ? editAirbnbCleaner
                            : () => openEdit("cleaner")
                    }
                    className="ml-1.5 font-medium text-blue-600 hover:underline"
                  >
                    Go back to view
                  </button>
                </p>
              )}
            </ReviewSection>
          );
        })()}

        {/* ⑤ Add-ons — hide entirely when this service has no DB-backed extras. */}
        {showAddonsReview ? (
          <ReviewSection
            number={extrasNumber}
            title="Add-ons"
            onEdit={
              isOfficeCleaning
                ? editOfficeDetails
                : isCarpetCleaning
                  ? editCarpetAddons
                  : isAirbnbCleaning
                    ? editAirbnbAddons
                    : () => openEdit("extras")
            }
            className={values.cleanerMode === "individual_cleaners" ? undefined : "sm:col-span-2"}
          >
            {selectedExtras.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Package className="h-4 w-4" aria-hidden />
                No add-ons selected.
              </div>
            ) : (
              <SelectedExtrasList
                extras={
                  pricingSummary?.selected_extras?.length
                    ? pricingSummary.selected_extras
                    : selectedExtras.map((id) => {
                        const extra = extrasSource.find((e) => e.id === id);
                        return {
                          extra_id: id,
                          name: extra?.label ?? id,
                          price: extra?.priceZar ?? 0,
                          quantity: 1,
                          total: extra?.priceZar ?? 0,
                        };
                      })
                }
              />
            )}
          </ReviewSection>
        ) : null}

        {/* Price breakdown */}
        <div className="rounded-2xl border border-slate-200 bg-white sm:col-span-2">
          <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-2.5 sm:px-5">
            <h3 className="text-sm font-bold text-slate-800">Price breakdown</h3>
          </div>

          <div className="min-w-0 space-y-2 px-4 py-3 sm:px-5">
            <CustomerPriceBreakdown pricing={pricingSummary} />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
              <span className="text-base font-bold text-slate-900">
                {values.bookingType === "recurring" ? "Price per visit" : "Estimated total"}
              </span>
              <span className="text-2xl font-bold text-blue-600">
                R{estimatedTotal.toLocaleString("en-ZA")}
              </span>
            </div>
            {values.bookingType === "recurring" && values.recurringFrequency ? (
              <div className="space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600">
                {(() => {
                  const prepaid = buildRecurringPrepaymentQuote({
                    startDate: values.recurringStartDate || values.date,
                    frequency: values.recurringFrequency,
                    recurringDays: values.recurringDays ?? [],
                    perVisitZar: estimatedTotal,
                    serviceSlug,
                  });
                  if (!prepaid) return <p>Choose a supported recurring schedule to continue.</p>;
                  return (
                    <>
                      <p>
                        {serviceSlug === "deep-cleaning"
                          ? "Monthly plan"
                          : `First 30 days: ${prepaid.visitCount} visit${prepaid.visitCount === 1 ? "" : "s"}`}{" "}
                        · total{" "}
                        <span className="font-semibold text-slate-800">
                          R{prepaid.grossPackageZar.toLocaleString("en-ZA")}
                        </span>
                      </p>
                      <p className="font-medium text-slate-700">
                        {serviceSlug === "deep-cleaning"
                          ? `Amount due today: R${prepaid.grossPackageZar.toLocaleString("en-ZA")} (one monthly visit)`
                          : `Amount due today: R${prepaid.grossPackageZar.toLocaleString("en-ZA")} (first 30 days)`}
                      </p>
                    </>
                  );
                })()}
              </div>
            ) : null}
          </div>

          <div className="border-t border-slate-100 bg-slate-50 px-4 py-2.5 sm:px-5">
            <p className="text-xs text-slate-400">
              {values.bookingType === "recurring"
                ? serviceSlug === "deep-cleaning"
                  ? "One deep-clean visit is charged each month while the monthly plan remains active."
                  : "Pay all visits in each 30-day billing cycle together. The package renews automatically while the recurring booking remains active."
                : "Final amount confirmed before payment. No hidden fees."}
            </p>
          </div>
        </div>

      </div>
    </>
  );
}
