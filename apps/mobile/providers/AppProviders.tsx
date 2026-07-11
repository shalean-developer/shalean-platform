import { DefaultTheme, ThemeProvider as NavThemeProvider } from "@react-navigation/native";
import { type ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { AuthProvider } from "@/providers/AuthProvider";
import { ConnectivityProvider } from "@/providers/ConnectivityProvider";
import { NotificationProvider } from "@/providers/NotificationProvider";
import { QueryProvider } from "@/providers/QueryProvider";
import { ToastProvider } from "@/providers/ToastProvider";
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
    <SafeAreaProvider>
      <AppErrorBoundary>
        <QueryProvider>
          <AuthProvider>
            <ConnectivityProvider>
              <NotificationProvider>
                <ToastProvider>
                  <NavThemeProvider value={lightNav}>{children}</NavThemeProvider>
                </ToastProvider>
              </NotificationProvider>
            </ConnectivityProvider>
          </AuthProvider>
        </QueryProvider>
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}
