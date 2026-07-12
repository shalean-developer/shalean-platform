import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  AppButton,
  ErrorState,
  LoadingState,
  Screen,
  SectionCard,
  TextField,
} from "@shalean/mobile-ui";
import { formatBookingDate } from "@/lib/bookings/bookingDisplay";
import { CUSTOMER_ANALYTICS_EVENTS } from "@/lib/analytics/customerAnalyticsEvents";
import { trackCustomerEvent } from "@/lib/analytics/trackCustomerEvent";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import { isBookingPendingCustomerReview } from "@/lib/rewards/reviewEligibility";
import {
  customerBookingDetailQueryKey,
  useCustomerBookingDetail,
} from "@/hooks/useCustomerBookings";
import {
  customerReviewsQueryKey,
  useCustomerReviews,
  useSubmitReview,
} from "@/hooks/useCustomerRewards";

export default function LeaveReviewScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const bookingId = (id ?? "").trim();
  const detailQuery = useCustomerBookingDetail(bookingId);
  const reviewsQuery = useCustomerReviews();
  const submit = useSubmitReview();
  const queryClient = useQueryClient();

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (detailQuery.isLoading && !detailQuery.data) {
    return (
      <Screen scroll={false} edges={["top", "bottom"]}>
        <LoadingState label="Loading booking…" />
      </Screen>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <Screen scroll={false} edges={["top", "bottom"]}>
        <ErrorState
          title="Couldn’t load booking"
          message={friendlyErrorMessage(detailQuery.error)}
          onRetry={() => void detailQuery.refetch()}
        />
      </Screen>
    );
  }

  const row = detailQuery.data;
  const reviewedIds = new Set((reviewsQuery.data ?? []).map((r) => r.booking_id));
  const alreadyReviewed = reviewedIds.has(bookingId);
  const canReview = isBookingPendingCustomerReview(row, reviewedIds);

  async function onSubmit() {
    setError(null);
    try {
      await submit.mutateAsync({
        bookingId,
        rating,
        comment: comment.trim() || undefined,
      });
      void trackCustomerEvent(CUSTOMER_ANALYTICS_EVENTS.REVIEW_SUBMITTED, {
        screen: "leave_review",
        booking_id: bookingId,
        rating,
      });
      await queryClient.invalidateQueries({ queryKey: customerBookingDetailQueryKey(bookingId) });
      await queryClient.invalidateQueries({ queryKey: customerReviewsQueryKey });
      Alert.alert("Thanks!", "Your review was submitted.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    }
  }

  return (
    <Screen scroll edges={["top", "bottom"]} contentClassName="px-4 pb-10 pt-2">
      <Pressable onPress={() => router.back()} accessibilityRole="button">
        <Text className="mb-2 text-caption font-semibold text-brand-600">← Back</Text>
      </Pressable>
      <Text className="mb-1 text-title text-ink">Leave a review</Text>
      <Text className="mb-5 text-body text-ink-muted">
        {row.service?.trim() || "Cleaning"} · {formatBookingDate(String(row.date ?? ""))}
      </Text>

      {alreadyReviewed ? (
        <SectionCard>
          <Text className="text-body text-ink">You’ve already reviewed this booking.</Text>
          <View className="mt-3">
            <AppButton label="Done" variant="secondary" onPress={() => router.back()} />
          </View>
        </SectionCard>
      ) : !canReview ? (
        <SectionCard>
          <Text className="text-body text-ink">
            This booking isn’t ready for a review yet (or no cleaner is assigned).
          </Text>
        </SectionCard>
      ) : (
        <>
          <SectionCard title="Rating" className="mb-4">
            <View className="flex-row gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable
                  key={n}
                  onPress={() => setRating(n)}
                  accessibilityRole="button"
                  accessibilityLabel={`${n} stars`}
                  className="min-h-touch min-w-touch items-center justify-center"
                >
                  <Text className={`text-2xl ${n <= rating ? "text-brand-600" : "text-ink-subtle"}`}>
                    ★
                  </Text>
                </Pressable>
              ))}
            </View>
          </SectionCard>

          <TextField
            label="Comment (optional)"
            value={comment}
            onChangeText={setComment}
            placeholder="How was your clean?"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            className="mb-4 min-h-[100px]"
          />

          {error ? <Text className="mb-3 text-body text-danger">{error}</Text> : null}

          <AppButton
            label="Submit review"
            loading={submit.isPending}
            disabled={submit.isPending}
            onPress={() => void onSubmit()}
          />
        </>
      )}
    </Screen>
  );
}
