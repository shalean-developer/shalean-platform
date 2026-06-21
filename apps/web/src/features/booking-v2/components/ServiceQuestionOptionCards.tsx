"use client";

import { Controller, useFormContext } from "react-hook-form";
import { cn } from "@/lib/utils";
import type { FormQuestion } from "@/src/features/booking-v2/config/serviceConfig";
import type { BookingV2FormData } from "@/src/features/booking-v2/types";
import { isYesNoQuestion } from "@/src/features/booking-v2/components/serviceQuestionYesNo";
import { YesNoToggleRow } from "@/src/features/booking-v2/components/YesNoToggleRow";

function optionGridClass(count: number): string {
  if (count <= 2) return "grid-cols-2";
  if (count === 3) return "grid-cols-3";
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
    return (
      <Controller
        name={fieldKey}
        control={control}
        rules={{ required: question.required ? `${question.label} is required` : false }}
        render={({ field }) => (
          <YesNoToggleRow
            label={question.label}
            hint={question.hint}
            required={question.required}
            checked={String(field.value ?? "") === "yes"}
            onCheckedChange={(next) => field.onChange(next ? "yes" : "no")}
            error={fieldError}
            bordered={!compact}
          />
        )}
      />
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
                    "rounded-xl border text-center font-medium transition",
                    compact ? "px-2 py-2 text-xs" : "px-3 py-2.5 text-sm",
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
