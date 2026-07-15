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
  ShieldCheck,
  CreditCard,
  X,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Package,
} from "lucide-react";
import { CleanerCountSelector } from "@/src/features/booking-v2/components/CleanerCountSelector";
import { CleanerPreferenceSection } from "@/src/features/booking-v2/components/CleanerPreferenceSection";
import { formatAreasServedPreview } from "@/src/features/booking-v2/components/CleanerCard";
import { EquipmentSection } from "@/src/features/booking-v2/components/EquipmentSection";
import { RoomCountSelector } from "@/src/features/booking-v2/components/RoomCountSelector";
import { TeamAvailabilitySection } from "@/src/features/booking-v2/components/TeamAvailabilitySection";
import type { AvailableCleanerV2 } from "@/src/features/booking-v2/types";
import { cn } from "@/lib/utils";
import {
  SERVICE_CONFIG,
  type FormQuestion,
} from "@/src/features/booking-v2/config/serviceConfig";
import type {
  BookingV2FormData,
} from "@/src/features/booking-v2/types";
import { useBookingV2 } from "@/src/features/booking-v2/BookingV2Context";
import {
  RECURRING_FREQUENCY_OPTIONS,
  RECURRING_WEEKDAYS,
  recurringFrequencyLabel,
  shouldShowRecurringDayPicker,
} from "@/src/features/booking-v2/config/recurringScheduleOptions";
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

  if (question.key === "bedrooms" || question.key === "bathrooms") {
    const kind = question.key as "bedrooms" | "bathrooms";
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

      <div>
        <label htmlFor="edit-access" className="mb-1.5 block text-sm font-medium text-slate-700">
          Access instructions (optional)
        </label>
        <input
          id="edit-access"
          type="text"
          placeholder="e.g. Ring bell, use side gate…"
          {...register("accessInstructions")}
          className="block w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="edit-parking" className="mb-1.5 block text-sm font-medium text-slate-700">
            Parking (optional)
          </label>
          <input
            id="edit-parking"
            type="text"
            placeholder="Street parking…"
            {...register("parkingInstructions")}
            className="block w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <div>
          <label htmlFor="edit-gate" className="mb-1.5 block text-sm font-medium text-slate-700">
            Gate code (optional)
          </label>
          <input
            id="edit-gate"
            type="text"
            placeholder="e.g. #1234"
            {...register("gateCode")}
            className="block w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      </div>
    </div>
  );
}

function EquipmentEditPanel() {
  return <EquipmentSection />;
}

function PropertyEditPanel() {
  const { serviceSlug, liveConfig } = useBookingV2();
  const config = SERVICE_CONFIG[serviceSlug];
  const step1Questions = liveConfig?.step1Questions ?? config.step1Questions;

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
  const { scheduling } = useBookingV2();

  const { control, watch, setValue } = useFormContext<BookingV2FormData>();
  const bookingType = watch("bookingType");
  const date = watch("date");
  const recurringFrequency = watch("recurringFrequency");

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (bookingType === "recurring" && recurringFrequency === "custom") {
      setValue("recurringFrequency", "weekly", { shouldDirty: true });
    }
  }, [bookingType, recurringFrequency, setValue]);

  return (
    <div className="space-y-5">
      {/* Booking type */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Booking type
        </p>
        <Controller name="bookingType" control={control}
          render={({ field }) => (
            <div className="flex gap-3">
              {[{ value: "once_off", label: "Once-off" }, { value: "recurring", label: "Recurring" }].map((opt) => (
                <button key={opt.value} type="button" onClick={() => field.onChange(opt.value)}
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
      {bookingType === "recurring" && (
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
                    {RECURRING_FREQUENCIES.map((opt) => (
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

            {shouldShowRecurringDayPicker(recurringFrequency) && (
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="edit-start" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Start date
                </label>
                <Controller name="recurringStartDate" control={control}
                  render={({ field }) => (
                    <input id="edit-start" type="date" min={today}
                      value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value)}
                      className="block w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  )}
                />
              </div>
              <div>
                <label htmlFor="edit-end" className="mb-1.5 block text-sm font-medium text-slate-700">
                  End date (optional)
                </label>
                <Controller name="recurringEndDate" control={control}
                  render={({ field }) => (
                    <input id="edit-end" type="date" min={today}
                      value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value)}
                      className="block w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  )}
                />
              </div>
            </div>
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

  const { watch, setValue } = useFormContext<BookingV2FormData>();
  const date = watch("date");
  const time = watch("time");
  const cleanerCount = watch("cleanerCount") ?? 1;
  const selectedCleanerIds = watch("selectedCleanerIds") ?? [];
  const selectedCleanerDetails = watch("selectedCleanerDetails") ?? [];
  const assignedTeamId = watch("assignedTeamId") ?? "";
  const serviceAreaLocationId = watch("serviceAreaLocationId") ?? "";

  const durationMinutes = Math.round(
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
        />
      ) : (
        <>
          <CleanerCountSelector
            value={cleanerCount}
            onChange={(n) => {
              setValue("cleanerCount", n);
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
            locationId={serviceAreaLocationId.trim()}
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

function CleanerPreviewCard({ cleaner }: { cleaner: AvailableCleanerV2 }) {
  const areas = formatAreasServedPreview(cleaner.areasServed);

  return (
    <div className="flex min-w-0 max-w-full flex-col items-center gap-2 overflow-hidden rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-4 text-center">
      {/* Avatar */}
      <div
        className={cn(
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold",
          cleaner.avatarColor,
        )}
        aria-hidden
      >
        {cleaner.initials}
      </div>

      {/* Name */}
      <p className="w-full truncate text-sm font-semibold leading-snug text-slate-900">{cleaner.name}</p>

      {/* Rating + jobs */}
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
        {cleaner.rating != null && (
          <span className="flex items-center gap-0.5">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden />
            {cleaner.rating.toFixed(1)}
          </span>
        )}
        <span>{cleaner.jobsCompleted.toLocaleString()} jobs</span>
      </div>

      {/* Areas */}
      {areas ? (
        <div className="w-full min-w-0 text-xs text-slate-400">
          <p className="line-clamp-2 break-words">{areas.primary}</p>
          {areas.moreCount > 0 ? (
            <p className="mt-0.5 font-medium">+{areas.moreCount} more</p>
          ) : null}
        </div>
      ) : null}

      {/* Badge */}
      <span className="rounded-full border border-blue-200 bg-white px-2.5 py-0.5 text-xs font-medium text-blue-700">
        Preferred cleaner
      </span>
    </div>
  );
}

// ─── Section container ─────────────────────────────────────────────────────────

function ReviewSection({
  number,
  title,
  onEdit,
  children,
}: {
  number: number;
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3.5 sm:px-5">
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
      <div className="min-w-0 px-4 py-4 sm:px-5">{children}</div>
    </div>
  );
}

// ─── Step 3 ─────────────────────────────────────────────────────────────────────

type EditPanel = "location" | "equipment" | "property" | "schedule" | "cleaner" | "extras" | null;

export function Step3Review() {
  const { serviceSlug, liveConfig } = useBookingV2();
  const config = SERVICE_CONFIG[serviceSlug];
  const step1Questions = liveConfig?.step1Questions ?? config.step1Questions;
  const serviceLabel = liveConfig?.label ?? config.label;
  const serviceDescription = liveConfig?.description ?? config.description;
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
    const duration = Math.round(estimatedDurationHours * 60);
    if (date) params.set("date", date);
    if (time) params.set("time", time);
    params.set("durationMinutes", String(duration));
    if (locationId) params.set("locationId", locationId);

    fetch(`/api/booking-v2/available-cleaners?${params.toString()}`)
      .then((r) => r.json())
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
  function saveEdit() {
    setEditPanel(null);
    setSnapshot(null);
  }
  function cancelEdit() {
    if (snapshot) reset(snapshot);
    setEditPanel(null);
    setSnapshot(null);
  }

  const serviceDetails = Object.entries(values.serviceDetails ?? {}).filter(
    ([, val]) => val !== "" && val !== null && val !== undefined,
  );
  const selectedExtras = values.selectedExtras ?? [];
  const pricingSummary = values.pricingSummary;
  const extrasSource = liveConfig?.extras ?? [];
  const estimatedTotal =
    pricingSummary?.estimated_total ?? pricingSummary?.total ?? liveConfig?.basePrice ?? config.basePrice;

  return (
    <>
      {/* ── Edit modals ── */}
      {editPanel === "location" && (
        <EditModal title="Edit location" onSave={saveEdit} onCancel={cancelEdit}>
          <LocationEditPanel />
        </EditModal>
      )}
      {editPanel === "equipment" && (
        <EditModal title="Edit equipment" onSave={saveEdit} onCancel={cancelEdit}>
          <EquipmentEditPanel />
        </EditModal>
      )}
      {editPanel === "property" && (
        <EditModal title="Edit clean details" onSave={saveEdit} onCancel={cancelEdit}>
          <PropertyEditPanel />
        </EditModal>
      )}
      {editPanel === "schedule" && (
        <EditModal title="Edit schedule" onSave={saveEdit} onCancel={cancelEdit}>
          <ScheduleEditPanel />
        </EditModal>
      )}
      {editPanel === "cleaner" && (
        <EditModal title="Edit cleaner preference" onSave={saveEdit} onCancel={cancelEdit}>
          <CleanerEditPanel />
        </EditModal>
      )}
      {editPanel === "extras" && (
        <EditModal title="Edit add-ons" onSave={saveEdit} onCancel={cancelEdit}>
          <ExtrasEditPanel />
        </EditModal>
      )}

      {/* ── Page ── */}
      <div className="space-y-5">

        {/* Header */}
        <div className="text-center">
          <h2 className="text-xl font-bold text-slate-900">Review your booking</h2>
          <p className="mt-1 text-sm text-slate-500">
            Everything look right? Make any changes before you pay.
          </p>
        </div>

        {/* Service badge */}
        <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4 sm:gap-4 sm:px-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-600">
            <config.icon className="h-6 w-6 text-white" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-base font-bold text-blue-900">{serviceLabel}</p>
            <p className="mt-0.5 text-xs text-blue-700/80 sm:truncate">{serviceDescription}</p>
          </div>
        </div>

        {/* ① Location */}
        <ReviewSection number={1} title="Location" onEdit={() => openEdit("location")}>
          <div className="flex items-start gap-2.5">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {values.address || "—"}
              </p>
              <p className="mt-0.5 text-sm text-slate-500">
                {[values.suburb, values.city].filter(Boolean).join(", ")}
                {values.postalCode && `, ${values.postalCode}`}
              </p>
            </div>
          </div>

          {(values.accessInstructions || values.gateCode || values.parkingInstructions) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {values.accessInstructions && (
                <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                  Access: {values.accessInstructions}
                </span>
              )}
              {values.gateCode && (
                <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                  Gate: {values.gateCode}
                </span>
              )}
              {values.parkingInstructions && (
                <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                  Parking: {values.parkingInstructions}
                </span>
              )}
            </div>
          )}
        </ReviewSection>

        {(values.equipmentRequired === "yes" || values.equipmentRequired === "no") && (
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

        {/* ② Clean details */}
        {serviceDetails.length > 0 && (
          <ReviewSection number={2} title="Clean details" onEdit={() => openEdit("property")}>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              {serviceDetails.map(([key, val]) => {
                const question = step1Questions.find((q) => q.key === key);
                if (question?.type === "textarea") {
                  return (
                    <div key={key} className="col-span-2">
                      <p className="text-xs text-slate-400">{question?.label ?? key}</p>
                      <p className="mt-0.5 text-sm text-slate-700">{String(val)}</p>
                    </div>
                  );
                }
                const displayVal =
                  question?.options?.find((o) => o.value === String(val))?.label ??
                  String(val);
                return (
                  <div key={key}>
                    <p className="text-xs text-slate-400">{question?.label ?? key}</p>
                    <p className="mt-0.5 text-sm font-medium capitalize text-slate-800">
                      {displayVal}
                    </p>
                  </div>
                );
              })}
            </div>
          </ReviewSection>
        )}

        {/* ③ Schedule */}
        <ReviewSection
          number={serviceDetails.length > 0 ? 3 : 2}
          title="Schedule"
          onEdit={() => openEdit("schedule")}
        >
          {/* Date + time cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-400">
                <Calendar className="h-3.5 w-3.5" aria-hidden />
                Date
              </p>
              <p className="text-sm font-bold text-slate-900">
                {values.date ? formatDate(values.date) : "—"}
              </p>
            </div>
            <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-400">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                Time
              </p>
              <p className="text-2xl font-bold text-blue-600">{values.time || "—"}</p>
            </div>
          </div>

          {/* Booking meta chips */}
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
              {values.bookingType === "recurring" ? (
                <>
                  <RefreshCw className="h-3 w-3 text-blue-500" />
                  Recurring
                  {values.recurringFrequency
                    ? ` · ${recurringFrequencyLabel(values.recurringFrequency)}`
                    : ""}
                </>
              ) : (
                "Once-off"
              )}
            </span>

            {values.cleanerMode === "individual_cleaners" && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                <Users className="h-3 w-3 text-blue-500" />
                {values.cleanerCount} cleaner{values.cleanerCount > 1 ? "s" : ""}
              </span>
            )}
            {values.cleanerMode === "individual_cleaners" && (() => {
              const n = (values.selectedCleanerDetails ?? []).length;
              return (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                  {n > 0
                    ? `${n} preferred cleaner${n > 1 ? "s" : ""} selected`
                    : "Best available cleaner"}
                </span>
              );
            })()}

            {values.cleanerMode === "team" && values.assignedTeamId && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                <Users className="h-3 w-3 text-blue-500" />
                {values.assignedTeamName?.trim() || "Selected team"}
              </span>
            )}

            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
              <Clock className="h-3 w-3 text-blue-500" />
              ~{estimatedDurationHours} hrs
            </span>
          </div>

          {/* Recurring preferred days */}
          {values.bookingType === "recurring" &&
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
              number={serviceDetails.length > 0 ? 4 : 3}
              title="Cleaner preference"
              onEdit={() => openEdit("cleaner")}
            >
              {!hasDetails && !hasIds ? (
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50">
                    <Users className="h-5 w-5 text-blue-500" aria-hidden />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      Best available cleaner
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      We&apos;ll assign the best available cleaner for your booking.
                    </p>
                  </div>
                </div>
              ) : hasDetails ? (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {cleanerDetails.map((cleaner) => (
                    <CleanerPreviewCard key={cleaner.id} cleaner={cleaner} />
                  ))}
                </div>
              ) : (
                /* IDs saved but details not yet synced (e.g. navigated directly to Step 3) */
                <p className="text-sm text-slate-500">
                  {cleanerIds.length} preferred cleaner{cleanerIds.length > 1 ? "s" : ""} selected.
                  <button
                    type="button"
                    onClick={() => openEdit("cleaner")}
                    className="ml-1.5 font-medium text-blue-600 hover:underline"
                  >
                    Go back to view
                  </button>
                </p>
              )}
            </ReviewSection>
          );
        })()}

        {/* ⑤ Add-ons */}
        <ReviewSection
          number={
            values.cleanerMode === "individual_cleaners"
              ? serviceDetails.length > 0 ? 5 : 4
              : serviceDetails.length > 0 ? 4 : 3
          }
          title="Add-ons"
          onEdit={() => openEdit("extras")}
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

        {/* Price breakdown */}
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3.5 sm:px-5">
            <h3 className="text-sm font-bold text-slate-800">Price breakdown</h3>
          </div>

          <div className="min-w-0 space-y-2.5 px-4 py-4 sm:px-5">
            <CustomerPriceBreakdown pricing={pricingSummary} />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
              <span className="text-base font-bold text-slate-900">Estimated total</span>
              <span className="text-2xl font-bold text-blue-600">
                R{estimatedTotal.toLocaleString("en-ZA")}
              </span>
            </div>
          </div>

          <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 sm:px-5">
            <p className="text-xs text-slate-400">
              Final amount confirmed before payment. No hidden fees.
            </p>
          </div>
        </div>

        {/* Trust strip */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
          {[
            { Icon: ShieldCheck, label: "Vetted cleaners" },
            { Icon: CreditCard, label: "Secure payment" },
            { Icon: Star, label: "Satisfaction guarantee" },
          ].map(({ Icon, label }) => (
            <div
              key={label}
              className="flex flex-row items-center gap-2.5 rounded-xl border border-slate-100 bg-white p-3 sm:flex-col sm:items-center sm:gap-1.5 sm:text-center"
            >
              <Icon className="h-5 w-5 shrink-0 text-blue-600" aria-hidden />
              <p className="text-xs font-medium text-slate-600">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
