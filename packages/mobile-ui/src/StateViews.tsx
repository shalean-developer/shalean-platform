import { ActivityIndicator, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppButton } from "./AppButton";
import { colors } from "./theme";

type Props = {
  title: string;
  message?: string;
  onRetry?: () => void;
};

export function ErrorState({ title, message, onRetry }: Props) {
  return (
    <View className="flex-1 items-center justify-center px-6 py-10" accessibilityRole="alert">
      <View className="mb-4 h-14 w-14 items-center justify-center rounded-full bg-status-danger-bg">
        <Ionicons name="alert-circle-outline" size={28} color={colors.status.danger.fg} />
      </View>
      <Text className="mb-2 text-center text-card text-ink">{title}</Text>
      {message ? <Text className="mb-5 text-center text-caption text-ink-muted">{message}</Text> : null}
      {onRetry ? <AppButton label="Retry" onPress={onRetry} className="min-w-[140px]" /> : null}
    </View>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <View
      className="flex-1 items-center justify-center px-6 py-10"
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      <ActivityIndicator color={colors.brand[500]} size="large" />
      <Text className="mt-3 text-caption text-ink-muted">{label}</Text>
    </View>
  );
}

export function EmptyState({
  title,
  message,
  icon = "calendar-outline",
}: {
  title: string;
  message?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View className="flex-1 items-center justify-center px-6 py-16" accessibilityRole="text">
      <View className="mb-4 h-14 w-14 items-center justify-center rounded-full bg-brand-50">
        <Ionicons name={icon} size={28} color={colors.brand[600]} />
      </View>
      <Text className="mb-2 text-center text-card text-ink">{title}</Text>
      {message ? <Text className="text-center text-caption text-ink-muted">{message}</Text> : null}
    </View>
  );
}
