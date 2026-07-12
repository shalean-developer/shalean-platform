import { useCallback, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { canonicalDbBookingStatus } from "@shalean/types";
import {
  AppButton,
  ErrorState,
  LoadingState,
  Screen,
  SectionCard,
  StatusBadge,
} from "@shalean/mobile-ui";
import { formatZar } from "@/lib/booking/displayPricing";
import { rebookHrefFromBookingRow } from "@/lib/booking/rebookFromBookingRow";
import {
  bookingStatusLabel,
  bookingStatusTone,
  formatAddressLine,
  formatBookingDate,
  formatBookingTime,
} from "@/lib/bookings/bookingDisplay";
import {
  extrasLabelFromBooking,
  notesLabelFromBooking,
  roomsLabelFromBooking,
  serviceTitleFromBooking,
} from "@/lib/bookings/bookingDetailDisplay";
import {
  bookingCleanerLabel,
  bookingDisplayPriceZar,
  durationHoursFromRow,
} from "@/lib/bookings/bookingList";
import {
  canCancelBooking,
  canRebookBooking,
  canRescheduleBooking,
} from "@/lib/bookings/modifyEligibility";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import {
  customerBookingDetailQueryKey,
  customerBookingsQueryKey,
  useCustomerBookingDetail,
} from "@/hooks/useCustomerBookings";
import { useCustomerReviews } from "@/hooks/useCustomerRewards";
import { dashboardSummaryQueryKey } from "@/hooks/useDashboardSummary";
import { isBookingPendingCustomerReview } from "@/lib/rewards/reviewEligibility";
import { getCustomerBookingsApi } from "@/services/customerApi";

function DetailRow({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <View className="mb-3">
      <Text className="text-label font-medium tracking-wide text-ink-muted">
        {label}
      </Text>
      <Text className="mt-0.5 text-body text-ink">{value}</Text>
    </View>
  );
}

export default function BookingDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const bookingId = (id ?? "").trim();
  const detailQuery = useCustomerBookingDetail(bookingId);
  const reviewsQuery = useCustomerReviews();
  const queryClient = useQueryClient();
  const [cancelling, setCancelling] = useState(false);

  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: customerBookingsQueryKey }),
      queryClient.invalidateQueries({ queryKey: customerBookingDetailQueryKey(bookingId) }),
      queryClient.invalidateQueries({ queryKey: dashboardSummaryQueryKey }),
    ]);
  }, [bookingId, queryClient]);

  const confirmCancel = useCallback(() => {
    Alert.alert(
      "Cancel booking?",
      "This clean will be cancelled. You can rebook later if needed.",
      [
        { text: "Keep booking", style: "cancel" },
        {
          text: "Cancel booking",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setCancelling(true);
              try {
                const result = await getCustomerBookingsApi().cancel(bookingId);
                if (!result.ok) {
                  Alert.alert("Couldn’t cancel", result.error || "Please try again.");
                  return;
                }
                await invalidate();
                Alert.alert("Cancelled", "Your booking has been cancelled.");
              } catch (err) {
                Alert.alert("Couldn’t cancel", friendlyErrorMessage(err));
              } finally {
                setCancelling(false);
              }
            })();
          },
        },
      ],
    );
  }, [bookingId, invalidate]);

  if (detailQuery.isLoading && !detailQuery.data) {
    return (
      <Screen scroll={false} edges={["top"]}>
        <LoadingState label="Loading booking…" />
      </Screen>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <Screen scroll={false} edges={["top"]}>
        <ErrorState
          title="Couldn’t load booking"
          message={friendlyErrorMessage(detailQuery.error)}
          onRetry={() => void detailQuery.refetch()}
        />
        <View className="px-4 pb-6">
          <AppButton label="Back to bookings" variant="secondary" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const row = detailQuery.data;
  const when = `${formatBookingDate(String(row.date ?? ""))} · ${formatBookingTime(
    String(row.time ?? ""),
    durationHoursFromRow(row),
    row.schedule_confirmed !== false,
  )}`;
  const where = formatAddressLine(row.location, row.suburb);
  const cleaner = bookingCleanerLabel(row);
  const price = bookingDisplayPriceZar(row);
  const rooms = roomsLabelFromBooking(row);
  const extras = extrasLabelFromBooking(row);
  const notes = notesLabelFromBooking(row);
  const accessParts = [
    row.access_instructions?.trim(),
    row.parking_instructions?.trim()
      ? `Parking: ${row.parking_instructions.trim()}`
      : null,
    row.gate_code?.trim() ? `Gate: ${row.gate_code.trim()}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const showCancel = canCancelBooking(row);
  const showReschedule = canRescheduleBooking(row);
  const showRebook = canRebookBooking(row);
  const status = canonicalDbBookingStatus(row.status);
  const showPayAgain =
    status === "pending_payment" && Boolean(row.paystack_reference?.trim()) && price != null;
  const reviewedIds = new Set((reviewsQuery.data ?? []).map((r) => r.booking_id));
  const showLeaveReview = isBookingPendingCustomerReview(row, reviewedIds);

  return (
    <Screen scroll edges={["top"]} contentClassName="px-4 pb-10 pt-2">
      <Pressable onPress={() => router.back()} accessibilityRole="button" className="mb-3 self-start">
        <Text className="text-body font-semibold text-brand-600">← Back</Text>
      </Pressable>

      <View className="mb-4 flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-label font-medium tracking-wide text-brand-600">
            Booking
          </Text>
          <Text className="text-title text-ink">{serviceTitleFromBooking(row)}</Text>
          {row.booking_reference ? (
            <Text className="mt-1 text-caption text-ink-muted">{row.booking_reference}</Text>
          ) : null}
        </View>
        <StatusBadge label={bookingStatusLabel(row.status)} tone={bookingStatusTone(row.status)} />
      </View>

      <SectionCard title="Summary" className="mb-4">
        <DetailRow label="When" value={when} />
        <DetailRow label="Where" value={where} />
        <DetailRow label="Cleaner" value={cleaner ?? "To be assigned"} />
        <DetailRow label="Price" value={price != null ? formatZar(price) : "—"} />
        {rooms ? <DetailRow label="Rooms" value={rooms} /> : null}
        {extras ? <DetailRow label="Extras" value={extras} /> : null}
        {notes ? <DetailRow label="Notes" value={notes} /> : null}
        {accessParts ? <DetailRow label="Access" value={accessParts} /> : null}
        {row.booking_type ? (
          <DetailRow
            label="Type"
            value={row.booking_type === "recurring" ? "Recurring visit" : "Once-off"}
          />
        ) : null}
      </SectionCard>

      <SectionCard title="Actions" className="mb-4">
        <View className="gap-2">
          {showLeaveReview ? (
            <AppButton
              label="Leave a review"
              onPress={() => router.push(`/bookings/${bookingId}/review` as never)}
            />
          ) : null}
          {showReschedule ? (
            <AppButton
              label="Reschedule"
              onPress={() => router.push(`/bookings/${bookingId}/reschedule` as never)}
            />
          ) : null}
          {showCancel ? (
            <AppButton
              label="Cancel booking"
              variant="danger"
              loading={cancelling}
              disabled={cancelling}
              onPress={confirmCancel}
            />
          ) : null}
          {showRebook ? (
            <AppButton
              label="Rebook"
              variant="secondary"
              onPress={() => router.push(rebookHrefFromBookingRow(row) as never)}
            />
          ) : null}
          {showPayAgain ? (
            <AppButton
              label="Pay again"
              onPress={() => {
                const params = new URLSearchParams({
                  bookingId,
                  reference: row.paystack_reference!.trim(),
                  amount: String(price),
                  email: (row.customer_email ?? "").trim(),
                });
                router.push(`/book/pay?${params.toString()}` as never);
              }}
            />
          ) : null}
          <AppButton
            label="Track cleaner"
            variant="secondary"
            onPress={() => router.push(`/bookings/${bookingId}/track` as never)}
          />
        </View>
      </SectionCard>
    </Screen>
  );
}
