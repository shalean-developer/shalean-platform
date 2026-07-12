import { Image, View, type StyleProp, type ViewStyle } from "react-native";
import { homeColors } from "@/features/home/homeTheme";

export const HOME_HERO_IMAGE = require("../../assets/images/welcome-hero.png");

type Props = {
  /** Outer frame width. */
  size: number;
  /** Optional taller frame for portraits (defaults to `size`). */
  height?: number;
  /** Corner radius — use size/2 for a circle. */
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  /** Soft fill behind the portrait. */
  backgroundColor?: string;
  /**
   * `contain` — full portrait visible (best for service cards).
   * `cover` — fills the frame (best for tiny circles).
   */
  fit?: "contain" | "cover";
};

/**
 * Portrait hero fitted into a rounded frame without awkward crops.
 */
export function HomeServiceThumb({
  size,
  height,
  borderRadius = 16,
  style,
  backgroundColor = homeColors.primarySoft,
  fit = "contain",
}: Props) {
  const frameH = height ?? size;
  const pad = fit === "contain" ? Math.round(size * 0.06) : 0;
  const imgW = fit === "contain" ? size - pad * 2 : Math.round(size * 1.08);
  const imgH =
    fit === "contain" ? frameH - pad * 2 : Math.round(frameH * 1.28);

  return (
    <View
      style={[
        {
          width: size,
          height: frameH,
          borderRadius,
          backgroundColor,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: fit === "contain" ? "center" : "flex-end",
        },
        style,
      ]}
    >
      <Image
        source={HOME_HERO_IMAGE}
        style={{
          width: imgW,
          height: imgH,
          ...(fit === "cover" ? { marginBottom: -Math.round(frameH * 0.04) } : null),
        }}
        resizeMode={fit}
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}
