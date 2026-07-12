import { useEffect, useRef } from "react";
import { Animated, View, type ViewStyle } from "react-native";
import { colors } from "./theme";

type Props = {
  className?: string;
  style?: ViewStyle;
  width?: number | `${number}%`;
  height?: number;
  rounded?: "md" | "lg" | "full";
};

/** Pulsing placeholder block for skeleton screens. */
export function Skeleton({
  className = "",
  style,
  width = "100%",
  height = 16,
  rounded = "md",
}: Props) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  const radius = rounded === "full" ? 9999 : rounded === "lg" ? 16 : 8;

  return (
    <Animated.View
      className={className}
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: colors.surface.muted,
          opacity,
        },
        style,
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

/** Prebuilt card skeleton for list loading. */
export function JobCardSkeleton() {
  return (
    <View className="mb-3 rounded-2xl border border-border bg-surface-card p-4">
      <View className="mb-3 flex-row justify-between">
        <Skeleton width="55%" height={20} />
        <Skeleton width={72} height={22} rounded="md" />
      </View>
      <Skeleton width="40%" height={16} className="mb-2" />
      <Skeleton width="85%" height={14} />
    </View>
  );
}

export function DashboardSkeleton() {
  return (
    <View className="gap-3 px-4 pt-2">
      <Skeleton width="40%" height={14} />
      <Skeleton width="60%" height={24} className="mb-2" />
      <JobCardSkeleton />
      <JobCardSkeleton />
      <JobCardSkeleton />
    </View>
  );
}
