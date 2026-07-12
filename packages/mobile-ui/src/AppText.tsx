import type { ReactNode } from "react";
import { Text, type StyleProp, type TextProps, type TextStyle } from "react-native";

export type AppTextVariant =
  | "hero"
  | "title"
  | "section"
  | "card"
  | "body"
  | "secondary"
  | "label"
  | "button"
  | "tab"
  /** @deprecated Prefer `hero` */
  | "display"
  /** @deprecated Prefer `section` */
  | "heading"
  /** @deprecated Prefer `secondary` */
  | "caption";

const nativewindClass: Record<AppTextVariant, string> = {
  hero: "text-display",
  display: "text-display",
  title: "text-title",
  section: "text-heading",
  heading: "text-heading",
  card: "text-card",
  body: "text-body",
  secondary: "text-caption",
  caption: "text-caption",
  label: "text-label",
  button: "text-button",
  tab: "text-tab",
};

type Props = Omit<TextProps, "children"> & {
  variant?: AppTextVariant;
  children: ReactNode;
  className?: string;
  style?: StyleProp<TextStyle>;
};

/**
 * Reusable text primitive bound to the shared typography scale.
 * `allowFontScaling` defaults to true for Dynamic Type / Android font scale.
 */
export function AppText({
  variant = "body",
  children,
  className = "",
  style,
  allowFontScaling = true,
  maxFontSizeMultiplier = 1.4,
  ...rest
}: Props) {
  return (
    <Text
      allowFontScaling={allowFontScaling}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      className={`${nativewindClass[variant]} ${className}`.trim()}
      style={style}
      {...rest}
    >
      {children}
    </Text>
  );
}
