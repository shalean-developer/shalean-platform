import { Alert, Text, View } from "react-native";
import { AvailabilityToggle } from "@/components/ui/AvailabilityToggle";
import { useSetAvailability } from "@/hooks/useCleanerDashboard";
import { useCleanerProfile } from "@/hooks/useCleanerProfile";
import { useToast } from "@/providers/ToastProvider";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { OfflineBanner } from "@/components/OfflineBanner";
import { AppButton } from "@/components/ui/AppButton";
import { ListRow } from "@/components/ui/ListRow";
import { SectionCard } from "@/components/ui/SectionCard";
import { API_UPSTREAM_URL, APP_ENV, APP_VERSION } from "@/constants/config";
import { useAuth } from "@/providers/AuthProvider";
import { offlineActionQueue } from "@/lib/offline/actionQueue";
import { useConnectivity } from "@/providers/ConnectivityProvider";
import { colors } from "@/theme";

export default function CleanerSettingsScreen() {
  const { signOut, profile } = useAuth();
  const { syncNow, pendingQueueCount, isOnline } = useConnectivity();
  const router = useRouter();
  const { data: cleanerProfile, refetch: refetchCleanerProfile } = useCleanerProfile();
  const availabilityMutation = useSetAvailability();
  const { showToast } = useToast();
  const isAvailable = (cleanerProfile?.cleaner ?? profile?.cleaner)?.is_available !== false;
  const onAvailabilityChange = (next: boolean) => {
    availabilityMutation.mutate(next, {
      onSuccess: () => {
        showToast(next ? "You're available for jobs" : "You're marked unavailable", "success");
        void refetchCleanerProfile();
      },
      onError: (err) => Alert.alert("Could not update availability", friendlyErrorMessage(err)),
    });
  };
  const showApiUrl = __DEV__ || APP_ENV === "development" || APP_ENV === "preview";

  const completeSignOut = async () => {
    try {
      await signOut();
      router.replace("/(auth)/sign-in");
    } catch {
      Alert.alert("Sign out failed", "Please try again. Your session has not been confirmed closed.");
    }
  };

  const onSignOut = async () => {
    const queued = await offlineActionQueue.list();
    const unsent = queued.filter((item) => item.status !== "dead").length;
    if (unsent > 0) {
      Alert.alert(
        "Unsynced work",
        `${unsent} job action(s) or photo(s) have not synced. Signing out will discard them from this device.`,
        [
          { text: "Stay signed in", style: "cancel" },
          { text: "Sync now", onPress: () => void syncNow() },
          { text: "Discard and sign out", style: "destructive", onPress: () => void completeSignOut() },
        ],
      );
      return;
    }
    Alert.alert("Sign out", "End your session on this device?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void completeSignOut() },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["bottom"]}>
      <OfflineBanner />
      <View className="gap-3 px-4 py-4">
        <SectionCard>
          <Text className="text-sm text-ink-muted">Signed in as</Text>
          <Text className="mt-1 text-base font-semibold text-ink">
            {profile?.cleaner?.full_name ?? "Cleaner"}
          </Text>
          <View className="mt-3 flex-row items-center gap-2">
            <View
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor: isOnline ? colors.status.success.fg : colors.ink.subtle,
              }}
              accessibilityElementsHidden
            />
            <Text className="text-sm text-ink-muted">
              {isOnline ? "Online" : "Offline"}
              {pendingQueueCount > 0 ? ` · ${pendingQueueCount} queued` : ""}
            </Text>
          </View>
          <Text className="mt-2 text-xs text-ink-muted">
            Version {APP_VERSION}
            {showApiUrl && API_UPSTREAM_URL ? ` · ${API_UPSTREAM_URL}` : ""}
          </Text>
        </SectionCard>

        <AvailabilityToggle
          value={isAvailable}
          onChange={onAvailabilityChange}
          loading={availabilityMutation.isPending}
          disabled={!isOnline && !availabilityMutation.isPending}
        />

        <AppButton
          label="Sync now"
          variant="secondary"
          onPress={() => void syncNow()}
          icon={<Ionicons name="sync-outline" size={18} color={colors.ink.default} />}
        />

        {__DEV__ ? (
          <SectionCard flush className="overflow-hidden p-0">
            <ListRow
              label="About / Diagnostics"
              icon="information-circle-outline"
              onPress={() => router.push("/(cleaner)/diagnostics")}
            />
          </SectionCard>
        ) : null}

        <AppButton label="Sign out" variant="danger" onPress={onSignOut} />
      </View>
    </SafeAreaView>
  );
}
