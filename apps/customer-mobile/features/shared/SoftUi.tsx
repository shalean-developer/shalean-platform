import type { ReactNode } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";
import { homeColors } from "@/features/home/homeTheme";
import { AppText, radius, touchTarget } from "@/theme";

export const softCardStyle: ViewStyle = {
  backgroundColor: homeColors.card,
  borderRadius: radius["2xl"],
  padding: 16,
  shadowColor: "#000",
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

type SoftCardProps = {
  children: ReactNode;
  title?: string;
  style?: StyleProp<ViewStyle>;
  /** Extra bottom margin (default 12). */
  mb?: number;
};

/** Soft white card used on Home / Bookings / Rewards / Profile / Booking. */
export function SoftCard({ children, title, style, mb = 12 }: SoftCardProps) {
  return (
    <View style={[softCardStyle, { marginBottom: mb }, style]}>
      {title ? (
        <AppText
          variant="label"
          style={{
            color: homeColors.muted,
            letterSpacing: 0.3,
            marginBottom: 12,
            textTransform: "uppercase",
          }}
        >
          {title}
        </AppText>
      ) : null}
      {children}
    </View>
  );
}

type ScreenTitleProps = {
  title: string;
  subtitle?: string;
};

export function ScreenTitle({ title, subtitle }: ScreenTitleProps) {
  return (
    <View style={{ marginBottom: 18, alignItems: "center", justifyContent: "center" }}>
      <AppText
        variant="title"
        style={{ color: homeColors.ink, letterSpacing: -0.3, textAlign: "center" }}
      >
        {title}
      </AppText>
      {subtitle ? (
        <AppText variant="secondary" style={{ color: homeColors.muted, marginTop: 4, textAlign: "center" }}>
          {subtitle}
        </AppText>
      ) : null}
    </View>
  );
}

type SectionHeadingProps = {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onActionPress?: () => void;
};

export function SectionHeading({
  title,
  subtitle,
  actionLabel,
  onActionPress,
}: SectionHeadingProps) {
  return (
    <View
      style={{
        marginBottom: 12,
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <View style={{ flex: 1 }}>
        <AppText variant="section" style={{ color: homeColors.ink }}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="secondary" style={{ color: homeColors.muted, marginTop: 2 }}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {actionLabel && onActionPress ? (
        <Pressable onPress={onActionPress} accessibilityRole="button">
          <AppText variant="secondary" style={{ color: homeColors.primary, fontWeight: "600" }}>
            {actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

type SoftActionChipProps = {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  primary?: boolean;
  badge?: number;
  /** Stretch across a row slot (default true). Set false for full-width solo chips. */
  flex?: boolean;
};

export function SoftActionChip({
  label,
  icon,
  onPress,
  primary = false,
  badge,
  flex = true,
}: SoftActionChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        badge != null && badge > 0 ? `${label}, ${badge} pending` : label
      }
      style={{
        ...(flex ? { flex: 1 } : { alignSelf: "stretch" }),
        minHeight: touchTarget,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        backgroundColor: primary ? homeColors.primary : homeColors.primarySoft,
        borderRadius: radius.md,
        paddingHorizontal: 10,
        paddingVertical: 10,
      }}
    >
      <Feather
        name={icon}
        size={16}
        color={primary ? "#FFFFFF" : homeColors.primaryLight}
      />
      <AppText
        variant="label"
        style={{
          color: primary ? "#FFFFFF" : homeColors.primaryLight,
          fontWeight: "600",
        }}
      >
        {label}
      </AppText>
      {badge != null && badge > 0 ? (
        <View
          style={{
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            paddingHorizontal: 4,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: primary ? "rgba(255,255,255,0.25)" : homeColors.primary,
          }}
        >
          <AppText variant="label" style={{ color: "#FFFFFF", fontWeight: "700" }}>
            {badge > 9 ? "9+" : badge}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

type MenuRowCardProps = {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  subtitle?: string;
  onPress: () => void;
  badge?: number;
  danger?: boolean;
};

export function MenuRowCard({
  icon,
  label,
  subtitle,
  onPress,
  badge,
  danger = false,
}: MenuRowCardProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        badge != null && badge > 0 ? `${label}, ${badge} unread` : label
      }
      style={[
        softCardStyle,
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingVertical: 14,
          minHeight: touchTarget,
        },
      ]}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: radius.md,
          backgroundColor: danger ? "#fdecec" : homeColors.primarySoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather
          name={icon}
          size={18}
          color={danger ? homeColors.danger : homeColors.primary}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText
          variant="card"
          style={{ color: danger ? homeColors.danger : homeColors.ink }}
          numberOfLines={1}
        >
          {label}
        </AppText>
        {subtitle ? (
          <AppText
            variant="label"
            style={{ color: homeColors.muted, marginTop: 2 }}
            numberOfLines={1}
          >
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {badge != null && badge > 0 ? (
        <View
          style={{
            minWidth: 22,
            height: 22,
            borderRadius: 11,
            paddingHorizontal: 6,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: homeColors.primary,
          }}
        >
          <AppText variant="label" style={{ color: "#FFFFFF", fontWeight: "700" }}>
            {badge > 9 ? "9+" : badge}
          </AppText>
        </View>
      ) : (
        <Feather name="chevron-right" size={18} color={homeColors.muted} />
      )}
    </Pressable>
  );
}
