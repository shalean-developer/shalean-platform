import { ActivityIndicator, Pressable, Switch, Text, View } from "react-native";
import { colors } from "@/theme";

type Props = {
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  loading?: boolean;
  /** Compact for header; default for profile cards */
  compact?: boolean;
};

/** Available / Unavailable control — wired to CleanerApi.setAvailability. */
export function AvailabilityToggle({
  value,
  onChange,
  disabled,
  loading,
  compact = false,
}: Props) {
  const label = value ? "Available" : "Unavailable";

  return (
    <View
      className={`flex-row items-center ${compact ? "gap-2" : "justify-between gap-3 rounded-2xl border border-border bg-surface-card px-4 py-3.5"}`}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: Boolean(disabled || loading) }}
      accessibilityLabel={`Availability: ${label}`}
    >
      {!compact ? (
        <View className="flex-1">
          <Text className="text-base font-semibold text-ink">{label}</Text>
          <Text className="mt-0.5 text-sm text-ink-muted">
            {value ? "You can receive new job offers" : "You won’t get new offers"}
          </Text>
        </View>
      ) : (
        <Pressable
          onPress={() => !disabled && !loading && onChange(!value)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          <Text
            className="text-sm font-semibold"
            style={{ color: value ? colors.status.success.fg : colors.ink.muted }}
          >
            {label}
          </Text>
        </Pressable>
      )}
      {loading ? (
        <ActivityIndicator size="small" color={colors.brand[500]} />
      ) : (
        <Switch
          value={value}
          onValueChange={onChange}
          disabled={disabled || loading}
          trackColor={{ false: colors.surface.muted, true: colors.status.success.bg }}
          thumbColor={value ? colors.status.success.fg : colors.ink.subtle}
          ios_backgroundColor={colors.surface.muted}
        />
      )}
    </View>
  );
}
