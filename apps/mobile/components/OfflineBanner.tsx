import { Text, View } from "react-native";
import { useConnectivity } from "@/providers/ConnectivityProvider";

/** Compact banner when offline or when actions are waiting to sync. */
export function OfflineBanner() {
  const { isOnline, pendingQueueCount } = useConnectivity();

  if (isOnline && pendingQueueCount === 0) return null;

  const message = !isOnline
    ? pendingQueueCount > 0
      ? `You're offline · ${pendingQueueCount} action${pendingQueueCount === 1 ? "" : "s"} queued`
      : "You're offline · Showing cached jobs"
    : `${pendingQueueCount} action${pendingQueueCount === 1 ? "" : "s"} waiting to sync`;

  return (
    <View
      className={`px-4 py-2.5 ${isOnline ? "bg-status-warning-bg" : "bg-ink"}`}
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      accessibilityLabel={message}
    >
      <Text
        className={`text-center text-sm font-medium ${isOnline ? "text-status-warning-fg" : "text-ink-inverse"}`}
      >
        {message}
      </Text>
    </View>
  );
}
