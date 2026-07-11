import type { ComponentProps, ReactNode } from "react";
import { ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { OfflineBanner } from "@/components/OfflineBanner";

type Props = {
  children: ReactNode;
  /** Show offline / queue banner at top */
  showOfflineBanner?: boolean;
  /** Wrap content in ScrollView */
  scroll?: boolean;
  /** Extra class on outer container */
  className?: string;
  contentClassName?: string;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
  refreshControl?: ComponentProps<typeof ScrollView>["refreshControl"];
};

/**
 * Standard screen chrome — surface background, optional offline banner, safe area.
 */
export function Screen({
  children,
  showOfflineBanner = true,
  scroll = false,
  className = "",
  contentClassName = "",
  edges = ["bottom"],
  style,
  refreshControl,
}: Props) {
  const body = scroll ? (
    <ScrollView
      className="flex-1"
      contentContainerClassName={`grow px-4 pb-8 pt-2 ${contentClassName}`}
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
      {showOfflineBanner ? <OfflineBanner /> : null}
      {body}
    </SafeAreaView>
  );
}
