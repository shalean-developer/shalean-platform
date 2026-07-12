import { Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors } from "@/theme";

export type IconActionItem = {
  key: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  badge?: number;
  accessibilityLabel?: string;
};

type Props = {
  items: IconActionItem[];
  /** Columns per row — 3 or 4. */
  columns?: 3 | 4;
  className?: string;
};

/** FNB-style circular icon + title actions. */
export function IconActionGrid({ items, columns = 4, className = "" }: Props) {
  const widthClass = columns === 3 ? "w-[30%]" : "w-[22%]";

  return (
    <View className={`flex-row flex-wrap justify-between gap-y-4 px-1 ${className}`}>
      {items.map((item) => (
        <Pressable
          key={item.key}
          onPress={item.onPress}
          accessibilityRole="button"
          accessibilityLabel={
            item.accessibilityLabel ??
            (item.badge != null && item.badge > 0
              ? `${item.label}, ${item.badge} unread`
              : item.label)
          }
          className={`${widthClass} items-center active:opacity-70`}
        >
          <View className="relative mb-2 h-14 w-14 items-center justify-center rounded-full bg-brand-50">
            <Feather name={item.icon} size={24} color={colors.brand[600]} />
            {item.badge != null && item.badge > 0 ? (
              <View className="absolute -right-0.5 -top-0.5 min-w-[18px] items-center rounded-full bg-brand-500 px-1 py-0.5">
                <Text className="text-label font-bold text-white">
                  {item.badge > 9 ? "9+" : item.badge}
                </Text>
              </View>
            ) : null}
          </View>
          <Text className="text-center text-label font-medium text-ink" numberOfLines={1}>
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
