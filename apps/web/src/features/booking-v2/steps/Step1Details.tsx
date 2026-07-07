"use client";

import { useState, useRef, useEffect } from "react";
import { useFormContext, Controller } from "react-hook-form";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SERVICE_CONFIG,
  type FormQuestion,
} from "@/src/features/booking-v2/config/serviceConfig";
import type { BookingV2FormData } from "@/src/features/booking-v2/types";
import { useBookingV2 } from "@/src/features/booking-v2/BookingV2Context";
import { PropertyAddressSection } from "@/src/features/booking-v2/components/PropertyAddressSection";
import { EquipmentSection } from "@/src/features/booking-v2/components/EquipmentSection";
import {
  ServiceQuestionOptionCards,
  shouldUseHorizontalOptionCards,
} from "@/src/features/booking-v2/components/ServiceQuestionOptionCards";

// ─── Shared field components ───────────────────────────────────────────────────

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-500">{message}</p>;
}

function FieldLabel({
  htmlFor,
  children,
  required,
  centered,
}: {
  htmlFor: string;
  children: React.ReactNode;
  required?: boolean;
  centered?: boolean;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn(
        "mb-1.5 block text-sm font-medium text-slate-700",
        centered && "text-center",
      )}
    >
      {children}
      {required && <span className="ml-1 text-red-500">*</span>}
    </label>
  );
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-slate-400">{children}</p>;
}

// ─── Custom popover select ─────────────────────────────────────────────────────

function CustomSelect({
  id,
  options,
  value,
  onChange,
  placeholder = "Select…",
  error,
}: {
  id: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={containerRef} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => setOpen((v) => !v)}
        suppressHydrationWarning
        className={cn(
          "flex w-full items-center justify-between rounded-xl border bg-white px-4 py-2.5 text-sm shadow-sm transition",
          open
            ? "border-blue-500 ring-2 ring-blue-500/20"
            : "border-slate-200 hover:border-slate-300",
          error && "border-red-400",
        )}
      >
        <span className={selected ? "text-slate-800" : "text-slate-400"}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition",
                  isSelected
                    ? "bg-blue-50 text-blue-700 font-medium"
                    : "text-slate-700 hover:bg-slate-50",
                )}
              >
                {opt.label}
                {isSelected && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Dynamic question renderer ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyForm = ReturnType<typeof useFormContext<any>>;

function ServiceQuestion({ question }: { question: FormQuestion }) {
  const { register, control, formState: { errors } } = useFormContext() as AnyForm;
  const fieldKey = `serviceDetails.${question.key}`;
  const fieldError = (errors.serviceDetails as Record<string, { message?: string }> | undefined)?.[question.key]?.message;

  if (shouldUseHorizontalOptionCards(question)) {
    return <ServiceQuestionOptionCards question={question} />;
  }

  if (question.type === "select") {
    return (
      <div>
        <FieldLabel htmlFor={question.key} required={question.required}>
          {question.label}
        </FieldLabel>
        <Controller
          name={fieldKey}
          control={control}
          rules={{ required: question.required ? `${question.label} is required` : false }}
          render={({ field }) => (
            <CustomSelect
              id={question.key}
              options={question.options ?? []}
              value={String(field.value ?? "")}
              onChange={field.onChange}
              placeholder="Select…"
              error={fieldError}
            />
          )}
        />
        {question.hint && <FieldHint>{question.hint}</FieldHint>}
        <FieldError message={fieldError} />
      </div>
    );
  }

  if (question.type === "textarea") {
    return (
      <div>
        <FieldLabel htmlFor={question.key} required={question.required}>
          {question.label}
        </FieldLabel>
        <textarea
          id={question.key}
          {...register(fieldKey)}
          rows={3}
          placeholder={question.placeholder}
          className="block w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
        <FieldError message={fieldError} />
      </div>
    );
  }

  if (question.type === "number") {
    return (
      <div>
        <FieldLabel htmlFor={question.key} required={question.required}>
          {question.label}
        </FieldLabel>
        <input
          id={question.key}
          type="number"
          min={question.min}
          max={question.max}
          {...register(fieldKey, {
            valueAsNumber: true,
            required: question.required ? `${question.label} is required` : false,
          })}
          className="block w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
        {question.hint && <FieldHint>{question.hint}</FieldHint>}
        <FieldError message={fieldError} />
      </div>
    );
  }

  // Default: text
  return (
    <div>
      <FieldLabel htmlFor={question.key} required={question.required}>
        {question.label}
      </FieldLabel>
      <input
        id={question.key}
        type="text"
        placeholder={question.placeholder}
        {...register(fieldKey, {
          required: question.required ? `${question.label} is required` : false,
        })}
        className="block w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      />
      <FieldError message={fieldError} />
    </div>
  );
}

// ─── Group questions by their named group ──────────────────────────────────────

type QuestionGroup =
  | { type: "single"; question: FormQuestion }
  | { type: "inline"; groupName: string; questions: FormQuestion[] };

function groupQuestions(questions: FormQuestion[]): QuestionGroup[] {
  const result: QuestionGroup[] = [];
  const seen = new Map<string, boolean>();

  for (const question of questions) {
    if (!question.group) {
      result.push({ type: "single", question });
      continue;
    }
    if (!seen.has(question.group)) {
      seen.set(question.group, true);
      const grouped = questions.filter((q) => q.group === question.group);
      result.push({ type: "inline", groupName: question.group, questions: grouped });
    }
  }
  return result;
}

// ─── Step 1 ─────────────────────────────────────────────────────────────────────

export function Step1Details() {
  const { serviceSlug, liveConfig } = useBookingV2();
  const config = SERVICE_CONFIG[serviceSlug];
  const { register, watch, setValue } = useFormContext<BookingV2FormData>();
  const selectedExtras = watch("selectedExtras") ?? [];

  const extras = liveConfig?.extras ?? [];
  const step1Questions = liveConfig?.step1Questions ?? config.step1Questions;

  function toggleExtra(id: string) {
    const current = selectedExtras;
    const updated = current.includes(id)
      ? current.filter((e) => e !== id)
      : [...current, id];
    setValue("selectedExtras", updated, { shouldDirty: true });
  }

  const questionGroups = groupQuestions(
    step1Questions.filter((q) => q.key !== "cleaningProducts"),
  );

  return (
    <div className="space-y-8" data-lpignore="true" data-form-type="other">
      <div className="text-center">
        <h2 className="text-xl font-bold text-slate-900">Your details</h2>
        <p className="mt-1 text-sm text-slate-500">
          Tell us about the property and what you need cleaned.
        </p>
      </div>

      <hr className="border-slate-200" />

      {/* Service-specific questions */}
      <section className="space-y-5">
        <h3 className="text-center text-sm font-semibold uppercase tracking-wide text-slate-400">
          About the clean
        </h3>
        {questionGroups.map((group) => {
          if (group.type === "inline") {
            const isRooms = group.groupName === "rooms";
            return (
              <div
                key={group.groupName}
                className={cn(isRooms ? "grid gap-4" : "w-full space-y-4")}
                style={
                  isRooms
                    ? { gridTemplateColumns: `repeat(${group.questions.length}, minmax(0, 1fr))` }
                    : undefined
                }
              >
                {group.questions.map((q) => (
                  <ServiceQuestion key={q.key} question={q} />
                ))}
              </div>
            );
          }
          return <ServiceQuestion key={group.question.key} question={group.question} />;
        })}
      </section>

      <hr className="border-slate-200" />

      <PropertyAddressSection />

      <EquipmentSection />

      <div className="space-y-4">
        <div>
          <FieldLabel htmlFor="accessInstructions">Access instructions (optional)</FieldLabel>
          <input
            id="accessInstructions"
            type="text"
            placeholder="e.g. Ring bell, use side gate…"
            {...register("accessInstructions")}
            autoComplete="off"
            suppressHydrationWarning
            className="block w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel htmlFor="parkingInstructions">Parking (optional)</FieldLabel>
            <input
              id="parkingInstructions"
              type="text"
              placeholder="Street parking, driveway…"
              {...register("parkingInstructions")}
              autoComplete="off"
              suppressHydrationWarning
              className="block w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div>
            <FieldLabel htmlFor="gateCode">Gate / security code (optional)</FieldLabel>
            <input
              id="gateCode"
              type="text"
              placeholder="e.g. #1234"
              {...register("gateCode")}
              autoComplete="off"
              suppressHydrationWarning
              className="block w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>
      </div>

      {/* Extras */}
      {extras.length > 0 && (
        <>
          <hr className="border-slate-200" />
          <section className="space-y-4">
            <h3 className="text-center text-sm font-semibold uppercase tracking-wide text-slate-400">
              Add-on extras
            </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {extras.map((extra) => {
              const checked = selectedExtras.includes(extra.id);
              return (
                <button
                  key={extra.id}
                  type="button"
                  onClick={() => toggleExtra(extra.id)}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-4 text-left transition",
                    checked
                      ? "border-blue-600 bg-blue-50"
                      : "border-slate-200 bg-white hover:border-slate-300",
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 text-white transition",
                      checked ? "border-blue-600 bg-blue-600" : "border-slate-300",
                    )}
                  >
                    {checked && (
                      <svg viewBox="0 0 12 10" className="h-3 w-3 fill-current" aria-hidden>
                        <path d="M1 5l3.5 3.5L11 1" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className={cn("text-sm font-semibold", checked ? "text-blue-700" : "text-slate-800")}>
                        {extra.label}
                      </p>
                      <p className={cn("text-sm font-bold", checked ? "text-blue-600" : "text-slate-600")}>
                        +R{extra.priceZar}
                      </p>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{extra.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
          </section>
        </>
      )}
    </div>
  );
}
