import { Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { formatZarFromCents } from "@shalean/utils";
import { colors } from "@/theme";

type Props = {
  bookingsThisMonthCount: number;
  hoursBookedThisMonth: number;
  completedThisMonthCount: number;
  totalSpentThisMonthCents: number;
};

type Stat = {
  key: string;
  label: string;
  value: string;
  icon: keyof typeof Feather.glyphMap;
};

export function HomeMonthSnapshot({
  bookingsThisMonthCount,
  hoursBookedThisMonth,
  completedThisMonthCount,
  totalSpentThisMonthCents,
}: Props) {
  const stats: Stat[] = [
    {
      key: "bookings",
      label: "Bookings",
      value: String(bookingsThisMonthCount),
      icon: "calendar",
    },
    {
      key: "hours",
      label: "Hours",
      value: String(hoursBookedThisMonth),
      icon: "clock",
    },
    {
      key: "completed",
      label: "Completed",
      value: String(completedThisMonthCount),
      icon: "check-circle",
    },
    {
      key: "spent",
      label: "Spent",
      value: formatZarFromCents(totalSpentThisMonthCents),
      icon: "credit-card",
    },
  ];

  return (
    <View className="mb-5">
      <Text className="mb-3 px-1 text-label font-medium tracking-wide text-ink-muted">
        This month
      </Text>
      <View className="flex-row items-start justify-between px-1">
        {stats.map((stat) => (
          <View
            key={stat.key}
            className="w-[22%] items-center"
            accessibilityLabel={`${stat.label}: ${stat.value}`}
          >
            <View className="mb-2 h-14 w-14 items-center justify-center rounded-full bg-brand-50">
              <Feather name={stat.icon} size={24} color={colors.brand[600]} />
            </View>
            <Text
              className="text-center text-caption font-semibold text-ink"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {stat.value}
            </Text>
            <Text className="mt-0.5 text-center text-label font-medium text-ink-muted" numberOfLines={1}>
              {stat.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
