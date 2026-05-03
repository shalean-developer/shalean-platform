/** Re-export for consumers that prefer a generic name. */
export { hrefForNotificationKind } from "@/lib/notifications/notificationRoutes";
export { CleanerNotificationsProvider, useCleanerNotifications } from "@/lib/notifications/notificationsStore";
export { useCleanerNotifications as useNotifications } from "@/lib/notifications/notificationsStore";
export type { CleanerInAppNotification, CleanerNotificationInput, CleanerNotificationKind } from "@/lib/notifications/types";
