import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppButton } from "@/components/ui/AppButton";
import { SectionCard } from "@/components/ui/SectionCard";
import { colors } from "@/theme";

type Props = {
  title: string;
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
};

/**
 * Polished shell for Phase 3+ screens (Schedule, Earnings) before full implementation.
 * Not a dead "Placeholder" — communicates roadmap without blocking IA.
 */
export function FeatureShell({
  title,
  message,
  icon = "construct-outline",
  actionLabel,
  onAction,
  children,
}: Props) {
  return (
    <View className="flex-1 px-4 pt-2">
      <SectionCard elevated className="items-center py-8">
        <View className="mb-4 h-14 w-14 items-center justify-center rounded-full bg-brand-50">
          <Ionicons name={icon} size={28} color={colors.brand[600]} />
        </View>
        <Text className="mb-2 text-center text-title text-ink" accessibilityRole="header">
          {title}
        </Text>
        <Text className="mb-5 text-center text-body text-ink-muted">{message}</Text>
        {actionLabel && onAction ? (
          <AppButton label={actionLabel} onPress={onAction} className="min-w-[160px]" />
        ) : null}
        {children}
      </SectionCard>
    </View>
  );
}
