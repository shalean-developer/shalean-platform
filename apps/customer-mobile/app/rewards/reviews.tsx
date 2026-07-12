import { useMemo } from "react";
import { Pressable, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  AppButton,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  SectionCard,
} from "@shalean/mobile-ui";
import { formatBookingDate } from "@/lib/bookings/bookingDisplay";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import { isBookingPendingCustomerReview } from "@/lib/rewards/reviewEligibility";
import { useCustomerBookingsList } from "@/hooks/useCustomerBookings";
import { useCustomerReviews } from "@/hooks/useCustomerRewards";

function Stars({ rating }: { rating: number }) {
  const n = Math.max(0, Math.min(5, Math.round(rating)));
  return <Text className="text-body text-brand-600">{"★".repeat(n)}{"☆".repeat(5 - n)}</Text>;
}

export default function ReviewsHubScreen() {
  const router = useRouter();
  const reviewsQuery = useCustomerReviews();
  const bookingsQuery = useCustomerBookingsList();

  const reviewedIds = useMemo(
    () => new Set((reviewsQuery.data ?? []).map((r) => r.booking_id)),
    [reviewsQuery.data],
  );

  const pending = useMemo(
    () => (bookingsQuery.data ?? []).filter((b) => isBookingPendingCustomerReview(b, reviewedIds)),
    [bookingsQuery.data, reviewedIds],
  );

  const loading =
    (reviewsQuery.isLoading || bookingsQuery.isLoading) &&
    !reviewsQuery.data &&
    !bookingsQuery.data;

  if (loading) {
    return (
      <Screen scroll={false} edges={["top", "bottom"]}>
        <LoadingState label="Loading reviews…" />
      </Screen>
    );
  }

  if (reviewsQuery.isError && !reviewsQuery.data) {
    return (
      <Screen scroll={false} edges={["top", "bottom"]}>
        <ErrorState
          title="Couldn’t load reviews"
          message={friendlyErrorMessage(reviewsQuery.error)}
          onRetry={() => {
            void reviewsQuery.refetch();
            void bookingsQuery.refetch();
          }}
        />
      </Screen>
    );
  }

  const submitted = reviewsQuery.data ?? [];

  return (
    <Screen
      scroll
      edges={["top", "bottom"]}
      contentClassName="px-4 pb-10 pt-2"
      refreshControl={
        <RefreshControl
          refreshing={
            (reviewsQuery.isRefetching || bookingsQuery.isRefetching) &&
            !reviewsQuery.isLoading &&
            !bookingsQuery.isLoading
          }
          onRefresh={() => {
            void reviewsQuery.refetch();
            void bookingsQuery.refetch();
          }}
        />
      }
    >
      <Pressable onPress={() => router.back()} accessibilityRole="button">
        <Text className="mb-2 text-caption font-semibold text-brand-600">← Rewards</Text>
      </Pressable>
      <Text className="mb-1 text-title text-ink">Reviews</Text>
      <Text className="mb-5 text-body text-ink-muted">
        Rate completed cleans. Submissions are checked on the server.
      </Text>

      <Text className="mb-2 text-label font-medium tracking-wide text-ink-muted">
        Waiting for your rating
      </Text>
      {pending.length === 0 ? (
        <EmptyState
          title="Nothing to review"
          message="Completed visits you haven’t rated will show up here."
        />
      ) : (
        <View className="mb-6 gap-3">
          {pending.map((b) => (
            <SectionCard key={b.id}>
              <Text className="text-title text-ink">{b.service?.trim() || "Cleaning"}</Text>
              <Text className="mt-1 text-caption text-ink-muted">
                {formatBookingDate(String(b.date ?? ""))}
                {b.display_cleaner_name || b.payout_owner_cleaner_name
                  ? ` · ${b.display_cleaner_name || b.payout_owner_cleaner_name}`
                  : ""}
              </Text>
              <View className="mt-3">
                <AppButton
                  label="Leave review"
                  onPress={() => router.push(`/bookings/${b.id}/review` as never)}
                />
              </View>
            </SectionCard>
          ))}
        </View>
      )}

      <Text className="mb-2 text-label font-medium tracking-wide text-ink-muted">
        Submitted
      </Text>
      {submitted.length === 0 ? (
        <EmptyState title="No reviews yet" message="Your past ratings will appear here." />
      ) : (
        <View className="gap-3">
          {submitted.map((r) => (
            <SectionCard key={r.id}>
              <Stars rating={r.rating} />
              <Text className="mt-2 text-body font-semibold text-ink">
                {r.serviceName || "Cleaning"}
              </Text>
              {r.cleanerName ? (
                <Text className="mt-0.5 text-caption text-ink-muted">{r.cleanerName}</Text>
              ) : null}
              {r.comment ? (
                <Text className="mt-2 text-body text-ink-muted" numberOfLines={4}>
                  {r.comment}
                </Text>
              ) : null}
            </SectionCard>
          ))}
        </View>
      )}
    </Screen>
  );
}
