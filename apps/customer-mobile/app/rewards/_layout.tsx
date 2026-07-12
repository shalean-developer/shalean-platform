import { Stack } from "expo-router";

export default function RewardsStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="referrals" />
      <Stack.Screen name="credit-history" />
      <Stack.Screen name="reviews" />
    </Stack>
  );
}
