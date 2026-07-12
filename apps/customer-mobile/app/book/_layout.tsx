import { Stack } from "expo-router";
import { BookingWizardProvider } from "@/features/booking/BookingWizardProvider";

export default function BookStackLayout() {
  return (
    <BookingWizardProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="[slug]/details" />
        <Stack.Screen name="[slug]/schedule" />
        <Stack.Screen name="[slug]/review" />
        <Stack.Screen name="[slug]/checkout" />
        <Stack.Screen name="pay" />
        <Stack.Screen name="success" />
      </Stack>
    </BookingWizardProvider>
  );
}
