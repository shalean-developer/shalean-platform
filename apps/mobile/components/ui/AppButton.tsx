import type { ReactNode } from "react";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { colors } from "@/theme";

type Variant = "primary" | "secondary" | "danger" | "ghost";

type Props = {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: Variant;
  accessibilityLabel?: string;
  icon?: ReactNode;
  className?: string;
};

const variantClass: Record<Variant, string> = {
  primary: "bg-brand-500",
  secondary: "border border-surface-muted bg-surface-card",
  danger: "border border-danger-border bg-surface-card",
  ghost: "bg-transparent",
};

const labelClass: Record<Variant, string> = {
  primary: "text-ink-inverse",
  secondary: "text-ink",
  danger: "text-danger",
  ghost: "text-brand-600",
};

async function lightHaptic() {
  if (Platform.OS === "web") return;
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // Haptics unavailable on some emulators / devices — ignore.
  }
}

export function AppButton({
  label,
  onPress,
  disabled,
  loading,
  variant = "primary",
  accessibilityLabel,
  icon,
  className = "",
}: Props) {
  const busy = Boolean(loading);
  const isDisabled = Boolean(disabled || busy);

  return (
    <Pressable
      onPress={() => {
        if (isDisabled) return;
        void lightHaptic();
        onPress?.();
      }}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy }}
      className={`min-h-touch flex-row items-center justify-center gap-2 rounded-xl px-4 py-3.5 active:opacity-80 ${variantClass[variant]} ${isDisabled ? "opacity-60" : ""} ${className}`}
    >
      {busy ? (
        <ActivityIndicator
          color={variant === "primary" ? colors.ink.inverse : colors.brand[500]}
        />
      ) : (
        <>
          {icon ? <View>{icon}</View> : null}
          <Text className={`text-center text-base font-semibold ${labelClass[variant]}`}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}
