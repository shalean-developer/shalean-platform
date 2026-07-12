import { Stack } from "expo-router";

export default function BookingsStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[id]/index" />
      <Stack.Screen name="[id]/reschedule" />
      <Stack.Screen name="[id]/track" />
      <Stack.Screen name="[id]/review" />
      <Stack.Screen name="recurring/index" />
    </Stack>
  );
}
