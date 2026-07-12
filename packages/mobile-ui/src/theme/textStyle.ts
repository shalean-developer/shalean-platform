import type { TextStyle } from "react-native";
import { typography, type TypographyVariant } from "./tokens";

/** StyleSheet-friendly typography from shared tokens (supports Dynamic Type via font scaling). */
export function textStyle(variant: TypographyVariant): TextStyle {
  const token = typography[variant];
  return {
    fontSize: token.size,
    lineHeight: token.lineHeight,
    fontWeight: token.weight,
  };
}
