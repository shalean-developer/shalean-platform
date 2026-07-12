import { Stack } from "expo-router";

export default function TrackStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[bookingId]" />
    </Stack>
  );
}
