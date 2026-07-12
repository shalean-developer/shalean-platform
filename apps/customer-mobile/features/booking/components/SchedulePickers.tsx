import { Pressable, ScrollView, View } from "react-native";
import {
  formatCustomerBookingSlotLabel,
  nextBookingDateChips,
} from "@/lib/booking/timeSlots";
import type { RecurringFrequency } from "@/lib/booking/types";
import { AppText } from "@/theme";

type DateChipsProps = {
  selected: string;
  onSelect: (ymd: string) => void;
};

export function DateChips({ selected, onSelect }: DateChipsProps) {
  const chips = nextBookingDateChips(21);
  return (
    <View>
      <AppText variant="secondary" className="mb-1.5 font-semibold text-ink">
        Date *
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1">
        <View className="flex-row gap-2 px-1">
          {chips.map((chip) => {
            const on = selected === chip.ymd;
            return (
              <Pressable
                key={chip.ymd}
                onPress={() => onSelect(chip.ymd)}
                className={`min-w-[64px] items-center rounded-xl border px-2.5 py-2 ${
                  on ? "border-brand-500 bg-brand-50" : "border-border bg-surface-card"
                }`}
              >
                <AppText variant="label" className={on ? "text-brand-600" : "text-ink-muted"}>
                  {chip.weekday}
                </AppText>
                <AppText
                  variant="secondary"
                  className={`mt-0.5 font-semibold ${on ? "text-brand-700" : "text-ink"}`}
                >
                  {chip.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

type TimeSlotsProps = {
  slots: string[];
  selected: string;
  onSelect: (time: string) => void;
  emptyMessage?: string;
};

export function TimeSlotGrid({ slots, selected, onSelect, emptyMessage }: TimeSlotsProps) {
  return (
    <View>
      <AppText variant="secondary" className="mb-1.5 font-semibold text-ink">
        Time *
      </AppText>
      {slots.length === 0 ? (
        <AppText
          variant="secondary"
          className="rounded-xl border border-border bg-surface-muted px-3 py-2.5 text-ink-muted"
        >
          {emptyMessage ?? "No morning slots available for this date."}
        </AppText>
      ) : (
        <View className="flex-row flex-wrap justify-between gap-y-2">
          {slots.map((slot) => {
            const on = selected === slot;
            return (
              <Pressable
                key={slot}
                onPress={() => onSelect(slot)}
                className={`w-[31%] items-center rounded-xl border px-2 py-2.5 ${
                  on ? "border-brand-500 bg-brand-50" : "border-border bg-surface-card"
                }`}
              >
                <AppText
                  variant="secondary"
                  className={`text-center font-medium ${
                    on ? "text-brand-700" : "text-ink"
                  }`}
                  numberOfLines={1}
                >
                  {formatCustomerBookingSlotLabel(slot)}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const FREQUENCIES: { value: RecurringFrequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Bi-weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "custom", label: "Custom days" },
];

export const RECURRING_WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

type BookingTypeProps = {
  value: "once_off" | "recurring";
  onChange: (v: "once_off" | "recurring") => void;
  frequency: string;
  onFrequencyChange: (v: RecurringFrequency) => void;
  recurringDays?: string[];
  onRecurringDaysChange?: (days: string[]) => void;
};

export function BookingTypePicker({
  value,
  onChange,
  frequency,
  onFrequencyChange,
  recurringDays = [],
  onRecurringDaysChange,
}: BookingTypeProps) {
  const showDayPicker =
    value === "recurring" &&
    (frequency === "weekly" ||
      frequency === "fortnightly" ||
      frequency === "monthly" ||
      frequency === "custom");

  const toggleDay = (day: string) => {
    if (!onRecurringDaysChange) return;
    const on = recurringDays.includes(day);
    onRecurringDaysChange(
      on ? recurringDays.filter((d) => d !== day) : [...recurringDays, day],
    );
  };

  return (
    <View className="gap-2.5">
      <AppText variant="secondary" className="font-semibold text-ink">
        Booking type
      </AppText>
      <View className="flex-row gap-2">
        {(
          [
            { value: "once_off" as const, label: "Once-off" },
            { value: "recurring" as const, label: "Recurring" },
          ] as const
        ).map((opt) => {
          const on = value === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
              className={`flex-1 items-center rounded-xl border py-2.5 ${
                on ? "border-brand-500 bg-brand-50" : "border-border bg-surface-card"
              }`}
            >
              <AppText
                variant="secondary"
                className={`font-semibold ${on ? "text-brand-700" : "text-ink"}`}
              >
                {opt.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {value === "recurring" ? (
        <View className="flex-row flex-wrap justify-between gap-y-2">
          {FREQUENCIES.map((f) => {
            const on = frequency === f.value;
            return (
              <Pressable
                key={f.value}
                onPress={() => onFrequencyChange(f.value)}
                className={`w-[48%] items-center rounded-xl border px-2 py-2.5 ${
                  on ? "border-brand-500 bg-brand-50" : "border-border bg-surface-card"
                }`}
              >
                <AppText
                  variant="label"
                  className={`text-center font-medium ${
                    on ? "text-brand-700" : "text-ink"
                  }`}
                  numberOfLines={1}
                >
                  {f.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {showDayPicker && onRecurringDaysChange ? (
        <View className="gap-2">
          <AppText variant="secondary" className="font-semibold text-ink">
            Preferred days{frequency === "custom" ? " *" : ""}
          </AppText>
          <AppText variant="label" className="text-ink-muted">
            {frequency === "custom"
              ? "Pick the days you want cleans on this custom schedule."
              : "Optional — which days should we prefer on this schedule?"}
          </AppText>
          <View className="flex-row flex-wrap gap-2">
            {RECURRING_WEEKDAYS.map((day) => {
              const on = recurringDays.includes(day);
              return (
                <Pressable
                  key={day}
                  onPress={() => toggleDay(day)}
                  className={`min-w-[40px] items-center rounded-xl border px-2.5 py-2 ${
                    on ? "border-brand-500 bg-brand-50" : "border-border bg-surface-card"
                  }`}
                >
                  <AppText
                    variant="label"
                    className={`font-semibold ${on ? "text-brand-700" : "text-ink"}`}
                  >
                    {day.slice(0, 3)}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}
