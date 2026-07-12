import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { formatZarFromCents } from "@shalean/utils";
import { SectionCard, StatusBadge } from "@shalean/mobile-ui";
import {
  bookingStatusLabel,
  bookingStatusTone,
  formatBookingDate,
  formatBookingTime,
} from "@/lib/bookings/bookingDisplay";
import type { DashboardBookingSummary } from "@/services/types/dashboard";

type Props = {
  bookings: DashboardBookingSummary[];
};

export function HomeRecentBookings({ bookings }: Props) {
  const router = useRouter();
  if (!bookings.length) return null;

  return (
    <SectionCard title="Recent" className="mb-4" flush>
      {bookings.map((b, index) => {
        const priceCents = Math.round((b.priceZar ?? 0) * 100);
        return (
          <Pressable
            key={b.id}
            onPress={() =>
              router.push((b.id ? `/bookings/${b.id}` : "/(tabs)/bookings") as never)
            }
            accessibilityRole="button"
            accessibilityLabel={`${b.serviceName} on ${b.date}`}
            className={`px-4 py-3 active:bg-surface-muted ${
              index < bookings.length - 1 ? "border-b border-border" : ""
            }`}
          >
            <View className="mb-0.5 flex-row items-start justify-between gap-2">
              <Text className="flex-1 text-card text-ink" numberOfLines={1}>
                {b.serviceName || "Cleaning"}
              </Text>
              <StatusBadge label={bookingStatusLabel(b.status)} tone={bookingStatusTone(b.status)} />
            </View>
            <Text className="text-caption text-ink-muted" numberOfLines={1}>
              {formatBookingDate(b.date)} ·{" "}
              {formatBookingTime(b.time, b.durationHours, b.scheduleConfirmed !== false)}
              {" · "}
              {formatZarFromCents(priceCents)}
            </Text>
          </Pressable>
        );
      })}
    </SectionCard>
  );
}
