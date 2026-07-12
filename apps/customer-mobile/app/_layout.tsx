import "../global.css";

import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import "react-native-gesture-handler";
import "react-native-reanimated";
import { AppProviders } from "@/providers/AppProviders";
import { initCrashReporting } from "@/lib/monitoring/crashReporting";

SplashScreen.preventAutoHideAsync().catch(() => undefined);
initCrashReporting();

if (__DEV__) {
  void import("@/lib/workspaceResolution").then(({ allWorkspacePackagesReady }) => {
    if (!allWorkspacePackagesReady()) {
      console.warn("[customer-mobile] Shared @shalean packages failed to resolve");
    }
  });
}

/**
 * Root layout — do not gate the tree on optional fonts.
 * Previously `useFonts(SpaceMono)` returned `null` until load finished; SpaceMono is
 * unused elsewhere, so a hung font load left a permanent blank/splash screen.
 */
export default function RootLayout() {
  useEffect(() => {
    if (__DEV__) {
      console.info("[startup] RootLayout mounted — releasing splash");
    }
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  return (
    <AppProviders>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="book" />
        <Stack.Screen name="bookings" />
        <Stack.Screen name="track" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="rewards" />
      </Stack>
      <StatusBar style="dark" />
    </AppProviders>
  );
}
