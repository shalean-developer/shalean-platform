import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { BookingV2FormQuestion } from "@/services/types/bookingV2";
import { AppText, colors } from "@/theme";

export const ROOM_COUNT_KEYS = new Set(["bedrooms", "bathrooms", "extraRooms", "rooms"]);

type Props = {
  questions: BookingV2FormQuestion[];
  values: Record<string, string | number | boolean>;
  onChange: (key: string, value: string | number | boolean) => void;
  errors?: Record<string, string>;
};

function shortLabel(q: BookingV2FormQuestion): string {
  const key = q.key;
  if (key === "bedrooms" || key === "rooms") return "Bedrooms";
  if (key === "bathrooms") return "Bathrooms";
  if (key === "extraRooms") return "Extra";
  return q.label.replace(/^Number of\s+/i, "").replace(/\s*\*$/, "");
}

function parseOptionBounds(q: BookingV2FormQuestion): { min: number; max: number } {
  if (typeof q.min === "number" && typeof q.max === "number") {
    return { min: q.min, max: q.max };
  }
  const nums = (q.options ?? [])
    .map((o) => parseInt(String(o.value), 10))
    .filter((n) => Number.isFinite(n));
  if (nums.length === 0) {
    if (q.key === "extraRooms") return { min: 0, max: 5 };
    return { min: 1, max: 5 };
  }
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

function readCount(raw: string | number | boolean | undefined, fallback: number): number {
  if (raw === "" || raw == null) return fallback;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function toStoredValue(n: number, q: BookingV2FormQuestion): string {
  const opts = q.options ?? [];
  const exact = opts.find((o) => parseInt(String(o.value), 10) === n && !String(o.value).includes("+"));
  if (exact) return exact.value;
  const match = opts.find((o) => parseInt(String(o.value), 10) === n);
  if (match) return match.value;
  return String(n);
}

/** Horizontal room chips; active chip shows a − / count / + stepper. */
export function RoomCountSteppers({ questions, values, onChange, errors }: Props) {
  const ordered = useMemo(() => {
    const order = ["bedrooms", "rooms", "bathrooms", "extraRooms"];
    return [...questions].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  }, [questions]);

  const [activeKey, setActiveKey] = useState(ordered[0]?.key ?? "bedrooms");

  useEffect(() => {
    if (!ordered.some((q) => q.key === activeKey) && ordered[0]) {
      setActiveKey(ordered[0].key);
    }
  }, [ordered, activeKey]);

  const active = ordered.find((q) => q.key === activeKey) ?? ordered[0];
  if (!active) return null;

  const { min, max } = parseOptionBounds(active);
  const defaultCount = active.key === "extraRooms" ? 0 : min;
  const count = Math.min(max, Math.max(min, readCount(values[active.key], defaultCount)));

  const setCount = (next: number) => {
    const clamped = Math.min(max, Math.max(min, next));
    onChange(active.key, toStoredValue(clamped, active));
  };

  return (
    <View>
      <AppText variant="secondary" className="mb-1.5 font-semibold text-ink">
        Rooms
      </AppText>
      <View className="mb-3 flex-row gap-2">
        {ordered.map((q) => {
          const bounds = parseOptionBounds(q);
          const fallback = q.key === "extraRooms" ? 0 : bounds.min;
          const n = readCount(values[q.key], fallback);
          const on = q.key === activeKey;
          const err = Boolean(errors?.[q.key]);
          return (
            <Pressable
              key={q.key}
              onPress={() => {
                setActiveKey(q.key);
                if (values[q.key] === "" || values[q.key] == null) {
                  const bounds = parseOptionBounds(q);
                  const fallback = q.key === "extraRooms" ? 0 : bounds.min;
                  onChange(q.key, toStoredValue(fallback, q));
                }
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              className={`min-w-0 flex-1 items-center rounded-xl border px-2 py-2.5 ${
                on
                  ? "border-brand-500 bg-brand-50"
                  : err
                    ? "border-danger bg-surface-card"
                    : "border-border bg-surface-card"
              }`}
            >
              <AppText
                variant="label"
                className={`text-center font-semibold ${
                  on ? "text-brand-600" : "text-ink-muted"
                }`}
                numberOfLines={1}
              >
                {shortLabel(q)}
              </AppText>
              <AppText
                variant="body"
                className={`mt-0.5 text-center font-bold tabular-nums ${
                  on ? "text-brand-700" : "text-ink"
                }`}
              >
                {values[q.key] === "" || values[q.key] == null ? "—" : n}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <View className="flex-row items-center justify-center gap-4 rounded-xl border border-border bg-surface-card px-3 py-2">
        <Pressable
          onPress={() => setCount(count - 1)}
          disabled={count <= min}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${shortLabel(active)}`}
          className="h-11 w-11 items-center justify-center rounded-xl bg-brand-50 active:opacity-70 disabled:opacity-35"
        >
          <Feather name="minus" size={20} color={colors.brand[600]} />
        </Pressable>
        <View className="min-w-[48px] items-center">
          <AppText variant="title" className="tabular-nums text-ink">
            {count}
          </AppText>
          <AppText variant="label" className="font-medium text-ink-muted">
            {shortLabel(active)}
          </AppText>
        </View>
        <Pressable
          onPress={() => setCount(count + 1)}
          disabled={count >= max}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${shortLabel(active)}`}
          className="h-11 w-11 items-center justify-center rounded-xl bg-brand-50 active:opacity-70 disabled:opacity-35"
        >
          <Feather name="plus" size={20} color={colors.brand[600]} />
        </Pressable>
      </View>

      {errors?.[active.key] ? (
        <AppText variant="secondary" className="mt-1 text-danger">
          {errors[active.key]}
        </AppText>
      ) : null}
    </View>
  );
}
