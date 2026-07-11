import type { ReactNode } from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { shadows } from "@/theme";

type Props = {
  children: ReactNode;
  title?: string;
  /** Remove horizontal/vertical padding (e.g. nested lists) */
  flush?: boolean;
  className?: string;
  style?: StyleProp<ViewStyle>;
  /** Soft elevation instead of flat border */
  elevated?: boolean;
};

/** Card section used across dashboard, profile, job detail. */
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
        <Text className="mb-2 text-overline font-semibold uppercase tracking-wide text-ink-muted">
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}
