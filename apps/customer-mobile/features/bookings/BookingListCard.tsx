import { Pressable, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { homeColors } from "@/features/home/homeTheme";
import { HomeServiceThumb } from "@/features/home/HomeServiceThumb";
import { formatZar } from "@/lib/booking/displayPricing";
import { serviceTitleFromBooking } from "@/lib/bookings/bookingDetailDisplay";
import {
  bookingStatusLabel,
  bookingStatusTone,
  formatAddressLine,
  formatBookingDate,
  formatBookingTime,
} from "@/lib/bookings/bookingDisplay";
import {
  bookingCleanerLabel,
  bookingDisplayPriceZar,
  durationHoursFromRow,
} from "@/lib/bookings/bookingList";
import {
  canRebookBooking,
  canRescheduleBooking,
} from "@/lib/bookings/modifyEligibility";
import type { CustomerBookingRow } from "@/services/types/customerBookings";
import { canonicalDbBookingStatus } from "@shalean/types";
import { AppText } from "@/theme";

const STATUS_PILL: Record<
  ReturnType<typeof bookingStatusTone>,
  { bg: string; fg: string }
> = {
  success: { bg: "#e8f5ef", fg: "#166534" },
  warning: { bg: "#fff4e5", fg: "#9a6700" },
  danger: { bg: "#fdecec", fg: "#b42318" },
  info: { bg: "#e8f1fb", fg: "#175cd3" },
  neutral: { bg: "#eef1ef", fg: "#5b6b63" },
};

export type BookingCardPrimaryAction = {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
};

type Props = {
  row: CustomerBookingRow;
  onViewDetails: () => void;
  onPrimaryAction: (action: "track" | "reschedule" | "rebook" | "open") => void;
};

export function resolveBookingPrimaryAction(
  row: CustomerBookingRow,
): Omit<BookingCardPrimaryAction, "onPress"> & { kind: "track" | "reschedule" | "rebook" | "open" } {
  const status = canonicalDbBookingStatus(row.status);
  if (status === "in_progress" || status === "assigned" || status === "offered") {
    return { kind: "track", label: "Track", icon: "map-pin" };
  }
  if (canRescheduleBooking(row)) {
    return { kind: "reschedule", label: "Reschedule", icon: "calendar" };
  }
  if (canRebookBooking(row)) {
    return { kind: "rebook", label: "Rebook", icon: "refresh-cw" };
  }
  return { kind: "open", label: "Open", icon: "arrow-right" };
}

export function BookingListCard({ row, onViewDetails, onPrimaryAction }: Props) {
  const when = `${formatBookingDate(String(row.date ?? ""))} · ${formatBookingTime(
    String(row.time ?? ""),
    durationHoursFromRow(row),
    row.schedule_confirmed !== false,
  )}`;
  const where = formatAddressLine(row.location, row.suburb);
  const cleaner = bookingCleanerLabel(row);
  const price = bookingDisplayPriceZar(row);
  const title = serviceTitleFromBooking(row);
  const subtitle = [where !== "Address on file" ? where : null, cleaner]
    .filter(Boolean)
    .join(" · ");
  const tone = bookingStatusTone(row.status);
  const pill = STATUS_PILL[tone];
  const primary = resolveBookingPrimaryAction(row);

  return (
    <View
      style={{
        backgroundColor: homeColors.card,
        borderRadius: 24,
        padding: 14,
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 3 },
        elevation: 2,
      }}
    >
      <Pressable
        onPress={onViewDetails}
        accessibilityRole="button"
        accessibilityLabel={`${title} on ${when}`}
        style={{ flexDirection: "row", gap: 12 }}
      >
        <HomeServiceThumb size={88} height={96} borderRadius={18} fit="contain" />

        <View style={{ flex: 1, minWidth: 0, justifyContent: "space-between" }}>
          <View>
            <AppText
              variant="body"
              numberOfLines={1}
              style={{ color: homeColors.ink, fontWeight: "700" }}
            >
              {title}
            </AppText>
            <AppText
              variant="secondary"
              numberOfLines={1}
              style={{
                color: homeColors.muted,
                marginTop: 4,
              }}
            >
              {when}
            </AppText>
            {subtitle ? (
              <AppText
                variant="secondary"
                numberOfLines={1}
                style={{
                  color: homeColors.muted,
                  marginTop: 2,
                }}
              >
                {subtitle}
              </AppText>
            ) : null}
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 8,
              gap: 8,
            }}
          >
            <AppText
              variant="body"
              style={{
                color: homeColors.primary,
                fontWeight: "700",
                flexShrink: 1,
              }}
              numberOfLines={1}
            >
              {price != null ? formatZar(price) : "—"}
            </AppText>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: pill.bg,
                borderRadius: 999,
                paddingHorizontal: 8,
                paddingVertical: 4,
              }}
            >
              <AppText variant="label" style={{ color: pill.fg, fontWeight: "600" }}>
                {bookingStatusLabel(row.status)}
              </AppText>
            </View>
          </View>
        </View>
      </Pressable>

      <View
        style={{
          height: 1,
          backgroundColor: "#EEF1F4",
          marginTop: 14,
          marginBottom: 12,
        }}
      />

      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          onPress={onViewDetails}
          accessibilityRole="button"
          accessibilityLabel="View details"
          style={{
            flex: 1,
            minHeight: 44,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            backgroundColor: homeColors.primarySoft,
            borderRadius: 14,
            paddingHorizontal: 10,
            paddingVertical: 10,
          }}
        >
          <Feather name="eye" size={15} color={homeColors.primaryLight} />
          <AppText
            variant="secondary"
            style={{ color: homeColors.primaryLight, fontWeight: "700" }}
          >
            View Details
          </AppText>
        </Pressable>

        <Pressable
          onPress={() => onPrimaryAction(primary.kind)}
          accessibilityRole="button"
          accessibilityLabel={primary.label}
          style={{
            flex: 1,
            minHeight: 44,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            backgroundColor: homeColors.primary,
            borderRadius: 14,
            paddingHorizontal: 10,
            paddingVertical: 10,
          }}
        >
          <Feather name={primary.icon} size={15} color="#FFFFFF" />
          <AppText variant="secondary" style={{ color: "#FFFFFF", fontWeight: "700" }}>
            {primary.label}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}
