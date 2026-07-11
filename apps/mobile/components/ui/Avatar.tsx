import { Text, View } from "react-native";
import { colors } from "@/theme";

type Props = {
  name: string;
  size?: "sm" | "md" | "lg";
  /** Optional status ring colour */
  ringColor?: string;
};

const sizeMap = {
  sm: { box: "h-10 w-10", text: "text-base" },
  md: { box: "h-16 w-16", text: "text-2xl" },
  lg: { box: "h-20 w-20", text: "text-3xl" },
} as const;

/** Initial avatar — photo upload lands in a later phase. */
export function Avatar({ name, size = "md", ringColor }: Props) {
  const initial = name.trim().charAt(0).toUpperCase() || "C";
  const s = sizeMap[size];

  return (
    <View
      className={`${s.box} items-center justify-center rounded-full bg-brand-50`}
      style={ringColor ? { borderWidth: 2, borderColor: ringColor } : undefined}
      accessibilityLabel={`Avatar for ${name}`}
    >
      <Text className={`${s.text} font-bold text-brand-600`}>{initial}</Text>
    </View>
  );
}

export function AvatarOnlineDot({ online }: { online: boolean }) {
  return (
    <View
      className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-surface-card"
      style={{ backgroundColor: online ? colors.status.success.fg : colors.ink.subtle }}
      accessibilityElementsHidden
    />
  );
}
