import { Alert, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { OfflineBanner } from "@/components/OfflineBanner";
import { AppButton } from "@/components/ui/AppButton";
import { ListRow } from "@/components/ui/ListRow";
import { SectionCard } from "@/components/ui/SectionCard";
import { API_UPSTREAM_URL, APP_ENV, APP_VERSION } from "@/constants/config";
import { useAuth } from "@/providers/AuthProvider";
import { useConnectivity } from "@/providers/ConnectivityProvider";
import { colors } from "@/theme";

export default function CleanerSettingsScreen() {
  const { signOut, profile } = useAuth();
  const { syncNow, pendingQueueCount, isOnline } = useConnectivity();
  const router = useRouter();
  const showApiUrl = __DEV__ || APP_ENV === "development" || APP_ENV === "preview";

  const onSignOut = () => {
    Alert.alert("Sign out", "End your session on this device?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => {
          void (async () => {
            await signOut();
            router.replace("/(auth)/sign-in");
          })();
        },
      },
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
