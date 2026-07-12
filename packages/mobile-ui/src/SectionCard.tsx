import type { ReactNode } from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { shadows } from "./theme";

type Props = {
  children: ReactNode;
  title?: string;
  flush?: boolean;
  className?: string;
  style?: StyleProp<ViewStyle>;
  elevated?: boolean;
};

/** Card section used across dashboards and detail screens. */
export function SectionCard({
  children,
  title,
  flush = false,
  className = "",
  style,
  elevated = false,
}: Props) {
  return (
    <View
      className={`rounded-2xl border border-border bg-surface-card ${flush ? "p-3" : "p-4"} ${className}`}
      style={[elevated ? shadows.sm : undefined, style]}
    >
      {title ? (
        <Text className="mb-2 text-label font-medium tracking-wide text-ink-muted">
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}
