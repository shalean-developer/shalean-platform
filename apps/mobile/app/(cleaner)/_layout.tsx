import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { LoadingState } from "@/components/ui/StateViews";
import { colors } from "@/theme";

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
      <Stack.Screen name="index" options={{ title: "Today's jobs" }} />
      <Stack.Screen name="job/[id]" options={{ title: "Job details" }} />
      <Stack.Screen name="profile" options={{ title: "Profile" }} />
      <Stack.Screen name="settings" options={{ title: "Settings" }} />
      <Stack.Screen name="diagnostics" options={{ title: "Diagnostics" }} />
    </Stack>
  );
}
