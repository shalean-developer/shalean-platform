import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { WebView } from "react-native-webview";
import {
  AppButton,
  ErrorState,
  LoadingState,
  Screen,
  SectionCard,
} from "@shalean/mobile-ui";
import { useCustomerBookingTrack } from "@/hooks/useCustomerBookingTrack";
import { CUSTOMER_ANALYTICS_EVENTS } from "@/lib/analytics/customerAnalyticsEvents";
import { trackCustomerEvent } from "@/lib/analytics/trackCustomerEvent";
import {
  buildGoogleMapsEmbedUrl,
  buildGoogleMapsOpenUrl,
  shouldExposeTrackPoint,
} from "@/lib/bookings/trackPrivacy";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";

export default function BookingTrackScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const bookingId = (id ?? "").trim();
  const trackQuery = useCustomerBookingTrack(bookingId);

  useEffect(() => {
    if (!bookingId) return;
    void trackCustomerEvent(CUSTOMER_ANALYTICS_EVENTS.PAGE_VIEW, {
      page_type: "track",
      screen: "track",
      booking_id: bookingId,
    });
  }, [bookingId]);

  if (!bookingId) {
    return (
      <Screen scroll={false} edges={["top", "bottom"]}>
        <ErrorState
          title="Missing booking"
          message="Open tracking from a booking detail screen."
          onRetry={() => router.replace("/(tabs)/bookings")}
        />
      </Screen>
    );
  }

  if (trackQuery.isLoading && !trackQuery.data) {
    return (
      <Screen scroll={false} edges={["top", "bottom"]}>
        <LoadingState label="Loading tracking…" />
      </Screen>
    );
  }

  if (trackQuery.isError && !trackQuery.data) {
    const status = (trackQuery.error as Error & { status?: number })?.status;
    const denied = status === 404 || status === 403;
    return (
      <Screen scroll={false} edges={["top", "bottom"]}>
        <ErrorState
          title={denied ? "Booking unavailable" : "Couldn’t load tracking"}
          message={
            denied
              ? "This booking isn’t available. You may not have access, or it was removed."
              : friendlyErrorMessage(trackQuery.error)
          }
          onRetry={() => void trackQuery.refetch()}
        />
        <View className="px-4 pb-6">
          <AppButton
            label="Back to bookings"
            variant="secondary"
            onPress={() => router.replace("/(tabs)/bookings")}
          />
        </View>
      </Screen>
    );
  }

  const track = trackQuery.data!;
  const point = shouldExposeTrackPoint(track.trackable, track.point);

  return (
    <Screen scroll={false} edges={["top", "bottom"]} contentClassName="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pb-10 pt-2"
        refreshControl={
          <RefreshControl
            refreshing={trackQuery.isRefetching && !trackQuery.isLoading}
            onRefresh={() => void trackQuery.refetch()}
          />
        }
      >
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text className="mb-2 text-caption font-semibold text-brand-600">← Booking</Text>
        </Pressable>
        <Text className="text-label font-medium tracking-wide text-brand-600">
          Live tracking
        </Text>
        <Text className="mb-1 text-title text-ink">
          {track.service?.trim() || "Your clean"}
        </Text>
        <Text className="mb-4 text-body text-ink-muted">{track.message}</Text>

        <SectionCard className="mb-4">
          {track.locationLabel ? (
            <View className="mb-3">
              <Text className="text-label font-medium tracking-wide text-ink-muted">
                Job address
              </Text>
              <Text className="mt-0.5 text-body text-ink">{track.locationLabel}</Text>
            </View>
          ) : null}
          {track.cleanerName ? (
            <View className="mb-3">
              <Text className="text-label font-medium tracking-wide text-ink-muted">
                Cleaner
              </Text>
              <Text className="mt-0.5 text-body text-ink">{track.cleanerName}</Text>
            </View>
          ) : null}
          <Text className="text-caption text-ink-subtle">
            Location is only shared while your cleaner is on the way or on the job. We never ask for
            your device location on this screen.
          </Text>
        </SectionCard>

        {point ? (
          <View className="mb-4 overflow-hidden rounded-2xl border border-border">
            <WebView
              originWhitelist={["*"]}
              source={{ uri: buildGoogleMapsEmbedUrl(point.lat, point.lng) }}
              style={styles.map}
              startInLoadingState
              setSupportMultipleWindows={false}
            />
            <Pressable
              onPress={() => void Linking.openURL(buildGoogleMapsOpenUrl(point.lat, point.lng))}
              className="bg-surface-card px-4 py-3 active:opacity-80"
              accessibilityRole="link"
              accessibilityLabel="Open in Google Maps"
            >
              <Text className="text-center text-body font-semibold text-brand-600">
                Open in Google Maps
              </Text>
            </Pressable>
          </View>
        ) : (
          <SectionCard className="mb-4">
            <Text className="text-body text-ink-muted">{track.message}</Text>
          </SectionCard>
        )}

        <AppButton
          label="View booking"
          variant="secondary"
          onPress={() => router.replace(`/bookings/${bookingId}` as never)}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  map: { width: "100%", height: 280, backgroundColor: "#f1f5f9" },
});
