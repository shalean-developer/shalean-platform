import { Pressable, View } from "react-native";
import { TextField } from "@shalean/mobile-ui";
import type { BookingV2FormQuestion } from "@/services/types/bookingV2";
import {
  ROOM_COUNT_KEYS,
  RoomCountSteppers,
} from "@/features/booking/components/RoomCountSteppers";
import { YesNoToggle } from "@/features/booking/components/YesNoToggle";
import { AppText } from "@/theme";

type Props = {
  questions: BookingV2FormQuestion[];
  values: Record<string, string | number | boolean>;
  onChange: (key: string, value: string | number | boolean) => void;
  errors?: Record<string, string>;
};

/** Shorten long option labels for denser grids (e.g. "Apartment / flat" → "Apartment"). */
function compactOptionLabel(label: string): string {
  const trimmed = label.trim();
  if (/^apartment\s*\/\s*flat$/i.test(trimmed)) return "Apartment";
  return trimmed;
}

function columnsForOptions(count: number): 2 | 3 | 4 {
  if (count <= 2) return 2;
  if (count === 3) return 3;
  if (count === 4) return 4;
  if (count === 5) return 3;
  return 3;
}

function isYesNoQuestion(q: BookingV2FormQuestion): boolean {
  if (q.group === "yesno") return true;
  const opts = (q.options ?? []).map((o) => o.value.toLowerCase()).sort();
  return opts.length === 2 && opts[0] === "no" && opts[1] === "yes";
}

function asYesNo(raw: string | number | boolean | undefined): "yes" | "no" | "" {
  if (raw === true || raw === "yes") return "yes";
  if (raw === false || raw === "no") return "no";
  return "";
}

export function ServiceQuestions({ questions, values, onChange, errors }: Props) {
  const roomQuestions = questions.filter((q) => ROOM_COUNT_KEYS.has(q.key));
  const otherQuestions = questions.filter((q) => !ROOM_COUNT_KEYS.has(q.key));

  return (
    <View className="gap-3">
      {otherQuestions.map((q) => {
        const error = errors?.[q.key];
        const raw = values[q.key];

        if (
          (q.type === "radio" || q.type === "select" || q.type === "checkbox") &&
          isYesNoQuestion(q)
        ) {
          const yn = asYesNo(raw);
          return (
            <View key={q.key}>
              <View className="flex-row items-center justify-between gap-3">
                <AppText variant="secondary" className="min-w-0 flex-1 font-semibold text-ink">
                  {q.label}
                  {q.required ? (
                    <AppText variant="secondary" className="text-danger">
                      {" "}
                      *
                    </AppText>
                  ) : null}
                </AppText>
                <YesNoToggle
                  value={yn === "" ? "no" : yn}
                  onChange={(v) => onChange(q.key, v)}
                  accessibilityLabel={q.label}
                />
              </View>
              {error ? (
                <AppText variant="secondary" className="mt-1 text-danger">
                  {error}
                </AppText>
              ) : null}
            </View>
          );
        }

        if (q.type === "radio" || (q.type === "select" && q.options)) {
          const options = q.options ?? [];
          const cols = columnsForOptions(options.length);

          return (
            <View key={q.key}>
              <AppText variant="secondary" className="mb-1.5 font-semibold text-ink">
                {q.label}
                {q.required ? (
                  <AppText variant="secondary" className="text-danger">
                    {" "}
                    *
                  </AppText>
                ) : null}
              </AppText>
              <View className="flex-row flex-wrap justify-between gap-y-2">
                {options.map((opt) => {
                  const selected = String(raw ?? "") === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => onChange(q.key, opt.value)}
                      style={{
                        width: cols === 2 ? "48%" : cols === 4 ? "23%" : "31%",
                        alignItems: "center",
                        borderRadius: 999,
                        borderWidth: 1,
                        paddingHorizontal: 8,
                        paddingVertical: 10,
                        backgroundColor: selected ? "#2563eb" : "#F4F6F8",
                        borderColor: selected ? "#2563eb" : "#E5E7EB",
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={opt.label}
                    >
                      <AppText
                        variant="secondary"
                        style={{
                          textAlign: "center",
                          fontWeight: "600",
                          color: selected ? "#FFFFFF" : "#111827",
                        }}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                      >
                        {compactOptionLabel(opt.label)}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
              {error ? (
                <AppText variant="secondary" className="mt-1 text-danger">
                  {error}
                </AppText>
              ) : null}
            </View>
          );
        }

        if (q.type === "number") {
          return (
            <TextField
              key={q.key}
              label={q.label + (q.required ? " *" : "")}
              keyboardType="number-pad"
              value={raw == null || raw === "" ? "" : String(raw)}
              onChangeText={(t) => onChange(q.key, t)}
              placeholder={q.placeholder}
              error={error}
            />
          );
        }

        if (q.type === "checkbox") {
          const checked = raw === true || raw === "yes";
          return (
            <View key={q.key} className="flex-row items-center justify-between gap-3">
              <AppText variant="secondary" className="min-w-0 flex-1 font-semibold text-ink">
                {q.label}
              </AppText>
              <YesNoToggle
                value={checked ? "yes" : "no"}
                onChange={(v) => onChange(q.key, v)}
                accessibilityLabel={q.label}
              />
            </View>
          );
        }

        return (
          <TextField
            key={q.key}
            label={q.label + (q.required ? " *" : "")}
            value={raw == null ? "" : String(raw)}
            onChangeText={(t) => onChange(q.key, t)}
            placeholder={q.placeholder}
            error={error}
            multiline={q.type === "textarea"}
          />
        );
      })}

      {roomQuestions.length > 0 ? (
        <RoomCountSteppers
          questions={roomQuestions}
          values={values}
          onChange={onChange}
          errors={errors}
        />
      ) : null}
    </View>
  );
}
