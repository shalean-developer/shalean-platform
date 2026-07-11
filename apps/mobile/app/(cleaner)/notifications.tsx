import { useCallback } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { OfflineBanner } from "@/components/OfflineBanner";
import { AppButton } from "@/components/ui/AppButton";
import { EmptyState, ErrorState } from "@/components/ui/StateViews";
import { useCleanerNotifications } from "@/hooks/useCleanerNotifications";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import { useConnectivity } from "@/providers/ConnectivityProvider";
import type { CleanerNotificationItem, CleanerNotificationKind } from "@/services/types/cleanerJobs";
import { colors } from "@/theme";

const kindIcon: Record<CleanerNotificationKind, keyof typeof Ionicons.glyphMap> = {
  booking_assigned: "briefcase-outline",
  booking_updated: "refresh-outline",
  reminder: "alarm-outline",
  payment: "wallet-outline",
  announcement: "megaphone-outline",
};

/**
 * In-app notification centre — derived from jobs + earnings until a push inbox API exists.
 */
export default function NotificationsScreen() {
  const router = useRouter();
  const { syncNow } = useConnectivity();
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
    unreadCount,
    markRead,
    markAllRead,
    isRead,
  } = useCleanerNotifications();

  const onRefresh = useCallback(async () => {
    await syncNow();
    await refetch();
  }, [refetch, syncNow]);

  const onOpen = async (item: CleanerNotificationItem) => {
    await markRead(item.id);
    if (item.href) {
      router.push(item.href as Href);
    }
  };

  if (isLoading && data.length === 0) {
    return (
      <View className="flex-1 bg-surface">
        <OfflineBanner />
        <View className="flex-1 items-center justify-center">
          <Text className="text-sm text-ink-muted">Loading notifications…</Text>
        </View>
      </View>
    );
  }

  if (isError && data.length === 0) {
    return (
      <View className="flex-1 bg-surface">
        <OfflineBanner />
        <ErrorState
          title="Could not load notifications"
          message={friendlyErrorMessage(error)}
          onRetry={() => void onRefresh()}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface">
      <OfflineBanner />
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerClassName="grow px-4 pb-10 pt-2"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void onRefresh()} />}
        ListHeaderComponent={
          <View className="mb-3 flex-row items-center justify-between gap-3">
            <View className="flex-1">
              <Text className="text-sm text-ink-muted">
                {unreadCount === 0
                  ? "You're all caught up"
                  : `${unreadCount} unread`}
              </Text>
            </View>
            {unreadCount > 0 ? (
              <AppButton
                label="Mark all read"
                variant="ghost"
                onPress={() => void markAllRead()}
                className="min-h-10 px-3 py-2"
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="No notifications"
            message="Assignments, reminders, and payment updates will appear here."
            icon="notifications-outline"
          />
        }
        renderItem={({ item }) => {
          const read = isRead(item.id);
          return (
            <Pressable
              onPress={() => void onOpen(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}. ${item.body}`}
              className={`mb-3 flex-row gap-3 rounded-2xl border px-4 py-3.5 active:opacity-90 ${
                read ? "border-border bg-surface-card" : "border-brand-200 bg-brand-50"
              }`}
              android_ripple={{ color: colors.surface.muted }}
            >
              <View className="mt-0.5 h-10 w-10 items-center justify-center rounded-full bg-surface-card">
                <Ionicons name={kindIcon[item.kind]} size={20} color={colors.brand[600]} />
              </View>
              <View className="flex-1">
                <View className="flex-row items-start justify-between gap-2">
                  <Text className="flex-1 text-base font-semibold text-ink">{item.title}</Text>
                  {!read ? (
                    <View className="mt-1.5 h-2 w-2 rounded-full bg-brand-500" accessibilityElementsHidden />
                  ) : null}
                </View>
                <Text className="mt-1 text-sm leading-5 text-ink-muted">{item.body}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
