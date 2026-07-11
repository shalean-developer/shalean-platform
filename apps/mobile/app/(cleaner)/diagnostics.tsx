import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import Constants from "expo-constants";
import * as Application from "expo-application";
import * as Device from "expo-device";
import { OfflineBanner } from "@/components/OfflineBanner";
import {
  APP_BUILD_NUMBER,
  APP_ENV,
  APP_VERSION,
  API_BASE_URL,
  API_UPSTREAM_URL,
  assertMobileConfig,
} from "@/constants/config";
import { diagnosticLog } from "@/lib/diagnostics/logger";
import { getLastSyncAt } from "@/lib/network/networkStatus";
import { offlineActionQueue } from "@/lib/offline/actionQueue";
import { useAuth } from "@/providers/AuthProvider";
import { useConnectivity } from "@/providers/ConnectivityProvider";
import { useNotifications } from "@/providers/NotificationProvider";
import { colors } from "@/theme";

export default function DiagnosticsScreen() {
  const { profile } = useAuth();
  const { isOnline, pendingQueueCount, lastSyncAt, syncNow } = useConnectivity();
  const { pushToken, registration, refreshPushRegistration } = useNotifications();
  const [busy, setBusy] = useState(false);
  const [queueCount, setQueueCount] = useState(pendingQueueCount);

  const configCheck = assertMobileConfig();

  const rows = useMemo(() => {
    const cleaner = profile?.cleaner;
    return [
      { label: "App version", value: APP_VERSION },
      {
        label: "Build number",
        value: Application.nativeBuildVersion || APP_BUILD_NUMBER || "—",
      },
      { label: "Environment", value: APP_ENV },
      {
        label: "API base URL",
        value:
          API_BASE_URL ||
          (API_UPSTREAM_URL
            ? `(web proxy → ${API_UPSTREAM_URL})`
            : "(missing — set EXPO_PUBLIC_API_BASE_URL)"),
      },
      { label: "Config OK", value: configCheck.ok ? "Yes" : `Missing: ${configCheck.missing.join(", ")}` },
      { label: "Expo SDK", value: String(Constants.expoConfig?.sdkVersion ?? "53") },
      {
        label: "Logged-in cleaner",
        value: cleaner ? `${cleaner.full_name ?? "—"} (${cleaner.id})` : "—",
      },
      { label: "Device", value: `${Device.manufacturer ?? ""} ${Device.modelName ?? Device.modelId ?? "Unknown"}`.trim() },
      { label: "OS", value: `${Device.osName ?? Platform.OS} ${Device.osVersion ?? ""}`.trim() },
      { label: "Online", value: isOnline ? "Yes" : "No" },
      { label: "Pending queue", value: String(queueCount) },
      { label: "Last sync", value: lastSyncAt || getLastSyncAt() || "—" },
      {
        label: "Push token",
        value: pushToken
          ? `${pushToken.slice(0, 28)}…`
          : registration?.ok === false
            ? registration.reason
            : "—",
      },
      { label: "EAS projectId", value: String(Constants.expoConfig?.extra?.eas?.projectId ?? "—") },
      { label: "@shalean/api-client", value: "workspace" },
      { label: "@shalean/types", value: "workspace" },
      { label: "@shalean/utils", value: "workspace" },
      { label: "@shalean/validation", value: "workspace" },
    ];
  }, [profile, isOnline, queueCount, lastSyncAt, pushToken, registration, configCheck]);

  const exportLogs = async () => {
    setBusy(true);
    try {
      const queue = await offlineActionQueue.list();
      const active = queue.filter((i) => i.status !== "dead");
      const dead = queue.filter((i) => i.status === "dead");
      setQueueCount(active.length);
      const payload = [
        "=== Shalean Cleaner Diagnostics ===",
        ...rows.map((r) => `${r.label}: ${r.value}`),
        `Dead-lettered queue items: ${dead.length}`,
        "",
        "=== Queue (active) ===",
        JSON.stringify(active, null, 2),
        "",
        "=== Queue (dead) ===",
        JSON.stringify(dead, null, 2),
        "",
        "=== Logs ===",
        diagnosticLog.exportText() || "(empty)",
      ].join("\n");

      await Share.share({
        title: "Shalean cleaner diagnostics",
        message: payload,
      });
      diagnosticLog.info("Diagnostics exported");
    } catch (e) {
      Alert.alert("Export failed", e instanceof Error ? e.message : "Could not share diagnostics.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-1 bg-surface">
      <OfflineBanner />
      <ScrollView contentContainerClassName="gap-3 px-4 pb-12 pt-2">
        <Text className="text-sm text-ink-muted" accessibilityRole="header">
          For support — share these details if something goes wrong.
        </Text>

        <View className="rounded-xl border border-surface-muted bg-surface-card p-4">
          {rows.map((row) => (
            <View key={row.label} className="mb-3">
              <Text className="text-xs font-semibold uppercase text-ink-muted">{row.label}</Text>
              <Text selectable className="mt-0.5 text-sm text-ink">
                {row.value}
              </Text>
            </View>
          ))}
        </View>

        <Pressable
          onPress={() => void syncNow()}
          accessibilityRole="button"
          accessibilityLabel="Sync now"
          className="min-h-12 items-center justify-center rounded-xl bg-brand-500 px-4 py-3"
        >
          <Text className="font-semibold text-ink-inverse">Sync now</Text>
        </Pressable>

        <Pressable
          onPress={() => void refreshPushRegistration()}
          accessibilityRole="button"
          accessibilityLabel="Refresh push registration"
          className="min-h-12 items-center justify-center rounded-xl border border-surface-muted bg-white px-4 py-3"
        >
          <Text className="font-semibold text-ink">Refresh push token</Text>
        </Pressable>

        <Pressable
          onPress={() => void exportLogs()}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Export diagnostic logs"
          className="min-h-12 items-center justify-center rounded-xl border border-brand-500 bg-brand-50 px-4 py-3"
        >
          {busy ? (
            <ActivityIndicator color={colors.brand[500]} />
          ) : (
            <Text className="font-semibold text-brand-600">Export diagnostic logs</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}
