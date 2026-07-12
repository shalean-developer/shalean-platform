import { useMemo, useState } from "react";
import { Pressable, RefreshControl, View } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { AppButton, EmptyState, ErrorState, LoadingState, Screen } from "@shalean/mobile-ui";
import { BookingListCard } from "@/features/bookings/BookingListCard";
import { homeColors } from "@/features/home/homeTheme";
import { rebookHrefFromBookingRow } from "@/lib/booking/rebookFromBookingRow";
import { splitBookingsBySegment } from "@/lib/bookings/bookingList";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import { useCustomerBookingsList } from "@/hooks/useCustomerBookings";
import type { CustomerBookingRow } from "@/services/types/customerBookings";
import { AppText } from "@/theme";

type Segment = "all" | "upcoming" | "past";

const FILTERS: { key: Segment; label: string }[] = [
  { key: "all", label: "All" },
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
];

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      style={{
        height: 36,
        paddingHorizontal: 14,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: selected ? homeColors.primary : homeColors.card,
        borderWidth: selected ? 0 : 1,
        borderColor: "#E5E7EB",
      }}
    >
      <AppText
        variant="secondary"
        style={{
          color: selected ? "#FFFFFF" : homeColors.muted,
          fontWeight: "600",
        }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

export default function BookingsListScreen() {
  const router = useRouter();
  const listQuery = useCustomerBookingsList();
  const [segment, setSegment] = useState<Segment>("upcoming");

  const { upcoming, past } = useMemo(
    () => splitBookingsBySegment(listQuery.data ?? []),
    [listQuery.data],
  );

  const rows = useMemo(() => {
    if (segment === "upcoming") return upcoming;
    if (segment === "past") return past;
    return [...upcoming, ...past];
  }, [segment, upcoming, past]);

  const openBooking = (row: CustomerBookingRow) => {
    router.push(`/bookings/${row.id}` as never);
  };

  const handlePrimary = (
    row: CustomerBookingRow,
    kind: "track" | "reschedule" | "rebook" | "open",
  ) => {
    if (kind === "track") {
      router.push(`/bookings/${row.id}/track` as never);
      return;
    }
    if (kind === "reschedule") {
      router.push(`/bookings/${row.id}/reschedule` as never);
      return;
    }
    if (kind === "rebook") {
      router.push(rebookHrefFromBookingRow(row) as never);
      return;
    }
    openBooking(row);
  };

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <Screen scroll={false} edges={["top"]}>
        <LoadingState label="Loading bookings…" />
      </Screen>
    );
  }

  if (listQuery.isError && !listQuery.data) {
    return (
      <Screen scroll={false} edges={["top"]}>
        <ErrorState
          title="Couldn’t load bookings"
          message={friendlyErrorMessage(listQuery.error)}
          onRetry={() => void listQuery.refetch()}
        />
      </Screen>
    );
  }

  const sectionTitle =
    segment === "upcoming" ? "Upcoming cleans" : segment === "past" ? "Past cleans" : "All bookings";
  const sectionCount =
    segment === "upcoming"
      ? `${upcoming.length} upcoming`
      : segment === "past"
        ? `${past.length} past`
        : `${rows.length} total`;

  return (
    <Screen
      scroll
      edges={["top"]}
      contentClassName="pb-28 pt-1"
      refreshControl={
        <RefreshControl
          refreshing={listQuery.isFetching && !listQuery.isLoading}
          onRefresh={() => void listQuery.refetch()}
          tintColor={homeColors.primary}
        />
      }
    >
      <View style={{ marginBottom: 16, alignItems: "center", justifyContent: "center" }}>
        <AppText
          variant="title"
          style={{
            color: homeColors.ink,
            letterSpacing: -0.3,
          }}
        >
          Bookings
        </AppText>
      </View>

      {/* Fixed-height row — nested horizontal ScrollView stretches vertically inside Screen scroll */}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 20,
          alignItems: "center",
        }}
      >
        {FILTERS.map((tab) => (
          <FilterChip
            key={tab.key}
            label={tab.label}
            selected={segment === tab.key}
            onPress={() => setSegment(tab.key)}
          />
        ))}
        <FilterChip
          label="Recurring"
          onPress={() => router.push("/bookings/recurring" as never)}
        />
      </View>

      <View
        style={{
          marginBottom: 12,
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <AppText variant="section" style={{ color: homeColors.ink }}>
            {sectionTitle}
          </AppText>
          <AppText variant="secondary" style={{ color: homeColors.muted, marginTop: 2 }}>
            {sectionCount}
          </AppText>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <AppText variant="secondary" style={{ color: homeColors.primary, fontWeight: "600" }}>
            Sort: Date
          </AppText>
          <Feather name="chevron-down" size={14} color={homeColors.primary} />
        </View>
      </View>

      {rows.length === 0 ? (
        <View
          style={{
            backgroundColor: homeColors.card,
            borderRadius: 24,
            paddingVertical: 12,
            shadowColor: "#000",
            shadowOpacity: 0.05,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 2 },
            elevation: 1,
          }}
        >
          <EmptyState
            title={segment === "past" ? "No past bookings" : "No upcoming cleans"}
            message={
              segment === "past"
                ? "Completed and cancelled cleans will show up here."
                : "Book a clean when you’re ready — it only takes a few minutes."
            }
            icon="calendar-outline"
          />
          {segment !== "past" ? (
            <View className="px-6 pb-4">
              <AppButton
                label="Book a cleaning"
                onPress={() => router.push("/book/regular-cleaning/details" as never)}
              />
            </View>
          ) : null}
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          {rows.map((row) => (
            <BookingListCard
              key={row.id}
              row={row}
              onViewDetails={() => openBooking(row)}
              onPrimaryAction={(kind) => handlePrimary(row, kind)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}
