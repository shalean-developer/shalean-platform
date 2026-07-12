import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "./theme";

type Props = {
  label: string;
  value?: string;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  right?: ReactNode;
  showChevron?: boolean;
  danger?: boolean;
  accessibilityLabel?: string;
};

/** Tappable row for profile / settings lists. */
export function ListRow({
  label,
  value,
  onPress,
  icon,
  right,
  showChevron,
  danger = false,
  accessibilityLabel,
}: Props) {
  const chevron = showChevron ?? Boolean(onPress);
  const content = (
    <View className="min-h-touch flex-row items-center gap-3 px-4 py-3">
      {icon ? (
        <View className="h-9 w-9 items-center justify-center rounded-lg bg-surface-muted">
          <Ionicons
            name={icon}
            size={20}
            color={danger ? colors.danger.text : colors.ink.default}
          />
        </View>
      ) : null}
      <View className="flex-1">
        <Text className={`text-body font-medium ${danger ? "text-danger" : "text-ink"}`}>
          {label}
        </Text>
        {value ? <Text className="mt-0.5 text-caption text-ink-muted">{value}</Text> : null}
      </View>
      {right}
      {chevron ? (
        <Ionicons name="chevron-forward" size={18} color={colors.ink.subtle} />
      ) : null}
    </View>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={accessibilityLabel ?? `${label}${value ? `: ${value}` : ""}`}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      className="active:bg-surface-muted"
      android_ripple={{ color: colors.surface.muted }}
    >
      {content}
    </Pressable>
  );
}
