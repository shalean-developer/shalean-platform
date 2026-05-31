"use client";

import { WidgetServicePicker } from "@/components/booking/WidgetServicePicker";
import type { BookFlowFormState } from "@/src/features/book/bookFlowTypes";
import type { HomeWidgetServiceKey } from "@/lib/pricing/calculatePrice";

type BookStepServiceProps = {
  form: BookFlowFormState;
  onChange: (patch: Partial<BookFlowFormState>) => void;
};

export function BookStepService({ form, onChange }: BookStepServiceProps) {
  return (
    <section className="space-y-4" aria-labelledby="book-step-service-heading">
      <div>
        <h1
          id="book-step-service-heading"
          className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
        >
          Choose your service
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Select the type of clean you need. You can change this before confirming.
        </p>
      </div>
      <WidgetServicePicker
        embedded
        value={form.service}
        onChange={(service: HomeWidgetServiceKey) => onChange({ service })}
        labelId="book-step-service-heading"
      />
    </section>
  );
}
