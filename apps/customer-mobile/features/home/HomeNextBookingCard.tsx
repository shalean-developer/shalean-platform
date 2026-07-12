import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { formatZarFromCents } from "@shalean/utils";
import { StatusBadge } from "@shalean/mobile-ui";
import {
  bookingStatusLabel,
  bookingStatusTone,
  formatAddressLine,
  formatBookingDate,
  formatBookingTime,
} from "@/lib/bookings/bookingDisplay";
import type { DashboardBookingSummary } from "@/services/types/dashboard";
import { colors } from "@/theme";

type Props = {
  booking: DashboardBookingSummary;
};

/** Compact next-clean card. */
export function HomeNextBookingCard({ booking }: Props) {
  const router = useRouter();
  const openBooking = () => {
    if (booking.id) {
      router.push(`/bookings/${booking.id}` as never);
      return;
    }
    router.push("/(tabs)/bookings");
  };

  const priceCents = Math.round((booking.priceZar ?? 0) * 100);
  const when = `${formatBookingDate(booking.date)} · ${formatBookingTime(
    booking.time,
    booking.durationHours,
    booking.scheduleConfirmed !== false,
  )}`;
  const where = formatAddressLine(booking.addressLine, booking.suburb);

  return (
    <Pressable
      onPress={openBooking}
      accessibilityRole="button"
      accessibilityLabel={`Next clean: ${booking.serviceName} on ${when}`}
      className="mb-4 rounded-2xl border border-brand-200 bg-surface-card px-4 py-3 active:opacity-90"
    >
      <View className="mb-2 flex-row items-center justify-between gap-2">
        <Text className="text-label font-medium tracking-wide text-brand-600">
          Next clean
        </Text>
        <StatusBadge label={bookingStatusLabel(booking.status)} tone={bookingStatusTone(booking.status)} />
      </View>

      <View className="flex-row items-center gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-card text-ink" numberOfLines={1}>
            {booking.serviceName || "Cleaning"}
          </Text>
          <Text className="mt-0.5 text-caption text-ink" numberOfLines={1}>
            {when}
          </Text>
          <Text className="mt-0.5 text-caption text-ink-muted" numberOfLines={1}>
            {where}
          </Text>
          <Text className="mt-1 text-caption font-semibold text-ink">
            {formatZarFromCents(priceCents)}
          </Text>
        </View>
        <Feather name="chevron-right" size={22} color={colors.ink.subtle} />
      </View>
    </Pressable>
  );
}
