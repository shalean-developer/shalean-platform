import { Stack } from "expo-router";

export default function ProfileStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="edit" />
      <Stack.Screen name="addresses/index" />
      <Stack.Screen name="addresses/[id]" />
      <Stack.Screen name="invoices/index" />
      <Stack.Screen name="invoice-pdf" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
