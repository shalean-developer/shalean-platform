import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { homeColors } from "@/features/home/homeTheme";
import { AppText, radius, touchTarget } from "@/theme";
import { formatZar } from "@/lib/booking/displayPricing";

type Props = {
  label?: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  secondary?: ReactNode;
  /** When set, shows total to the left of the action button. */
  amountZar?: number | null;
  amountLabel?: string;
};

/** Sticky continue footer for wizard steps — matches Home/Bookings soft UI. */
export function BookingStickyFooter({
  label = "Continue",
  onPress,
  disabled,
  loading,
  secondary,
  amountZar,
  amountLabel = "Estimated total",
}: Props) {
  const insets = useSafeAreaInsets();
  const showAmount = amountZar != null && Number.isFinite(amountZar);
  const busy = Boolean(disabled || loading);

  return (
    <View
      style={{
        backgroundColor: homeColors.card,
        borderTopLeftRadius: radius["2xl"],
        borderTopRightRadius: radius["2xl"],
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: Math.max(insets.bottom, 12) + 4,
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: -4 },
        elevation: 10,
      }}
    >
      {secondary}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {showAmount ? (
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText
              variant="label"
              style={{ color: homeColors.muted }}
              numberOfLines={1}
            >
              {amountLabel}
            </AppText>
            <AppText
              variant="title"
              style={{
                color: homeColors.primary,
                marginTop: 2,
                letterSpacing: -0.3,
                fontWeight: "700",
              }}
              numberOfLines={1}
            >
              {formatZar(amountZar)}
            </AppText>
          </View>
        ) : null}

        <Pressable
          onPress={onPress}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy, busy: Boolean(loading) }}
          style={{
            flex: showAmount ? 1.05 : 1,
            minHeight: touchTarget,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            backgroundColor: busy ? homeColors.primaryMuted : homeColors.primary,
            borderRadius: radius.md,
            paddingHorizontal: 16,
            opacity: busy && !loading ? 0.7 : 1,
          }}
        >
          <AppText variant="button" style={{ color: "#FFFFFF" }}>
            {loading ? "Please wait…" : label}
          </AppText>
          {!loading ? <Feather name="arrow-right" size={18} color="#FFFFFF" /> : null}
        </Pressable>
      </View>
    </View>
  );
}
