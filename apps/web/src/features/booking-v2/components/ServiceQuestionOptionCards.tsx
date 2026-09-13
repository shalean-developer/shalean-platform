"use client";

import { Building2, Check, Home, PanelsTopLeft, type LucideIcon } from "lucide-react";
import { Controller, useFormContext } from "react-hook-form";
import { cn } from "@/lib/utils";
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
};

const PROPERTY_TYPE_PRESENTATION: Record<
  string,
  { icon: LucideIcon; description: string }
> = {
  house: {
    icon: Home,
    description: "A freestanding home with private rooms and living areas.",
  },
  apartment: {
    icon: Building2,
    description: "A flat or apartment within a shared residential building.",
  },
  townhouse: {
    icon: PanelsTopLeft,
    description: "An attached or multi-level home in a residential complex.",
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

export function ServiceQuestionOptionCards({ question, compact }: ServiceQuestionOptionCardsProps) {
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
                    onClick={() => field.onChange(opt.value)}
                    suppressHydrationWarning
                    className={cn(
                      "relative min-h-36 rounded-xl border bg-white p-5 text-left shadow-md transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:aspect-[2/1] sm:min-h-0",
                      selected
                        ? "border-blue-600 bg-blue-50/60 ring-2 ring-blue-600/15"
                        : "border-slate-200 text-slate-800",
                    )}
                  >
                    {selected ? (
                      <span className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white">
                        <Check className="h-4 w-4" aria-hidden />
                      </span>
                    ) : null}
                    <span className="flex items-center gap-3 pr-8">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>
                      <span className="whitespace-nowrap text-base font-bold text-slate-900 lg:text-lg">{opt.label}</span>
                    </span>
                    <span className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-slate-600">
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
                  onClick={() => field.onChange(opt.value)}
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
