"use client";

import { useEffect } from "react";
import { BookingDateTimeSection } from "@/components/booking/BookingDateTimeSection";
import { todayBookingYmd } from "@/lib/booking/bookingTimeSlots";
import type { BookFlowFormState } from "@/src/features/book/bookFlowTypes";

type BookStepScheduleProps = {
  form: BookFlowFormState;
  onChange: (patch: Partial<BookFlowFormState>) => void;
};

export function BookStepSchedule({ form, onChange }: BookStepScheduleProps) {
  useEffect(() => {
    if (!form.date) {
      onChange({ date: todayBookingYmd() });
    }
  }, [form.date, onChange]);

  return (
    <section className="space-y-6" aria-labelledby="book-step-schedule-heading">
      <div>
        <h1
          id="book-step-schedule-heading"
          className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
        >
          Date and time
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Pick when you would like your cleaner to arrive.
        </p>
      </div>

      <BookingDateTimeSection
        date={form.date || todayBookingYmd()}
        time={form.time}
        onDateChange={(date) => onChange({ date })}
        onTimeChange={(time) => onChange({ time })}
      />
    </section>
  );
}
