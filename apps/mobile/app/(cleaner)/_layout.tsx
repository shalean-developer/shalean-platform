import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { LoadingState } from "@/components/ui/StateViews";
import { colors } from "@/theme";

/**
 * Cleaner stack shell — tabs live under `(tabs)`; job detail & settings push above.
 */
export default function CleanerLayout() {
  const { status } = useAuth();

  if (status === "loading") {
    return <LoadingState label="Loading…" />;
  }

  if (status !== "signedIn") {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface.default },
        headerTintColor: colors.ink.default,
        headerTitleStyle: { fontWeight: "600", fontSize: 17 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.surface.default },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="job/[id]" options={{ title: "Job details" }} />
      <Stack.Screen name="settings" options={{ title: "Settings" }} />
      <Stack.Screen name="diagnostics" options={{ title: "Diagnostics" }} />
      <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
      <Stack.Screen name="support" options={{ title: "Support" }} />
      <Stack.Screen name="help" options={{ title: "Help centre" }} />
      <Stack.Screen name="feedback" options={{ title: "Feedback" }} />
      <Stack.Screen name="referral" options={{ title: "Refer cleaners" }} />
      <Stack.Screen name="performance" options={{ title: "Performance" }} />
      <Stack.Screen name="achievements" options={{ title: "Achievements" }} />
      <Stack.Screen name="training" options={{ title: "Training" }} />
    </Stack>
  );
}
