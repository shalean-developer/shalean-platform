import { useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { AppButton, ErrorState, LoadingState, Screen, SectionCard } from "@shalean/mobile-ui";
import { DateChips, TimeSlotGrid } from "@/features/booking/components/SchedulePickers";
import {
  filterCustomerOnlineBookingTimeSlots,
  isCustomerOnlineBookingTimeSlot,
} from "@/lib/booking/timeSlots";
import {
  canRescheduleBooking,
  isRescheduleCrossMonthBlocked,
} from "@/lib/bookings/modifyEligibility";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import {
  customerBookingDetailQueryKey,
  customerBookingsQueryKey,
  useCustomerBookingDetail,
} from "@/hooks/useCustomerBookings";
import { dashboardSummaryQueryKey } from "@/hooks/useDashboardSummary";
import { getCustomerBookingsApi } from "@/services/customerApi";

export default function RescheduleBookingScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const bookingId = (id ?? "").trim();
  const detailQuery = useCustomerBookingDetail(bookingId);
  const queryClient = useQueryClient();

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const slots = useMemo(
    () => (date ? filterCustomerOnlineBookingTimeSlots(date) : []),
    [date],
  );

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
      </Screen>
    );
  }

  const row = detailQuery.data;
  if (!canRescheduleBooking(row)) {
    return (
      <Screen scroll edges={["top"]} contentClassName="px-4 pb-10 pt-2">
        <Pressable onPress={() => router.back()} className="mb-3 self-start">
          <Text className="text-body font-semibold text-brand-600">← Back</Text>
        </Pressable>
        <SectionCard>
          <Text className="text-body text-ink">
            This booking can no longer be rescheduled online.
          </Text>
          <View className="mt-4">
            <AppButton label="Back to booking" onPress={() => router.back()} />
          </View>
        </SectionCard>
      </Screen>
    );
  }

  const onSubmit = async () => {
    setFormError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isCustomerOnlineBookingTimeSlot(time)) {
      setFormError("Pick a date and morning time slot.");
      return;
    }
    if (!slots.includes(time)) {
      setFormError("That time is no longer available. Pick another slot.");
      return;
    }
    if (isRescheduleCrossMonthBlocked(row, date)) {
      setFormError(
        "Cannot reschedule across calendar months for a monthly-billed visit. Contact support if needed.",
      );
      return;
    }

    setSubmitting(true);
    try {
      const result = await getCustomerBookingsApi().reschedule(bookingId, { date, time });
      if (!result.ok) {
        setFormError(result.error || "Could not reschedule. Please try again.");
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: customerBookingsQueryKey }),
        queryClient.invalidateQueries({ queryKey: customerBookingDetailQueryKey(bookingId) }),
        queryClient.invalidateQueries({ queryKey: dashboardSummaryQueryKey }),
      ]);
      Alert.alert("Rescheduled", "Your booking date and time were updated.", [
        { text: "OK", onPress: () => router.replace(`/bookings/${bookingId}` as never) },
      ]);
    } catch (err) {
      setFormError(friendlyErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen scroll edges={["top"]} contentClassName="px-4 pb-10 pt-2">
      <Pressable onPress={() => router.back()} accessibilityRole="button" className="mb-3 self-start">
        <Text className="text-body font-semibold text-brand-600">← Back</Text>
      </Pressable>

      <Text className="text-label font-medium tracking-wide text-brand-600">
        Reschedule
      </Text>
      <Text className="mb-1 text-title text-ink">{row.service?.trim() || "Cleaning"}</Text>
      <Text className="mb-5 text-body text-ink-muted">
        Choose a new date and morning slot. At least 2 hours’ notice is required.
      </Text>

      <SectionCard className="mb-4">
        <DateChips
          selected={date}
          onSelect={(ymd) => {
            setDate(ymd);
            setTime("");
            setFormError(null);
          }}
        />
        <View className="mt-4">
          <TimeSlotGrid
            slots={slots}
            selected={time}
            onSelect={(t) => {
              setTime(t);
              setFormError(null);
            }}
          />
        </View>
        {formError ? (
          <Text className="mt-3 text-caption text-danger">{formError}</Text>
        ) : null}
      </SectionCard>

      <AppButton
        label="Save new time"
        loading={submitting}
        disabled={submitting || !date || !time}
        onPress={() => void onSubmit()}
      />
    </Screen>
  );
}
