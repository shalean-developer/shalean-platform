"use client";

import { Building2, Home, PanelsTopLeft, type LucideIcon } from "lucide-react";
import { Controller, useFormContext } from "react-hook-form";
import { FloatingSelect } from "@/components/ui/floating-select";
import { cn } from "@/lib/utils";
import { PET_OPTIONS } from "@/lib/booking-v2/petOptions";
import type { FormQuestion } from "@/src/features/booking-v2/config/serviceConfig";
import type { BookingV2FormData } from "@/src/features/booking-v2/types";
import {
  coerceYesNoValue,
  isYesNoQuestion,
  validateYesNoRequired,
} from "@/src/features/booking-v2/components/serviceQuestionYesNo";
import { YesNoToggleRow } from "@/src/features/booking-v2/components/YesNoToggleRow";

function optionGridClass(count: number): string {
  if (count <= 2) return "grid-cols-2";
  if (count === 3) return "grid-cols-1 sm:grid-cols-3";
  if (count === 4) return "grid-cols-2 sm:grid-cols-4";
  return "grid-cols-2 sm:grid-cols-3";
}

/** Radio and short ungrouped selects render as full-width horizontal option cards. */
export function shouldUseHorizontalOptionCards(question: FormQuestion): boolean {
  if (isYesNoQuestion(question)) return true;
  if (question.type === "radio") return true;
  if (question.type === "select" && !question.group && (question.options?.length ?? 0) <= 6) return true;
  return false;
}

type ServiceQuestionOptionCardsProps = {
  question: FormQuestion;
  compact?: boolean;
  onValueChange?: (value: string) => void;
};

const PROPERTY_TYPE_PRESENTATION: Record<
  string,
  { icon: LucideIcon; description: string }
> = {
  house: {
    icon: Home,
    description: "A freestanding home.",
  },
  apartment: {
    icon: Building2,
    description: "A home in a building.",
  },
  townhouse: {
    icon: PanelsTopLeft,
    description: "A home in a complex.",
  },
};

function YesNoServiceQuestionField({
  question,
  compact,
}: {
  question: FormQuestion;
  compact?: boolean;
}) {
  const {
    control,
    formState: { errors },
  } = useFormContext<BookingV2FormData>();
  const fieldKey = `serviceDetails.${question.key}` as const;
  const fieldError = (errors.serviceDetails as Record<string, { message?: string }> | undefined)?.[
    question.key
  ]?.message;

  return (
    <Controller
      name={fieldKey}
      control={control}
      defaultValue="no"
      rules={{
        validate: (value) =>
          question.required ? validateYesNoRequired(value, question.label) : true,
      }}
      render={({ field }) => (
        <YesNoToggleRow
          label={question.label}
          hint={question.hint}
          required={question.required}
          checked={coerceYesNoValue(field.value) === "yes"}
          onCheckedChange={(next) => field.onChange(next ? "yes" : "no")}
          error={fieldError}
          bordered={!compact}
        />
      )}
    />
  );
}

function PetsDropdownField({ question }: { question: FormQuestion }) {
  const {
    control,
    formState: { errors },
  } = useFormContext<BookingV2FormData>();
  const fieldKey = `serviceDetails.${question.key}` as const;
  const fieldError = (errors.serviceDetails as Record<string, { message?: string }> | undefined)?.[
    question.key
  ]?.message;

  return (
    <div className="w-full">
      <Controller
        name={fieldKey}
        control={control}
        defaultValue="no"
        rules={{ required: question.required ? `${question.label} is required` : false }}
        render={({ field }) => (
          <FloatingSelect
            label={question.label}
            name={field.name}
            value={String(field.value ?? "no")}
            onChange={field.onChange}
            options={[...PET_OPTIONS]}
            aria-label={question.label}
            className="mt-2"
            triggerClassName={cn("h-14", fieldError && "border-red-400")}
            labelClassName={cn(
              "text-sm font-medium text-slate-800",
              question.required && "after:ml-1 after:text-red-500 after:content-['*']",
            )}
          />
        )}
      />
      {question.hint ? <p className="mt-1 text-sm text-slate-500">{question.hint}</p> : null}
      {fieldError ? (
        <p id={`service-question-${question.key}-error`} className="mt-2 text-xs text-red-500">
          {fieldError}
        </p>
      ) : null}
    </div>
  );
}

export function ServiceQuestionOptionCards({
  question,
  compact,
  onValueChange,
}: ServiceQuestionOptionCardsProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext<BookingV2FormData>();
  const fieldKey = `serviceDetails.${question.key}` as const;
  const fieldError = (errors.serviceDetails as Record<string, { message?: string }> | undefined)?.[
    question.key
  ]?.message;
  const options = question.options ?? [];
  const gridClass = optionGridClass(options.length);

  if (question.key === "hasPets") {
    return <PetsDropdownField question={question} />;
  }

  if (isYesNoQuestion(question)) {
    return <YesNoServiceQuestionField question={question} compact={compact} />;
  }

  if (question.key === "propertyType") {
    return (
      <fieldset className="w-full">
        <legend className="w-full text-center text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
          What type of property needs cleaning?
          {question.required ? <span className="ml-1 text-red-500">*</span> : null}
        </legend>
        <p className="mt-2 text-center text-sm text-slate-500">
          Select the property type for this booking.
        </p>
        <Controller
          name={fieldKey}
          control={control}
          rules={{ required: question.required ? `${question.label} is required` : false }}
          render={({ field }) => (
            <div className="mx-auto mt-6 grid w-full max-w-5xl gap-5 sm:grid-cols-3 sm:gap-6">
              {options.map((opt) => {
                const selected = String(field.value ?? "") === opt.value;
                const presentation = PROPERTY_TYPE_PRESENTATION[opt.value];
                const Icon = presentation?.icon ?? Home;

                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      field.onChange(opt.value);
                      onValueChange?.(opt.value);
                    }}
                    suppressHydrationWarning
                    className={cn(
                      "relative min-h-36 overflow-hidden rounded-xl border bg-white p-4 text-left shadow-md transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:aspect-[2/1] sm:min-h-0 sm:p-2",
                      selected
                        ? "border-blue-600 bg-blue-50/60 ring-2 ring-blue-600/15"
                        : "border-slate-200 text-slate-800",
                    )}
                  >
                    <span className="flex items-center gap-3 sm:gap-2">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700 sm:h-8 sm:w-8">
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>
                      <span className="whitespace-nowrap text-base font-bold leading-6 text-slate-900">{opt.label}</span>
                    </span>
                    <span className="mt-2 line-clamp-2 text-sm leading-5 text-slate-600 sm:mt-1 sm:text-[13px] sm:leading-4">
                      {presentation?.description ?? "Select this property type."}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        />
        {fieldError ? <p className="mt-2 text-center text-xs text-red-500">{fieldError}</p> : null}
      </fieldset>
    );
  }

  return (
    <div className={cn("w-full", question.centered && "text-center")}>
      <p className="mb-2 text-sm font-medium text-slate-700">
        {question.label}
        {question.required ? <span className="ml-1 text-red-500">*</span> : null}
      </p>
      <Controller
        name={fieldKey}
        control={control}
        rules={{ required: question.required ? `${question.label} is required` : false }}
        render={({ field }) => (
          <div className={cn("grid w-full gap-2", gridClass)}>
            {options.map((opt) => {
              const selected = String(field.value ?? "") === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    field.onChange(opt.value);
                    onValueChange?.(opt.value);
                  }}
                  suppressHydrationWarning
                  className={cn(
                    "min-h-11 rounded-xl border text-center font-medium transition",
                    compact ? "px-2 py-2.5 text-xs" : "px-3 py-2.5 text-sm",
                    selected
                      ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50/60",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}
      />
      {question.hint ? <p className="mt-1.5 text-xs text-slate-400">{question.hint}</p> : null}
      {fieldError ? <p className="mt-1 text-xs text-red-500">{fieldError}</p> : null}
    </div>
  );
}
