import { Pressable, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  AppButton,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  SectionCard,
} from "@shalean/mobile-ui";
import {
  useCustomerNotifications,
  useMarkNotificationsRead,
} from "@/hooks/useCustomerNotifications";
import { resolveCustomerNotificationDeepLink } from "@/lib/notifications/resolveCustomerNotificationDeepLink";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import type { CustomerNotificationRow } from "@/services/types/customerNotifications";

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function NotificationRow({
  item,
  onOpen,
}: {
  item: CustomerNotificationRow;
  onOpen: (item: CustomerNotificationRow) => void;
}) {
  const unread = !item.read_at;
  return (
    <Pressable
      onPress={() => onOpen(item)}
      accessibilityRole="button"
      className="min-h-touch border-b border-surface-muted px-4 py-3 active:opacity-80"
    >
      <View className="flex-row items-start gap-2">
        {unread ? <View className="mt-1.5 h-2 w-2 rounded-full bg-brand-500" /> : null}
        <View className="flex-1">
          <Text className={`text-title text-ink ${unread ? "font-semibold" : ""}`}>
            {item.title || "Notification"}
          </Text>
          {item.body ? (
            <Text className="mt-1 text-body text-ink-muted" numberOfLines={3}>
              {item.body}
            </Text>
          ) : null}
          <Text className="mt-1 text-caption text-ink-muted">{formatWhen(item.created_at)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function NotificationsInboxScreen() {
  const router = useRouter();
  const inboxQuery = useCustomerNotifications();
  const markRead = useMarkNotificationsRead();

  const openItem = (item: CustomerNotificationRow) => {
    if (!item.read_at) {
      void markRead.mutateAsync({ id: item.id }).catch(() => undefined);
    }
    const path = resolveCustomerNotificationDeepLink({
      booking_id: item.booking_id,
      type: item.type,
    });
    if (path) {
      router.push(path as never);
    }
  };

  if (inboxQuery.isLoading && !inboxQuery.data) {
    return (
      <Screen scroll={false} edges={["top", "bottom"]}>
        <LoadingState label="Loading notifications…" />
      </Screen>
    );
  }

  if (inboxQuery.isError && !inboxQuery.data) {
    return (
      <Screen scroll={false} edges={["top", "bottom"]}>
        <ErrorState
          title="Couldn’t load notifications"
          message={friendlyErrorMessage(inboxQuery.error)}
          onRetry={() => void inboxQuery.refetch()}
        />
      </Screen>
    );
  }

  const notifications = inboxQuery.data?.notifications ?? [];
  const unreadCount = inboxQuery.data?.unreadCount ?? 0;

  return (
    <Screen
      scroll
      edges={["top", "bottom"]}
      contentClassName="px-4 pb-10 pt-2"
      refreshControl={
        <RefreshControl
          refreshing={inboxQuery.isRefetching && !inboxQuery.isLoading}
          onRefresh={() => void inboxQuery.refetch()}
        />
      }
    >
      <Pressable onPress={() => router.back()} accessibilityRole="button">
        <Text className="mb-2 text-caption font-semibold text-brand-600">← Profile</Text>
      </Pressable>
      <Text className="mb-1 text-title text-ink">Notifications</Text>
      <Text className="mb-4 text-body text-ink-muted">
        {unreadCount > 0 ? `${unreadCount} unread` : "You’re all caught up"}
      </Text>

      {unreadCount > 0 ? (
        <View className="mb-4">
          <AppButton
            label="Mark all read"
            variant="secondary"
            onPress={() => void markRead.mutateAsync({ all: true }).catch(() => undefined)}
          />
        </View>
      ) : null}

      {notifications.length === 0 ? (
        <EmptyState
          title="No notifications yet"
          message="Booking updates and reminders will appear here."
        />
      ) : (
        <SectionCard flush className="overflow-hidden p-0">
          {notifications.map((item) => (
            <NotificationRow key={item.id} item={item} onOpen={openItem} />
          ))}
        </SectionCard>
      )}
    </Screen>
  );
}
