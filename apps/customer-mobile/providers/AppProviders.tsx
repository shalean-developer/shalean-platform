import { DefaultTheme, ThemeProvider as NavThemeProvider } from "@react-navigation/native";
import { type ReactNode } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { AuthProvider } from "@/providers/AuthProvider";
import { NotificationProvider } from "@/providers/NotificationProvider";
import { QueryProvider } from "@/providers/QueryProvider";
import { colors } from "@/theme";

const lightNav = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.brand[500],
    background: colors.surface.default,
    card: colors.surface.card,
    text: colors.ink.default,
    border: colors.surface.muted,
  },
};

type Props = { children: ReactNode };

export function AppProviders({ children }: Props) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppErrorBoundary>
          <QueryProvider>
            <AuthProvider>
              <NotificationProvider>
                <NavThemeProvider value={lightNav}>{children}</NavThemeProvider>
              </NotificationProvider>
            </AuthProvider>
          </QueryProvider>
        </AppErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
