import type { ComponentProps, ReactNode } from "react";
import { ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

type Props = {
  children: ReactNode;
  /**
   * Optional top banner (e.g. cleaner OfflineBanner).
   * Kept injectable so the package does not depend on app providers.
   */
  banner?: ReactNode;
  scroll?: boolean;
  className?: string;
  contentClassName?: string;
  /** Extra scroll content styles (e.g. paddingBottom for floating tab bars). */
  contentContainerStyle?: StyleProp<ViewStyle>;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
  refreshControl?: ComponentProps<typeof ScrollView>["refreshControl"];
};

/**
 * Standard screen chrome — surface background, optional banner, safe area.
 */
export function Screen({
  children,
  banner = null,
  scroll = false,
  className = "",
  contentClassName = "",
  contentContainerStyle,
  edges = ["bottom"],
  style,
  refreshControl,
}: Props) {
  // Avoid conflicting utilities (e.g. default pb-8 fighting caller pb-28).
  const hasPadX = /\bpx-/.test(contentClassName);
  const hasPadT = /\bpt-/.test(contentClassName);
  const hasPadB = /\bpb-/.test(contentClassName);
  const defaults = [
    "grow",
    hasPadX ? "" : "px-4",
    hasPadT ? "" : "pt-2",
    hasPadB ? "" : "pb-8",
    contentClassName,
  ]
    .filter(Boolean)
    .join(" ");

  const body = scroll ? (
    <ScrollView
      className="flex-1"
      contentContainerClassName={defaults}
      contentContainerStyle={contentContainerStyle}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  ) : (
    <View className={`flex-1 ${contentClassName}`}>{children}</View>
  );

  return (
    <SafeAreaView className={`flex-1 bg-surface ${className}`} edges={edges} style={style}>
      {banner}
      {body}
    </SafeAreaView>
  );
}
