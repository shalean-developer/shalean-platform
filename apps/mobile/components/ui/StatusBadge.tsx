import { Text, View } from "react-native";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const toneClass: Record<StatusTone, { wrap: string; text: string }> = {
  success: { wrap: "bg-status-success-bg", text: "text-status-success-fg" },
  warning: { wrap: "bg-status-warning-bg", text: "text-status-warning-fg" },
  danger: { wrap: "bg-status-danger-bg", text: "text-status-danger-fg" },
  info: { wrap: "bg-status-info-bg", text: "text-status-info-fg" },
  neutral: { wrap: "bg-status-neutral-bg", text: "text-status-neutral-fg" },
};

type Props = {
  label: string;
  tone?: StatusTone;
};

export function StatusBadge({ label, tone = "neutral" }: Props) {
  const classes = toneClass[tone];
  return (
    <View className={`rounded-md px-2 py-1 ${classes.wrap}`}>
      <Text className={`text-xs font-semibold uppercase ${classes.text}`}>{label}</Text>
    </View>
  );
}
