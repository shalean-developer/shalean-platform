import { View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors } from "@/theme";

type Props = {
  size?: number;
  backgroundColor?: string;
  selected?: boolean;
};

/** Circular person icon avatar (photos not available on booking cleaner DTO yet). */
export function CleanerAvatar({
  size = 48,
  backgroundColor = colors.brand[50],
  selected = false,
}: Props) {
  const iconSize = Math.round(size * 0.45);

  return (
    <View
      className={`items-center justify-center rounded-full ${
        selected ? "border-2 border-brand-500" : ""
      }`}
      style={{
        width: size,
        height: size,
        backgroundColor: selected ? colors.brand[100] : backgroundColor || colors.brand[50],
      }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Feather name="user" size={iconSize} color={colors.brand[600]} />
    </View>
  );
}
