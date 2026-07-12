import { Redirect, useLocalSearchParams } from "expo-router";

/** Deep-link alias: shalean-customer://track/<bookingId> → bookings track screen. */
export default function TrackDeepLinkRedirect() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const id = (bookingId ?? "").trim();
  if (!id) {
    return <Redirect href="/(tabs)/bookings" />;
  }
  return <Redirect href={`/bookings/${id}/track` as never} />;
}
