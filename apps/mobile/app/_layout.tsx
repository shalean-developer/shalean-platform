import "../global.css";

import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import "react-native-gesture-handler";
import "react-native-reanimated";
import { AppProviders } from "@/providers/AppProviders";
import { workspacePackagesReady } from "@/lib/workspaceResolution";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

if (__DEV__ && !workspacePackagesReady.createApiClient) {
  console.warn("[mobile] Shared @shalean packages failed to resolve");
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [loaded, error]);

  if (!loaded && !error) {
    return null;
  }

  return (
    <AppProviders>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(customer)" />
        <Stack.Screen name="(cleaner)" />
        <Stack.Screen name="(modals)" options={{ presentation: "modal" }} />
      </Stack>
      <StatusBar style="auto" />
    </AppProviders>
  );
}
