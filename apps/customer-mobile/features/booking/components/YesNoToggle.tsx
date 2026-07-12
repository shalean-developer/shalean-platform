import { Pressable, View } from "react-native";
import { AppText, colors } from "@/theme";

type Props = {
  value: "yes" | "no" | "";
  onChange: (value: "yes" | "no") => void;
  accessibilityLabel?: string;
};

const TRACK_ON = "#0f5c45";
const TRACK_OFF = "#9ca3af";
const KNOB = "#ecfdf5";

/** Pill Yes/No toggle (knob slides; label shows active side). */
export function YesNoToggle({ value, onChange, accessibilityLabel }: Props) {
  const on = value === "yes";

  return (
    <Pressable
      onPress={() => onChange(on ? "no" : "yes")}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={accessibilityLabel ?? (on ? "Yes" : "No")}
      className="h-9 w-[84px] justify-center rounded-full px-1.5 active:opacity-90"
      style={{ backgroundColor: on ? TRACK_ON : TRACK_OFF }}
    >
      <View className={`flex-row items-center ${on ? "justify-between" : "justify-between"}`}>
        {on ? (
          <>
            <AppText variant="label" className="pl-2 font-semibold text-white">
              Yes
            </AppText>
            <View
              className="h-7 w-7 rounded-full"
              style={{ backgroundColor: KNOB }}
            />
          </>
        ) : (
          <>
            <View
              className="h-7 w-7 rounded-full"
              style={{ backgroundColor: colors.surface.card }}
            />
            <AppText variant="label" className="pr-2 font-semibold text-white">
              No
            </AppText>
          </>
        )}
      </View>
    </Pressable>
  );
}
