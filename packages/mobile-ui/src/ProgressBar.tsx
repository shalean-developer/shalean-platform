import { View } from "react-native";
import { colors } from "./theme";

type Props = {
  /** 0–100 */
  value: number;
  accessibilityLabel?: string;
  tone?: "brand" | "success" | "warning";
  height?: number;
};

const fillColor = {
  brand: colors.brand[500],
  success: colors.status.success.fg,
  warning: colors.status.warning.fg,
} as const;

/** Linear progress bar. */
export function ProgressBar({
  value,
  accessibilityLabel,
  tone = "brand",
  height = 8,
}: Props) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <View
      className="w-full overflow-hidden rounded-full bg-surface-muted"
      style={{ height }}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? `Progress ${Math.round(clamped)} percent`}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
    >
      <View
        className="h-full rounded-full"
        style={{ width: `${clamped}%`, backgroundColor: fillColor[tone] }}
      />
    </View>
  );
}
